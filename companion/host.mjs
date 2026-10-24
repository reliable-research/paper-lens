import fs from 'node:fs/promises';
import path from 'node:path';
import {FrameDecoder,encodeFrame} from './lib.mjs';
import {runCodex,subscriptionStatus} from './runner.mjs';
const config=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
process.env.PATH=[path.dirname(config.node),path.dirname(config.codex),process.env.PATH||''].join(path.delimiter);
const origin=process.argv[2];if(!config.allowedOrigins.includes(origin)){process.stderr.write('Paper Lens: origin not allowed.\n');process.exit(1);}
let active=null,closed=false;
function send(value){if(!closed)process.stdout.write(encodeFrame(value));}
const decoder=new FrameDecoder(async msg=>{
 const id=typeof msg.id==='string'?msg.id:'';
 try{
  if(msg.action==='cancel'){active?.abort();return;}
  if(msg.action==='status'){send({id,type:'result',result:await subscriptionStatus(config)});return;}
  if(msg.action!=='analyze')throw Error('Unknown Paper Lens action.');
  if(active)throw Error('A paper is already being analyzed.');
  const controller=new AbortController();active=controller;
  try{const result=await runCodex(msg,config,{signal:controller.signal,onProgress:progress=>send({id,type:'progress',...progress})});send({id,type:'result',result});}finally{if(active===controller)active=null;}
 }catch(error){send({id,type:'error',error:error.message});}
});
process.stdin.on('data',chunk=>{try{decoder.push(chunk);}catch{send({type:'error',error:'Malformed or oversized native message.'});closed=true;active?.abort();process.exitCode=1;process.stdin.destroy();}});
process.stdin.on('end',()=>{closed=true;active?.abort();});process.on('SIGTERM',()=>{closed=true;active?.abort();process.exitCode=0;process.stdin.destroy();});
