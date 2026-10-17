import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSTHost} from '../src/st-host.js';
const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const C=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return SideCore;')();
const aux={enabled:true,assistant:'What mood should the scene have?',user:'Warm and reassuring.'};
const config=()=>C.settings({mode:'story',instructionPresets:[{id:'a',name:'Test',mode:'story',prompt:'Write a story',auxDialogue:aux}],activeInstructionPresetIds:{story:'a'}});
test('per-preset dialogue survives normalization and backup settings; default off, strict validation and mode isolation',()=>{
 const s=config(),round=C.settings(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(C.auxiliaryTurns(round),[{role:'assistant',content:aux.assistant},{role:'user',content:aux.user}]);
 assert.deepEqual(C.auxiliaryTurns(C.settings({})),[]);
 assert.deepEqual(C.auxiliaryTurns(s,'visual'),[]);assert.deepEqual(C.auxiliaryTurns(s,'facet'),[]);
 s.instructionPresets[0].auxDialogue.enabled=false;assert.deepEqual(C.auxiliaryTurns(s),[]);assert.equal(s.instructionPresets[0].auxDialogue.user,aux.user);
 s.instructionPresets[0].auxDialogue={...aux,user:'  '};assert.throws(()=>C.auxiliaryTurns(s),/모두 입력/);
 s.activeInstructionPresetIds.story=C.BUILTIN_INSTRUCTION_ID;assert.deepEqual(C.auxiliaryTurns(s),[]);
});
test('native prompt suffix follows final request exactly once and does not mutate chat; off on next call',async()=>{
 const handlers=new Map(),original=[{is_user:true,mes:'real chat'}];let last;
 const c={chat:original,name1:'User',extensionSettings:{},eventTypes:{CHAT_COMPLETION_PROMPT_READY:'ready'},eventSource:{on:(k,f)=>handlers.set(k,f),removeListener:k=>handlers.delete(k)},generateQuietPrompt:async a=>{
  last={chat:[{role:'system',content:'PRESET\n'+a.quietPrompt}]};handlers.get('ready')(last);handlers.get('ready')(last);return 'Result';
 }};
 const h=createSTHost({context:()=>c}),suffix=C.auxiliaryTurns(config()),payload={messages:[{role:'user',content:'<SIDESTORY>REQUEST'},...suffix],quietPrompt:'<SIDESTORY>REQUEST',useSillyTavernContext:true,auxiliaryTurns:suffix};
 try{await h.generate(payload);assert.deepEqual(last.chat.slice(-3),[{role:'user',content:'<SIDESTORY>REQUEST'},...suffix]);assert.equal(last.chat.length,4);assert.deepEqual(c.chat,[{is_user:true,mes:'real chat'}]);
 await h.generate({...payload,auxiliaryTurns:[],messages:payload.messages.slice(0,1)});assert.equal(last.chat.length,2);
 }finally{h.cleanup();}
});
test('raw generation keeps the two roles and request copy; token fitting includes both turns',async()=>{
 let sent;const h=createSTHost({context:()=>({extensionSettings:{},generateRaw:async p=>{sent=p.prompt;return 'OK';}})});
 const rows=[{role:'system',content:'Rules'},{role:'user',content:'Request'},...C.auxiliaryTurns(config())];
 const fit=new Function(read('token-budget.js')+';return fitTokenBudget')();const counter={messages:async rows=>rows.reduce((n,r)=>n+r.content.length,0)};
 const fitted=await fit(rows,10000,counter);assert.equal(fitted.tokens,await counter.messages(rows));
 try{await h.generate({messages:fitted.messages});assert.deepEqual(sent,rows);}finally{h.cleanup();}
});
