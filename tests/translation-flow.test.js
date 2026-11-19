import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML,DOMParser} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';

async function boot(settings){
 const {window,document}=parseHTML('<html><body><div id="extensionsMenu"></div></body></html>');
 window.innerWidth=400;window.innerHeight=800;window.matchMedia=()=>({matches:false});
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 Object.assign(globalThis,{window,document,DOMParser,sessionStorage:storage,localStorage:storage});
 const records=new Map();
 const db={close(){},transaction(){let count=0;const tx={};function req(fn){count++;const r={};setTimeout(()=>{r.result=fn();r.onsuccess?.();count--;setTimeout(()=>{if(!count)tx.oncomplete?.();},0);},0);return r;}tx.objectStore=()=>({getAll:()=>req(()=>[...records.values()]),put:v=>req(()=>records.set(v.id,structuredClone(v))),delete:id=>req(()=>records.delete(id))});return tx;}};
 globalThis.indexedDB={open(){const r={};setTimeout(()=>{r.result=db;r.onsuccess?.();},0);return r;}};
 const events=new Map(),sent=[];let finishGeneration,live=0,peak=0,limited=false;
 const story=Array.from({length:12},(_,i)=>`Paragraph ${i} walks along the quiet harbour where the boats sleep under grey skies and gulls.`).join('\n\n');
 const c={chatId:'current',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:''}}],chat:[{name:'A',mes:'HELLO',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'u.png':'U'},persona_descriptions:{}},name1:'U',mainApi:'openai',
  extensionSettings:{st_sidestory:{mode:'story',translationMaxTokens:512,translationConnectionId:'fast',...settings},connectionManager:{profiles:[{id:'fast',name:'Fast',api:'openai'}]}},saveSettingsDebounced(){},
  generateQuietPrompt:async()=>new Promise(resolve=>finishGeneration=resolve),getTokenCountAsync:async t=>Math.ceil(t.length/3),getTokenizerModel:()=>'m',eventTypes:{CHAT_CHANGED:'chat',WORLDINFO_ENTRIES_LOADED:'lore'},eventSource:{on(k,f){events.set(k,f);},removeListener(k){events.delete(k);}},
  ConnectionManagerRequestService:{isProfileSupported:()=>true,sendRequest:async(id,messages)=>{
   assert.equal(id,'fast');sent.push(messages[1].content);live++;peak=Math.max(peak,live);
   try{await new Promise(r=>setTimeout(r,20));if(settings.rateLimitOnce&&!limited){limited=true;throw new Error('429 Too Many Requests');}
    return {content:messages[1].content.match(/⟦[^⟧]+⟧/g).map(m=>m+'\n번역 '+m).join('\n\n')};}finally{live--;}}}};
 globalThis.SillyTavern={getContext:()=>c};
 const h=createSTHost({context:()=>c,world:{world_names:[],selected_world_info:[],loadWorldInfo:async()=>({entries:{}})}});
 const code=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8').split('await (async function(stHost){\n')[1].split('\n})(hostAdapter);')[0];
 await new Function('stHost','return (async()=>{'+code+'})()')(h);
 const root=document.querySelector('#st-sidestory-root').shadowRoot,$=s=>root.querySelector(s);
 const click=selector=>{assert($(selector),'missing '+selector);$(selector).dispatchEvent(new window.Event('click',{bubbles:true}));};
 const wait=async fn=>{for(let i=0;i<700;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout: '+($('#notice')?.textContent||''));};
 const idle=()=>!$('.busy-pill:not(.ready)')&&!$('#stop-reader')&&!$('#stop');
 document.querySelector('#side-story-wand').dispatchEvent(new window.Event('click',{bubbles:true}));await wait(()=>$('.nav-new'));
 click('.nav-new');await wait(()=>$('#generate')&&!$('#generate').disabled);$('#request').value='항구';$('#request').dispatchEvent(new window.Event('input',{bubbles:true}));
 click('#generate');await wait(()=>finishGeneration);finishGeneration(story);await wait(()=>records.size===1&&idle());
 const record=()=>[...records.values()][0];
 click('#translate');await wait(()=>record().translationView&&idle());
 return {sent,peak:()=>peak,record,root,$,click,h};
}

test('fast mode sends the chunks of a long article together through a connection profile',async()=>{
 const t=await boot({translationParallel:3});
 const view=t.record().translationView;assert.equal((view.content.match(/번역 ⟦/g)||[]).length,12);assert(!view.content.includes('Paragraph'));
 assert(view.batches>=3,'split for three requests');assert.equal(t.peak(),3,'three requests at a time');
 assert(t.sent.every(m=>!m.includes('<previous_translation>')));
 t.h.cleanup();await new Promise(r=>setTimeout(r,5));
});

test('a rate-limited chunk is retried once',async()=>{
 const t=await boot({translationParallel:2,rateLimitOnce:true});
 assert.equal((t.record().translationView.content.match(/번역 ⟦/g)||[]).length,12);assert.equal(t.record().translationRecovery,undefined);
 t.h.cleanup();await new Promise(r=>setTimeout(r,5));
});

test('smooth mode goes one chunk at a time and shows each the end of the previous translation',async()=>{
 const t=await boot({translationFlow:'smooth',translationParallel:3});
 assert.equal(t.peak(),1);assert(t.sent.length>=2);assert(!t.sent[0].includes('<previous_translation>'));
 const second=t.sent[1],lastOfFirst=t.sent[0].match(/⟦[^⟧]+⟧/g).at(-1);
 assert(second.startsWith('<previous_translation>\n'));assert(second.includes('번역 '+lastOfFirst),'carries the tail of the first chunk');
 t.click('[data-page=settings]');t.click('[data-settings-tab=translation]');assert.equal(t.$('[data-translation-flow=smooth]').getAttribute('aria-pressed'),'true');assert.equal(t.$('[data-setting=translationParallel]'),null);
 t.click('[data-translation-flow=fast]');assert(t.$('[data-setting=translationParallel]'));
 t.h.cleanup();await new Promise(r=>setTimeout(r,5));
});
