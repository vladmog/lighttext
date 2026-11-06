const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {crc32} from 'node:zlib';
const base = process.env.LIGHTTEXT_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const errors=[], requests=[];
const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
try {
await page.goto(base);
for(const [name,width,height] of [['desktop',1280,900],['portrait',393,852],['landscape',852,393]]) {
  await page.setViewportSize({width,height});
  await page.locator('#message').fill('const sum = (a, b) => {\n\treturn a + b; // | & {} []\n};');
  assert(await page.locator('#play').isEnabled());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({path:`qa/${name}.png`,fullPage:true});
  await page.locator('#play').click();await page.waitForTimeout(3500);
  assert(await page.locator('#stage').isVisible());
  const geom=await page.locator('#lights').boundingBox();assert(geom.width>200 && geom.height>200);
  await page.screenshot({path:`qa/${name}-transmit.png`});
  await page.locator('#stop').click();assert(!(await page.locator('#stage').isVisible()));
  await page.locator('#decode-tab').click();assert(await page.locator('#choose').isVisible());
  await page.screenshot({path:`qa/${name}-decode.png`});
  await page.locator('#transmit-tab').click();
}
await page.locator('#about-button').click();assert(await page.locator('#about').isVisible());await page.locator('#close-about').click();
const expected='Hi{}|\n\t9';
const payload=Buffer.from(expected), packet=Buffer.alloc(payload.length+25);
Buffer.from([76,84,88,49,166,57,197,114]).copy(packet);packet.writeUInt32BE(crc32(payload),8);packet.writeUInt32BE(payload.length,12);packet.writeUInt16BE(0,16);packet.writeUInt16BE(1,18);packet[20]=payload.length;payload.copy(packet,21);packet.writeUInt32BE(crc32(packet.subarray(8,21+payload.length)),21+payload.length);
await page.setViewportSize({width:1280,height:900});
console.log('UI checks passed; generating a moving, perspective-distorted camera fixture.');
const video64=await page.evaluate(async bytes=>{
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=360;const ctx=canvas.getContext('2d');
  const stream=canvas.captureStream(30), chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000});
  recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);
  const start=performance.now();let frame;
  const render=now=>{
    const t=(now-start)/1000, index=Math.floor(t/.25), bits=bytes[index%bytes.length]|((index%2)<<8);
    ctx.fillStyle='#111';ctx.fillRect(0,0,480,360);
    const angle=.10+Math.sin(t*1.3)*.06, c=Math.cos(angle),s=Math.sin(angle);
    const map=(x,y)=>{const z=1+.025*x-.015*y;return[(54*(x*c-y*s)+240+Math.sin(t*2.1)*7)/z,(54*(x*s+y*c)+180+Math.cos(t*1.7)*6)/z];};
    ctx.fillStyle='#e7e7e7';
    const dot=(x,y)=>{ctx.beginPath();for(let k=0;k<=40;k++){const a=k/40*Math.PI*2,p=map(x+Math.cos(a)*.175,y+Math.sin(a)*.175);if(k===0)ctx.moveTo(...p);else ctx.lineTo(...p);}ctx.fill();};
    for(const [x,y]of[[-2,-2],[0,-2],[2,-2],[-2,2],[2,2]])dot(x,y);
    for(let b=0;b<9;b++)if(bits&1<<b)dot(b%3-1,Math.floor(b/3)-1);
    if(t<bytes.length*.25*2+.3)frame=requestAnimationFrame(render);else recorder.stop();
  };
  render(start);recorder.start();await done;cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:'video/webm'});
  return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});
},[...packet]);
await fs.writeFile('qa/moving-grid.webm',Buffer.from(video64,'base64'));
await page.locator('#decode-tab').click();await page.locator('#video-file').setInputFiles('qa/moving-grid.webm');
await page.waitForFunction(()=>!document.getElementById('result-area').hidden || !document.getElementById('notice').hidden,{},{timeout:120000});
const actual=await page.locator('#result').inputValue();
console.log('Decode notice:',await page.locator('#notice').textContent());assert.equal(actual,expected);
await page.locator('#copy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected);
await page.screenshot({path:'qa/decoded.png'});
await page.locator('#video-file').setInputFiles('qa/moving-grid.webm');await page.locator('#cancel').click();await page.waitForTimeout(150);assert(await page.locator('#choose').isVisible());
assert.equal(errors.length,0,errors.join('\n'));assert(requests.every(url=>url.startsWith(base)||url.startsWith('blob:')),JSON.stringify(requests));
console.log(JSON.stringify({ui:['desktop','portrait','landscape'],video:'moving perspective fixture',text:actual,copy:true,cancel:true,errors,externalRequests:0},null,2));
} finally {await browser.close();}
