import fs from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {buildPage} from '../src/core.mjs';
const pdf=await getDocument({data:new Uint8Array(fs.readFileSync('fixtures/monitoring-monitorability.pdf')),useSystemFonts:true}).promise;
const pages=[];for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n);pages.push(buildPage((await p.getTextContent()).items.filter(x=>'str' in x),n));}
fs.writeFileSync('fixtures/extracted.json',JSON.stringify(pages));
fs.writeFileSync('fixtures/extracted.txt',pages.map(p=>`\n=== PAGE ${p.page} ===\n${p.lines.join('\n')}`).join('\n'));
console.log(pdf.numPages,'pages;',pages.reduce((n,p)=>n+p.text.length,0),'characters');
