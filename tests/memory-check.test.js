import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML,DOMParser} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';

const ELEPHANT='[장기기억]\n레오와 모니아는 가을 학기에 추가교습을 시작했다.\n모니아는 사진을 들킨 뒤로 레오를 피한다.';
const MEMORIA='[장부]\n모니아의 기숙사는 델타 동 204호다.';

function stContext(){
 const handlers=new Map();
 const c={name1:'U',chat:[{name:'A',mes:'The harbour was quiet that evening, and the boats slept.',send_date:'d0'},{name:'U',mes:'Shall we walk along the pier before dinner tonight?',is_user:true,send_date:'d1'},{name:'A',mes:'The lanterns flickered as they reached the end of the pier.',send_date:'d2'}],
  eventTypes:{CHAT_COMPLETION_PROMPT_READY:'ready'},eventSource:{on:(k,f)=>handlers.set(k,f),removeListener:k=>handlers.delete(k)},extensionSettings:{},
  extensionPrompts:{long_memory_main:{value:ELEPHANT,position:0,depth:4},memoria_ledger:{value:MEMORIA,position:1,depth:2},'2_floating_prompt':{value:'',position:1}},substituteParams:t=>t};
 return {c,handlers};
}

test('the final prompt is checked for registered extension texts, and forced ones are added only when missing',async()=>{
 const {c,handlers}=stContext(),host=createSTHost({context:()=>c});
 assert.deepEqual(host.extensionPrompts().map(p=>[p.key,p.label,p.memory]),[['long_memory_main','코끼리를 생각하지마 · 장기기억',true],['memoria_ledger','Memoria · 장부',true]]);
 let built;
 c.generateQuietPrompt=async a=>{
  const chat=c.chat.map(m=>({...m}));await globalThis.sideStoryGenerateInterceptor(chat,0,()=>{},'quiet');
  // ST put the elephant summary in, but Memoria's ledger did not make it; ST also dropped the oldest chat turn.
  built={chat:[{role:'system',content:'MAIN\n'+ELEPHANT},...chat.slice(1).map(m=>({role:m.is_user?'user':'assistant',content:m.mes})),{role:'system',content:a.quietPrompt}],dryRun:false};
  handlers.get('ready')(built);return 'OK';
 };
 let info;
 await host.generate({useSillyTavernContext:true,quietPrompt:'<SIDESTORY>\nASK\n</SIDESTORY>',parameters:{maxTokens:10},history:{limit:null,anchor:null,exclude:false},forceExtensions:['memoria_ledger'],onPromptReady:x=>info=x});
 const byKey=Object.fromEntries(info.extensions.map(x=>[x.key,x]));
 assert.deepEqual([byKey.long_memory_main.included,byKey.long_memory_main.forced],[true,false]);
 assert.deepEqual([byKey.memoria_ledger.included,byKey.memoria_ledger.forced],[true,true]);
 const last=info.messages.at(-1);assert.equal(last.role,'user');assert.match(last.content,/^<memory source="Memoria · 장부">\n\[장부\]\n모니아의 기숙사는/);assert(last.content.includes('<SIDESTORY>'));
 assert.equal(info.messages.filter(m=>m.content.includes('추가교습')).length,1,'what ST already sent is not added twice');
 assert.deepEqual([info.history.checked,info.history.found],[3,2],'the turn ST dropped is reported');

 // Without forcing, a missing text is only reported.
 await host.generate({useSillyTavernContext:true,quietPrompt:'<SIDESTORY>\nASK\n</SIDESTORY>',parameters:{maxTokens:10},history:{limit:null,anchor:null,exclude:false},onPromptReady:x=>info=x});
 assert.deepEqual(info.extensions.map(x=>[x.key,x.included,x.forced]),[['long_memory_main',true,false],['memoria_ledger',false,false]]);
 assert(!info.messages.some(m=>m.content.includes('델타 동')));
 host.cleanup();
});

