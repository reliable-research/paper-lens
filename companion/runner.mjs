import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {validateRequest,cacheKey,codexEnvironment,codexArguments} from './lib.mjs';
import {analysisPrompt,analysisSchema} from '../src/analysis.mjs';
import {normalize} from '../src/core.mjs';
import {dossierSchema,deepGuideSchema,dossierPrompt,reviewPrompt,verifyDossier,verifyDeepGuide} from '../src/insights.mjs';
function terminate(child,signal='SIGTERM'){try{if(process.platform!=='win32')process.kill(-child.pid,signal);else child.kill(signal);}catch{}}
async function execute(binary,args,{input='',signal,onEvent=()=>{},timeout=900000}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(Error('Cancelled.'));return;}
  const child=spawn(binary,args,{env:codexEnvironment(),stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true});
  let out='',err='',line='',done=false,stopReason=null,killTimer;const timer=setTimeout(()=>stop(Error('Codex timed out. Existing annotations were kept.')),timeout);
  function stop(error){if(done||stopReason)return;stopReason=error;terminate(child);killTimer=setTimeout(()=>terminate(child,'SIGKILL'),2000);}
  const abort=()=>stop(Error('Cancelled.'));signal?.addEventListener('abort',abort,{once:true});
  function finish(error,value){if(done)return;done=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);}
  child.on('error',()=>finish(Error('Could not launch Codex CLI. Reinstall the companion with the correct Codex executable.')));
  child.stdout.on('data',chunk=>{out+=chunk;if(out.length>2000000){stop(Error('Codex output exceeded the limit.'));return;}line+=chunk;let n;while((n=line.indexOf('\n'))>=0){const raw=line.slice(0,n);line=line.slice(n+1);try{const event=JSON.parse(raw);if(event.type==='item.started'&&event.item?.type==='command_execution'){stop(Error('Unexpected tool execution refused.'));return;}onEvent(event);}catch{}}});
  child.stderr.on('data',chunk=>{err=(err+chunk).slice(-8000);});
  child.on('close',code=>stopReason?finish(stopReason):code===0?finish(null,{out,err}):finish(Error(`Codex exited with code ${code}. Check codex login status, subscription limits and model access in your terminal.`)));
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export async function subscriptionStatus(config){
 const {out,err}=await execute(config.codex,['login','status'],{timeout:15000});
 if(!/Logged in using ChatGPT/i.test(out+err))throw Error('Local Codex requires ChatGPT subscription sign-in. Run codex login and choose ChatGPT. API-key login is not used.');
 return {auth:'chatgpt',ready:true};
}
function verifiedResult(data,pages,deep=false){
 if(deep)return verifyDeepGuide(data,(quote,page)=>typeof quote==='string'&&normalize(quote).length>=12&&pages[page-1]?.page===page&&normalize(pages[page-1].text).includes(normalize(quote)));
 if(!data||typeof data.summary!=='string'||!Array.isArray(data.highlights))throw Error('Codex returned an invalid reading guide.');
 const seen=new Set();let rejected=0;const highlights=[];
 for(const h of data.highlights){const page=pages[h?.page-1];if(!page||typeof h?.quote!=='string'||!h.explanation?.trim()||normalize(h.quote).length<12||!normalize(page.text).includes(normalize(h.quote))){rejected++;continue;}const key=`${h.page}:${normalize(h.quote)}`;if(seen.has(key)){rejected++;continue;}seen.add(key);highlights.push(h);}
 if(!highlights.length)throw Error('Codex returned no quotations matching the supplied PDF pages.');
 return {summary:data.summary,highlights,rejected};
}
export async function runCodex(input,config,{signal,onProgress=()=>{}}={}){
 const request=validateRequest(input);await subscriptionStatus(config);if(signal?.aborted)throw Error('Cancelled.');
 const key=cacheKey(request);const file=path.join(config.cacheDir,key+'.json');
 try{const stored=JSON.parse(await fs.readFile(file,'utf8'));const result=verifiedResult(stored,request.pages,!request.focus);return {...result,rejected:(stored.rejected||0)+result.rejected,cached:true,auth:'chatgpt',cacheKey:key,usage:stored.usage||null,dossierRejected:stored.dossierRejected||0};}catch{}
 onProgress({stage:'analyzing',pages:request.pages.length});
 const job=await fs.mkdtemp(path.join(os.tmpdir(),'paper-lens-'));await fs.chmod(job,0o700);
 const schema=path.join(job,'schema.json'),out=path.join(job,'result.json');let usage=null;
 try{
  async function stage(stageName,prompt,outputSchema){
   onProgress({stage:stageName,pages:request.pages.length});await fs.writeFile(schema,JSON.stringify(outputSchema),{mode:0o600});
   await execute(config.codex,codexArguments(job,schema,out,request.model),{input:prompt,signal,timeout:request.focus?900000:450000,onEvent:event=>{if(event.type==='turn.completed'&&event.usage){usage||={};for(const [key,value] of Object.entries(event.usage))if(typeof value==='number')usage[key]=(usage[key]||0)+value;}if(event.type==='thread.started')onProgress({stage:'connected',phase:stageName,pages:request.pages.length});}});
   return JSON.parse(await fs.readFile(out,'utf8'));
  }
  let result;
  if(request.focus)result=verifiedResult(await stage('answering question',analysisPrompt(request),analysisSchema),request.pages);
  else{
   const locate=(quote,page)=>typeof quote==='string'&&normalize(quote).length>=12&&request.pages[page-1]?.page===page&&normalize(request.pages[page-1].text).includes(normalize(quote));
   const dossier=verifyDossier(await stage('1/2 · reconstructing argument and evidence',dossierPrompt(request),dossierSchema),locate);
   result=verifiedResult(await stage('2/2 · challenging and ranking insights',reviewPrompt(request,dossier),deepGuideSchema),request.pages,true);result.dossierRejected=dossier.rejected;
  }
  if(signal?.aborted)throw Error('Cancelled.');
  await fs.mkdir(config.cacheDir,{recursive:true,mode:0o700});await fs.writeFile(file,JSON.stringify({...result,usage}),{mode:0o600});
  return {...result,auth:'chatgpt',cached:false,cacheKey:key,usage};
 }finally{await fs.rm(job,{recursive:true,force:true});}
}
