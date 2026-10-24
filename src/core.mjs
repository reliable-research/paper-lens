// Pure extraction and anchoring: every displayed passage resolves to source text.
export function normalize(value){
 return String(value).normalize('NFKC').replace(/\u00ad/g,'').replace(/-\s+(?=[a-z])/g,'').replace(/\s+/g,' ').trim();
}
export function buildPage(items,page){
 let raw='', refs=[];
 items.forEach((item,i)=>{
  for(let j=0;j<item.str.length;j++){raw+=item.str[j];refs.push({i,j});}
  raw+=item.hasEOL?'\n':' ';refs.push(null);
 });
 let chars=[], map=[];
 for(let k=0;k<raw.length;k++){
  if(raw[k]==='\u00ad')continue;
  if(raw[k]==='-' && /^-\s+[a-z]/.test(raw.slice(k))){k++;while(/\s/.test(raw[k]))k++;k--;continue;}
  const s=raw[k].normalize('NFKC');
  for(const c of s){if(/\s/.test(c)){if(chars.length && chars.at(-1)!==' '){chars.push(' ');map.push(refs[k]);}}else{chars.push(c);map.push(refs[k]);}}
 }
 if(chars.at(-1)===' '){chars.pop();map.pop();}
 return {page,items,text:chars.join(''),map,lines:raw.split('\n').map(normalize).filter(Boolean)};
}
export function anchorRange(p,start,end){
 const groups=new Map();
 for(let k=start;k<end;k++){const ref=p.map[k];if(!ref)continue;const part=groups.get(ref.i);if(part)part.end=Math.max(part.end,ref.j+1);else groups.set(ref.i,{item:ref.i,start:ref.j,end:ref.j+1});}
 return {page:p.page,start,end,parts:[...groups.values()]};
}
export function findQuote(pages,quote,preferredPage){
 const q=normalize(quote);if(q.length<12)return null;
 const order=preferredPage?[...pages.filter(p=>p.page===preferredPage),...pages.filter(p=>p.page!==preferredPage)]:pages;
 for(const p of order){const start=p.text.indexOf(q);if(start>=0)return anchorRange(p,start,start+q.length);}
 return null;
}
export function categoryFor(section,quote=''){
 if(/limit|caveat|future|discussion|conclusion/i.test(section)&&/limit|only|however|unclear|future|need|caution|not |two /i.test(quote))return 'limitation';
 if(/limit|only two|single seed|unclear|further study|more thorough|do not make any strong|not.*generaliz/i.test(quote))return 'limitation';
 if(/method|evaluat|metric|archetype|process|intervention/i.test(section)&&!/we (find|see|observe)/i.test(quote))return 'method';
 if(/result|scal|obfuscat|frontier|monitorability of|getting more/i.test(section)||/we (find|see|observe)|results (show|suggest)|decreas|increas/i.test(quote))return 'result';
 if(/introduc|propos|contribut/i.test(quote))return 'contribution';
 return 'motivation';
}
const headingPattern=/^(?:(?:\d+(?:\.\d+)*|[A-J](?:\.\d+)*)\s+[A-Z][^.!?]{2,100}|Abstract|References|Bibliography)$/;
export function extractSentences(pages){
 let section='Abstract', stopped=false, result=[];
 for(const p of pages){
  const headings=[];let cursor=0;
  for(const line of p.lines){const idx=p.text.indexOf(line,cursor);if(idx>=0)cursor=idx+line.length;if(idx>=0&&headingPattern.test(line)&&!line.endsWith('-'))headings.push({at:idx,title:line});}
  const blocks=[];let start=0;
  for(const h of headings){if(h.at>start)blocks.push({start,end:h.at,section});section=h.title;start=h.at+h.title.length;}
  if(start<p.text.length)blocks.push({start,end:p.text.length,section});
  const segmenter=new Intl.Segmenter('en',{granularity:'sentence'});
  for(const block of blocks){
   if(/^(References|Bibliography)$/.test(block.section)){stopped=true;continue;}
   if(stopped && /^(?:Appendix\s+)?[A-J](?:\.\d+)*\s/.test(block.section))stopped=false;
   if(stopped)continue;
   for(const {segment,index} of segmenter.segment(p.text.slice(block.start,block.end))){
    const quote=segment.trim();
    if(quote.length<50||quote.length>750||quote.split(' ').length<9||/^Figure \d|^Table \d/.test(quote))continue;
    const at=p.text.indexOf(quote,block.start+index);if(at<0)continue;
    result.push({quote,section:block.section,page:p.page,category:categoryFor(block.section,quote),anchor:anchorRange(p,at,at+quote.length)});
   }
  }
 }
 return result;
}
export function selectCore(pages,budget=24){
 const candidates=extractSentences(pages);const counts=new Map();
 for(const c of candidates){c.score=1+( /we (introduce|propose|find|show|demonstrate|evaluate)|our (results|evaluations|experiments)|these results|however|limitation/i.test(c.quote)?5:0)+(/monitorability|reward|obfuscat|reinforcement|evaluat|method|limitation|contribut/i.test(c.quote)?2:0)-( /\[\d/.test(c.quote)?1:0);}
 const groups=new Map();for(const c of candidates){if(!groups.has(c.section))groups.set(c.section,[]);groups.get(c.section).push(c);}
 const selected=[];
 for(const group of groups.values()){const best=group.sort((a,b)=>b.score-a.score)[0];if(best&&best.score>=3&&!selected.some(x=>x.page===best.page&&x.anchor.start===best.anchor.start))selected.push(best);}
 selected.sort((a,b)=>b.score-a.score);selected.splice(budget);
 for(const c of candidates.sort((a,b)=>b.score-a.score)){if(selected.length>=budget)break;if(selected.includes(c)||selected.some(x=>normalize(x.quote)===normalize(c.quote)))continue;if(selected.filter(x=>x.section===c.section).length>=3)continue;selected.push(c);}
 return selected.sort((a,b)=>a.page-b.page||a.anchor.start-b.anchor.start).map((c,i)=>({...c,id:`local-${i}`,explanation:`This passage was selected as a ${c.category} in “${c.section}” because it states a claim, definition, or qualification central to this section. Read the surrounding paragraph to check its scope. This is a local reading cue, not an AI paraphrase.`,why:`Helps trace the paper's ${c.category==='method'?'measurement or experimental design':c.category==='limitation'?'boundaries and uncertainty':'argument'}.`,origin:'Local sentence ranking'}));
}
export function validateAnalysis(data,pages){
 if(!data||!Array.isArray(data.highlights))throw Error('The provider did not return a highlights array.');
 let rejected=0;const highlights=[];const seen=new Set();
 for(const h of data.highlights){
  if(!h || typeof h.quote!=='string'||typeof h.explanation!=='string'||!h.explanation.trim()){rejected++;continue;}
  const anchor=findQuote(pages,h.quote,Number(h.page));const key=anchor?`${anchor.page}:${anchor.start}`:'';
  if(!anchor||seen.has(key)){rejected++;continue;}seen.add(key);
  highlights.push({id:`ai-${highlights.length}`,quote:normalize(h.quote),category:['motivation','contribution','method','result','limitation'].includes(h.category)?h.category:'result',section:String(h.section||'Paper'),explanation:h.explanation.slice(0,6000),why:String(h.why||'').slice(0,2000),page:anchor.page,anchor,origin:'AI · quote verified'});
 }
 if(!highlights.length)throw Error('No verified highlights: the returned quotations could not be anchored to this PDF.');
 return {summary:typeof data.summary==='string'?data.summary.slice(0,6000):'',highlights,rejected};
}

export function mergeHighlights(next,previous){
 const retained=previous.filter(h=>h.note||h.origin==='Your highlight');
 const unique=new Map();
 for(const h of [...next,...retained]){
  const key=`${h.page}:${h.anchor.start}`;
  const existing=unique.get(key);
  if(existing){if(h.note)existing.note=h.note;continue;}
  unique.set(key,{...h,id:`passage-${h.page}-${h.anchor.start}`});
 }
 return [...unique.values()].sort((a,b)=>a.page-b.page||a.anchor.start-b.anchor.start);
}
