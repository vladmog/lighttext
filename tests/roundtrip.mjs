const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
try {
  for(const [name,width,height]of[['portrait',393,852],['landscape',852,393]]) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();
    await page.goto('http://127.0.0.1:8765');await page.locator('#message').fill('Hello, light.');await page.locator('#message').blur();await page.waitForTimeout(250);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`qa/${name}-touch.png`,fullPage:true});
    await page.locator('#decode-tab').tap();await page.screenshot({path:`qa/${name}-touch-decode.png`,fullPage:true});
    const before=Date.now();await page.locator('#video-file').setInputFiles('qa/moving-grid.webm');
    await page.locator('#result-area').waitFor({state:'visible',timeout:120000});assert.equal(await page.locator('#result').inputValue(),'Hi{}|\n\t9');
    console.log(name,'mobile emulation decoded in',Date.now()-before,'ms');await context.close();
  }
  const context=await browser.newContext({viewport:{width:852,height:393},isMobile:true,hasTouch:true});const page=await context.newPage();await page.goto('http://127.0.0.1:8765');
  await page.locator('#message').fill('aA0|\n\t');await page.locator('#play').tap();
  const video64=await page.evaluate(async()=>{
    const canvas=document.getElementById('lights'),stream=canvas.captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>chunks.push(e.data);
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();setTimeout(()=>recorder.stop(),20500);await done;stream.getTracks().forEach(t=>t.stop());
    return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  });
  await page.locator('#stop').tap();await fs.writeFile('qa/actual-transmitter.webm',Buffer.from(video64,'base64'));
  await page.locator('#decode-tab').tap();await page.locator('#video-file').setInputFiles('qa/actual-transmitter.webm');await page.locator('#result-area').waitFor({state:'visible',timeout:120000});assert.equal(await page.locator('#result').inputValue(),'aA0|\n\t');
  console.log('Actual transmitter canvas -> recorded video -> file input -> decoder: exact match.');
  await context.close();
} finally {await browser.close();}