test('the reference sheet links to the check, which lists registered texts, the last result and the force switch',async()=>{
 const {window,document}=parseHTML('<html><body><div id="extensionsMenu"></div></body></html>');
 window.innerWidth=400;window.innerHeight=800;window.matchMedia=()=>({matches:false});
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 Object.assign(globalThis,{window,document,DOMParser,sessionStorage:storage,localStorage:storage});
 const records=new Map();
 const db={close(){},transaction(){let count=0;const tx={};function req(fn){count++;const r={};setTimeout(()=>{r.result=fn();r.onsuccess?.();count--;setTimeout(()=>{if(!count)tx.oncomplete?.();},0);},0);return r;}tx.objectStore=()=>({getAll:()=>req(()=>[...records.values()]),put:v=>req(()=>records.set(v.id,structuredClone(v))),delete:id=>req(()=>records.delete(id))});return tx;}};
 globalThis.indexedDB={open(){const r={};setTimeout(()=>{r.result=db;r.onsuccess?.();},0);return r;}};
 const {c,handlers}=stContext();const events=new Map();
 Object.assign(c,{chatId:'current',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:''}}],chatMetadata:{},powerUserSettings:{personas:{'u.png':'U'},persona_descriptions:{}},mainApi:'openai',extensionSettings:{st_sidestory:{mode:'story',scope:'40'}},saveSettingsDebounced(){},getTokenCountAsync:async t=>Math.ceil(t.length/3),getTokenizerModel:()=>'m',eventTypes:{CHAT_CHANGED:'chat',WORLDINFO_ENTRIES_LOADED:'lore',CHAT_COMPLETION_PROMPT_READY:'ready'},
  eventSource:{on(k,f){(k==='ready'?handlers:events).set(k,f);},removeListener(k){(k==='ready'?handlers:events).delete(k);}},
  generateQuietPrompt:async a=>{const chat=c.chat.map(m=>({...m}));await globalThis.sideStoryGenerateInterceptor(chat,0,()=>{},'quiet');handlers.get('ready')?.({chat:[{role:'system',content:ELEPHANT},...chat.map(m=>({role:'assistant',content:m.mes})),{role:'system',content:a.quietPrompt}],dryRun:false});return 'STORY';}});
 globalThis.SillyTavern={getContext:()=>c};
 const h=createSTHost({context:()=>c,world:{world_names:[],selected_world_info:[],loadWorldInfo:async()=>({entries:{}})}});
 const code=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8').split('await (async function(stHost){\n')[1].split('\n})(hostAdapter);')[0];
 await new Function('stHost','return (async()=>{'+code+'})()')(h);
 const root=document.querySelector('#st-sidestory-root').shadowRoot,$=s=>root.querySelector(s);
 const click=selector=>{assert($(selector),'missing '+selector);$(selector).dispatchEvent(new window.Event('click',{bubbles:true}));};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout: '+($('#notice')?.textContent||''));};
 document.querySelector('#side-story-wand').dispatchEvent(new window.Event('click',{bubbles:true}));await wait(()=>$('.nav-new'));
 click('.nav-new');await wait(()=>$('#generate')&&!$('#generate').disabled);
 click('#open-references');assert.equal($('[data-setting=includeSummary]'),null,'the switch that did nothing on the ST connection is gone');
 click('[data-scope-mode=recent]');click('[data-scope-quick="20"]');await wait(()=>c.extensionSettings.st_sidestory.scope==='20');assert.equal($('[data-scope-quick="20"]').getAttribute('aria-pressed'),'true');
 click('[data-sheet=memory-check]');assert.match($('.sheet').textContent,/코끼리를 생각하지마 · 장기기억/);assert.match($('.sheet').textContent,/아직 확인 전/);
 const force=$('[data-force-ext=memoria_ledger]');force.checked=true;force.dispatchEvent(new window.Event('input',{bubbles:true}));
 await wait(()=>c.extensionSettings.st_sidestory.forceExtensions?.includes('memoria_ledger'));
 click('[data-sheet-close=x]');$('#request').value='외전';$('#request').dispatchEvent(new window.Event('input',{bubbles:true}));click('#generate');await wait(()=>records.size===1&&!$('.busy-pill'));
 click('[data-pane=compose]');click('#open-references');assert.match($('[data-sheet=memory-check] small').textContent,/모두 들어감/);
 click('[data-sheet=memory-check]');assert.match($('.sheet').textContent,/✓ 들어감/);assert.match($('.sheet').textContent,/직접 넣음/);assert.match($('.sheet').textContent,/프롬프트에서 확인 3\/3개/);
 h.cleanup();await new Promise(r=>setTimeout(r,5));
});
