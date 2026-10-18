import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML,DOMParser} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';
const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const C=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return SideCore;')();

test('new chat can take every part up to the current one, one character message each',async()=>{
 let payload;const c={chatId:'old',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A'}],getRequestHeaders:()=>({}),saveChat:async()=>{},selectCharacterById:async()=>{},openCharacterChat:async()=>{}};
 const host=createSTHost({context:()=>c,fetcher:async(url,args)=>{payload=JSON.parse(args.body);return {ok:true,json:async()=>({ok:true})};}});
 const chatId=JSON.stringify(['character:a.png','old']);
 const parts=[{id:'p1',chatId,title:'One',seriesTitle:'Series',content:'FIRST'},{id:'p2',chatId,title:'Two',seriesTitle:'Series',content:'SECOND',translationView:{content:'번역'}}];
 await host.createChatFromRecord(parts[1],parts);
 assert.deepEqual(payload.chat.slice(1).map(m=>[m.mes,m.is_user,m.extra.sideStoryRecordId]),[['FIRST',false,'p1'],['SECOND',false,'p2']]);
 assert(payload.file_name.startsWith('Side Story - Series - '));
 await assert.rejects(host.createChatFromRecord(parts[1],[parts[0],{id:'x',chatId,content:' '}]),/원문이 없어요/);
});

test('settings normalise theme colour and reader navigation',()=>{
 assert.deepEqual([C.settings({}).accentColor,C.settings({}).readerNav,C.settings({}).readerNavSide],['',false,'right']);
 const s=C.settings({accentColor:'#2E6B4F',readerNav:true,readerNavSide:'left'});assert.deepEqual([s.accentColor,s.readerNav,s.readerNavSide],['#2e6b4f',true,'left']);
 assert.equal(C.settings({accentColor:'red'}).accentColor,'');assert.equal(C.settings({readerNavSide:'top'}).readerNavSide,'right');
});

test('continue sheet voice options, reader navigation, multi-part chat and theme colour in the full UI',async()=>{
 const {window,document}=parseHTML('<html><body><div id="extensionsMenu"></div></body></html>');
 window.innerWidth=400;window.innerHeight=800;window.matchMedia=()=>({matches:false});
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 Object.assign(globalThis,{window,document,DOMParser,sessionStorage:storage,localStorage:storage});
 const records=new Map();
 const db={close(){},transaction(){let count=0;const tx={};function req(fn){count++;const r={};setTimeout(()=>{r.result=fn();r.onsuccess?.();count--;setTimeout(()=>{if(!count)tx.oncomplete?.();},0);},0);return r;}tx.objectStore=()=>({getAll:()=>req(()=>[...records.values()]),put:v=>req(()=>records.set(v.id,structuredClone(v))),delete:id=>req(()=>records.delete(id))});return tx;}};
 globalThis.indexedDB={open(){const r={};setTimeout(()=>{r.result=db;r.onsuccess?.();},0);return r;}};
 const calls=[],events=new Map();let finishGeneration,payload;
 const c={chatId:'current',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:''}}],chat:[{name:'A',mes:'HELLO',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'u.png':'U'},persona_descriptions:{}},name1:'U',mainApi:'openai',extensionSettings:{st_sidestory:{mode:'speak',speakAsker:'user'}},saveSettingsDebounced(){},
  generateQuietPrompt:async p=>{calls.push(p);return new Promise(resolve=>finishGeneration=resolve);},getTokenCountAsync:async t=>Math.ceil(t.length/3),getTokenizerModel:()=>'m',eventTypes:{CHAT_CHANGED:'chat',WORLDINFO_ENTRIES_LOADED:'lore'},eventSource:{on(k,f){events.set(k,f);},removeListener(k){events.delete(k);}},
  getRequestHeaders:()=>({}),saveChat:async()=>{},selectCharacterById:async()=>{},openCharacterChat:async()=>{}};
 globalThis.SillyTavern={getContext:()=>c};
 const h=createSTHost({context:()=>c,world:{world_names:[],selected_world_info:[],loadWorldInfo:async()=>({entries:{}})},fetcher:async(url,args)=>{payload=JSON.parse(args.body);return {ok:true,json:async()=>({ok:true})};}});
 const code=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8').split('await (async function(stHost){\n')[1].split('\n})(hostAdapter);')[0];
 await new Function('stHost','return (async()=>{'+code+'})()')(h);
 const root=document.querySelector('#st-sidestory-root').shadowRoot,$=s=>root.querySelector(s);
 const click=selector=>{assert($(selector),'missing '+selector);$(selector).dispatchEvent(new window.Event('click',{bubbles:true}));};
 const input=(selector,value)=>{const el=$(selector);assert(el,'missing '+selector);if(el.type==='checkbox')el.checked=value;else if(el.tagName==='SELECT')for(const o of el.querySelectorAll('option'))o.toggleAttribute('selected',o.value===value);else el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
 const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout: '+($('#notice')?.textContent||''));};
 const idle=()=>!$('.busy-pill')&&!$('#stop-reader')&&!$('#stop');
 document.querySelector('#side-story-wand').dispatchEvent(new window.Event('click',{bubbles:true}));await wait(()=>$('.nav-new'));
 click('.nav-new');await wait(()=>$('#generate')&&!$('#generate').disabled);
 input('#request','첫 질문');click('#generate');await wait(()=>finishGeneration);finishGeneration('FIRST_ANSWER');await wait(()=>records.size===1&&idle());
 const first=[...records.values()][0];assert.equal(first.settings.speakAsker,'user');

 // The continue sheet shows the speak options, seeded from the part, and they apply to this continuation only.
 click('[data-sheet=continue-options]');assert.equal($('[data-continue-knob=speakAsker]').value,'user');assert($('[data-continue-knob=showInnerThoughts]'));
 input('[data-continue-knob=speakAsker]','author');input('[data-continue-knob=showInnerThoughts]',true);
 click('[data-continuation-mode=write]');assert($('[data-continue-knob=writeHonesty]'));assert.equal($('[data-continue-knob=speakAsker]'),null);
 click('[data-continuation-mode=speak]');assert.equal($('[data-continue-knob=speakAsker]').value,'author');click('[data-sheet-close=done]');
 finishGeneration=null;$('#followup').value='두 번째';click('#continue');await wait(()=>finishGeneration);
 assert(calls.at(-1).quietPrompt.includes(C.askerLine(C.settings({speakAsker:'author'}))));
 finishGeneration('SECOND_ANSWER');await wait(()=>records.size===2&&idle());
 const second=[...records.values()].find(r=>r.content==='SECOND_ANSWER');assert.equal(second.settings.speakAsker,'author');assert.equal(second.settings.showInnerThoughts,true);
 await new Promise(r=>setTimeout(r,350));assert.equal(c.extensionSettings.st_sidestory.speakAsker,'user','composer settings stay as they were');assert.equal(c.extensionSettings.st_sidestory.showInnerThoughts,false);

 // Theme colour and section titles.
 click('[data-page=settings]');assert.equal(root.querySelectorAll('.section-label').length,4);
 click('[data-accent="#2e6b4f"]');assert.equal($('.app').style.getPropertyValue('--accent'),'#2e6b4f');await wait(()=>c.extensionSettings.st_sidestory.accentColor==='#2e6b4f');
 click('[data-theme-set=dark]');assert.notEqual($('.app').style.getPropertyValue('--accent'),'#2e6b4f');click('[data-theme-set=light]');
 click('[data-accent=""]');assert.equal($('.app').style.getPropertyValue('--accent'),'');

 // Reader navigation is off until switched on.
 assert.equal($('[data-reader-nav-side]'),null);input('[data-setting=readerNav]',true);click('[data-reader-nav-side=left]');await wait(()=>c.extensionSettings.st_sidestory.readerNavSide==='left');
 click('[data-page=archive]');click('[data-archive-scope=all]');click(`[data-open="${second.id}"]`);
 assert($('.reader-nav.left'));assert($('[data-reader-nav=next]').disabled);assert(!$('[data-reader-nav=prev]').disabled);
 click('[data-reader-nav=prev]');assert($('.part.current').textContent.includes('FIRST_ANSWER')||$('.part.current .note').textContent.includes('1편'));assert($('[data-reader-nav=prev]').disabled);
 click('[data-reader-nav=next]');assert(!$('[data-reader-nav=prev]').disabled);

 // A new chat from part 2 asks for the range and can take both parts.
 click('[data-sheet=more]');click('#new-result-chat');assert($('[data-new-chat-range=one]'));click('[data-new-chat-range=line]');
 await wait(()=>payload);assert.deepEqual(payload.chat.slice(1).map(m=>m.mes),['FIRST_ANSWER','SECOND_ANSWER']);
 h.cleanup();await new Promise(r=>setTimeout(r,5));
});
