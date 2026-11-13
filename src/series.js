const SideSeries=(()=>{
 function groups(rows){const map=new Map();for(const r of rows){const key=r.seriesId?'series:'+r.seriesId:'record:'+r.id;if(!map.has(key))map.set(key,[]);map.get(key).push(r);}return [...map.values()];}
 function ordered(rows){const ids=new Set(rows.map(r=>r.id)),children=new Map(),seen=new Set(),out=[];for(const r of [...rows].sort((a,b)=>a.createdAt-b.createdAt)){const key=ids.has(r.parentId)?r.parentId:null;if(!children.has(key))children.set(key,[]);children.get(key).push(r);}function walk(r,depth){if(seen.has(r.id))return;seen.add(r.id);out.push({record:r,depth});for(const child of children.get(r.id)||[])walk(child,depth+1);}for(const r of children.get(null)||[])walk(r,0);for(const r of rows)walk(r,0);return out;}
 /** Survivors of a delete, re-linked so a series stays one line: a deleted part's oldest surviving version takes its place,
  * everything else that hung off a deleted record moves up to its nearest surviving ancestor, and a series left with a
  * single article stops being a series. Returns only the records that changed. */
 function relink(rows,ids){
  const gone=new Set(ids),REPL=new Set(['revise','regenerate','edit']),byId=new Map(rows.map(r=>[r.id,{...r}])),stand=new Map(),changed=new Set();
  for(const x of rows.filter(r=>gone.has(r.id)&&!REPL.has(r.action)).sort((a,b)=>a.createdAt-b.createdAt)){
   const v=[...byId.values()].filter(r=>!gone.has(r.id)&&r.parentId===x.id&&REPL.has(r.action)).sort((a,b)=>a.createdAt-b.createdAt)[0];
   if(!v)continue;v.action=x.action;v.baseAction=x.baseAction;v.parentId=x.parentId||null;if(!v.anchor&&x.anchor)v.anchor=x.anchor;if(!v.canon&&x.canon)v.canon=x.canon;stand.set(x.id,v.id);changed.add(v.id);
  }
  const resolve=id=>{for(let g=0;g<500&&id&&gone.has(id);g++)id=stand.get(id)??byId.get(id)?.parentId??null;return id||null;};
  for(const r of byId.values()){if(gone.has(r.id))continue;const p=resolve(r.parentId);if(p!==(r.parentId||null)){r.parentId=p;changed.add(r.id);}}
  const members=new Map();for(const r of byId.values())if(!gone.has(r.id)&&r.seriesId)members.set(r.seriesId,[...(members.get(r.seriesId)||[]),r]);
  for(const rest of members.values())if(rest.length===1&&[...gone].some(id=>rows.find(x=>x.id===id)?.seriesId===rest[0].seriesId)){rest[0].seriesId=null;rest[0].seriesTitle=null;changed.add(rest[0].id);}
  return [...changed].map(id=>byId.get(id));
 }
 return {groups,ordered,relink};
})();
let seriesSelection=null,continuationMode=null,continuationKnobs=null,pngIncludeInner=false,rewriteMode='revise',rewriteNote='';
function seriesMembers(record){return record?.seriesId?records.filter(r=>r.seriesId===record.seriesId):[];}
function seriesList(rows,{actions=false,picking=false}={}){const byId=new Map(records.map(r=>[r.id,r])),kids=new Map();for(const r of rows)if(r.parentId)kids.set(r.parentId,(kids.get(r.parentId)||0)+1);
 const relation=r=>!r.parentId?'시작':!byId.has(r.parentId)?'원본 삭제됨':kids.get(r.parentId)>1?'갈래':r.action==='continue'?'이어짐':'파생됨';
 return `<div class="series-list">${SideSeries.ordered(rows).map(({record:r,depth})=>{const on=current?.id===r.id,meta=[C.MODE_LABELS[r.mode],relation(r),r.status==='partial'?'미완료':''].filter(Boolean).join(' · ');return `<div class="series-row${on?' on':''}"><span class="series-no" aria-hidden="true">${depth+1}</span><button ${picking?`data-series-toggle="${E(r.id)}" aria-pressed="${seriesSelection.has(r.id)}"`:`data-open="${E(r.id)}" aria-current="${on?'true':'false'}"`} aria-label="${depth+1}편 ${E(r.title)}"><b>${E(r.title)}</b><small>${E(meta)}</small></button>${picking?`<span class="series-check${seriesSelection.has(r.id)?' on':''}" aria-hidden="true">${seriesSelection.has(r.id)?icon('check'):''}</span>`:''}${actions?`<div class="card-icons"><button data-rename-record="${E(r.id)}" aria-label="제목 바꾸기">${smallIcon('edit')}</button><button data-fav="${E(r.id)}" aria-label="즐겨찾기" aria-pressed="${!!r.favorite}">${smallIcon('star',!!r.favorite)}</button><button data-organize="${E(r.id)}" aria-label="폴더 · 태그">${smallIcon('tag')}</button><button data-delete="${E(r.id)}" aria-label="삭제" ${busy?'disabled':''}>${smallIcon('trash')}</button></div>`:''}</div>`;}).join('')}</div>`;}
