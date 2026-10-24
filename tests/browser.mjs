import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.EXTENSION_DIR||process.cwd());fs.mkdirSync('test-results',{recursive:true});
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1512,height:1000},acceptDownloads:true});
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
try{
 await page.route('https://arxiv.org/pdf/2512.18311v1',route=>route.fulfill({path:path.join(process.cwd(),'fixtures/monitoring-monitorability.pdf'),contentType:'application/pdf'}));
 await page.goto(`chrome-extension://${id}/reader.html?demo=1`);
 await page.waitForFunction(()=>window.paperLens?.snapshot.pages===90&&window.paperLens.snapshot.highlights===16,{timeout:60000});
 await page.waitForSelector('.highlight-rect',{timeout:30000});
 const snapshot=await page.evaluate(()=>paperLens.snapshot);assert.equal(snapshot.pages,90);assert.equal(snapshot.highlights,16);
 assert.ok(snapshot.quotes.every(x=>x.parts>0));
 await page.screenshot({path:'test-results/reader-overview.png'});
 // Every guide anchor must have visible rectangles on the correct page.
 for(const n of [...new Set(snapshot.quotes.map(x=>x.page))]){
  await page.locator('#page-input').fill(String(n));await page.locator('#page-go').click();
  await page.waitForSelector(`.pdf-page[data-page="${n}"] .highlight-rect`,{timeout:30000});
  const geometry=await page.locator(`.pdf-page[data-page="${n}"]`).evaluate(box=>{const b=box.getBoundingClientRect();return [...box.querySelectorAll('.highlight-rect')].map(x=>({x:parseFloat(x.style.left),y:parseFloat(x.style.top),w:parseFloat(x.style.width),h:parseFloat(x.style.height),bw:b.width,bh:b.height}));});
  assert.ok(geometry.every(r=>r.x>=-2&&r.y>=-2&&r.w>0&&r.h>0&&r.x+r.w<=r.bw+3&&r.y+r.h<=r.bh+3),`Bad geometry on page ${n}`);
 }
 await page.locator('.passage-card[data-id="guide-10"]').click();
 await page.waitForSelector('.inspector .explanation');await page.locator('#personal-note').fill('Compare ordinary RL with explicit CoT pressure.');
 await page.waitForTimeout(500);await page.screenshot({path:'test-results/rl-explanation.png'});
 await page.reload();await page.waitForFunction(()=>window.paperLens?.snapshot.highlights===16,{timeout:60000});
 await page.locator('.passage-card[data-id="guide-10"]').click();assert.equal(await page.locator('#personal-note').inputValue(),'Compare ordinary RL with explicit CoT pressure.');
 await page.getByRole('button',{name:'limitation',exact:true}).click();assert.equal(await page.locator('.passage-card').count(),4);
 await page.locator('#search').fill('single');assert.equal(await page.locator('.passage-card').count(),1);
 await page.locator('#search').fill('');await page.getByRole('button',{name:'All',exact:true}).click();
 await page.locator('#export-open').click();const downloadPromise=page.waitForEvent('download');await page.locator('#export-json').click();const download=await downloadPromise;await download.saveAs('test-results/annotations.json');const exported=JSON.parse(fs.readFileSync('test-results/annotations.json'));assert.equal(exported.highlights.length,16);assert.ok(!JSON.stringify(exported).includes('Authorization'));
 // Local ranking really parses this PDF, rather than reusing the included guide.
 await page.locator('#local-analyze').click();assert.equal((await page.locator('.passage-card').count())>10,true);assert.match(await page.locator('#status').textContent(),/No document text was sent/);
 // Exercise AI transport inside the actual extension, with a deterministic provider fixture.
 let apiBody;let mode='valid';
 await page.route('https://arxiv.org/paper-lens-test-api',async route=>{
  apiBody=route.request().postDataJSON();await new Promise(r=>setTimeout(r,300));
  const data=mode==='valid'?{summary:'Whole-paper provider fixture.',highlights:[{quote:snapshot.quotes[10].quote,page:19,section:'6.1 RL result',category:'result',explanation:'<img src=x onerror=alert(1)> This is literal text, not HTML.',why:'Two runs only.'},{quote:'This quote does not occur anywhere in the PDF.',explanation:'Reject this.'}]}:{highlights:[{quote:'Invented source quotation with no matching passage.',explanation:'Reject.'}]};
  await route.fulfill({json:{choices:[{message:{content:JSON.stringify(data)}}]}});
 });
 await page.locator('#settings-open').click();await page.locator('#backend').selectOption('api');await page.locator('#api-endpoint').fill('https://arxiv.org/paper-lens-test-api');await page.locator('#api-model').fill('fixture-model');await page.locator('#api-key').fill('fixture-not-a-real-key');await page.locator('#save-settings').click();
 await page.locator('#ai-analyze').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Sending all'));
 assert.equal(await page.locator('#zoom-in').isDisabled(),true);await page.locator('.passage-card').first().click();assert.equal(await page.locator('[data-ai-explain]').isDisabled(),true);
 await page.waitForFunction(()=>document.getElementById('status').textContent.includes('AI analysis complete'));
 assert.ok(apiBody.messages[1].content.includes('[PAGE 90]'));
 assert.ok(apiBody.messages[1].content.includes('[PAGE 1]'));
 assert.match(await page.locator('#status').textContent(),/1 unanchored/);
 await page.locator('.passage-card').first().click();assert.equal(await page.locator('.inspector img').count(),0);
 assert.equal(await page.locator('#personal-note').inputValue(),'Compare ordinary RL with explicit CoT pressure.');
 const beforeInvalid=await page.locator('.passage-card').count();mode='invalid';await page.locator('#ai-analyze').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('No verified highlights'));assert.equal(await page.locator('.passage-card').count(),beforeInvalid);
 await page.locator('#zoom-in').click();await page.waitForSelector('.pdf-page[data-page="1"] canvas');
 // User-selected source text gets its own anchored annotation.
 await page.locator('#page-input').fill('1');await page.locator('#page-go').click();
 await page.locator('.pdf-page[data-page="1"] .textLayer span').first().waitFor();
 await page.evaluate(()=>{const spans=[...document.querySelectorAll('.pdf-page[data-page="1"] .textLayer span')];const span=spans.find(x=>x.textContent.length>50);const range=document.createRange();range.selectNodeContents(span);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.getElementById('pdf-scroll').dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:650,clientY:450}));});
 await page.locator('#selection-add').waitFor({state:'visible'});await page.locator('#selection-add').click();
 await page.locator('#personal-note').fill('My manually selected source note.');
 assert.match(await page.locator('.inspector .origin').textContent(),/Your highlight/);
 // File picker opens a different two-page paper, then restores this PDF by fingerprint.
 function tinyPdf(blank=false){const streams=blank?['']:['BT /F1 12 Tf 50 740 Td (1 Introduction) Tj 0 -25 Td (We introduce a careful method for evaluating research papers across multiple sections.) Tj ET','BT /F1 12 Tf 50 740 Td (2 Results) Tj 0 -25 Td (We find that this simple method improves our measured results in two experiments.) Tj ET'];const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${streams.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${streams.length} >>`];const fontId=3+streams.length*2;for(let i=0;i<streams.length;i++){objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4+i*2} 0 R >>`);objects.push(`<< /Length ${Buffer.byteLength(streams[i])} >>\nstream\n${streams[i]}\nendstream`);}objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');let out='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(out);out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(out);}
 await page.locator('#file').setInputFiles({name:'another-paper.pdf',mimeType:'application/pdf',buffer:tinyPdf()});
 await page.waitForFunction(()=>paperLens.snapshot.pages===2&&document.getElementById('status').textContent.includes('2 / 2 pages read'));
 assert.ok((await page.locator('.passage-card').count())>0);
 assert.equal(await page.locator('#selection-add').isVisible(),false);
 await page.locator('#file').setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:tinyPdf(true)});
 await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Run OCR first'));
 assert.equal((await page.evaluate(()=>paperLens.snapshot.highlights)),0);
 await page.locator('#file').setInputFiles(path.join(process.cwd(),'fixtures/monitoring-monitorability.pdf'));
 await page.waitForFunction(()=>paperLens.snapshot.pages===90&&document.getElementById('status').textContent.includes('90 / 90 pages read'));
 await page.locator('#search').fill('My manually selected');await page.locator('.passage-card').first().click();assert.equal(await page.locator('#personal-note').inputValue(),'My manually selected source note.');
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync('test-results/browser-report.json',JSON.stringify({extensionId:id,fullPdfPages:snapshot.pages,guideHighlights:snapshot.highlights,verifiedPages:[...new Set(snapshot.quotes.map(x=>x.page))],notesPersisted:true,manualSelection:true,fileSwitch:true,ocrRequiredNotice:true,filters:true,export:true,localRanking:true,zoom:true,aiTransport:'mock provider; all 90 pages sent, quote rejection, HTML escaped, errors preserve notes',errors},null,2));
 console.log('PASS extension: 90 pages, 16 anchored passages; geometry, notes/reload, filters, JSON export, local analysis, zoom');
}catch(error){console.log('FAIL STATE',await page.evaluate(()=>({status:document.getElementById('status').textContent,snapshot:window.paperLens?.snapshot})));await page.screenshot({path:'test-results/failure.png'});throw error;}finally{await context.close();}
