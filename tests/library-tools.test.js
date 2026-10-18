import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML,DOMParser} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';
const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const X=new Function(read('extras.js')+';return SideExtras;')();

test('marked translation replies: order, edges, re-requests, truncation and the older JSON form',()=>{
 const items=[{id:0,text:'Hello.'},{id:'1:0',sourceId:1,text:'  Spaced  '},{id:2,text:'Bye.'}];
 assert.equal(X.markedSource(items),'⟦0⟧\nHello.\n\n⟦1:0⟧\n  Spaced  \n\n⟦2⟧\nBye.');
 let r=X.readTranslation('```\n⟦0⟧\n안녕.\n\n⟦1:0⟧ 띄움\n⟦2⟧\n잘 가.\n```',items);
 assert.deepEqual([...r.map],[[0,'안녕.'],['1:0','  띄움  '],[2,'잘 가.']]);assert.deepEqual(r.missing,[]);
 r=X.readTranslation('⟦0⟧\n안녕.\n\n⟦1:0⟧\n띄',items);assert.deepEqual(r.missing,[2]);assert.equal(r.last,'1:0');
 r=X.readTranslation('⟦0⟧\n안녕.\n\n⟦1:0⟧\n띄\n\n⟦1:0⟧\n띄움\n⟦2⟧\n잘 가.',items);assert.equal(r.map.get('1:0'),'  띄움  ');assert.deepEqual(r.missing,[]);
 r=X.readTranslation('⟦0⟧\n\n⟦9⟧\nstray',items);assert.deepEqual(r.missing,[0,'1:0',2]);
 assert.equal(X.readTranslation('그냥 번역문',[{id:5,text:'Just text'}]).map.get(5),'그냥 번역문');
 assert.equal(X.readTranslation(JSON.stringify({items:[{id:0,text:'안녕'}]}),[{id:0,text:'Hi'}]).map.get(0),'안녕');
 assert.throws(()=>X.readTranslation('{"items":[{"id":0,"text":"깨진"自我"}]}',[{id:0,text:'Hi'}]),/JSON 형식 오류/);
});

