/* Shared composer controls for the original workspace and inner-life workspace. */
let inputPanelOpen=false,inputPanelTab='history',inputPanelScope='all';
let lastOuterMode='visual',lastInnerMode='speak';
const workResults=new Map();
function isInner(mode=s.mode){return ['speak','write'].includes(mode);}
function switchWorkMode(mode){
 if(!C.MODES[mode])return;
 continuationMode=null;
 s.requestDrafts[s.mode]=s.request;
 if(current?.chatId===chatId)workResults.set(current.mode,current);
 s.mode=mode;s.request=s.requestDrafts[mode]||'';
 if(isInner(mode))lastInnerMode=mode;else if(mode!=='facet')lastOuterMode=mode;
 const cached=workResults.get(mode);current=cached?records.find(r=>r.id===cached.id&&r.chatId===chatId)||null:null;if(mode==='facet'&&!facetWorkspaceMatches(current,s.facetWorkspace))current=records.filter(r=>r.chatId===chatId&&facetWorkspaceMatches(r,s.facetWorkspace)).sort((a,b)=>b.createdAt-a.createdAt)[0]||null;
 page='create';viewEpoch++;mobilePane='compose';raw=false;editing=false;translationDraft=null;translationShown=false;referencesOpen=false;
 persist();render();
}
function switchWorkSection(inner){
 if(isInner())lastInnerMode=s.mode;else if(s.mode!=='facet')lastOuterMode=s.mode;
 if(s.mode!=='facet'&&inner===isInner()){page='create';viewEpoch++;render();return;}
 switchWorkMode(inner?lastInnerMode:lastOuterMode);
}
function innerOptions(){
 const honesty=[['character','캐릭터답게'],['honest','솔직하게']];
 if(s.mode==='speak')return `<div class="inner-options">${field('말하는 방식',select('innerHonesty',honesty))}<label class="check"><input type="checkbox" data-setting="showInnerThoughts" ${s.showInnerThoughts?'checked':''}>속마음 함께 보기</label><p class="hint">켜면 각 응답 카드 아래에 접어 둔 <b>속마음</b>을 함께 만들어요. 필요한 항목만 펼쳐 볼 수 있어요.</p></div>`;
 if(s.mode==='write')return `<div class="inner-options">${field('쓰는 방식',select('writeHonesty',honesty))}</div>`;
 return '';
}
function inputHistoryMatchesCurrent(r){return C.matchesCharacter(r,s.characterIds,chatId);}


