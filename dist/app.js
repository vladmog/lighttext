import { encode, SYMBOL_MS, COUNTDOWN_MS, duration, measureText } from './protocol.js?v=2';
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
function draw(bits) {
  const canvas = $('lights'), ctx = canvas.getContext('2d');
  const size = Math.min(1600, Math.max(400, Math.round(canvas.getBoundingClientRect().width * (devicePixelRatio || 1))));
  if (canvas.width !== size) canvas.width = canvas.height = size;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#fff';
  const dot = (x, y) => { ctx.beginPath(); ctx.arc(size * (.12 + .19 * x), size * (.12 + .19 * y), size * .034, 0, 2 * Math.PI); ctx.fill(); };
  for (const [x, y] of [[0, 0], [2, 0], [4, 0], [0, 4], [4, 4]]) dot(x, y);
  for (let i = 0; i < 9; i++) if (bits & (1 << i)) dot(1 + i % 3, 1 + Math.floor(i / 3));
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
  let index = 0, clock = 0, pass = 1, started = false, last = performance.now(), countdown = last, observedPeriod = SYMBOL_MS;
  draw(0);
  const tick = now => {
    if (!transmitting) return;
    if (!started) {
      const left = Math.ceil((COUNTDOWN_MS - (now - countdown)) / 1000); $('stage-status').textContent = left > 0 ? `Start recording · ${left}` : `Pass 1 · ~${duration(data.seconds)} left`;
      if (left <= 0) { started = true; last = now; draw(data.symbols[0]); }
    } else if (now - last >= SYMBOL_MS) {
      observedPeriod = observedPeriod * .8 + (now - last) * .2; last = now; index++; clock ^= 1;
      if (index >= data.symbols.length) { index = 0; pass++; }
      draw(data.symbols[index] | (clock << 8)); $('stage-status').textContent = `Pass ${pass} · ~${duration((data.symbols.length - index) * observedPeriod / 1000)} left`;
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
    video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
    url = URL.createObjectURL(file);
    const loaded = waitEvent(video, 'loadeddata', signal); video.src = url; video.load(); await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error('This video has no readable duration. Try a regular camera recording.');
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    worker = new Worker(new URL('./worker.js?v=2', import.meta.url), { type: 'module' });
    await workerCall(worker, { type: 'reset' }, signal);
    let answer = { result: null, found: 0, progress: { received: 0, total: 0 } };
    // Sequential seeks provide backpressure: slow devices take longer without skipping analysis.
    // 15 observations/sec gives 3–4 samples per 250 ms symbol, independent of recorded fps.
    const total = Math.ceil(video.duration * 15);
    for (let i = 0; i < total; i++) {
      if (signal.aborted) throw abortError();
      const time = Math.min(i / 15 + .002, Math.max(0, video.duration - .001));
      if (Math.abs(video.currentTime - time) > .001) {
        const sought = waitEvent(video, 'seeked', signal); video.currentTime = time; await sought;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer;
      answer = await workerCall(worker, { type: 'frame', pixels, width: canvas.width, height: canvas.height, time }, signal, [pixels]);
      $('progress').value = (i + 1) / total;
      const p = answer.progress;
      $('decode-status').textContent = p.received ? `Recovered ${p.received} of ${p.total} parts · ${Math.round((i + 1) / total * 100)}%` : `${answer.found ? 'Reading' : 'Looking for the grid'} · ${Math.round((i + 1) / total * 100)}%`;
      if (answer.result !== null) break;
    }
    if (answer.result === null) answer = await workerCall(worker, { type: 'finish' }, signal);
    if (answer.result !== null) { $('result').value = answer.result; decodeView('result-area'); $('copy').focus(); }
    else {
      decodeView('upload-area'); const p = answer.progress;
      notice(p.received ? `Recovered ${p.received} of ${p.total} parts. Record a longer clip covering two full passes with every fixed dot visible.` : answer.found ? 'Grid found, but no complete message passed its checks. Record two full passes; keep the dots sharp and all five fixed lights visible.' : 'No readable grid found. Keep all five fixed lights in view, fill more of the recording with the grid, and avoid glare.');
    }
  } catch (error) {
    if (activeDecode === control) { decodeView('upload-area'); if (error.name !== 'AbortError') notice(error.message); }
  } finally {
    worker?.terminate(); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } if (url) URL.revokeObjectURL(url);
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
