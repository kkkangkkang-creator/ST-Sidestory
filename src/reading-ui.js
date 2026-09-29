let readingSurface=null,readingErrors=[],readingPending=false,readingFrame=null,readingEpoch=0;
let temporaryRules=[],temporaryEnabled=false,featurePanel='',rulesDraft=null,featureFocus=null,selectedExcerpt=null;
const frameFlushRequests=new Map();let frameFlushSequence=0;
function activeReplacementRules(useRules=s.replacementsEnabled,useTemporary=temporaryEnabled){return [...(useRules?s.replacementRules:[]),...(useTemporary?temporaryRules:[])];}
function readingBadge(){const node=$('reading-status');if(node){node.textContent=raw&&current?.mode==='visual'?'원문 소스 보기 · 치환 미적용':readingPending?'표시 처리 중…':readingErrors.length?'치환 오류 · 설정 확인':activeReplacementRules().some(r=>r.enabled&&r.find)?'표시용 치환 적용 중 · 원본 보존':'';node.classList.toggle('error',!!readingErrors.length);node.title=readingErrors.join('\n');}}
function clearSelection(){selectedExcerpt=null;$('excerpt-selection')?.remove();}
function disposeReading(){readingEpoch++;readingSurface?.dispose();readingSurface=null;readingFrame=null;readingPending=false;readingErrors=[];clearSelection();}
function showExcerptSelection(value,frame=null){
 if(!value?.text?.trim()||featurePanel||editing||page!=='create'){if(!featurePanel)clearSelection();return;}
 selectedExcerpt={...value,id:current?.id,translation:translationShown};let b=$('excerpt-selection');if(!b){b=document.createElement('button');b.id='excerpt-selection';b.textContent='발췌';b.className='excerpt-selection';b.addEventListener('pointerdown',e=>e.preventDefault());ui.append(b);}
 const hostRect=host.getBoundingClientRect(),frameRect=frame?.getBoundingClientRect();const x=value.rect.x+(frameRect?.x||0)-hostRect.x,y=value.rect.bottom+(frameRect?.y||0)-hostRect.y;
 b.style.left=Math.max(8,Math.min(hostRect.width-80,x))+'px';b.style.top=Math.max(8,Math.min(hostRect.height-45,y+6))+'px';
}
function attachReading(){
 if(!current||editing||!$('result'))return;
 const el=$('result'),epoch=readingEpoch;readingFrame=el.querySelector('iframe');
 if(readingFrame){readingPending=true;readingBadge();return;}
 if(typeof document.createTreeWalker!=='function')return;
 readingSurface=installReadingSurface(el,values=>SideReplace.run(values,raw&&current.mode==='visual'?[]:activeReplacementRules()),v=>showExcerptSelection(v),(status,errors)=>{if(epoch!==readingEpoch)return;readingPending=status==='pending';if(status!=='pending')readingErrors=errors||[];readingBadge();});
}
async function refreshReading(){clearSelection();if(readingSurface)await readingSurface.refresh();else if(readingFrame)await flushReading(false);readingBadge();}
async function flushReading(requireValid=true){
 if(readingSurface)await readingSurface.flush();
 else if(readingFrame){const frame=readingFrame,id=++frameFlushSequence;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{frameFlushRequests.delete(id);reject(Error('화면 준비가 지연되고 있어요. 잠시 후 다시 저장해 주세요.'));},5000);frameFlushRequests.set(id,{resolve,reject,timer,frame});frame.contentWindow?.postMessage({channel:'st-sidestory-reading-v1',type:'flush',id},'*');});}
 if(requireValid&&readingErrors.length)throw Error(readingErrors.join('\n'));
}
function onReadingMessage(e){
 const frame=readingFrame,d=e.data;if(!frame||e.source!==frame.contentWindow||d?.channel!=='st-sidestory-reading-v1')return;
 if(d.type==='transform'){
  if(!Array.isArray(d.values)||d.values.length>50000||d.values.some(v=>typeof v!=='string')||d.values.reduce((a,v)=>a+v.length,0)>2000000)return;
  SideReplace.run(d.values,activeReplacementRules()).then(result=>{if(frame===readingFrame)frame.contentWindow?.postMessage({channel:d.channel,type:'transformed',id:d.id,result},'*');},error=>{if(frame===readingFrame)frame.contentWindow?.postMessage({channel:d.channel,type:'transformed',id:d.id,error:error.message},'*');});
 }else if(d.type==='selection'){const v=d.value;if(v&&typeof v.raw==='string'&&typeof v.text==='string'&&v.raw.length<=100000&&v.rect&&[v.rect.x,v.rect.bottom].every(Number.isFinite))showExcerptSelection(v,frame);else if(!v)showExcerptSelection(null);}
 else if(d.type==='status'){readingPending=d.status==='pending';if(!readingPending)readingErrors=Array.isArray(d.errors)?d.errors.map(String).slice(0,80):[];readingBadge();}
 else if(d.type==='flushed'){const p=frameFlushRequests.get(d.id);if(p&&p.frame===frame){clearTimeout(p.timer);frameFlushRequests.delete(d.id);p.resolve();}}
}
function featureShell(title,body,footer){return `<div class="feature-overlay"><section class="feature-dialog ${featurePanel==='excerpt'?'excerpt-dialog':''}" role="dialog" aria-modal="true" aria-label="${E(title)}"><header><h2>${E(title)}</h2><button id="feature-close" aria-label="닫기">×</button></header><div class="feature-body">${body}</div><footer>${footer}</footer></section></div>`;}
function openFeature(kind){featureFocus=root.activeElement;featurePanel=kind;if(kind==='rules')rulesDraft={rules:structuredClone(s.replacementRules),temporary:structuredClone(temporaryRules),enabled:s.replacementsEnabled,tempEnabled:temporaryEnabled};paintFeature();root.querySelector('.feature-dialog button')?.focus();}
function closeFeature(){featurePanel='';$('feature-layer')?.remove();excerptEpoch++;featureFocus?.focus?.();}
function paintFeature(){let layer=$('feature-layer');if(!featurePanel){layer?.remove();return;}if(!layer){layer=document.createElement('div');layer.id='feature-layer';ui.append(layer);}layer.innerHTML=featurePanel==='rules'?replacementPanel():excerptPanel();if(featurePanel==='excerpt')updateExcerptPreview();}
function replacementPanel(){
 const rows=(key)=>rulesDraft[key].map((r,i)=>`<article class="replacement-row" data-rule-row="${key}-${i}"><div class="replacement-row-head"><label class="check"><input type="checkbox" data-rule-key="${key}" data-rule-index="${i}" data-rule-field="enabled" ${r.enabled?'checked':''}>사용</label><input aria-label="규칙 이름" data-rule-key="${key}" data-rule-index="${i}" data-rule-field="name" value="${E(r.name)}" maxlength="80"><button data-rule-move="${key}:${i}:-1" aria-label="위로">${smallIcon('prev')}</button><button data-rule-move="${key}:${i}:1" aria-label="아래로">${smallIcon('next')}</button><button data-rule-delete="${key}:${i}" aria-label="규칙 삭제">${smallIcon('trash')}</button></div><div class="replacement-pair"><label>찾을 내용<input data-rule-key="${key}" data-rule-index="${i}" data-rule-field="find" value="${E(r.find)}" maxlength="2000"></label><label>바꿀 내용<input data-rule-key="${key}" data-rule-index="${i}" data-rule-field="replace" value="${E(r.replace)}" maxlength="4000"></label></div>${key==='rules'?`<div class="replacement-options"><label class="check"><input type="checkbox" data-rule-key="${key}" data-rule-index="${i}" data-rule-field="regex" ${r.regex?'checked':''}>정규식</label><label>플래그<input aria-label="정규식 플래그" data-rule-key="${key}" data-rule-index="${i}" data-rule-field="flags" value="${E(r.flags)}" maxlength="8"></label><span class="hint">g: 전체 · i: 대소문자 무시 · $1: 캡처 그룹</span></div>`:''}</article>`).join('');
 return featureShell('화면 치환',`<p class="hint">원문·번역문에 동일하게 적용해요. 보관함 원본과 AI 요청은 바뀌지 않아요. HTML은 텍스트만 바꾸며 태그·스타일·스크립트는 유지해요.</p><section><div class="replacement-title"><h3>저장할 규칙</h3><label class="check"><input id="rules-enabled" type="checkbox" ${rulesDraft.enabled?'checked':''}>전체 적용</label><button data-rule-add="rules">${smallIcon('plus')} 추가</button></div>${rows('rules')}</section><section><div class="replacement-title"><h3>임시 치환</h3><label class="check"><input id="temporary-enabled" type="checkbox" ${rulesDraft.tempEnabled?'checked':''}>전체 적용</label><button data-rule-add="temporary">${smallIcon('plus')} 추가</button></div><p class="hint">이름 → 🌙처럼 입력해요. 새로고침하면 사라지고, 채팅을 바꾸면 꺼져요. 저장 규칙 다음에 적용돼요.</p>${rows('temporary')}</section><details><summary>치환 미리보기</summary><textarea id="replacement-sample" rows="2" placeholder="확인할 문장을 입력하세요"></textarea><button id="replacement-test">미리보기</button><pre id="replacement-preview"></pre></details><p id="replacement-error" class="inline-error" role="status"></p>`,`<button id="feature-close-bottom">닫기</button><button id="replacement-apply" class="primary">저장·적용</button>`);
}
async function handleReadingAction(b){const d=b.dataset;
 if(d.ruleAdd){if(rulesDraft[d.ruleAdd].length>=80)throw Error('규칙은 최대 80개까지 추가할 수 있어요.');rulesDraft[d.ruleAdd].push({id:H.uuid(),name:'치환 '+(rulesDraft[d.ruleAdd].length+1),find:'',replace:'',enabled:true,regex:false,flags:'g'});paintFeature();return true;}
 if(d.ruleDelete){const [k,i]=d.ruleDelete.split(':');rulesDraft[k].splice(Number(i),1);paintFeature();return true;}
 if(d.ruleMove){const [k,i,delta]=d.ruleMove.split(':'),a=Number(i),z=a+Number(delta);if(z>=0&&z<rulesDraft[k].length)[rulesDraft[k][a],rulesDraft[k][z]]=[rulesDraft[k][z],rulesDraft[k][a]];paintFeature();return true;}
 switch(b.id){
 case 'open-replacements-tools':case 'open-replacements':openFeature('rules');return true;
 case 'feature-close':case 'feature-close-bottom':closeFeature();return true;
 case 'replacement-test':{try{const r=await SideReplace.run([$('replacement-sample').value],[...(rulesDraft.enabled?rulesDraft.rules:[]),...(rulesDraft.tempEnabled?rulesDraft.temporary:[])]);if($('replacement-preview'))$('replacement-preview').textContent=r.items[0].text;if($('replacement-error'))$('replacement-error').textContent=r.errors.join('\n');}catch(e){if($('replacement-error'))$('replacement-error').textContent=e.message;}return true;}
 case 'replacement-apply':{const validation=await SideReplace.run([''],[...(rulesDraft.enabled?rulesDraft.rules:[]),...(rulesDraft.tempEnabled?rulesDraft.temporary:[])]);if(validation.errors.length){$('replacement-error').textContent=validation.errors.join('\n');return true;}s.replacementRules=SideReplace.clean(rulesDraft.rules);s.replacementsEnabled=rulesDraft.enabled;temporaryRules=SideReplace.clean(rulesDraft.temporary);temporaryEnabled=rulesDraft.tempEnabled;persist();await refreshReading();if($('replacement-error'))$('replacement-error').textContent=readingErrors.join('\n');if(!readingErrors.length){closeFeature();say('화면 치환을 적용했어요. 원본은 그대로예요.');}return true;}
 case 'excerpt-tools':case 'excerpt-selection':case 'excerpt-open':await openExcerpt();return true;
 case 'excerpt-save':await saveExcerpt();return true;
 case 'excerpt-prev':excerpt.page=Math.max(0,excerpt.page-1);updateExcerptPreview();return true;
 case 'excerpt-next':excerpt.page=Math.min(excerpt.pages-1,excerpt.page+1);updateExcerptPreview();return true;
 case 'excerpt-upload':$('excerpt-image-input').click();return true;
 case 'excerpt-background-delete':await deleteExcerptBackground();return true;
 }
 if(d.excerptRatio){excerpt.ratio=d.excerptRatio;excerpt.page=0;paintFeature();return true;}
 if(d.excerptBackground){excerpt.background=d.excerptBackground;if(excerptThemes[d.excerptBackground])excerpt.color=excerptThemes[d.excerptBackground].ink;paintFeature();return true;}return false;
}
function readingInput(t){if(t.dataset.ruleField&&rulesDraft){const row=rulesDraft[t.dataset.ruleKey]?.[Number(t.dataset.ruleIndex)];if(row)row[t.dataset.ruleField]=t.type==='checkbox'?t.checked:t.value;}
 if(t.id==='rules-enabled')rulesDraft.enabled=t.checked;if(t.id==='temporary-enabled')rulesDraft.tempEnabled=t.checked;
 if(t.dataset.excerpt){const k=t.dataset.excerpt;excerpt[k]=t.type==='checkbox'?t.checked:t.type==='range'?Number(t.value):t.value;excerpt.page=0;updateExcerptPreview();}
}
function featureKeydown(e){if(!featurePanel)return false;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeFeature();return true;}if(e.key==='Tab'){const els=[...root.querySelectorAll('.feature-dialog button,.feature-dialog input,.feature-dialog select,.feature-dialog textarea,.feature-dialog summary')].filter(x=>!x.disabled&&x.getClientRects().length),a=els[0],b=els.at(-1);if(!root.querySelector('.feature-dialog').contains(root.activeElement)){e.preventDefault();a?.focus();}else if(e.shiftKey&&root.activeElement===a){e.preventDefault();b?.focus();}else if(!e.shiftKey&&root.activeElement===b){e.preventDefault();a?.focus();}}return true;}
