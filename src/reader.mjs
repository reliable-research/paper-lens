import * as pdfjs from '../vendor/pdf.mjs';
import {buildPage,findQuote,anchorRange,selectCore,normalize,mergeHighlights} from './core.mjs';
import {analyzeWithProvider,providerUrl} from './provider.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;
const $=id=>document.getElementById(id);
const cats=['motivation','contribution','method','result','limitation'];
const state={pages:[],pdf:null,highlights:[],summary:'',filter:'all',selected:null,scale:1,rendered:new Map(),rendering:new Map(),epoch:0,title:'',fingerprint:'',controller:null,loading:false,baseWidth:620};
let sessionKey='',pendingSelection=null,observer=null;
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function safeJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function settings(){return {...safeJSON('paper-lens-settings',{}),key:sessionKey||safeJSON('paper-lens-key','')};}
function save(){if(!state.fingerprint)return;try{localStorage.setItem('paper-lens:'+state.fingerprint,JSON.stringify({title:state.title,summary:state.summary,highlights:state.highlights,selected:state.selected}));}catch{status('Browser storage is full. Export your notes before closing this tab.',true);}}
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('paper-lens',1);r.onupgradeneeded=()=>r.result.createObjectStore('pdfs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function cachePdf(bytes,name){const d=await db();await new Promise((resolve,reject)=>{const t=d.transaction('pdfs','readwrite');t.objectStore('pdfs').put({bytes,name},'last');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});d.close();}
async function cachedPdf(){const d=await db();const value=await new Promise((resolve,reject)=>{const r=d.transaction('pdfs').objectStore('pdfs').get('last');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});d.close();return value;}
function busy(on){state.loading=on;for(const id of ['local-analyze','ai-analyze','export-open','zoom-in','zoom-out','page-go'])$(id).disabled=on;for(const b of document.querySelectorAll('[data-ai-explain]'))b.disabled=on;}
async function openPdf(bytes,name,{guide=false}={}){
 const epoch=++state.epoch;state.controller?.abort();observer?.disconnect();pendingSelection=null;$('selection-add').hidden=true;window.getSelection()?.removeAllRanges();
 for(const r of state.rendered.values())r.task?.cancel();
 state.rendered=new Map();state.rendering=new Map();state.selected=null;state.pages=[];state.highlights=[];state.summary='';state.fingerprint='';state.filter='all';$('search').value='';$('inspector-content').replaceChildren(el('p','muted','Choose a passage from the reading map.'));
 $('welcome').hidden=true;$('workspace').hidden=false;busy(true);$('doc-title').textContent='Opening PDF…';$('pages').replaceChildren();renderList();status('Reading the entire PDF…');
 try{
  const original=bytes.slice();const old=state.pdf;state.pdf=null;await old?.loadingTask.destroy();
  const pdf=await pdfjs.getDocument({data:bytes,useSystemFonts:true,isEvalSupported:false}).promise;
  if(epoch!==state.epoch){await pdf.loadingTask.destroy();return;}
  state.pdf=pdf;const extracted=[];
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
  if(saved){state.highlights=saved.highlights.map(h=>({...h,anchor:findQuote(state.pages,h.quote,h.page)})).filter(h=>h.anchor);state.summary=saved.summary||'';}
  else if(guide){const g=await (await fetch('fixtures/guide.json')).json();if(epoch!==state.epoch)return;state.highlights=g.highlights.map(h=>({...h,anchor:findQuote(state.pages,h.quote,h.page)})).filter(h=>h.anchor);state.summary=g.summary;}
  else if(chars>100){state.highlights=selectCore(state.pages);state.summary='Local sentence ranking selects reading cues across sections. Connect AI for whole-paper explanations, or write your own notes.';}
  await preparePages(epoch);if(epoch!==state.epoch)return;
  renderList();save();busy(false);
  if(chars<100){status('This PDF has little or no selectable text. Run OCR first; no automatic highlights were created.',true);}
  else status(`${pdf.numPages} / ${pdf.numPages} pages read · ${state.highlights.length} anchored passages · ${guide?'Included source-checked guide; AI is optional.':saved?'Restored your saved reading guide.':'Local ranking; use AI for semantic explanations.'}`);
  cachePdf(original,name).catch(()=>status('Reading works, but the PDF could not be cached. Reopen the file to restore your saved notes.',true));
 }catch(error){if(epoch!==state.epoch)return;busy(false);status('Could not open PDF: '+error.message,true);}
}
async function preparePages(epoch){
 state.baseWidth=Math.max(350,Math.min(720,$('pdf-scroll').clientWidth-40));
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
  const result={box,canvas,textLayer,overlay,task};state.rendered.set(n,result);drawHighlights(n);return result;
 })();state.rendering.set(n,job);try{return await job;}finally{if(state.rendering.get(n)===job)state.rendering.delete(n);}
}
function visibleHighlights(){const q=$('search').value.toLowerCase();return state.highlights.filter(h=>(state.filter==='all'||h.category===state.filter)&&(!q||[h.quote,h.explanation,h.section,h.note||''].join(' ').toLowerCase().includes(q)));}
function drawHighlights(n){
 const r=state.rendered.get(n);if(!r)return;r.overlay.replaceChildren();const bounds=r.box.getBoundingClientRect();
 for(const h of visibleHighlights().filter(h=>h.page===n)){
  let first=true;
  for(const part of h.anchor.parts){const span=r.textLayer.textDivs[part.item];const node=span?.firstChild;if(!node||node.nodeType!==Node.TEXT_NODE)continue;
   const range=document.createRange();range.setStart(node,Math.min(part.start,node.length));range.setEnd(node,Math.min(part.end,node.length));
   for(const rect of range.getClientRects()){if(rect.width<1||rect.height<1)continue;const mark=el('button',`highlight-rect ${h.category}${h.id===state.selected?' selected':''}`);mark.dataset.id=h.id;mark.title=h.explanation;mark.setAttribute('aria-label',`${h.category}: ${h.quote}`);mark.tabIndex=first?0:-1;first=false;Object.assign(mark.style,{left:(rect.left-bounds.left)+'px',top:(rect.top-bounds.top)+'px',width:rect.width+'px',height:rect.height+'px'});mark.addEventListener('click',()=>selectHighlight(h.id,false));r.overlay.append(mark);}
  }
 }
}
function redraw(){for(const n of state.rendered.keys())drawHighlights(n);}
function renderList(){
 $('highlight-count').textContent=state.highlights.length;$('summary').textContent=state.summary;
 const filters=$('filters');filters.replaceChildren();for(const cat of ['all',...cats]){const b=el('button',cat===state.filter?'active':'',cat==='all'?'All':cat);b.addEventListener('click',()=>{state.filter=cat;renderList();redraw();});filters.append(b);}
 const list=$('highlight-list');list.replaceChildren();for(const h of visibleHighlights()){
  const b=el('button','passage-card'+(h.id===state.selected?' active':''));b.dataset.id=h.id;
  const top=el('span','card-top');top.append(el('span',`tag ${h.category}`,h.category),el('span','small muted',`p. ${h.page}`));
  b.append(top,el('span','card-title',h.quote.length>130?h.quote.slice(0,127)+'…':h.quote),el('span','section-label',h.section));b.addEventListener('click',()=>selectHighlight(h.id,true));list.append(b);
 }
 if(!list.children.length)list.append(el('p','muted small',state.highlights.length?'No passages match this filter.':'No highlights yet. Select text or find core passages.'));
}
async function selectHighlight(id,jump=true){
 const h=state.highlights.find(h=>h.id===id);if(!h)return;$('page-input').value=h.page;state.selected=id;renderList();renderInspector(h);redraw();save();
 if(jump){const r=await renderPage(h.page);if(!r)return;const mark=r.overlay.querySelector(`[data-id="${h.id}"]`);scrollToSource(mark||r.box);}
}
function renderInspector(h){
 document.querySelector('.inspector').classList.add('open');const c=$('inspector-content');c.replaceChildren();
 const top=el('div','inspector-actions');const close=el('button','','Close margin');close.addEventListener('click',()=>document.querySelector('.inspector').classList.remove('open'));top.append(close);
 c.append(top,el('div',`tag ${h.category}`,h.category),el('h3','inspector-title',h.section),el('div','muted small',`Page ${h.page} · Source-anchored passage`),el('blockquote','quote',h.quote),el('h4','','What it means'),el('div','explanation',h.explanation));
 if(h.why)c.append(el('h4','','Why it matters'),el('div','why',h.why));
 c.append(el('div','origin',h.origin));
 const label=el('label','note-label','Your notes');label.htmlFor='personal-note';const note=el('textarea');note.id='personal-note';note.placeholder='Your question, connection, or observation…';note.value=h.note||'';const saved=el('div','note-saved','Saved automatically');note.addEventListener('input',()=>{h.note=note.value;save();});c.append(label,note,saved);
 const actions=el('div','inspector-actions');const jump=el('button','','Go to source ↗');jump.addEventListener('click',()=>selectHighlight(h.id,true));const explain=el('button','','Explain with AI ✦');explain.dataset.aiExplain='';explain.disabled=state.loading;explain.addEventListener('click',()=>runAI(h));const remove=el('button','danger','Remove');remove.addEventListener('click',()=>{state.highlights=state.highlights.filter(x=>x.id!==h.id);state.selected=null;save();renderList();redraw();c.replaceChildren(el('p','muted','Highlight removed.'));});actions.append(jump,explain,remove);c.append(actions);
}
async function permissionFor(url){
 if(!globalThis.chrome?.permissions)return;
 const origin=new URL(url).origin+'/*';if(!await chrome.permissions.contains({origins:[origin]})){const granted=await chrome.permissions.request({origins:[origin]});if(!granted)throw Error('Site access was not granted.');}
}
async function loadUrl(value){
 let u=new URL(value);if(u.hostname==='arxiv.org'&&u.pathname.startsWith('/abs/'))u.pathname=u.pathname.replace('/abs/','/pdf/');
 if(u.protocol!=='https:')throw Error('Use an HTTPS PDF URL, or Open PDF for a local file.');await permissionFor(u.href);$('url-dialog').close();$('welcome').hidden=true;$('workspace').hidden=false;status('Downloading PDF…');const response=await fetch(u.href);if(!response.ok)throw Error(`PDF download returned HTTP ${response.status}.`);const data=new Uint8Array(await response.arrayBuffer());if(new TextDecoder().decode(data.slice(0,1024)).indexOf('%PDF-')<0)throw Error('The link did not return a PDF. Open a direct PDF link or choose a local file.');await openPdf(data,u.pathname.split('/').pop()||'Paper');
}
function openSettings(){const s=settings();$('api-endpoint').value=s.endpoint||'';$('api-model').value=s.model||'';$('api-key').value=s.key||'';$('interests').value=s.interests||'';$('remember-key').checked=!!safeJSON('paper-lens-key','');$('settings-status').textContent='';$('settings').showModal();}
async function runAI(focus){
 if(state.loading)return;
 const s=settings();if(!s.endpoint||!s.model){openSettings();return;}
 const epoch=state.epoch;const targetFingerprint=state.fingerprint;busy(true);
 try{
  providerUrl(s.endpoint);await permissionFor(s.endpoint);if(epoch!==state.epoch)return;
  state.controller?.abort();const controller=new AbortController();state.controller=controller;const timer=setTimeout(()=>controller.abort(),180000);busy(true);status(`Sending all ${state.pages.length} pages to ${new URL(s.endpoint).hostname} for ${focus?'selected-passage explanation':'whole-paper analysis'}…`);
  let result;try{result=await analyzeWithProvider({pages:state.pages,settings:s,signal:controller.signal,focus:focus?.quote});}finally{clearTimeout(timer);}
  if(epoch!==state.epoch||targetFingerprint!==state.fingerprint)return;
  if(focus){const replacement=result.highlights.find(h=>normalize(h.quote)===normalize(focus.quote));if(!replacement)throw Error('AI did not return the selected source quote. Existing explanation was kept.');focus.explanation=replacement.explanation;focus.why=replacement.why;focus.origin=replacement.origin;}
  else{state.highlights=mergeHighlights(result.highlights,state.highlights);state.summary=result.summary;state.filter='all';state.selected=null;}
  save();renderList();redraw();if(focus)renderInspector(focus);else $('inspector-content').replaceChildren(el('p','muted','Choose a highlighted passage to read its explanation.'));
  status(`AI analysis complete · ${result.highlights.length} verified source quotes${result.rejected?` · ${result.rejected} unanchored/duplicate entries rejected`:''}. Explanations are generated; verify against the paper.`);
 }catch(e){if(epoch===state.epoch)status(e.name==='AbortError'?'AI request timed out or was cancelled. Existing annotations were kept.':e.message,true);}finally{if(epoch===state.epoch)busy(false);}
}
function exportNotes(format){
 const payload={schema:'paper-lens/v1',title:state.title,fingerprint:state.fingerprint,pages:state.pages.length,summary:state.summary,highlights:state.highlights};
 const text=format==='json'?JSON.stringify(payload,null,2):`# ${state.title}\n\n${state.summary}\n\n`+state.highlights.map(h=>`## ${h.section} · p. ${h.page} · ${h.category}\n\n> ${h.quote}\n\n${h.explanation}\n\n${h.why}\n\n${h.note?`**My notes:** ${h.note}\n\n`:''}*${h.origin}*\n`).join('\n');
 const url=URL.createObjectURL(new Blob([text],{type:format==='json'?'application/json':'text/markdown'}));const a=el('a');a.href=url;a.download=state.title.replace(/[^\p{L}\p{N} -]/gu,'').slice(0,90)+'.'+(format==='json'?'json':'md');a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('export-dialog').close();
}
$('demo').addEventListener('click',async()=>{$('welcome').hidden=true;$('workspace').hidden=false;busy(true);status('Downloading Monitoring Monitorability from arXiv…');try{const r=await fetch('https://arxiv.org/pdf/2512.18311v1');if(!r.ok)throw Error(`arXiv returned HTTP ${r.status}. Try Open PDF with a downloaded copy.`);await openPdf(new Uint8Array(await r.arrayBuffer()),'Monitoring Monitorability',{guide:true});}catch(e){busy(false);status(e.message,true);}});
for(const id of ['open-file','welcome-file'])$(id).addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{const file=$('file').files[0];if(file)await openPdf(new Uint8Array(await file.arrayBuffer()),file.name);$('file').value='';});
$('open-url').addEventListener('click',()=>$('url-dialog').showModal());$('load-url').addEventListener('click',()=>{if(!$('pdf-url').reportValidity())return;loadUrl($('pdf-url').value).catch(e=>{$('url-dialog').close();$('welcome').hidden=true;$('workspace').hidden=false;status(e.message,true);});});
$('settings-open').addEventListener('click',openSettings);$('save-settings').addEventListener('click',async()=>{try{const endpoint=providerUrl($('api-endpoint').value).href;if(!$('api-model').value.trim())throw Error('Enter a model ID.');await permissionFor(endpoint);const s={endpoint,model:$('api-model').value.trim(),interests:$('interests').value.trim()};sessionKey=$('api-key').value.trim();localStorage.setItem('paper-lens-settings',JSON.stringify(s));if($('remember-key').checked)localStorage.setItem('paper-lens-key',JSON.stringify(sessionKey));else localStorage.removeItem('paper-lens-key');$('settings').close();}catch(e){$('settings-status').textContent=e.message;}});
$('local-analyze').addEventListener('click',()=>{state.highlights=mergeHighlights(selectCore(state.pages),state.highlights);state.summary='Local sentence ranking: section-aware reading cues. Explanations describe the passage’s role; use AI for semantic analysis.';state.filter='all';state.selected=null;save();renderList();redraw();$('inspector-content').replaceChildren(el('p','muted','Choose a passage to read its explanation.'));status(`Read all ${state.pages.length} pages · ${state.highlights.length} local reading cues. No document text was sent anywhere.`);});
$('ai-analyze').addEventListener('click',()=>runAI());$('search').addEventListener('input',()=>{renderList();redraw();});$('export-open').addEventListener('click',()=>$('export-dialog').showModal());$('export-json').addEventListener('click',()=>exportNotes('json'));$('export-md').addEventListener('click',()=>exportNotes('md'));
$('show-highlights').addEventListener('change',()=>$('pages').classList.toggle('highlights-hidden',!$('show-highlights').checked));
function scrollToSource(target){const scroller=$('pdf-scroll');const a=target.getBoundingClientRect(),b=scroller.getBoundingClientRect();scroller.scrollTo({top:scroller.scrollTop+a.top-b.top-85,behavior:'instant'});}
async function goPage(){const n=Math.max(1,Math.min(state.pages.length,Number($('page-input').value)||1));const r=await renderPage(n);if(r)scrollToSource(r.box);}
$('page-go').addEventListener('click',goPage);$('page-input').addEventListener('keydown',e=>{if(e.key==='Enter')goPage();});
$('pdf-scroll').addEventListener('scroll',()=>{const boxes=[...$('pages').children];const top=$('pdf-scroll').getBoundingClientRect().top;const current=boxes.find(b=>b.getBoundingClientRect().bottom>top+30);if(current)$('page-indicator').textContent=`Page ${current.dataset.page} / ${state.pages.length}`;},{passive:true});
async function zoom(delta){if(!state.pdf||state.loading)return;busy(true);state.scale=Math.max(.65,Math.min(1.8,state.scale+delta));$('zoom-value').textContent=Math.round(state.scale*100)+'%';observer?.disconnect();state.rendered.clear();state.rendering.clear();const epoch=++state.epoch;state.controller?.abort();try{await preparePages(epoch);}finally{if(epoch===state.epoch)busy(false);}}
$('zoom-in').addEventListener('click',()=>zoom(.15));$('zoom-out').addEventListener('click',()=>zoom(-.15));
$('pdf-scroll').addEventListener('mouseup',e=>{setTimeout(()=>{const selection=window.getSelection();const text=selection?.toString().trim();if(!text||text.length<12){$('selection-add').hidden=true;return;}const node=selection.anchorNode?.parentElement?.closest('.pdf-page');const end=selection.focusNode?.parentElement?.closest('.pdf-page');if(!node||node!==end)return;const quote=normalize(text);const anchor=findQuote(state.pages,quote,Number(node.dataset.page));if(!anchor)return;pendingSelection={quote,anchor,fingerprint:state.fingerprint};const button=$('selection-add');button.hidden=false;button.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';button.style.top=Math.max(70,e.clientY-48)+'px';},0);});
$('selection-add').addEventListener('mousedown',e=>e.preventDefault());$('selection-add').addEventListener('click',()=>{if(!pendingSelection||pendingSelection.fingerprint!==state.fingerprint)return;const h={id:'user-'+crypto.randomUUID(),...pendingSelection,page:pendingSelection.anchor.page,section:'Your selected passage',category:'contribution',explanation:'Your highlight. Add a note below, or choose Explain with AI to get an explanation using the whole paper as context.',why:'',origin:'Your highlight'};state.highlights.push(h);state.filter='all';$('search').value='';$('selection-add').hidden=true;window.getSelection()?.removeAllRanges();save();renderList();redraw();selectHighlight(h.id,false);});
const params=new URLSearchParams(location.search);if(params.has('url'))loadUrl(params.get('url')).catch(e=>{status('Cannot open this link as a PDF: '+e.message,true);$('workspace').hidden=false;$('welcome').hidden=true;});else if(params.get('demo')==='1')$('demo').click();else{cachedPdf().then(c=>{if(c)openPdf(new Uint8Array(c.bytes),c.name);}).catch(()=>{});}
// Read-only diagnostic hook for integration checks; contains no credentials.
globalThis.paperLens={get snapshot(){return {pages:state.pages.length,highlights:state.highlights.length,fingerprint:state.fingerprint,rendered:[...state.rendered.keys()],quotes:state.highlights.map(h=>({page:h.page,quote:h.quote,parts:h.anchor.parts.length})),summary:state.summary};}};
