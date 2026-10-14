import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSTHost} from '../src/st-host.js';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const C=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return SideCore;')();
const H=new Function('SideExtras',read('transport.js')+';return HostCore;')({tokens:t=>String(t||'').length});

const part=(id,props)=>({id,mode:'story',chatId:'c',createdAt:1,...props});

test('continuation turn: earlier parts with their own requests, full previous part, resume point, request last',()=>{
 const records=[
  part('p1',{action:'new',request:'두 사람이 싸운 이야기',instruction:'두 사람이 싸운 이야기',content:'싸움이 시작됐다.\n\n문이 쾅 닫혔다.',recap:'둘은 크게 싸웠다.'}),
  part('p2',{action:'continue',parentId:'p1',request:'두 사람이 싸운 이야기',instruction:'화해까지',content:'초안'}),
  part('p2b',{action:'revise',parentId:'p2',request:'두 사람이 싸운 이야기',instruction:'더 천천히',content:'며칠이 지났다.\n\n그가 먼저 문을 두드렸다.'})
 ];
 const chain=C.seriesChain(records,records[2]);
 assert.deepEqual(chain.map(r=>r.id),['p1','p2b']);
 const s=C.settings({mode:'story'});
 const text=C.contextualPrompt(s,'그 다음날 아침',chain,'continue');
 assert(text.startsWith('<SIDESTORY>'));assert(text.trim().endsWith('</SIDESTORY>'));
 assert(text.includes('<part n="1" request="두 사람이 싸운 이야기">\n싸움이 시작됐다.'));
 assert(text.includes('<previous_part n="2" request="더 천천히">'));
 assert(text.includes('<resume_point>\n며칠이 지났다.\n\n그가 먼저 문을 두드렸다.\n</resume_point>'));
 assert(text.includes('Part 3 of an ongoing side story'));
 assert(!text.includes('초안'),'superseded draft never reaches the prompt');
 assert(!/standalone episode/i.test(text));
 const order=['<preset_scope>\n','<mode name="story">\n','<timeline>\n','<story_so_far>\n','<previous_part n','<resume_point>\n','<user_request>\n','<task>\n','<output>\n'].map(tag=>text.indexOf(tag));
 assert(order.every((v,i)=>v>=0&&(i===0||v>order[i-1])),'blocks keep their order with the request near the end');
 assert(text.includes('This counts the new part only.'));
});

test('long series falls back to recaps for earlier parts; revise sends the draft with earlier context',()=>{
 const big='가'.repeat(13000);
 const chain=[part('a',{action:'new',instruction:'A',content:big,recap:'RECAP_A'}),part('b',{action:'continue',parentId:'a',instruction:'B',content:'B 본문'}),part('c',{action:'continue',parentId:'b',instruction:'C',content:'C 본문'})];
 const s=C.settings({mode:'story'});
 const cont=C.contextualPrompt(s,'D',chain,'continue');
 assert(cont.includes('RECAP_A'));assert(!cont.includes(big));
 const rev=C.contextualPrompt(s,'고쳐줘',chain,'revise');
 assert(rev.includes('<draft_to_revise request="C">\nC 본문'));assert(rev.includes('<previous_part n="2" request="B">'));
 assert(!rev.includes('<resume_point>'));assert(!rev.includes('<timeline>'),'a revision keeps the original timing');
 assert(rev.includes('Revise <draft_to_revise>'));
});

test('new pieces carry the selected timeline only in creative modes; regenerate asks for a fresh attempt',()=>{
 for(const [timeline,text] of Object.entries(C.TIMELINES)){
  assert(C.contextualPrompt(C.settings({mode:'story',timeline}),'X').includes(text));
 }
 assert(!C.contextualPrompt(C.settings({mode:'analysis',timeline:'past'}),'X').includes('<timeline>'));
 assert(C.contextualPrompt(C.settings({mode:'story'}),'X',null,'regenerate').includes('fresh attempt'));
 assert.equal(C.settings({timeline:'bogus'}).timeline,'auto');
});

test('preset scope is editable, removable, and never sent on a separate connection',()=>{
 assert(C.contextualPrompt(C.settings({mode:'story'}),'X').includes(C.PRESET_SCOPE));
 assert(C.contextualPrompt(C.settings({mode:'story',presetScope:'MY SCOPE'}),'X').includes('<preset_scope>\nMY SCOPE\n</preset_scope>'));
 assert(!C.contextualPrompt(C.settings({mode:'story',presetScope:'  '}),'X').includes('<preset_scope>'));
 const rows=C.messages(C.settings({mode:'story'}),{text:'{"dialogue":[]}'},'X');
 assert(!rows[1].content.includes('<preset_scope>'));assert(rows[1].content.includes('<SIDESTORY>'));
});

test('recap is split off generated text; message count accepts free numbers',()=>{
 assert.deepEqual(C.splitRecap('본문\n\n<recap>요약입니다.</recap>'),{content:'본문',recap:'요약입니다.'});
 assert.deepEqual(C.splitRecap('본문만'),{content:'본문만',recap:''});
 assert.equal(C.splitRecap('본문\n<recap>잘림').content,'본문');
 for(const [input,expected] of [['','all'],['all','all'],['0','0'],['25','25'],['abc','all'],[' 7 ','7'],['20','20']])assert.equal(C.settings({scope:input}).scope,expected);
});

