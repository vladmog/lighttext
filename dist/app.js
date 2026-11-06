import {COUNTDOWN_MS,duration} from './protocol.js?v=3';
import {encodeSquare as encode,measureSquare as measureText,SYMBOL_MS,bankSlot} from './square.js?v=3';
const $ = id => document.getElementById(id);
let transmitting = false, frame = 0, wakeLock = null, activeDecode = null;
function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
function mode(name) {
  if (activeDecode) activeDecode.abort();
  for (const m of ['transmit', 'decode']) { $(`${m}-tab`).setAttribute('aria-pressed', String(m === name)); $(`${m}-panel`).hidden = m !== name; }
  notice();
}
$('transmit-tab').onclick = () => mode('transmit');
$('decode-tab').onclick = () => mode('decode');
$('about-button').onclick = () => $('about').showModal();
$('close-about').onclick = () => $('about').close();
$('about').onclick = event => { if (event.target === $('about')) { const r = $('about').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('about').close(); } };
function updateEstimate() {
  try { const data = measureText($('message').value); $('transmit-note').textContent = `~${duration(data.seconds + COUNTDOWN_MS / 1000)} to transmit`; $('transmit-note').title = `Includes the ${COUNTDOWN_MS / 1000}-second countdown. Each repeating pass takes about ${duration(data.seconds)} at ${1000 / SYMBOL_MS} patterns/s.`; $('play').disabled = false; }
  catch (error) { $('transmit-note').textContent = $('message').value ? error.message : 'Your words stay here.'; $('play').disabled = true; }
}
$('message').addEventListener('input', updateEstimate); updateEstimate();
function draw(word,index=0,blank=false) {
  const canvas = $('lights'), ctx = canvas.getContext('2d');
  const size = Math.min(1600, Math.max(400, Math.round(canvas.getBoundingClientRect().width * (devicePixelRatio || 1))));
  if (canvas.width !== size) canvas.width = canvas.height = size;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#fff';
  const pitch=size/9;
  const dot=(x,y)=>{ctx.beginPath();ctx.arc((x+1)*pitch,(y+1)*pitch,pitch*.175,0,2*Math.PI);ctx.fill();};
  for(const [x,y]of[[0,0],[3.5,0],[7,0],[7,7],[0,7]])dot(x,y);
  const banks=blank?[0,0]:bankSlot(word,index),counts=[0,0];
  for(let y=0;y<6;y++)for(let x=0;x<6;x++){const bank=(x+y)%2,i=counts[bank]++;if(banks[bank]&(1<<i))dot(x+1,y+1);}

}
async function stop() {
  transmitting = false; cancelAnimationFrame(frame); $('stage').hidden = true; $('app').inert = false;
  try { await wakeLock?.release(); } catch {} wakeLock = null;
  if (document.fullscreenElement === $('stage')) { try { await document.exitFullscreen(); } catch {} }
  $('play').focus();
}
$('stop').onclick = stop;
document.addEventListener('keydown', event => { if (event.key === 'Escape' && transmitting) stop(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && transmitting) { stop(); notice('Transmission stopped when the app went into the background. Press Play to restart.'); } });
$('play').onclick = async () => {
  let data; try { data = encode($('message').value); } catch (error) { notice(error.message); return; }
  notice(); transmitting = true; $('stage').hidden = false; $('app').inert = true; $('stop').focus();
  // Fullscreen is optional: fixed-position stage is the fallback on mobile Safari.
  try { const p = $('stage').requestFullscreen?.(); p?.catch(() => {}); } catch {}
  try { navigator.wakeLock?.request('screen').then(lock => { if (transmitting) wakeLock = lock; else lock.release(); }).catch(() => {}); } catch {}
  let index = 0, step = 0, pass = 1, started = false, last = performance.now(), countdown = last, observedPeriod = SYMBOL_MS;
  draw(0,0,true);
  const tick = now => {
    if (!transmitting) return;
    if (!started) {
      const left = Math.ceil((COUNTDOWN_MS - (now - countdown)) / 1000); $('stage-status').textContent = left > 0 ? `Start recording · ${left}` : `Pass 1 · ~${duration(data.seconds)} left`;
      if (left <= 0) { started = true; last = now; draw(data.symbols[0]); }
    } else if (now - last >= SYMBOL_MS) {
      observedPeriod = observedPeriod * .8 + (now - last) * .2; last = now; index++; step++;
      if (index >= data.symbols.length) { index = 0; pass++; }
      draw(data.symbols[index],step); $('stage-status').textContent = `Pass ${pass} · ~${duration((data.symbols.length - index) * observedPeriod / 1000)} left`;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
};
function decodeView(view) { for (const id of ['upload-area', 'working', 'result-area']) $(id).hidden = id !== view; }
$('choose').onclick = () => $('video-file').click();
$('another').onclick = () => { decodeView('upload-area'); $('result').value = ''; notice(); $('video-file').click(); };
$('cancel').onclick = () => activeDecode?.abort();
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('result').value); $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy ⧉'; }, 1800); }
  catch { $('result').focus(); $('result').select(); notice('Text selected. Use your device’s Copy command.'); }
};
function abortError() { return new DOMException('Cancelled', 'AbortError'); }
function waitEvent(target, event, signal, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(event, ok); target.removeEventListener('error', fail); signal.removeEventListener('abort', cancel); };
    const ok = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error('This browser cannot read this video. Try an MP4 recorded in a compatible camera mode.')); }, cancel = () => { cleanup(); reject(abortError()); };
    if (signal.aborted) { cancel(); return; }
    target.addEventListener(event, ok, { once: true }); target.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error('The video took too long to open or seek. Try a shorter recording or a different video format.')); }, timeout);
  });
}
function workerCall(worker, message, signal, transfer = []) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); worker.removeEventListener('message', done); worker.removeEventListener('error', fail); signal.removeEventListener('abort', cancel); };
    const done = ({ data }) => { cleanup(); data.error ? reject(new Error(data.error)) : resolve(data); };
    const fail = () => { cleanup(); reject(new Error('Video processing could not start. Reload and try again.')); };
    const cancel = () => { cleanup(); reject(abortError()); };
    if (signal.aborted) { cancel(); return; }
    worker.addEventListener('message', done, { once: true }); worker.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error('Processing stalled. Try a shorter recording.')); }, 20000);
    worker.postMessage(message, transfer);
  });
}
async function decodeFile(file) {
  activeDecode?.abort();
  const control = new AbortController(); activeDecode = control;
  const { signal } = control;
  let worker, url, video;
  notice(); decodeView('working'); $('decode-status').textContent = 'Opening video…'; $('progress').value = 0;
  try {
    video = document.createElement('video');video.className='decode-preview';$('working').prepend(video); video.muted = true; video.playsInline = true; video.preload = 'auto';
    url = URL.createObjectURL(file);
    const loaded = waitEvent(video, 'loadeddata', signal); video.src = url; video.load(); await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error('This video has no readable duration. Try a regular camera recording.');
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    worker = new Worker(new URL('./worker.js?v=3', import.meta.url), { type: 'module' });
    await workerCall(worker, { type: 'reset' }, signal);
    let answer = { result: null, found: 0, progress: { received: 0, total: 0 } };
    if(!video.requestVideoFrameCallback)throw new Error('Use a current browser with video-frame support to decode this recording.');
    let callback=0;
    answer=await new Promise((resolve,reject)=>{
      let pending=0,ended=false,finishing=false,settled=false,lastTimestamp=-Infinity,lastActivity=performance.now(),pausedForWork=false;
      const cleanup=()=>{clearInterval(watchdog);signal.removeEventListener('abort',cancel);video.cancelVideoFrameCallback(callback);video.pause();video.onended=null;video.onerror=null;worker.onmessage=null;worker.onerror=null;};
      const done=(error,value)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(value);};
      const cancel=()=>done(abortError());signal.addEventListener('abort',cancel,{once:true});
      const watchdog=setInterval(()=>{if(performance.now()-lastActivity>30000)done(new Error('Analysis stalled. Keep this page visible and try again.'));},1000);
      const finish=()=>{if(ended&&pending===0&&!finishing){finishing=true;worker.postMessage({type:'finish'});}};
      const pump=(_now,meta)=>{
        if(settled||signal.aborted)return;lastActivity=performance.now();
        if(meta.mediaTime>lastTimestamp){lastTimestamp=meta.mediaTime;ctx.drawImage(video,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data.buffer;pending++;worker.postMessage({type:'frame',pixels,width:canvas.width,height:canvas.height,time:meta.mediaTime},[pixels]);}
        callback=video.requestVideoFrameCallback(pump);
        if(pending>=8&&!video.paused){pausedForWork=true;video.pause();}
      };
      worker.onmessage=({data})=>{
        if(settled)return;lastActivity=performance.now();
        if(data.error){done(new Error(data.error));return;}
        if(data.type==='finish'||data.result!==null){done(null,data);return;}
        pending--;answer=data;const fraction=Math.min(1,lastTimestamp/video.duration);$('progress').value=fraction;
        const p=data.progress;$('decode-status').textContent=p.received?`Recovered ${p.received} of ${p.total} parts · ${Math.round(fraction*100)}%`:`${data.found?'Reading':'Looking for the grid'} · ${Math.round(fraction*100)}%`;
        if(pausedForWork&&pending<=2&&!ended){pausedForWork=false;video.play().catch(error=>done(error));}finish();
      };
      worker.onerror=()=>done(new Error('Video processing failed. Reload and try again.'));
      video.onended=()=>{ended=true;finish();};video.onerror=()=>done(new Error('Video playback failed. Try a compatible camera format.'));
      video.playbackRate=.5;callback=video.requestVideoFrameCallback(pump);video.play().catch(error=>done(error));
      if(signal.aborted)cancel();
    });
    if (answer.result !== null) { $('result').value = answer.result; decodeView('result-area'); $('copy').focus(); }
    else {
      decodeView('upload-area'); const p = answer.progress;
      notice(p.received ? `Recovered ${p.received} of ${p.total} parts. Record a longer clip covering two full passes with every fixed dot visible.` : answer.found ? 'Grid found, but no complete message passed its checks. Record two full passes; keep the dots sharp and all five fixed lights visible.' : 'No readable grid found. Keep all five fixed lights in view, fill more of the recording with the grid, and avoid glare.');
    }
  } catch (error) {
    if (activeDecode === control) { decodeView('upload-area'); if (error.name !== 'AbortError') notice(error.message); }
  } finally {
    worker?.terminate(); if (video) { video.pause(); video.removeAttribute('src'); video.load();video.remove(); } if (url) URL.revokeObjectURL(url);
    if (activeDecode === control) activeDecode = null;
  }
}
$('video-file').onchange = () => { const file = $('video-file').files[0]; $('video-file').value = ''; if (file) decodeFile(file); };

$('open-text').onclick = () => $('text-file').click();
$('text-file').onchange = async () => {
  const file = $('text-file').files[0]; $('text-file').value = ''; if (!file) return;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    $('message').value = text; updateEstimate(); notice();
  } catch { notice('Could not read this file as UTF-8 text. Choose a plain-text document or code file.'); }
};