async function saveGenerated(record,previous){
 const source=previous&&records.find(r=>r.id===previous.id);
 if(record.action==='continue'&&source&&!source.seriesId){const rootRecord={...source,seriesId:record.seriesId,seriesTitle:record.seriesTitle};await dbOp('batch',[rootRecord,record]);records=[...records.filter(r=>r.id!==source.id&&r.id!==record.id),rootRecord,record];}
 else await save(record);
}
/** Deletes articles and re-links what is left (see SideSeries.relink). Keeps the reader on the same series when it can. */
async function deleteRecords(ids){
 ids=[...new Set(ids)].filter(id=>records.some(r=>r.id===id));if(!ids.length)return 0;
 const removed=new Set(ids),series=current&&removed.has(current.id)?current.seriesId:null,stay=series?records.filter(r=>r.seriesId===series&&!removed.has(r.id)).map(r=>r.id):[],updates=SideSeries.relink(records,ids);
 await dbOp('deleteMany',ids);if(updates.length)await dbOp('batch',updates);
 const changed=new Map(updates.map(r=>[r.id,r]));records=records.filter(r=>!removed.has(r.id)).map(r=>changed.get(r.id)||r);
 for(const id of ids)temporaryByRecord.delete(id);for(const [mode,r] of workResults)if(removed.has(r.id))workResults.delete(mode);if(removed.has(archiveEditId))archiveEditId=null;for(const id of ids)archiveSelection.delete(id);
 if(current&&removed.has(current.id)){const left=records.filter(r=>stay.includes(r.id)).sort((a,b)=>b.createdAt-a.createdAt)[0];current=left?latestVersion(left):null;if(!current&&page==='create')page='stories';}
 else if(current)current=changed.get(current.id)||current;
 return ids.length;
}
async function deleteSeriesSelection(){if(busy||!seriesSelection?.size||!current)return;const members=seriesMembers(current),order=new Map(SideSeries.ordered(members).map(({record,depth})=>[record.id,depth+1])),ids=[...seriesSelection].filter(id=>order.has(id)),left=members.length-ids.length;
 if(!ids.length)return;const names=[...new Set(ids.map(id=>order.get(id)))].sort((a,b)=>a-b).map(n=>n+'편').join(' · ');
 const note=left<=0?'시리즈의 모든 아티클이 지워져요.':left===1?'남은 아티클 하나는 시리즈에서 풀려 보통 아티클이 돼요.':'남은 아티클은 앞뒤로 다시 이어 붙여요. 지운 아티클의 다음 아티클이 그 앞 아티클에 바로 이어져요.';
 if(!await askConfirm('아티클 삭제',`${names} (${ids.length}개)를 지울까요? 아티클에 붙은 번역도 함께 지워져요. ${note}`,true)){sheet='series';render();return;}
 const n=await deleteRecords(ids);seriesSelection=null;sheet=current?.seriesId?'series':'';render();say(`아티클 ${n}개를 지웠어요.`);}
