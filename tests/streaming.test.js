import test from 'node:test';
import assert from 'node:assert/strict';
import {createSTHost} from '../src/st-host.js';

/** Minimal stand-ins for ST's openai.js / sse-stream.js and a server that streams OpenAI-style chunks. */
function rig({pieces=['문단 하나. ','문단 둘. ','끝.'],finish=true,stallAfter=null,breakAfter=null}={}){
 const handlers=new Map(),sent=[];let stopped=0;
 const sseApi={getEventSourceStream:()=>{let buf='';return new TransformStream({transform(chunk,ctl){buf+=typeof chunk==='string'?chunk:new TextDecoder().decode(chunk);let at;while((at=buf.indexOf('\n\n'))>=0){const line=buf.slice(0,at);buf=buf.slice(at+2);if(line.startsWith('data: '))ctl.enqueue({data:line.slice(6)});}}});}};
 const openaiApi={oai_settings:{openai_max_tokens:300,temp_openai:0.7},getChatCompletionModel:()=>'m',
  createGenerationParameters:async(settings,model,type,messages)=>({generate_data:{model,type,messages,max_tokens:settings.openai_max_tokens,temperature:settings.temp_openai,stream:false},stream:false}),
  getStreamingReply:p=>p.choices?.[0]?.delta?.content||''};
 const fetcher=async(url,init)=>{
  const body=JSON.parse(init.body);sent.push(body);
  const stream=new ReadableStream({async start(ctl){
   const enc=new TextEncoder();
   for(let i=0;i<pieces.length;i++){
    if(breakAfter===i){ctl.close();return;}
    if(stallAfter===i)return;
    ctl.enqueue(enc.encode('data: '+JSON.stringify({choices:[{delta:{content:pieces[i]},finish_reason:null}]})+'\n\n'));await new Promise(r=>setTimeout(r,2));
   }
   if(finish)ctl.enqueue(enc.encode('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'));
   ctl.close();
  }});
  init.signal?.addEventListener('abort',()=>{try{stream.cancel();}catch{}});
  return {ok:true,status:200,body:stream};
 };
 const c={mainApi:'openai',name1:'U',chat:[{name:'A',mes:'hello'}],extensionSettings:{},getRequestHeaders:()=>({}),
  eventTypes:{CHAT_COMPLETION_PROMPT_READY:'ready',GENERATE_AFTER_DATA:'after',CHAT_COMPLETION_SETTINGS_READY:'settings'},
  eventSource:{on:(k,f)=>handlers.set(k,f),removeListener:k=>handlers.delete(k),emit:async(k,d)=>{if(k==='settings')d.seen=true;}},
  // ST's quiet generation: builds the request, lets GENERATE_AFTER_DATA listeners run, then sends unless stopped.
  generateQuietPrompt:async({quietPrompt})=>{const prompt=[{role:'system',content:'MAIN'},{role:'user',content:quietPrompt}];await handlers.get('after')?.({prompt},false);if(stopped)throw new DOMException('Clicked stop button','AbortError');return 'ST NON-STREAM';}};
 const host=createSTHost({context:()=>c,state:{stopGeneration:()=>{stopped++;}},openaiApi,sseApi,fetcher});
 return {host,c,sent,stopped:()=>stopped};
}
const ask=(host,extra={})=>host.generate({useSillyTavernContext:true,quietPrompt:'<SIDESTORY>\nASK\n</SIDESTORY>',parameters:{maxTokens:20000},stream:true,...extra});

test('streaming sends ST\'s own final request as a stream and stops ST\'s copy',async()=>{
 const r=rig(),seen=[];
 assert.equal(r.host.streamingSupported(),true);
 const out=await ask(r.host,{onStream:t=>seen.push(t)});
 assert.equal(out,'문단 하나. 문단 둘. 끝.');assert.deepEqual(seen,['문단 하나. ','문단 하나. 문단 둘. ','문단 하나. 문단 둘. 끝.']);
 assert.equal(r.sent.length,1);assert.equal(r.sent[0].stream,true);assert.equal(r.sent[0].type,'quiet');assert.equal(r.sent[0].temperature,0.7);
 assert.equal(r.sent[0].messages.at(-1).content,'<SIDESTORY>\nASK\n</SIDESTORY>');assert.equal(r.sent[0].seen,true,'CHAT_COMPLETION_SETTINGS_READY listeners see the request');
 assert.equal(r.stopped(),1,'ST\'s own request is stopped before it leaves');
 // Off: ST's normal quiet generation runs untouched.
 const off=rig();assert.equal(await ask(off.host,{stream:false}),'ST NON-STREAM');assert.equal(off.sent.length,0);assert.equal(off.stopped(),0);
 // Not chat completion: no streaming.
 const text=rig();text.c.mainApi='textgenerationwebui';assert.equal(text.host.streamingSupported(),false);assert.equal(await ask(text.host),'ST NON-STREAM');
});

test('a stream that ends without its finish marker, or goes silent, fails with what arrived',async()=>{
 const cut=rig({breakAfter:2,finish:false});
 await assert.rejects(ask(cut.host),e=>e.partialText==='문단 하나. 문단 둘. '&&/끝 표시 없이/.test(e.message));
 globalThis.sideStoryStreamIdleSeconds=0.05;
 try{const quiet=rig({stallAfter:1});await assert.rejects(ask(quiet.host),e=>e.partialText==='문단 하나. '&&/멈췄어요/.test(e.message));}
 finally{delete globalThis.sideStoryStreamIdleSeconds;}
});

test('raw requests (translation) stream directly with the requested length and skip the one-at-a-time lock',async()=>{
 const r=rig();
 const both=await Promise.all([1,2].map(()=>r.host.generate({connectionId:'st-current',messages:[{role:'system',content:'S'},{role:'user',content:'⟦0⟧\nHi'}],parameters:{maxTokens:4000},stream:true})));
 assert.deepEqual(both,['문단 하나. 문단 둘. 끝.','문단 하나. 문단 둘. 끝.']);assert.equal(r.sent.length,2);assert.equal(r.sent[0].max_tokens,4000);assert.equal(r.stopped(),0);
});
