import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url='https://arxiv.org/pdf/2512.18311v1';
const expected='ecb8076f08298956cc535d8ae516653808ade0d1fb62a7c06ac465392b88ada8';
const target=new URL('../fixtures/monitoring-monitorability.pdf',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
try{const existing=await fs.readFile(target);if(sha(existing)===expected){console.log('Existing arXiv v1 test fixture verified.');process.exit(0);}}catch{}
console.log('Downloading unchanged source from',url);
const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(`arXiv returned HTTP ${response.status}`);
const bytes=Buffer.from(await response.arrayBuffer());if(sha(bytes)!==expected)throw Error('Source hash differs from the tested arXiv v1 PDF. No file was saved.');
await fs.mkdir(new URL('../fixtures/',import.meta.url),{recursive:true});await fs.writeFile(target,bytes);console.log('Saved hash-verified local test fixture (excluded from Git).');