test('raw-path context honors a series cutoff, exclusion and a zero count',async()=>{
 const counter={text:async v=>String(v).length};
 const messages=[0,1,2,3,4].map(i=>({id:String(i),role:i%2?'user':'A',content:'M'+i,extra:{}}));
 const base={chat:{metadata:{}},cards:[],personas:[],messages,lore:[]};
 const run=async extra=>JSON.parse((await H.context(base,{...C.settings({}),contextBudget:100000,...extra},counter)).text).dialogue.map(d=>d.text);
 assert.deepEqual(await run({}),['M0','M1','M2','M3','M4']);
 assert.deepEqual(await run({historyCutoff:2}),['M0','M1','M2']);
 assert.deepEqual(await run({historyCutoff:2,scope:'2'}),['M1','M2']);
 assert.deepEqual(await run({scope:'0'}),[]);
 assert.deepEqual(await run({historyExclude:true}),[]);
});

function stContext(){
 const handlers=new Map();
 const c={name1:'유저',chat:[{name:'A',mes:'m0',send_date:'d0'},{name:'유저',mes:'m1',is_user:true,send_date:'d1'},{name:'A',mes:'hidden',is_system:true,send_date:'dh'},{name:'A',mes:'m3',send_date:'d3'},{name:'유저',mes:'m4',is_user:true,send_date:'d4'},{name:'A',mes:'m5',send_date:'d5'}],
  eventTypes:{CHAT_COMPLETION_PROMPT_READY:'ready'},
  eventSource:{on:(k,f)=>handlers.set(k,f),removeListener:k=>handlers.delete(k)},extensionSettings:{}};
 return {c,handlers};
}

test('anchors track the latest visible message and survive index shifts',()=>{
 const {c}=stContext(),host=createSTHost({context:()=>c});
 const anchor=host.currentAnchor();assert.deepEqual(anchor,{index:5,sendDate:'d5',name:'A'});
 c.chat.splice(0,1);assert.equal(host.resolveAnchor(anchor),4);
 c.chat.pop();assert.equal(host.resolveAnchor(anchor),-1);
 host.cleanup();
});

test('ST prompt: squashed quiet prompt is split into a final user turn; history is trimmed only for Side Story',async()=>{
 const {c,handlers}=stContext(),host=createSTHost({context:()=>c});
 const interceptor=globalThis.sideStoryGenerateInterceptor;assert.equal(typeof interceptor,'function');
 const coreChat=()=>c.chat.filter(m=>!m.is_system).map(m=>({...m}));
 // Outside a Side Story generation the interceptor never touches the chat.
 const untouched=coreChat();await interceptor(untouched,0,()=>{},'quiet');assert.equal(untouched.length,5);
 let seenHistory,ready,args;
 c.generateQuietPrompt=async a=>{
  args=a;
  const chat=coreChat();await interceptor(chat,0,()=>{},'quiet');seenHistory=chat.map(m=>m.mes);
  ready={chat:[{role:'system',content:'MAIN'},{role:'user',content:'m4'},{role:'system',content:'POST HISTORY\n'+a.quietPrompt}],dryRun:false};
  handlers.get('ready')?.({chat:[{role:'system',content:'dry'}],dryRun:true});
  handlers.get('ready')(ready);
  return 'RESULT';
 };
 let info;
 const quiet='<SIDESTORY>\nASK\n</SIDESTORY>';
 const out=await host.generate({useSillyTavernContext:true,quietPrompt:quiet,parameters:{maxTokens:10},history:{limit:2,anchor:{index:3,sendDate:'d3',name:'A'},exclude:false},onPromptReady:x=>info=x});
 assert.equal(out,'RESULT');assert.equal(args.quietName,'유저');
 assert.deepEqual(seenHistory,['m1','m3'],'cut at the series anchor, then the last two');
 assert.deepEqual(ready.chat.map(m=>m.role),['system','user','system','user']);
 assert.equal(ready.chat[2].content,'POST HISTORY');assert.equal(ready.chat.at(-1).content,quiet);
 assert.equal(info.messages.at(-1).role,'user');assert.deepEqual(info.history,{before:5,anchor:'applied',after:2});
 assert.equal(handlers.size,0,'listeners are removed after the run');
 // Excluding canon removes every chat message; zero limit does the same.
 for(const history of [{exclude:true},{limit:0}]){
  await host.generate({useSillyTavernContext:true,quietPrompt:quiet,history});assert.deepEqual(seenHistory,[]);
 }
 host.cleanup();assert.equal(globalThis.sideStoryGenerateInterceptor,undefined);
});

test('structure report carries roles, sizes and tag names but no prompt text',()=>{
 const X=new Function(read('extras.js')+';return SideExtras;')();
 const report=X.structureReport({connectionMeta:{api:'openai',source:'claude',model:'m',squash:true,prefillChars:12,promptReadyEvent:true},
  finalPrompt:[{role:'system',content:'<rules>SECRET_TEXT</rules>'},{role:'user',content:'<SIDESTORY>\nSECRET_REQUEST'},{role:'assistant',content:'SECRET_PREFILL'}],
  responseShape:{chars:10,tags:['thinking'],recap:false,startsWithTag:'thinking'}});
 assert(!/SECRET/.test(report));assert(report.includes('#2 user'));assert(report.includes('★SIDESTORY'));assert(report.includes('태그: rules'));
 assert(report.includes('SIDESTORY 뒤에 메시지 1개'));assert(report.includes('source=claude'));
});
