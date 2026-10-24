import {createHash} from 'node:crypto';
import {ANALYSIS_VERSION} from '../src/analysis.mjs';
export const MAX_FRAME=900000;
export function encodeFrame(value){const body=Buffer.from(JSON.stringify(value));if(body.length>MAX_FRAME)throw Error('Native response too large.');const header=Buffer.alloc(4);header.writeUInt32LE(body.length);return Buffer.concat([header,body]);}
export class FrameDecoder{
 constructor(onMessage){this.buffer=Buffer.alloc(0);this.onMessage=onMessage;}
 push(chunk){this.buffer=Buffer.concat([this.buffer,chunk]);while(this.buffer.length>=4){const length=this.buffer.readUInt32LE(0);if(length>MAX_FRAME||length===0)throw Error('Native message too large or empty.');if(this.buffer.length<length+4)return;const value=JSON.parse(this.buffer.subarray(4,length+4).toString('utf8'));this.buffer=this.buffer.subarray(length+4);this.onMessage(value);}}
}
export function validateRequest(input){
 if(!input||!Array.isArray(input.pages)||!input.pages.length||input.pages.length>5000)throw Error('Supply 1–5000 extracted pages.');
 let chars=0;const pages=input.pages.map((p,i)=>{if(p.page!==i+1||typeof p.text!=='string')throw Error('Pages must be consecutive, numbered from 1.');chars+=p.text.length;return {page:p.page,text:p.text};});
 if(chars>600000||chars<1)throw Error('Paper text exceeds the 600,000-character limit or is empty. No text was sent.');
 for(const field of ['focus','interests','model','question','history'])if(input[field]!==undefined&&typeof input[field]!=='string')throw Error('Invalid '+field);
 const {interests='',focus='',model='',question='',history=''}=input;if(question.length>1000||history.length>3000)throw Error('Conversation too long.');if(interests.length>4000||focus.length>6000)throw Error('Interests or selection too long.');if(model&&!/^[a-zA-Z0-9][\w.:-]{0,99}$/.test(model))throw Error('Invalid model ID.');
 return {pages,interests,focus,model,...(question?{question,history}:{})};
}
export function cacheKey(request){return createHash('sha256').update(JSON.stringify({version:ANALYSIS_VERSION,...validateRequest(request)})).digest('hex');}
export function codexEnvironment(source=process.env){
 const env={...source};for(const key of Object.keys(env))if(/API_KEY|ACCESS_TOKEN|AUTH_TOKEN|^CODEX_SANDBOX$|^OPENAI_BASE_URL$|^CODEX_MODEL_PROVIDER$/.test(key))delete env[key];return env;
}
export function codexArguments(cwd,schema,out,model){return ['-c','forced_login_method="chatgpt"','-c','web_search="disabled"','--disable','shell_tool','--disable','apps','--disable','computer_use','--disable','browser_use','--disable','chronicle','--disable','code_mode_host','exec','--ignore-user-config','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--cd',cwd,'--output-schema',schema,'--output-last-message',out,'--json',...(model?['--model',model]:[]),'-'];}
