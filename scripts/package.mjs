import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=process.cwd(),dest=path.join(root,'dist','paper-lens');fs.mkdirSync(dest,{recursive:true});
for(const file of ['manifest.json','reader.html','README.md','LICENSE','THIRD_PARTY.md'])fs.copyFileSync(path.join(root,file),path.join(dest,file));
for(const folder of ['src','vendor'])fs.cpSync(path.join(root,folder),path.join(dest,folder),{recursive:true});
fs.mkdirSync(path.join(dest,'fixtures'),{recursive:true});for(const file of ['guide.json'])fs.copyFileSync(path.join(root,'fixtures',file),path.join(dest,'fixtures',file));
execFileSync('/usr/bin/zip',['-qr',path.join(root,'dist','paper-lens-chrome.zip'),'paper-lens'],{cwd:path.join(root,'dist')});
console.log('Load unpacked:',dest);console.log('ZIP:',path.join(root,'dist','paper-lens-chrome.zip'));