async function renameRecord(id){const r=records.find(x=>x.id===id);if(!r)return;const name=await askText(r.seriesId?'이 아티클 제목':'제목 바꾸기','제목',r.title||'','저장');const title=String(name||'').trim().slice(0,300);if(!title||title===r.title)return;const next={...(records.find(x=>x.id===id)||r),title};await save(next);if(current?.id===id)current=next;render();}
/** Parts from the first one up to the given part, on the line being read (other branches are left out). */
function partsUpTo(record){const line=partLine(record),at=line.findIndex(r=>r.id===record?.id);return at<0?[record]:line.slice(0,at+1);}
async function createResultChat(fromStart=false){if(busy||!current)return;const record=current,parts=fromStart?partsUpTo(record):[record];busy=true;try{const name=await stHost.createChatFromRecord(record,parts);say('새 채팅을 만들었어요: '+name);globalThis.toastr?.success(parts.length>1?`1편부터 ${parts.length}편까지 아티클을 메시지로 넣어 새 채팅을 만들었어요.`:'아티클을 첫 메시지로 새 채팅을 만들었어요.','Side Story');}finally{busy=false;if(alive)render();}}
async function appendResultToChat(fromStart=false){if(busy||!current)return;const record=current,parts=fromStart?partsUpTo(record):[record];if(!await askConfirm('현재 채팅에 추가',`${parts.length>1?`1편부터 ${parts.length}편까지 `:''}아티클 ${parts.length}개를 캐릭터 메시지로 지금 채팅 맨 끝에 붙여요. 일반 메시지라 이후 대화에서 AI가 기억해요.`))return;busy=true;try{const n=await stHost.appendToCurrentChat(record,parts);say(`채팅에 메시지 ${n}개를 추가했어요.`);globalThis.toastr?.success(`채팅에 메시지 ${n}개를 추가했어요.`,'Side Story');}finally{busy=false;if(alive)render();}}
/* Per-continuation voice options. They start from the part being continued and never touch the composer's own settings. */
const CONTINUE_KNOBS={speak:['speakAsker','innerHonesty','showInnerThoughts'],write:['writeHonesty']};
function continueKnobValues(mode){const keys=CONTINUE_KNOBS[mode==='think'?'speak':mode];if(!keys)return null;const from=current?.settings||{},out={};for(const k of keys)out[k]=continuationKnobs?.[k]??from[k]??s[k];return C.settings({...s,...out});}
function continueKnobs(mode){const v=continueKnobValues(mode);if(!v)return '';const honesty=[['character','캐릭터답게'],['honest','솔직하게']];
 const sel=(label,key,items)=>`<label class="knob" title="${label}"><span>${label}</span><select data-continue-knob="${key}" aria-label="${label}">${items.map(x=>opt(x[0],x[1],v[key])).join('')}</select></label>`;
 if(mode==='write')return `<span class="label">쓰는 방식</span><div class="knobs grid-1">${sel('쓰는 방식','writeHonesty',honesty)}</div>`;
 return `<span class="label">말하기 옵션</span><div class="knobs grid-2">${sel('묻는 사람','speakAsker',[['user',userName()],['outsider','이야기 속 제3자'],['author','작가']])}${sel('말하는 방식','innerHonesty',honesty)}</div><label class="row switch"><span class="grow">속마음 함께 보기<small>답변마다 접어 둔 속마음을 함께 만들어요</small></span><input type="checkbox" class="toggle" data-continue-knob="showInnerThoughts" ${v.showInnerThoughts?'checked':''}></label>`;}
function setContinueKnob(t){const key=t.dataset.continueKnob;continuationKnobs={...(continuationKnobs||{}),[key]:t.type==='checkbox'?t.checked:t.value};}

