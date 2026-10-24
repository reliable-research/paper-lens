import * as pdfjs from '../vendor/pdf.mjs';
import {buildPage,findQuote,anchorRange,selectCore,normalize,mergeHighlights} from './core.mjs';
import {insightQuestions} from './insights.mjs';
import {analyzeWithProvider,providerUrl} from './provider.mjs';
import {analyzeWithCodex,nativeRequest} from './native.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;
const $=id=>document.getElementById(id);
const cats=['motivation','contribution','method','result','limitation'];
const state={pages:[],pdf:null,highlights:[],summary:'',filter:'all',selected:null,scale:1,rendered:new Map(),rendering:new Map(),epoch:0,title:'',fingerprint:'',controller:null,loading:false,baseWidth:620};
let mapHidden=window.innerWidth<1000,headerOpen=false,layoutTimer=null,pendingLayout=false,suppressCloseUntil=0,explanationTimer=null;
let sessionKey='',pendingSelection=null,observer=null;
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function safeJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function settings(){return {backend:'codex',...safeJSON('paper-lens-settings',{}),key:sessionKey||safeJSON('paper-lens-key','')};}
function save(){if(!state.fingerprint)return;try{localStorage.setItem('paper-lens:'+state.fingerprint,JSON.stringify({title:state.title,summary:state.summary,highlights:state.highlights,selected:state.selected}));}catch{status('Browser storage is full. Export your notes before closing this tab.',true);}}
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('paper-lens',1);r.onupgradeneeded=()=>r.result.createObjectStore('pdfs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function cachePdf(bytes,name){const d=await db();await new Promise((resolve,reject)=>{const t=d.transaction('pdfs','readwrite');t.objectStore('pdfs').put({bytes,name},'last');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});d.close();}
async function cachedPdf(){const d=await db();const value=await new Promise((resolve,reject)=>{const r=d.transaction('pdfs').objectStore('pdfs').get('last');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});d.close();return value;}
function busy(on){state.loading=on;for(const id of ['local-analyze','ai-analyze','export-open','zoom-in','zoom-out','page-go','toggle-map','hide-map','fit-page'])$(id).disabled=on;for(const b of document.querySelectorAll('[data-ai-explain]'))b.disabled=on;if(!on&&pendingLayout){pendingLayout=false;queueMicrotask(()=>relayout());}}
async function openPdf(bytes,name,{guide=false}={}){
 const epoch=++state.epoch;state.controller?.abort();observer?.disconnect();pendingSelection=null;$('selection-add').hidden=true;window.getSelection()?.removeAllRanges();
 for(const r of state.rendered.values())r.task?.cancel();
 state.rendered=new Map();state.rendering=new Map();state.selected=null;state.pages=[];state.highlights=[];state.summary='';$('cancel-analysis').hidden=true;state.fingerprint='';state.filter='all';$('search').value='';$('inspector-content').replaceChildren(el('p','muted','Choose a passage from the reading map.'));
 $('welcome').hidden=true;$('workspace').hidden=false;applyLayout();$('explanation-popover').hidden=true;busy(true);$('doc-title').textContent='Opening PDF…';$('pages').replaceChildren();renderList();status('Reading the entire PDF…');
 try{
  const original=bytes.slice();const old=state.pdf;state.pdf=null;await old?.loadingTask.destroy();
  const pdf=await pdfjs.getDocument({data:bytes,useSystemFonts:true,isEvalSupported:false}).promise;
  if(epoch!==state.epoch){await pdf.loadingTask.destroy();return;}
  state.pdf=pdf;state.documentHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',original))].map(x=>x.toString(16).padStart(2,'0')).join('');if(epoch!==state.epoch)return;const extracted=[];
  for(let n=1;n<=pdf.numPages;n++){
   if(epoch!==state.epoch)return;
   const page=await pdf.getPage(n);const text=await page.getTextContent();
   if(epoch!==state.epoch)return;
   extracted.push(buildPage(text.items.filter(x=>'str' in x),n));
   if(n%5===0||n===pdf.numPages){status(`Reading every page · ${n} / ${pdf.numPages}`);await new Promise(r=>setTimeout(r,0));}
  }
  if(epoch!==state.epoch)return;
  state.pages=extracted;
  const chars=state.pages.reduce((n,p)=>n+p.text.length,0);
  state.fingerprint=pdf.fingerprints[0];
  const metadata=await pdf.getMetadata().catch(()=>null);
  if(epoch!==state.epoch)return;
  state.title=(metadata?.info?.Title&&metadata.info.Title.length>3?metadata.info.Title:name.replace(/\.pdf$/i,''))||'Untitled paper';
  if(guide)state.title='Monitoring Monitorability';
  $('doc-title').textContent=state.title;$('doc-meta').textContent=`${pdf.numPages} pages · ${chars.toLocaleString()} characters read · Saved on this device`;$('page-input').max=pdf.numPages;
  const saved=safeJSON('paper-lens:'+state.fingerprint,null);
  if(saved){state.highlights=saved.highlights.map(h=>({...h,chatPending:false,chatError:"",anchor:findQuote(state.pages,h.quote,h.page)})).filter(h=>h.anchor);state.summary=saved.summary||'';}
  else if(guide){const g=await (await fetch('fixtures/guide.json')).json();if(epoch!==state.epoch)return;state.highlights=g.highlights.map(h=>({...h,anchor:findQuote(state.pages,h.quote,h.page)})).filter(h=>h.anchor);state.summary=g.summary;}
  else if(chars>100){state.highlights=selectCore(state.pages);state.summary='Local sentence ranking selects reading cues across sections. Connect AI for whole-paper explanations, or write your own notes.';}
  await preparePages(epoch);if(epoch!==state.epoch)return;
  renderList();save();busy(false);
  if(chars<100){status('This PDF has little or no selectable text. Run OCR first; no automatic highlights were created.',true);}
  else status(`${pdf.numPages} / ${pdf.numPages} pages read · ${state.highlights.length} anchored passages · ${guide?'Included source-checked guide; AI is optional.':saved?'Restored your saved reading guide.':'Local ranking; use AI for semantic explanations.'}`);
  cachePdf(original,name).catch(()=>status('Reading works, but the PDF could not be cached. Reopen the file to restore your saved notes.',true));
 }catch(error){if(epoch!==state.epoch)return;busy(false);status('Could not open PDF: '+error.message,true);}
}
function applyLayout(){document.querySelector('.reader-grid').classList.toggle('map-hidden',mapHidden);$('toggle-map').setAttribute('aria-expanded',String(!mapHidden));document.querySelector('.topbar').hidden=!headerOpen;document.querySelector('.document-bar').hidden=!headerOpen;$('toggle-header').setAttribute('aria-expanded',String(headerOpen));$('toggle-header').textContent=headerOpen?'Hide tools':'Tools';}
function closeExplanation(){clearTimeout(explanationTimer);explanationTimer=null;$('explanation-popover').hidden=true;}
function scheduleExplanationClose(){clearTimeout(explanationTimer);explanationTimer=setTimeout(closeExplanation,300);}
function explanationTarget(target){return target instanceof Element?target.closest('.highlight-rect, .pdf-tag, #explanation-popover'):null;}
document.addEventListener('pointerover',e=>{const target=explanationTarget(e.target);if(!target)return;clearTimeout(explanationTimer);explanationTimer=null;if(target.id==='explanation-popover'||explanationTarget(e.relatedTarget)===target)return;const h=state.highlights.find(h=>h.id===target.dataset.id);if(h&&($('explanation-popover').hidden||$('explanation-popover').dataset.highlight!==h.id))renderInspector(h);});
document.addEventListener('pointerout',e=>{if(explanationTarget(e.target)&&!explanationTarget(e.relatedTarget))scheduleExplanationClose();});
document.addEventListener('pointermove',e=>{if($('explanation-popover').hidden)return;if(explanationTarget(e.target)){clearTimeout(explanationTimer);explanationTimer=null;}else if(!explanationTimer)explanationTimer=setTimeout(closeExplanation,300);});
function positionExplanation(h){const panel=$('explanation-popover');const mark=state.rendered.get(h.page)?.overlay.querySelector(`[data-id="${h.id}"]`);const rect=mark?.getBoundingClientRect();const width=Math.min(370,window.innerWidth-24),height=Math.min(panel.offsetHeight||480,window.innerHeight-80);let left=rect?rect.right+14:window.innerWidth-width-18;if(left+width>window.innerWidth-12)left=rect&&rect.left>width+24?rect.left-width-14:window.innerWidth-width-12;panel.style.left=Math.max(12,left)+'px';panel.style.top=Math.max(55,Math.min(rect?.top||80,window.innerHeight-height-12))+'px';}
async function relayout({fit=false}={}){applyLayout();if(!state.pdf)return;if(state.loading){pendingLayout=true;return;}const selected=state.selected,n=Number($('page-indicator').textContent.match(/Page (\d+)/)?.[1]||$('page-input').value)||1;busy(true);closeExplanation();observer?.disconnect();const pending=[...state.rendering.values()];const epoch=++state.epoch;await Promise.allSettled(pending);if(epoch!==state.epoch)return;state.rendered.clear();state.rendering.clear();if(fit)state.scale=1;$('zoom-value').textContent=Math.round(state.scale*100)+'%';try{await preparePages(epoch);if(epoch===state.epoch){const r=await renderPage(n,epoch);if(r)scrollToSource(r.box);state.selected=selected;}}finally{if(epoch===state.epoch)busy(false);}}
async function preparePages(epoch){
 state.baseWidth=Math.max(240,Math.min(900,$('pdf-scroll').clientWidth-56));
 const container=$('pages');container.replaceChildren();
 const first=await state.pdf.getPage(1);if(epoch!==state.epoch)return;const v=first.getViewport({scale:1});
 for(const p of state.pages){const box=el('div','pdf-page');box.dataset.page=p.page;box.style.width=state.baseWidth*state.scale+'px';box.style.height=state.baseWidth*state.scale*v.height/v.width+'px';box.append(el('span','page-loading',`Page ${p.page}`),el('span','page-number',String(p.page)));container.append(box);}
 observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting&&epoch===state.epoch)renderPage(Number(entry.target.dataset.page),epoch).catch(e=>status('Page rendering failed: '+e.message,true));}},{root:$('pdf-scroll'),rootMargin:'500px 0px'});
 for(const box of container.children)observer.observe(box);
 await renderPage(1,epoch);
}
async function renderPage(n,epoch=state.epoch){
 if(state.rendered.has(n))return state.rendered.get(n);
 if(state.rendering.has(n))return state.rendering.get(n);
 const job=(async()=>{
  const box=$('pages').querySelector(`[data-page="${n}"]`);if(!box||epoch!==state.epoch)return;
  const page=await state.pdf.getPage(n);if(epoch!==state.epoch)return;
  const base=page.getViewport({scale:1});const scale=state.baseWidth*state.scale/base.width;const viewport=page.getViewport({scale});
  box.style.width=viewport.width+'px';box.style.height=viewport.height+'px';box.style.setProperty('--total-scale-factor',scale);box.style.setProperty('--scale-factor',scale);
  const canvas=el('canvas');const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.ceil(viewport.width*dpr);canvas.height=Math.ceil(viewport.height*dpr);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
  box.prepend(canvas);const task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]});
  const content=await page.getTextContent();const layer=el('div','textLayer');box.append(layer);const textLayer=new pdfjs.TextLayer({textContentSource:content,container:layer,viewport});await Promise.all([task.promise,textLayer.render()]);
  if(epoch!==state.epoch)return;
  box.querySelector('.page-loading')?.remove();const overlay=el('div','highlight-layer');box.append(overlay);
  const result={box,canvas,textLayer,overlay,task,viewport};state.rendered.set(n,result);drawHighlights(n);return result;
 })();state.rendering.set(n,job);try{return await job;}finally{if(state.rendering.get(n)===job)state.rendering.delete(n);}
}
function visibleHighlights(){const q=$('search').value.toLowerCase();return state.highlights.filter(h=>(state.filter==='all'||h.category===state.filter)&&(!q||[h.quote,h.title,h.interesting,h.mechanism,h.uncertainty,h.explanation,h.section,h.note||'',h.method?JSON.stringify(h.method):'',...(h.questions||[]),...(h.evidence||[]).map(e=>e.reason),...(h.chat||[]).map(m=>m.content)].join(' ').toLowerCase().includes(q)));}
function drawHighlights(n,all=false){
 const r=state.rendered.get(n);if(!r)return;r.overlay.replaceChildren();const bounds=r.box.getBoundingClientRect();
 for(const h of (all?state.highlights:visibleHighlights()).filter(h=>h.page===n)){
  let first=true,tagTop=null;const pdfRects=[];
  for(const part of h.anchor.parts){const span=r.textLayer.textDivs[part.item];const node=span?.firstChild;if(!node||node.nodeType!==Node.TEXT_NODE)continue;
   const range=document.createRange();range.setStart(node,Math.min(part.start,node.length));range.setEnd(node,Math.min(part.end,node.length));
   for(const rect of range.getClientRects()){if(rect.width<1||rect.height<1)continue;const a=r.viewport.convertToPdfPoint(rect.left-bounds.left,rect.top-bounds.top),b=r.viewport.convertToPdfPoint(rect.right-bounds.left,rect.bottom-bounds.top);if(tagTop===null)tagTop=rect.top-bounds.top;pdfRects.push({x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])});const mark=el('button',`highlight-rect ${h.category}${h.id===state.selected?' selected':''}`);mark.dataset.id=h.id;mark.setAttribute('aria-label',`${h.category}: ${h.quote}`);mark.tabIndex=first?0:-1;first=false;Object.assign(mark.style,{left:(rect.left-bounds.left)+'px',top:(rect.top-bounds.top)+'px',width:rect.width+'px',height:rect.height+'px'});mark.addEventListener('click',()=>selectHighlight(h.id,false));r.overlay.append(mark);}
  }
  if(tagTop!==null){const tag=el('button',`pdf-tag ${h.category}`,h.category);tag.dataset.id=h.id;tag.style.top=tagTop+'px';tag.setAttribute('aria-label',`${h.category}: ${h.quote}`);tag.addEventListener('click',()=>selectHighlight(h.id,false));r.overlay.append(tag);}
  h.geometry={page:n,coordinateSystem:'PDF points; origin at bottom-left',rects:pdfRects};
 }
}
function redraw(){for(const n of state.rendered.keys())drawHighlights(n);}
function renderList(){
 $('highlight-count').textContent=state.highlights.length;$('summary').textContent=state.summary;
 const filters=$('filters');filters.replaceChildren();for(const cat of ['all',...cats]){const b=el('button',cat===state.filter?'active':'',cat==='all'?'All':cat);b.addEventListener('click',()=>{state.filter=cat;renderList();redraw();});filters.append(b);}
 const list=$('highlight-list');list.replaceChildren();for(const h of visibleHighlights()){
  const b=el('button','passage-card'+(h.id===state.selected?' active':''));b.dataset.id=h.id;
  const top=el('span','card-top');top.append(el('span',`tag ${h.category}`,h.category),el('span','small muted',`${h.rank?'#'+h.rank+' · ':''}p. ${h.page}`));
  b.append(top,el('span','card-title',h.title||(h.quote.length>130?h.quote.slice(0,127)+'…':h.quote)),el('span','section-label',h.section));b.addEventListener('click',()=>selectHighlight(h.id,true));list.append(b);
 }
 if(!list.children.length)list.append(el('p','muted small',state.highlights.length?'No passages match this filter.':'No highlights yet. Select text or find core passages.'));
}
async function selectHighlight(id,jump=true){
 const h=state.highlights.find(h=>h.id===id);if(!h)return;$('page-input').value=h.page;state.selected=id;renderList();redraw();save();
 if(jump){const r=await renderPage(h.page);if(!r)return;const mark=r.overlay.querySelector(`[data-id="${h.id}"]`);scrollToSource(mark||r.box);}
 renderInspector(h);
}
function renderMethod(method){
 const box=el('details','method-walkthrough');box.open=true;box.append(el('summary','','Method walkthrough'));
 for(const [label,value] of [['Goal',method.goal],['Inputs',method.inputs],['Outputs',method.outputs]]){const p=el('p');p.append(el('strong','',label+': '),document.createTextNode(value));box.append(p);}
 box.append(el('h4','','Procedure and rationale'));const steps=el('ol','method-steps');for(const step of method.steps){const item=el('li');item.append(el('div','',step.action),el('div','method-rationale',step.why));steps.append(item);}box.append(steps);
 if(method.formalism.length){const formulas=el('details','method-formalism');formulas.append(el('summary','','Equations and definitions'));for(const f of method.formalism){const item=el('div','method-formula');if(f.status==='source-text'){item.append(el('code','',f.expression));const source=el('button','evidence-link',`Equation source · p. ${f.page}`);source.addEventListener('click',()=>goToEvidence(f));item.append(source);}else item.append(el('strong','','Equation not available or not needed'));item.append(el('p','',f.meaning));formulas.append(item);}box.append(formulas);}
 for(const [label,values] of [['Assumptions',method.assumptions],['Controls and ablations',method.controls],['Reproduce this method',method.reproduction]]){const details=el('details','method-checks');details.append(el('summary','',label));const list=el('ul');for(const value of values)list.append(el('li','',value));details.append(list);box.append(details);}
 const example=el('details','method-example');example.append(el('summary','',method.example.kind==='paper'?'Worked example from the paper':'Illustrative worked example (not a reported result)'),el('p','',method.example.description));if(method.example.kind==='paper'){const source=el('button','evidence-link',`Example source · p. ${method.example.page}`);source.addEventListener('click',()=>goToEvidence(method.example));example.append(source);}box.append(example);return box;
}
function renderInspector(h){
 clearTimeout(explanationTimer);explanationTimer=null;const panel=$('explanation-popover'),resetScroll=panel.hidden||panel.dataset.highlight!==h.id;panel.dataset.highlight=h.id;panel.hidden=false;const c=$('inspector-content');c.replaceChildren();
 const top=el('div','inspector-actions');const close=el('button','','× Close');close.id='close-explanation';close.addEventListener('click',closeExplanation);top.append(close);c.append(top);
 if(h.title){c.append(el('h3','insight-title',h.title),el('h4','','What is interesting'),el('div','insight-interesting',h.interesting));}
 if(h.method){c.append(renderMethod(h.method));if(h.methodAssessment)c.append(el('p','method-assessment',h.methodAssessment));}
 c.append(el('h4','',h.title?'Investigate this insight':'Explore this passage'));const tips=el('div','quick-questions');
 const specific=h.category==='result'?['Check the evidence','What experiments support this claim, and what are their limits?']:h.category==='method'?['Walk through the method','Walk through this method step by step, with a concrete example.']:['Why does this matter?','Why does this passage matter to the paper’s main argument?'];
 for(const [label,question] of (insightQuestions(h).length===3?insightQuestions(h).map(q=>[q,q]):[['Explain simply','Explain this passage in plain language.'],['Give an example','Give a concrete example that illustrates this passage. Label illustrative examples clearly.'],specific])){const b=el('button','',label);b.dataset.quickQuestion=question;b.dataset.aiExplain='';b.disabled=state.loading;b.addEventListener('click',()=>askPassage(h,question));tips.append(b);}c.append(tips);
 c.append(el('h4','','Chat about this passage'));const log=el('div','passage-chat');log.setAttribute('aria-live','polite');
 if(h.origin!=='Your highlight'&&h.explanation)log.append(el('div','explanation',h.explanation));
 if(h.mechanism){const details=el('details','insight-detail');details.append(el('summary','','How it works'),el('p','',h.mechanism));log.append(details);}
 if(h.evidence?.length){const sources=el('div','insight-evidence');sources.append(el('h4','','Evidence in the paper'));for(const evidence of h.evidence){const b=el('button','evidence-link',`${evidence.role} · p. ${evidence.page} — ${evidence.reason}`);b.dataset.evidencePage=evidence.page;b.addEventListener('click',()=>goToEvidence(evidence));sources.append(b);}log.append(sources);}
 if(h.uncertainty)log.append(el('h4','','What remains uncertain'),el('div','insight-uncertainty',h.uncertainty));
 for(const m of h.chat||[]){const item=el('div',`chat-message ${m.role}`);item.append(el('strong','',m.role==='user'?'You':'Paper Lens'),el('div','',m.content));log.append(item);}c.append(log);
 const form=el('form');form.id='passage-question';const label=el('label','note-label','Ask a question');label.htmlFor='personal-note';const input=el('textarea');input.id='personal-note';input.maxLength=1000;input.placeholder='Explain this idea, compare it, or ask a follow-up…';input.value=h.note||'';input.addEventListener('input',()=>{h.note=input.value;save();});const send=el('button','','Send');send.type='submit';send.dataset.aiExplain='';send.disabled=state.loading;form.append(label,input,send);form.addEventListener('submit',e=>{e.preventDefault();if(input.value.trim())askPassage(h,input.value.trim());});c.append(form);
 if(h.chatPending)c.append(el('p','muted small','Thinking with the whole paper…'));
 if(h.chatError){const error=el('p','error',h.chatError);error.setAttribute('role','alert');c.append(error);}
 const remove=el('button','danger','Remove highlight');remove.addEventListener('click',()=>{state.highlights=state.highlights.filter(x=>x.id!==h.id);state.selected=null;save();renderList();redraw();closeExplanation();});c.append(remove);if(resetScroll)panel.scrollTop=0;positionExplanation(h);
}
async function askPassage(h,question){
 if(state.loading)return;const s=settings();if(s.backend==='api'&&(!s.endpoint||!s.model)){openSettings();return;}
 const epoch=state.epoch,fingerprint=state.fingerprint;h.chat||=[];h.chat.push({role:'user',content:question.slice(0,1000)});h.note='';h.chatError='';h.chatPending=true;save();busy(true);renderInspector(h);
 const recent=h.chat.slice(-7,-1).map(m=>`${m.role}: ${m.content.slice(0,350)}`).join('\n');const context=h.method?`Displayed method (model-generated reconstruction; verify it against the paper): ${h.method.name}\nGoal: ${h.method.goal}\n${h.method.steps.map((step,i)=>`${i+1}. ${step.action} Rationale: ${step.why}`).join('\n')}`:'';const history=context?context.slice(0,1500)+'\nRecent conversation:\n'+recent.slice(-1400):recent;const requestSettings=s;
 const controller=new AbortController();state.controller=controller;const timer=setTimeout(()=>controller.abort(),s.backend==='api'?180000:960000);$('cancel-analysis').hidden=false;
 try{if(s.backend==='api'){providerUrl(s.endpoint);await permissionFor(s.endpoint);}if(epoch!==state.epoch)return;const analyze=s.backend==='api'?analyzeWithProvider:analyzeWithCodex;const result=await analyze({pages:state.pages,settings:requestSettings,signal:controller.signal,focus:h.quote,question:question.slice(0,1000),history});if(epoch!==state.epoch||fingerprint!==state.fingerprint)return;const answer=result.highlights.find(x=>normalize(x.quote)===normalize(h.quote));if(!answer)throw Error('No answer matched this passage. Try again.');h.chat.push({role:'assistant',content:answer.explanation+(answer.why?'\n\n'+answer.why:'')});
 }catch(e){if(epoch===state.epoch)h.chatError=e.name==='AbortError'?'Request cancelled. Your question is saved.':e.message;}finally{clearTimeout(timer);h.chatPending=false;if(epoch===state.epoch){busy(false);$('cancel-analysis').hidden=true;save();renderList();if(panelVisibleFor(h))renderInspector(h);}}
}
async function goToEvidence(evidence){const epoch=state.epoch;const anchor=findQuote(state.pages,evidence.quote,evidence.page);if(!anchor||anchor.page!==evidence.page)return;const r=await renderPage(evidence.page,epoch);if(!r||epoch!==state.epoch)return;const first=anchor.parts[0],last=anchor.parts.at(-1),start=r.textLayer.textDivs[first.item]?.firstChild,end=r.textLayer.textDivs[last.item]?.firstChild;if(!start||!end)return;closeExplanation();const range=document.createRange();range.setStart(start,Math.min(first.start,start.length));range.setEnd(end,Math.min(last.end,end.length));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('page-input').value=evidence.page;scrollToSource(start.parentElement);}
function panelVisibleFor(h){const p=$('explanation-popover');return !p.hidden&&p.dataset.highlight===h.id;}
async function permissionFor(url){
 if(!globalThis.chrome?.permissions)return;
 const origin=new URL(url).origin+'/*';if(!await chrome.permissions.contains({origins:[origin]})){const granted=await chrome.permissions.request({origins:[origin]});if(!granted)throw Error('Site access was not granted.');}
}
async function loadUrl(value){
 let u=new URL(value);if(u.hostname==='arxiv.org'&&u.pathname.startsWith('/abs/'))u.pathname=u.pathname.replace('/abs/','/pdf/');
 if(u.protocol!=='https:')throw Error('Use an HTTPS PDF URL, or Open PDF for a local file.');await permissionFor(u.href);$('url-dialog').close();$('welcome').hidden=true;$('workspace').hidden=false;status('Downloading PDF…');const response=await fetch(u.href);if(!response.ok)throw Error(`PDF download returned HTTP ${response.status}.`);const data=new Uint8Array(await response.arrayBuffer());if(new TextDecoder().decode(data.slice(0,1024)).indexOf('%PDF-')<0)throw Error('The link did not return a PDF. Open a direct PDF link or choose a local file.');await openPdf(data,u.pathname.split('/').pop()||'Paper');
}
function updateBackendUI(){const backend=$('backend').value;$('codex-settings').hidden=backend!=='codex';$('api-settings').hidden=backend!=='api';}
function updateAnalysisLabel(){$('ai-analyze').textContent=settings().backend==='api'?'Find insights with API ✦':'Find insights with local Codex ✦';}
function openSettings(){const s=settings();$('backend').value=s.backend;$('codex-model').value=s.codexModel||'';$('api-endpoint').value=s.endpoint||'';$('api-model').value=s.model||'';$('api-key').value=s.key||'';$('interests').value=s.interests||'';$('remember-key').checked=!!safeJSON('paper-lens-key','');$('settings-status').textContent='';$('connection-status').textContent='';$('setup-command').textContent=`npm run install:companion -- --extension-id ${chrome.runtime.id}`;updateBackendUI();$('settings').showModal();}
async function runAI(focus){
 if(state.loading)return;
 const s=settings();if(s.backend==='api'&&(!s.endpoint||!s.model)){openSettings();return;}
 const epoch=state.epoch;const targetFingerprint=state.fingerprint;busy(true);
 try{
  if(s.backend==='api'){providerUrl(s.endpoint);await permissionFor(s.endpoint);}if(epoch!==state.epoch)return;
  state.controller?.abort();const controller=new AbortController();state.controller=controller;$('cancel-analysis').hidden=false;
  const local=s.backend!=='api';status(local?`Local Codex is analyzing all ${state.pages.length} pages using your ChatGPT subscription…`:`Sending all ${state.pages.length} pages to ${new URL(s.endpoint).hostname}…`);
  let result;
  if(local)result=await analyzeWithCodex({pages:state.pages,settings:s,signal:controller.signal,focus:focus?.quote,onProgress:p=>{if(epoch===state.epoch)status(`Local Codex · ${p.phase||p.stage} · ${p.pages} pages · ChatGPT subscription`);}});
  else{const timer=setTimeout(()=>controller.abort(),180000);try{result=await analyzeWithProvider({pages:state.pages,settings:s,signal:controller.signal,focus:focus?.quote});}finally{clearTimeout(timer);}}

  if(epoch!==state.epoch||targetFingerprint!==state.fingerprint)return;
  if(focus){const replacement=result.highlights.find(h=>normalize(h.quote)===normalize(focus.quote));if(!replacement)throw Error('AI did not return the selected source quote. Existing explanation was kept.');focus.explanation=replacement.explanation;focus.why=replacement.why;focus.origin=replacement.origin;}
  else{closeExplanation();state.highlights=mergeHighlights(result.highlights,state.highlights);state.summary=result.summary;state.filter='all';state.selected=null;}
  save();renderList();redraw();if(focus)renderInspector(focus);else $('inspector-content').replaceChildren(el('p','muted','Choose a highlighted passage to read its explanation.'));
  status(`${local?'Local Codex':'AI'} analysis complete${result.pipeline?' · deep insights':''}${result.cached?' (cached)':''} · ${result.highlights.length} ${result.pipeline?'evidence-linked insights':'verified source quotes'}${result.methodCount?` · ${result.methodCount} method walkthroughs`:''}${result.rejected?` · ${result.rejected} entries failed source/insight checks`:''}. Explanations are generated; verify against the paper.`);
 }catch(e){if(epoch===state.epoch)status(e.name==='AbortError'?'AI request timed out or was cancelled. Existing annotations were kept.':e.message,true);}finally{if(epoch===state.epoch){busy(false);$('cancel-analysis').hidden=true;}}
}
function methodMarkdown(m){return `### Method walkthrough\n\n**Goal:** ${m.goal}\n\n**Inputs:** ${m.inputs}\n\n**Outputs:** ${m.outputs}\n\n`+m.steps.map((s,i)=>`${i+1}. ${s.action}\n   Rationale: ${s.why}\n`).join('')+'\n'+m.formalism.map(f=>f.status==='source-text'?`**Equation / definition (p. ${f.page}):** ${f.expression}\n${f.meaning}\n`:`**Formula unavailable:** ${f.meaning}\n`).join('')+[['Assumptions',m.assumptions],['Controls and ablations',m.controls],['Reproduction',m.reproduction]].map(([label,items])=>`\n**${label}:**\n`+items.map(v=>`- ${v}\n`).join('')).join('')+`\n**${m.example.kind==='paper'?'Paper example (p. '+m.example.page+')':'Illustrative example (not a reported result)'}:** ${m.example.description}\n\n`;}
async function exportNotes(format){
 const epoch=state.epoch;for(const n of new Set(state.highlights.map(h=>h.page))){await renderPage(n);if(epoch!==state.epoch)return;drawHighlights(n,true);}redraw();
 const payload={schema:'paper-lens/v1',title:state.title,fingerprint:state.fingerprint,pdfSha256:state.documentHash,pages:state.pages.length,summary:state.summary,highlights:state.highlights};
 const text=format==='json'?JSON.stringify(payload,null,2):`# ${state.title}\n\n${state.summary}\n\n`+state.highlights.map(h=>`## ${h.section} · p. ${h.page} · ${h.category}\n\n> ${h.quote}\n\n${h.explanation}\n\n${h.why}\n\n${h.method?methodMarkdown(h.method)+(h.methodAssessment?`**Method review:** ${h.methodAssessment}\n\n`:''):''}${h.interesting?`**What is interesting:** ${h.interesting}\n\n**Mechanism:** ${h.mechanism}\n\n**Uncertainty:** ${h.uncertainty}\n\n${(h.evidence||[]).map(e=>`- ${e.role}, p. ${e.page}: ${e.reason}\n  > ${e.quote}\n`).join('')}\n**Questions:**\n${(h.questions||[]).map(q=>`- ${q}`).join('\n')}\n\n`:''}${(h.chat||[]).map(m=>`**${m.role==='user'?'You':'Paper Lens'}:** ${m.content}\n\n`).join('')}${h.note?`**Draft / notes:** ${h.note}\n\n`:''}*${h.origin}*\n`).join('\n');
 const url=URL.createObjectURL(new Blob([text],{type:format==='json'?'application/json':'text/markdown'}));const a=el('a');a.href=url;a.download=state.title.replace(/[^\p{L}\p{N} -]/gu,'').slice(0,90)+'.'+(format==='json'?'json':'md');a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('export-dialog').close();
}
$('demo').addEventListener('click',async()=>{$('welcome').hidden=true;$('workspace').hidden=false;busy(true);status('Downloading Monitoring Monitorability from arXiv…');try{const r=await fetch('https://arxiv.org/pdf/2512.18311v1');if(!r.ok)throw Error(`arXiv returned HTTP ${r.status}. Try Open PDF with a downloaded copy.`);await openPdf(new Uint8Array(await r.arrayBuffer()),'Monitoring Monitorability',{guide:true});}catch(e){busy(false);status(e.message,true);}});
for(const id of ['open-file','welcome-file'])$(id).addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{const file=$('file').files[0];if(file)await openPdf(new Uint8Array(await file.arrayBuffer()),file.name);$('file').value='';});
$('open-url').addEventListener('click',()=>$('url-dialog').showModal());$('load-url').addEventListener('click',()=>{if(!$('pdf-url').reportValidity())return;loadUrl($('pdf-url').value).catch(e=>{$('url-dialog').close();$('welcome').hidden=true;$('workspace').hidden=false;status(e.message,true);});});
$('settings-open').addEventListener('click',openSettings);$('backend').addEventListener('change',updateBackendUI);
$('check-codex').addEventListener('click',async()=>{$('check-codex').disabled=true;$('connection-status').textContent='Checking local Codex…';try{const r=await nativeRequest('status');$('connection-status').textContent=r.auth==='chatgpt'?'Connected · ChatGPT subscription · no API key':'Unexpected authentication mode.';}catch(e){$('connection-status').textContent=e.message;}finally{$('check-codex').disabled=false;}});
$('save-settings').addEventListener('click',async()=>{try{const backend=$('backend').value;let endpoint=$('api-endpoint').value.trim();if(backend==='api'){endpoint=providerUrl(endpoint).href;if(!$('api-model').value.trim())throw Error('Enter a model ID.');await permissionFor(endpoint);}const s={backend,codexModel:$('codex-model').value.trim(),endpoint,model:$('api-model').value.trim(),interests:$('interests').value.trim()};sessionKey=$('api-key').value.trim();localStorage.setItem('paper-lens-settings',JSON.stringify(s));if($('remember-key').checked)localStorage.setItem('paper-lens-key',JSON.stringify(sessionKey));else localStorage.removeItem('paper-lens-key');updateAnalysisLabel();$('settings').close();}catch(e){$('settings-status').textContent=e.message;}});
$('cancel-analysis').addEventListener('click',()=>state.controller?.abort());

