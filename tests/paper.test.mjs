import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';import {buildPage,findQuote,selectCore} from '../src/core.mjs';
test('actual Monitoring Monitorability PDF: all 90 pages parsed and every guide quotation anchored',async t=>{
 if(!fs.existsSync(new URL('../fixtures/monitoring-monitorability.pdf',import.meta.url))){t.skip('Run npm run fetch:paper for the real-PDF integration test.');return;}
 const bytes=new Uint8Array(fs.readFileSync(new URL('../fixtures/monitoring-monitorability.pdf',import.meta.url)));
 const pdf=await getDocument({data:bytes,useSystemFonts:true}).promise;
 try{assert.equal(pdf.numPages,90);const pages=[];for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n);pages.push(buildPage((await p.getTextContent()).items.filter(x=>'str' in x),n));}
 const guide=JSON.parse(fs.readFileSync(new URL('../fixtures/guide.json',import.meta.url)));
 assert.equal(guide.highlights.length,16);for(const h of guide.highlights){const anchor=findQuote(pages,h.quote,h.page);assert.ok(anchor,`Missing quote: ${h.quote}`);assert.equal(anchor.page,h.page);assert.ok(anchor.parts.length>0);}
 assert.equal(pages.reduce((n,p)=>n+p.text.length,0),203873);
 const core=selectCore(pages);assert.ok(core.length>=15);assert.equal(new Set(core.map(h=>`${h.page}:${h.anchor.start}`)).size,core.length);assert.ok(core.some(h=>h.page>30));
 }finally{await pdf.loadingTask.destroy();}
});
