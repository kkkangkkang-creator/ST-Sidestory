import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML,DOMParser} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';

/** Boots the UI with a connection profile whose requests for the first chunk hang until `stuck.release()` or an abort. */
async function boot(){
 const {window,document}=parseHTML('<html><body><div id="extensionsMenu"></div></body></html>');
 window.innerWidth=400;window.innerHeight=800;window.matchMedia=()=>({matches:false});
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 Object.assign(globalThis,{window,document,DOMParser,sessionStorage:storage,localStorage:storage});
 const records=new Map();
 const db={close(){},transaction(){let count=0;const tx={};function req(fn){count++;const r={};setTimeout(()=>{r.result=fn();r.onsuccess?.();count--;setTimeout(()=>{if(!count)tx.oncomplete?.();},0);},0);return r;}tx.objectStore=()=>({getAll:()=>req(()=>[...records.values()]),put:v=>req(()=>records.set(v.id,structuredClone(v))),delete:id=>req(()=>records.delete(id))});return tx;}};
 globalThis.indexedDB={open(){const r={};setTimeout(()=>{r.result=db;r.onsuccess?.();},0);return r;}};
 const events=new Map(),sent=[],stuck={hang:true,first:null};let finishGeneration;
 const story=Array.from({length:24},(_,i)=>`Paragraph ${i} walks along the quiet harbour where the boats sleep under grey skies and gulls.`).join('\n\n');
 const c={chatId:'current',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:''}}],chat:[{name:'A',mes:'HELLO',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'u.png':'U'},persona_descriptions:{}},name1:'U',mainApi:'openai',
  extensionSettings:{st_sidestory:{mode:'story',translationMaxTokens:900,translationConnectionId:'fast',translationParallel:4},connectionManager:{profiles:[{id:'fast',name:'Fast',api:'openai'}]}},saveSettingsDebounced(){},
  generateQuietPrompt:async()=>new Promise(resolve=>finishGeneration=resolve),getTokenCountAsync:async t=>Math.ceil(t.length/3),getTokenizerModel:()=>'m',eventTypes:{CHAT_CHANGED:'chat',WORLDINFO_ENTRIES_LOADED:'lore'},eventSource:{on(k,f){events.set(k,f);},removeListener(k){events.delete(k);}},
  ConnectionManagerRequestService:{isProfileSupported:()=>true,sendRequest:async(id,messages,max,opts)=>{
   const body=messages[1].content,ids=body.match(/⟦[^⟧]+⟧/g);sent.push(ids);stuck.first??=ids[0];
   if(stuck.hang&&ids.includes(stuck.first))await new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
   await new Promise(r=>setTimeout(r,10));return {content:ids.map(m=>m+'\n번역 '+m).join('\n\n')};}}};
 globalThis.SillyTavern={getContext:()=>c};
 const h=createSTHost({context:()=>c,world:{world_names:[],selected_world_info:[],loadWorldInfo:async()=>({entries:{}})}});
 const code=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8').split('await (async function(stHost){\n')[1].split('\n})(hostAdapter);')[0];
 await new Function('stHost','return (async()=>{'+code+'})()')(h);
 const root=document.querySelector('#st-sidestory-root').shadowRoot,$=s=>root.querySelector(s);
 const click=selector=>{assert($(selector),'missing '+selector);$(selector).dispatchEvent(new window.Event('click',{bubbles:true}));};
 const wait=async fn=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout: '+($('#notice')?.textContent||''));};
 const idle=()=>!$('.busy-pill:not(.ready)')&&!$('#stop-reader')&&!$('#stop');
 document.querySelector('#side-story-wand').dispatchEvent(new window.Event('click',{bubbles:true}));await wait(()=>$('.nav-new'));
 click('.nav-new');await wait(()=>$('#generate')&&!$('#generate').disabled);$('#request').value='항구';$('#request').dispatchEvent(new window.Event('input',{bubbles:true}));
 click('#generate');await wait(()=>finishGeneration);finishGeneration(story);await wait(()=>records.size===1&&idle());
 const record=()=>[...records.values()][0];
 return {sent,stuck,record,$,root,click,wait,idle,h};
}
const chunkCount=t=>t.root.querySelectorAll('.tr-chunk').length;

test('a slow chunk can be sent again on its own while the others finish',async()=>{
 const t=await boot();
 t.click('#translate');await t.wait(()=>t.root.querySelectorAll('.tr-chunk.done').length===chunkCount(t)-1&&chunkCount(t)>=2);
 assert.equal(t.root.querySelectorAll('.tr-chunk.running').length,1);assert(t.$('[data-tr-retry]'));
 const before=t.sent.length;t.stuck.hang=false;t.click('[data-tr-retry]');
 await t.wait(()=>t.record().translationView&&t.idle());
 assert.equal(t.sent.length,before+1,'only the stuck chunk was sent again');
 assert.equal((t.record().translationView.content.match(/번역 ⟦/g)||[]).length,24);assert.equal(t.record().translationRecovery,undefined);assert.equal(t.$('.tr-progress'),null);
 t.h.cleanup();await new Promise(r=>setTimeout(r,5));
});

test('stopping keeps the finished chunks on screen and resumes only the missing one',async()=>{
 const t=await boot();
 t.click('#translate');await t.wait(()=>t.root.querySelectorAll('.tr-chunk.done').length===chunkCount(t)-1&&chunkCount(t)>=2);
 const total=chunkCount(t);t.click('#stop-global');await t.wait(()=>t.idle()&&t.record().translationRecovery);
 const view=t.record().translationView;assert(view.partial);assert.deepEqual(view.partial.missing,[0]);assert.equal(view.partial.total,total);
 assert(view.content.includes('번역 ⟦'));assert(view.content.includes('Paragraph 0'),'the unfinished chunk stays in the original');
 assert(t.$('.tr-banner'));assert.match(t.$('.tr-banner').textContent,new RegExp(`${total}구간 중 1구간`));assert(t.$('#translate').classList.contains('active'),'the partial translation is shown');
 const before=t.sent.length;t.stuck.hang=false;t.click('#tr-resume');
 await t.wait(()=>t.idle()&&!t.record().translationRecovery);
 assert.equal(t.sent.length,before+1,'only the missing chunk was requested');
 const done=t.record().translationView;assert.equal(done.partial,undefined);assert.equal((done.content.match(/번역 ⟦/g)||[]).length,24);assert.equal(t.$('.tr-banner'),null);
 t.h.cleanup();await new Promise(r=>setTimeout(r,5));
});