$('local-analyze').addEventListener('click',()=>{state.highlights=mergeHighlights(selectCore(state.pages),state.highlights);state.summary='Local sentence ranking: section-aware reading cues. Explanations describe the passage’s role; use AI for semantic analysis.';state.filter='all';state.selected=null;save();renderList();redraw();$('inspector-content').replaceChildren(el('p','muted','Choose a passage to read its explanation.'));status(`Read all ${state.pages.length} pages · ${state.highlights.length} local reading cues. No document text was sent anywhere.`);});
$('ai-analyze').addEventListener('click',()=>runAI());$('search').addEventListener('input',()=>{renderList();redraw();});$('export-open').addEventListener('click',()=>$('export-dialog').showModal());$('export-json').addEventListener('click',()=>exportNotes('json'));$('export-md').addEventListener('click',()=>exportNotes('md'));
$('show-highlights').addEventListener('change',()=>$('pages').classList.toggle('highlights-hidden',!$('show-highlights').checked));
function scrollToSource(target){suppressCloseUntil=performance.now()+250;const page=target.closest('.pdf-page');if(page)$('page-indicator').textContent=`Page ${page.dataset.page} / ${state.pages.length}`;const scroller=$('pdf-scroll');const a=target.getBoundingClientRect(),b=scroller.getBoundingClientRect();scroller.scrollTo({top:scroller.scrollTop+a.top-b.top-85,behavior:'instant'});}
async function goPage(){const n=Math.max(1,Math.min(state.pages.length,Number($('page-input').value)||1));const r=await renderPage(n);if(r)scrollToSource(r.box);}
$('page-go').addEventListener('click',goPage);$('page-input').addEventListener('keydown',e=>{if(e.key==='Enter')goPage();});
$('pdf-scroll').addEventListener('scroll',()=>{const boxes=[...$('pages').children];const top=$('pdf-scroll').getBoundingClientRect().top;const current=boxes.find(b=>b.getBoundingClientRect().bottom>top+30);if(current)$('page-indicator').textContent=`Page ${current.dataset.page} / ${state.pages.length}`;},{passive:true});
async function zoom(delta){if(!state.pdf||state.loading)return;state.scale=Math.max(.65,Math.min(2.5,state.scale+delta));if(state.scale>1)mapHidden=true;await relayout();}
$('zoom-in').addEventListener('click',()=>zoom(.15));$('zoom-out').addEventListener('click',()=>zoom(-.15));
$('pdf-scroll').addEventListener('mouseup',e=>{setTimeout(()=>{const selection=window.getSelection();const text=selection?.toString().trim();if(!text||text.length<12){$('selection-add').hidden=true;return;}const node=selection.anchorNode?.parentElement?.closest('.pdf-page');const end=selection.focusNode?.parentElement?.closest('.pdf-page');if(!node||node!==end)return;const quote=normalize(text);const anchor=findQuote(state.pages,quote,Number(node.dataset.page));if(!anchor)return;pendingSelection={quote,anchor,fingerprint:state.fingerprint};const button=$('selection-add');button.hidden=false;button.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';button.style.top=Math.max(70,e.clientY-48)+'px';},0);});
$('selection-add').addEventListener('mousedown',e=>e.preventDefault());$('selection-add').addEventListener('click',()=>{if(!pendingSelection||pendingSelection.fingerprint!==state.fingerprint)return;const h={id:'user-'+crypto.randomUUID(),...pendingSelection,page:pendingSelection.anchor.page,section:'Your selected passage',category:'contribution',explanation:'',why:'',origin:'Your highlight'};state.highlights.push(h);state.filter='all';$('search').value='';$('selection-add').hidden=true;window.getSelection()?.removeAllRanges();save();renderList();redraw();selectHighlight(h.id,false);});
$('toggle-map').addEventListener('click',()=>{mapHidden=!mapHidden;relayout();});$('hide-map').addEventListener('click',()=>{mapHidden=true;relayout();});$('toggle-header').addEventListener('click',()=>{headerOpen=!headerOpen;applyLayout();});$('fit-page').addEventListener('click',()=>relayout({fit:true}));
window.addEventListener('resize',()=>{clearTimeout(layoutTimer);layoutTimer=setTimeout(()=>{if(window.innerWidth<1000)mapHidden=true;relayout();},180);});
$('pdf-scroll').addEventListener('scroll',()=>{if(performance.now()>suppressCloseUntil)closeExplanation();},{passive:true});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeExplanation();});
updateAnalysisLabel();applyLayout();
const params=new URLSearchParams(location.search);if(params.has('url'))loadUrl(params.get('url')).catch(e=>{status('Cannot open this link as a PDF: '+e.message,true);$('workspace').hidden=false;$('welcome').hidden=true;});else if(params.get('demo')==='1')$('demo').click();else{cachedPdf().then(c=>{if(c)openPdf(new Uint8Array(c.bytes),c.name);}).catch(()=>{});}
// Read-only diagnostic hook for integration checks; contains no credentials.
globalThis.paperLens={get snapshot(){return {pages:state.pages.length,highlights:state.highlights.length,fingerprint:state.fingerprint,rendered:[...state.rendered.keys()],quotes:state.highlights.map(h=>({page:h.page,quote:h.quote,parts:h.anchor.parts.length})),summary:state.summary};}};
