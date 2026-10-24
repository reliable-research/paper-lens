import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize, buildPage, findQuote, extractSentences, selectCore, validateAnalysis, mergeHighlights} from '../src/core.mjs';

test('normalizes PDF ligatures, line hyphenation and whitespace',()=>{
 assert.equal(normalize('We ﬁnd moni-\ntorability   improves.'),'We find monitorability improves.');
});
test('anchors a quote spanning text items and preserves item offsets',()=>{
 const p=buildPage([{str:'We ﬁnd moni-'},{str:'torability improves.'}],1);
 const hit=findQuote([p],'We find monitorability improves.');
 assert.ok(hit); assert.equal(hit.page,1); assert.equal(hit.parts.length,2);
 assert.equal(findQuote([p],'We find monitorability always improves.'),null);
});
test('section-aware ranking covers methods, results, and limitations without references',()=>{
 const p=buildPage([{str:'1 Introduction',hasEOL:true},{str:'We introduce a new evaluation suite for monitoring reasoning models across diverse settings.',hasEOL:true},{str:'2 Methods',hasEOL:true},{str:'We measure monitorability using the product of true positive and true negative rates.',hasEOL:true},{str:'3 Results',hasEOL:true},{str:'We find that reinforcement learning does not substantially reduce monitorability in these experiments.',hasEOL:true},{str:'4 Limitations',hasEOL:true},{str:'Our experiments are limited to two training runs and cannot establish universal conclusions.',hasEOL:true},{str:'References',hasEOL:true},{str:'We introduce an unrelated benchmark in a cited paper.'}],1);
 const result=selectCore([p],12);
 assert.ok(result.some(x=>x.category==='method'));
 assert.ok(result.some(x=>x.category==='result'));
 assert.ok(result.some(x=>x.category==='limitation'));
 assert.ok(!result.some(x=>x.quote.includes('unrelated')));
});
test('validates AI quotations against the actual PDF, rejects hallucination and invalid data',()=>{
 const pages=[buildPage([{str:'We find that longer chains of thought are generally more monitorable.'}],1)];
 const r=validateAnalysis({summary:'A study.',highlights:[{quote:pages[0].text,category:'result',explanation:'Longer reasoning helped monitoring.'},{quote:'RL solves reward hacking.',category:'result',explanation:'False'}]},pages);
 assert.equal(r.highlights.length,1); assert.equal(r.rejected,1);
 assert.throws(()=>validateAnalysis({highlights:[]},pages),/No verified/);
 assert.throws(()=>validateAnalysis({highlights:[{quote:pages[0].text,explanation:''}]},pages),/No verified/);
});
test('splits sentences without treating decimal values as sentence boundaries',()=>{
 const sentences=extractSentences([buildPage([{str:'3 Results',hasEOL:true},{str:'The recall decreases from 0.85 to 0.70 in this coding experiment. This second sentence describes a different observation in enough detail.'}],1)]);
 assert.ok(sentences.some(x=>x.quote.includes('0.85 to 0.70')));
});

test('local ranking resumes in appendices after skipping the reference list',()=>{
 const pages=[buildPage([{str:'References',hasEOL:true},{str:'We introduce an unrelated benchmark in a cited paper with a long reference entry.'}],1),buildPage([{str:'A Additional Experiments',hasEOL:true},{str:'Our experiments are limited to two training runs and cannot establish universal conclusions.'}],2)];
 const result=selectCore(pages);assert.ok(result.some(x=>x.page===2));assert.ok(!result.some(x=>x.page===1));
});

test('reanalysis preserves notes and distinct passages without duplicate IDs or anchors',async()=>{
 const {mergeHighlights}=await import('../src/core.mjs');
 const old=[{id:'ai-0',page:1,anchor:{start:4},note:'Keep this',origin:'AI'},{id:'ai-1',page:2,anchor:{start:5},note:'Another',origin:'AI'}];
 const fresh=[{id:'ai-0',page:1,anchor:{start:4},explanation:'Updated'}];
 const result=mergeHighlights(fresh,old);assert.equal(result.length,2);assert.equal(result[0].note,'Keep this');assert.equal(result[0].explanation,'Updated');assert.equal(new Set(result.map(x=>x.id)).size,2);
});

test('reanalysis preserves passage chat even without notes',()=>{const h={id:'old',page:1,anchor:{start:4},quote:'A source quote',chat:[{role:'user',content:'Why?'},{role:'assistant',content:'Evidence.'}]};const result=mergeHighlights([{...h,id:'new',chat:undefined}], [h]);assert.deepEqual(result[0].chat,h.chat);});

test('deep insight rank survives annotation merging while personal passages remain',()=>{const a={page:1,anchor:{start:0},rank:2},b={page:8,anchor:{start:0},rank:1};assert.deepEqual(mergeHighlights([a,b],[{page:2,anchor:{start:1},origin:'Your highlight'}]).map(h=>h.page),[8,1,2]);});
