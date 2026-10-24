import {validateAnalysis} from './core.mjs';
const HOST='org.reliable_research.paper_lens';
export function nativeRequest(action,payload={}, {signal,onProgress=()=>{},runtime=globalThis.chrome?.runtime}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
  if(!runtime?.connectNative){reject(Error('Local Codex needs the Chrome extension and installed companion. See Setup in AI settings.'));return;}
  let port,finished=false;const id=crypto.randomUUID();
  const timer=setTimeout(()=>finish(Error('Local Codex timed out. Existing annotations were kept.')),960000);
  function finish(error,result){if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);try{port?.disconnect();}catch{}error?reject(error):resolve(result);}
  const abort=()=>{try{port?.postMessage({action:'cancel',id});}catch{}finish(new DOMException('Cancelled','AbortError'));};
  try{
   port=runtime.connectNative(HOST);
   port.onMessage.addListener(msg=>{if(msg.id!==id)return;if(msg.type==='progress')onProgress(msg);else if(msg.type==='result')finish(null,msg.result);else if(msg.type==='error')finish(Error(msg.error||'Local Codex failed.'));});
   port.onDisconnect.addListener(()=>{const detail=runtime.lastError?.message;if(!finished)finish(Error(`Local Codex companion is unavailable${detail?': '+detail:'.'} Open AI settings for setup. No API fallback was used.`));});
   signal?.addEventListener('abort',abort,{once:true});port.postMessage({id,action,...payload});
  }catch(e){finish(e);}
 });
}
export async function analyzeWithCodex({pages,settings,signal,focus,onProgress,question,history}){
 const raw=await nativeRequest('analyze',{pages:pages.map(({page,text})=>({page,text})),interests:settings.interests||'',focus:focus||'',model:settings.codexModel||'',...(question?{question,history:history||''}:{})},{signal,onProgress});
 const result=validateAnalysis(raw,pages);for(const h of result.highlights)h.origin=`Local Codex · quote verified${raw.cached?' · cached':''}`;
 return {...result,rejected:(raw.rejected||0)+result.rejected,cached:!!raw.cached,auth:raw.auth,usage:raw.usage,cacheKey:raw.cacheKey};
}
