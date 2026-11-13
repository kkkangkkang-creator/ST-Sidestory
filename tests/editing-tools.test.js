import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML,DOMParser} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';
const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const S=new Function(read('series.js').split('\nlet seriesSelection')[0]+';return SideSeries;')();

test('deleting articles re-links what is left of a series',()=>{
 const p=(id,parentId,extra={})=>({id,parentId,seriesId:'s',seriesTitle:'S',action:parentId?'continue':'new',createdAt:Number(id.slice(1)),...extra});
 const line=[p('a1',null),p('a2','a1'),p('a3','a2'),p('a4','a3'),p('a5','a4')];
 const apply=(rows,ids)=>{const ch=new Map(S.relink(rows,ids).map(r=>[r.id,r]));return rows.filter(r=>!ids.includes(r.id)).map(r=>ch.get(r.id)||r);};
 let left=apply(line,['a2','a4']);assert.deepEqual(left.map(r=>[r.id,r.parentId]),[['a1',null],['a3','a1'],['a5','a3']]);
 left=apply(line,['a1']);assert.deepEqual(left.find(r=>r.id==='a2').parentId,null);
 // A deleted part's oldest version takes its place; later parts and other versions follow it.
 const versions=[p('a1',null),p('a2','a1'),{...p('a6','a2'),action:'revise'},{...p('a7','a2'),action:'regenerate',baseAction:'continue'},p('a3','a2')];
 left=apply(versions,['a2']);const v=left.find(r=>r.id==='a6');
 assert.deepEqual([v.action,v.parentId],['continue','a1']);assert.equal(left.find(r=>r.id==='a7').parentId,'a6');assert.equal(left.find(r=>r.id==='a3').parentId,'a6');
 // Branches move up together; a single survivor stops being a series.
 const branched=[p('a1',null),p('a2','a1'),p('a3','a2'),p('a4','a2')];
 assert.deepEqual(apply(branched,['a2']).filter(r=>r.parentId==='a1').map(r=>r.id),['a3','a4']);
 const single=apply(line.slice(0,2),['a2']);assert.deepEqual([single[0].seriesId,single[0].seriesTitle],[null,null]);
 assert.deepEqual(S.relink(line,[]),[]);
});