test('appending to the current chat adds one character message per part and refuses another chat',async()=>{
 const c={chatId:'now',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A'}],chat:[{mes:'old'}],added:[],addOneMessage(m){this.added.push(m.mes);},saved:0,async saveChat(){this.saved++;}};
 const host=createSTHost({context:()=>c});
 const chatId=host.currentChatId(),parts=[{id:'p1',chatId,content:'ONE'},{id:'p2',chatId,content:'TWO'}];
 assert.equal(await host.appendToCurrentChat(parts[1],parts),2);
 assert.deepEqual(c.chat.slice(1).map(m=>[m.name,m.mes,m.is_user,m.extra.sideStoryRecordId]),[['A','ONE',false,'p1'],['A','TWO',false,'p2']]);
 assert.deepEqual(c.added,['ONE','TWO']);assert.equal(c.saved,1);
 await assert.rejects(host.appendToCurrentChat({id:'x',chatId:'["character:b.png","other"]',content:'NO'}),/만든 채팅에서만/);assert.equal(c.chat.length,3);
});

test('rename, archive bulk actions, chat append, branch placeholder and progressive translation in the full UI',async()=>{
 const {window,document}=parseHTML('<html><body><div id="extensionsMenu"></div></body></html>');
 window.innerWidth=400;window.innerHeight=800;window.matchMedia=()=>({matches:false});
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 Object.assign(globalThis,{window,document,DOMParser,sessionStorage:storage,localStorage:storage});
 const records=new Map();
 const db={close(){},transaction(){let count=0;const tx={};function req(fn){count++;const r={};setTimeout(()=>{r.result=fn();r.onsuccess?.();count--;setTimeout(()=>{if(!count)tx.oncomplete?.();},0);},0);return r;}tx.objectStore=()=>({getAll:()=>req(()=>[...records.values()]),put:v=>req(()=>records.set(v.id,structuredClone(v))),delete:id=>req(()=>records.delete(id))});return tx;}};
 globalThis.indexedDB={open(){const r={};setTimeout(()=>{r.result=db;r.onsuccess?.();},0);return r;}};
 const events=new Map();let finishGeneration;
 const story=Array.from({length:6},(_,i)=>`Paragraph ${i} walks along the quiet harbour where the boats sleep under grey skies and gulls.`).join('\n\n');
 const c={chatId:'current',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:''}}],chat:[{name:'A',mes:'HELLO',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'u.png':'U'},persona_descriptions:{}},name1:'U',mainApi:'openai',extensionSettings:{st_sidestory:{mode:'story',translationMaxTokens:512}},saveSettingsDebounced(){},
  generateQuietPrompt:async()=>new Promise(resolve=>finishGeneration=resolve),getTokenCountAsync:async t=>Math.ceil(t.length/3),getTokenizerModel:()=>'m',eventTypes:{CHAT_CHANGED:'chat',WORLDINFO_ENTRIES_LOADED:'lore'},eventSource:{on(k,f){events.set(k,f);},removeListener(k){events.delete(k);}},
  addOneMessage(){},saveChat:async()=>{},getRequestHeaders:()=>({})};
 globalThis.SillyTavern={getContext:()=>c};
 const h=createSTHost({context:()=>c,world:{world_names:[],selected_world_info:[],loadWorldInfo:async()=>({entries:{}})}});
 const code=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8').split('await (async function(stHost){\n')[1].split('\n})(hostAdapter);')[0];
 await new Function('stHost','return (async()=>{'+code+'})()')(h);
 const root=document.querySelector('#st-sidestory-root').shadowRoot,$=s=>root.querySelector(s);
 const click=selector=>{assert($(selector),'missing '+selector);$(selector).dispatchEvent(new window.Event('click',{bubbles:true}));};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout: '+($('#notice')?.textContent||''));};
 const idle=()=>!$('.busy-pill')&&!$('#stop-reader')&&!$('#stop');
 const answer=async value=>{await wait(()=>$('#side-dialog-input')||$('#side-dialog-confirm'));if(value!==undefined)$('#side-dialog-input').value=value;click('#side-dialog-confirm');};
 document.querySelector('#side-story-wand').dispatchEvent(new window.Event('click',{bubbles:true}));await wait(()=>$('.nav-new'));
 click('.nav-new');await wait(()=>$('#generate')&&!$('#generate').disabled);
 $('#request').value='항구';$('#request').dispatchEvent(new window.Event('input',{bubbles:true}));click('#generate');await wait(()=>finishGeneration);finishGeneration(story);await wait(()=>records.size===1&&idle());
 finishGeneration=null;$('#followup').value='다음';click('#continue');await wait(()=>finishGeneration);finishGeneration('PART_TWO');await wait(()=>records.size===2&&idle());
 const first=[...records.values()].find(r=>!r.parentId),second=[...records.values()].find(r=>r.parentId);

 // Reading an earlier part: no branch banner, the placeholder says a branch will start.
 click(`.read [data-open="${first.id}"]`);assert.equal($('.branch-note'),null);assert.match($('#followup').getAttribute('placeholder'),/1편에서 새 갈래/);

 // Rename one part, then the series.
 click('[data-sheet=more]');click('#rename-current');click(`[data-rename-record="${first.id}"]`);await answer('바뀐 1편');await wait(()=>records.get(first.id).title==='바뀐 1편');await new Promise(r=>setTimeout(r,50));
 click('[data-sheet=more]');click('#rename-current');click('#series-rename');await answer('새 시리즈');await wait(()=>records.get(second.id).seriesTitle==='새 시리즈');

 // Progressive translation: several marked chunks, one reply cut short and re-requested.
 const asked=[];let cut=true;
 c.generateRaw=async p=>{const body=p.prompt[1].content,ids=body.match(/⟦[^⟧]+⟧/g);asked.push(ids.length);assert(p.prompt[0].content.includes('⟦12⟧'));
  if(cut&&ids.length>1){cut=false;return ids[0]+'\n번역 일부';}await new Promise(r=>setTimeout(r,15));return ids.map(m=>m+'\n번역 '+m).join('\n\n');};
 click('#translate');let previewed=false;await wait(()=>{if(!previewed&&busyText()&&$('#translate')?.classList.contains('active'))previewed=true;return records.get(first.id).translationView&&idle();});
 function busyText(){return $('.app').textContent.includes('번역 중');}
 const view=records.get(first.id).translationView.content;assert(asked.length>=3,'split into chunks and re-asked');assert(!view.includes('Paragraph'));assert.equal((view.match(/번역 ⟦/g)||[]).length,6);assert(previewed,'finished chunks show before the end');

 // Reopening a translated part starts on the translation.
 click('[data-page=archive]');click('[data-archive-scope=all]');click(`.main [data-open]`);click(`.read [data-open="${first.id}"]`);assert($('#translate').classList.contains('active'));

 // Append both parts to the current chat as ordinary messages.
 click(`.read [data-open="${second.id}"]`);click('[data-sheet=more]');click('#add-to-chat');click('[data-chat-add-range=line]');await answer();
 await wait(()=>c.chat.length===3);assert.deepEqual(c.chat.slice(1).map(m=>[m.mes===story,m.is_system]),[[true,false],[false,false]]);assert.equal(c.chat[2].mes,'PART_TWO');

 // Archive selection: bulk favourite and tags/folder.
 click('[data-page=archive]');click('#archive-delete-mode');click('[data-archive-select-page],#archive-select-page');
 click('#archive-bulk-favorite');await wait(()=>[...records.values()].every(r=>r.favorite)&&$('#notice').textContent.includes('즐겨찾기에 넣었어요'));
 click('#archive-bulk-organize');$('#archive-bulk-add').value='항구, 시리즈';click('#archive-bulk-save');await wait(()=>[...records.values()].every(r=>r.tags?.includes('항구')&&r.tags.includes('시리즈'))&&!$('.archive-organizer'));
 click('#archive-bulk-organize');$('#archive-bulk-remove').value='시리즈';click('#archive-bulk-save');await wait(()=>[...records.values()].every(r=>!r.tags.includes('시리즈')&&r.tags.includes('항구'))&&!$('.archive-organizer'));
 click('#archive-bulk-favorite');await wait(()=>[...records.values()].every(r=>!r.favorite));
 h.cleanup();await new Promise(r=>setTimeout(r,5));
});
