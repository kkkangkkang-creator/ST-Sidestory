import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML,DOMParser} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';

test('other articles stay readable while a new one is written, and finishing does not pull the reader away',async()=>{
 const {window,document}=parseHTML('<html><body><div id="extensionsMenu"></div></body></html>');
 window.innerWidth=400;window.innerHeight=800;window.matchMedia=()=>({matches:false});
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 Object.assign(globalThis,{window,document,DOMParser,sessionStorage:storage,localStorage:storage});
 const records=new Map();
 const db={close(){},transaction(){let count=0;const tx={};function req(fn){count++;const r={};setTimeout(()=>{r.result=fn();r.onsuccess?.();count--;setTimeout(()=>{if(!count)tx.oncomplete?.();},0);},0);return r;}tx.objectStore=()=>({getAll:()=>req(()=>[...records.values()]),put:v=>req(()=>records.set(v.id,structuredClone(v))),delete:id=>req(()=>records.delete(id))});return tx;}};
 globalThis.indexedDB={open(){const r={};setTimeout(()=>{r.result=db;r.onsuccess?.();},0);return r;}};
 const events=new Map();let finishGeneration;
 const c={chatId:'current',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:''}}],chat:[{name:'A',mes:'HELLO',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'u.png':'U'},persona_descriptions:{}},name1:'U',mainApi:'openai',extensionSettings:{st_sidestory:{mode:'story'}},saveSettingsDebounced(){},
  generateQuietPrompt:async()=>new Promise(resolve=>finishGeneration=resolve),getTokenCountAsync:async t=>Math.ceil(t.length/3),getTokenizerModel:()=>'m',eventTypes:{CHAT_CHANGED:'chat',WORLDINFO_ENTRIES_LOADED:'lore'},eventSource:{on(k,f){events.set(k,f);},removeListener(k){events.delete(k);}}};
 globalThis.SillyTavern={getContext:()=>c};
 const h=createSTHost({context:()=>c,world:{world_names:[],selected_world_info:[],loadWorldInfo:async()=>({entries:{}})}});
 const code=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8').split('await (async function(stHost){\n')[1].split('\n})(hostAdapter);')[0];
 await new Function('stHost','return (async()=>{'+code+'})()')(h);
 const root=document.querySelector('#st-sidestory-root').shadowRoot,$=s=>root.querySelector(s);
 const click=selector=>{assert($(selector),'missing '+selector);$(selector).dispatchEvent(new window.Event('click',{bubbles:true}));};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout: '+($('#notice')?.textContent||''));};
 const idle=()=>!$('.busy-pill:not(.ready)')&&!$('#stop-reader')&&!$('#stop');
 const write=async text=>{click('.nav-new');await wait(()=>$('#generate')&&!$('#generate').disabled);$('#request').value=text;$('#request').dispatchEvent(new window.Event('input',{bubbles:true}));finishGeneration=null;click('#generate');await wait(()=>finishGeneration);};
 document.querySelector('#side-story-wand').dispatchEvent(new window.Event('click',{bubbles:true}));await wait(()=>$('.nav-new'));
 await write('첫 아티클');finishGeneration('OLD_ARTICLE');await wait(()=>records.size===1&&idle());
 const old=[...records.values()][0];

 // Start a second article and, while it is being written, open the first one from the archive.
 await write('두 번째 아티클');assert($('.waiting'));
 click('[data-page=archive]');click(`.main [data-open="${old.id}"]`);
 assert.equal($('.waiting'),null,'the chosen article is shown, not the waiting screen');assert($('.part.current'));assert($('#busy-view'),'the busy pill leads back to the article being written');
 click('#busy-view');assert($('.waiting'));
 click('[data-page=archive]');click(`.main [data-open="${old.id}"]`);assert.equal($('.waiting'),null);

 // Finishing keeps the reader where they are and offers the new article instead.
 finishGeneration('NEW_ARTICLE');await wait(()=>records.size===2&&$('.busy-pill.ready'));
 const fresh=[...records.values()].find(r=>r.content==='NEW_ARTICLE');
 assert.equal($('.waiting'),null);assert($(`.busy-pill.ready [data-open="${fresh.id}"]`));assert.equal($('.bar-text h1')?.textContent,'첫 아티클');
 click(`.busy-pill.ready [data-open="${fresh.id}"]`);assert.equal($('.busy-pill.ready'),null);assert.equal($('.bar-text h1')?.textContent,'두 번째 아티클');
 h.cleanup();await new Promise(r=>setTimeout(r,5));
});