test('series multi-delete, find & replace and per-character translation rules in the full UI',async()=>{
 const {window,document}=parseHTML('<html><body><div id="extensionsMenu"></div></body></html>');
 window.innerWidth=400;window.innerHeight=800;window.matchMedia=()=>({matches:false});
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 Object.assign(globalThis,{window,document,DOMParser,sessionStorage:storage,localStorage:storage});
 const records=new Map();
 const db={close(){},transaction(){let count=0;const tx={};function req(fn){count++;const r={};setTimeout(()=>{r.result=fn();r.onsuccess?.();count--;setTimeout(()=>{if(!count)tx.oncomplete?.();},0);},0);return r;}tx.objectStore=()=>({getAll:()=>req(()=>[...records.values()]),put:v=>req(()=>records.set(v.id,structuredClone(v))),delete:id=>req(()=>records.delete(id))});return tx;}};
 globalThis.indexedDB={open(){const r={};setTimeout(()=>{r.result=db;r.onsuccess?.();},0);return r;}};
 const events=new Map();let finishGeneration;const translations=[];
 const c={chatId:'current',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'Monia',data:{name:'Monia',description:''}}],chat:[{name:'Monia',mes:'HELLO',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'u.png':'U'},persona_descriptions:{}},name1:'U',mainApi:'openai',extensionSettings:{st_sidestory:{mode:'story'}},saveSettingsDebounced(){},
  generateQuietPrompt:async()=>new Promise(resolve=>finishGeneration=resolve),getTokenCountAsync:async t=>Math.ceil(t.length/3),getTokenizerModel:()=>'m',eventTypes:{CHAT_CHANGED:'chat',WORLDINFO_ENTRIES_LOADED:'lore'},eventSource:{on(k,f){events.set(k,f);},removeListener(k){events.delete(k);}},
  generateRaw:async p=>{translations.push(p.prompt[0].content);return p.prompt[1].content.match(/⟦[^⟧]+⟧/g).map(m=>m+'\n마이클이 미소 지었다. <b>마이클</b>').join('\n\n');}};
 globalThis.SillyTavern={getContext:()=>c};
 const h=createSTHost({context:()=>c,world:{world_names:[],selected_world_info:[],loadWorldInfo:async()=>({entries:{}})}});
 const code=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8').split('await (async function(stHost){\n')[1].split('\n})(hostAdapter);')[0];
 await new Function('stHost','return (async()=>{'+code+'})()')(h);
 const root=document.querySelector('#st-sidestory-root').shadowRoot,$=s=>root.querySelector(s);
 const click=selector=>{assert($(selector),'missing '+selector);$(selector).dispatchEvent(new window.Event('click',{bubbles:true}));};
 const type=(selector,value)=>{const el=$(selector);assert(el,'missing '+selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout: '+($('#notice')?.textContent||''));};
 const idle=()=>!$('.busy-pill:not(.ready)')&&!$('#stop-reader')&&!$('#stop');
 const answer=async()=>{await wait(()=>$('#side-dialog-confirm'));click('#side-dialog-confirm');};
 document.querySelector('#side-story-wand').dispatchEvent(new window.Event('click',{bubbles:true}));await wait(()=>$('.nav-new'));
 click('.nav-new');await wait(()=>$('#generate')&&!$('#generate').disabled);type('#request','시작');click('#generate');await wait(()=>finishGeneration);finishGeneration('Michael smiled. Michaela waved. MICHAEL ran.');await wait(()=>records.size===1&&idle());
 for(const [i,text] of ['TWO','THREE','FOUR'].entries()){finishGeneration=null;$('#followup').value='다음 '+i;click('#continue');await wait(()=>finishGeneration);finishGeneration(text);await wait(()=>records.size===i+2&&idle());}
 const byText=t=>[...records.values()].find(r=>r.content===t);

 // Pick parts 2 and 3 in the series sheet and delete them: part 4 now follows part 1.
 click('[data-sheet=more]');click('[data-sheet=series]');click('#series-select-mode');
 click(`[data-series-toggle="${byText('TWO').id}"]`);click(`[data-series-toggle="${byText('THREE').id}"]`);assert.match($('#series-delete-selected').textContent,/2개 지우기/);
 click('#series-delete-selected');await answer();await wait(()=>records.size===2&&byText('FOUR').parentId&&records.has(byText('FOUR').parentId)&&$('.sheet [data-open]'));
 const first=[...records.values()].find(r=>!r.parentId);assert.equal(byText('FOUR').parentId,first.id);assert.equal(byText('FOUR').seriesId,first.seriesId);
 await wait(()=>$('.sheet [data-open]'));assert.equal(root.querySelectorAll('.sheet .series-row').length,2);
 click(`.sheet [data-open="${first.id}"]`);

 // Per-character translation rules are edited from the article and sent with the translation.
 click('[data-sheet=more]');click('[data-tr-rules="character:a.png"]');assert.match($('.sheet-head h2').textContent,/Monia/);
 type('#rules-text','Michael = 미카엘\n모니아 → 레오: 존댓말');click('#rules-save');
 await wait(()=>c.extensionSettings.st_sidestory.translationRules?.['character:a.png']?.includes('미카엘'));
 click('#translate');await wait(()=>records.get(first.id).translationView&&idle());assert(translations.at(-1).includes('Michael = 미카엘'));assert(translations.at(-1).includes('존댓말'));

 // Find & replace in the translation leaves tags alone; in the original it can respect case and word edges.
 click('[data-sheet=more]');click('[data-sheet=find-replace]');click('[data-fr-target=translation]');
 type('#fr-find','마이클');assert.match($('#fr-count').textContent,/2군데/);type('#fr-replace','미카엘');click('#fr-apply');
 await wait(()=>records.get(first.id).translationView.content.includes('미카엘이 미소 지었다. <b>미카엘</b>'));assert(!records.get(first.id).translationView.content.includes('마이클'));
 click('[data-fr-target=original]');type('#fr-find','michael');type('#fr-whole',true);assert.match($('#fr-count').textContent,/2군데/);type('#fr-case',true);assert.match($('#fr-count').textContent,/찾는 말이 없어요/);
 type('#fr-case',false);type('#fr-replace','Mikael');click('#fr-apply');await wait(()=>records.get(first.id).content==='Mikael smiled. Michaela waved. Mikael ran.');
 assert(records.get(first.id).translationView,'the translation stays');assert.equal(records.size,2,'no new version');
 h.cleanup();await new Promise(r=>setTimeout(r,5));
});
