/* AU and character-idea inputs with a built-in editable English prompt and single-pass macros. */
const SideFacet=(()=>{
 const DEFAULT_PROMPT="# PURPOSE\n\nReimagine established characters as people who genuinely belong to the requested alternate universe (AU). Explore how their identities could exist or develop through different lives, rather than translating their original biographies into another genre.\n\n# REQUEST\n\n## SUBJECTS\n{{AU대상}}\n\n## AU SETTING\n{{설정된AU}}\n\n## CHARACTER CONTINUITY\n{{변경정도}}\n\n## RELATIONSHIP\n{{관계설정}}\n\n## DETAIL\n{{상세도}}\n\n## ADDITIONAL REQUIREMENTS\n{{유의사항}}\n\n# CORE PRINCIPLES\n\n## WORLD AND GENRE\nEstablish a coherent world independently of the source characters, grounded in the requested genre, culture, era, and explicit premise. Respect recognizable genre conventions, social structures, and familiar tropes.\nDo not invent unusual institutions, spectacles, or central conflicts merely to reflect source personalities or make the setting more dramatic. The world should exist naturally even without these particular characters. Honor explicitly requested unconventional settings.\n\n## Character Identity\nDistinguish foundational temperament and psychological tendencies from experience-shaped personality and contingent biography. Character identity concerns distinctive ways of perceiving, feeling, thinking, valuing, and responding—not a mandatory collection of past events, occupations, habits, or memorable details.\nApply the selected continuity instructions to determine which psychological characteristics remain recognizable and which may develop differently. Do not treat every prominent acquired fear, coping habit, or recurring personal detail as foundational identity.\n\n## Relationships and AU Lives\nWhen a relationship is requested, establish a genre-appropriate relational premise according to the selected relationship instructions, then develop each person's life within that framework.\nCreate plausible origins, family circumstances, upbringing, social positions, experiences, interests, activities, and present situations native to the AU.\nDo not automatically transfer or replace source-world facts with genre equivalents, including minor hobbies, routines, personal secrets, coping behaviors, or specific incidents. Psychological continuity does not require biographical continuity.\nChoose social positions and relationship premises from the AU's ordinary opportunities, institutions, family circumstances, and genre conflicts. Apply psychological continuity primarily to how each person perceives, chooses, speaks, and responds within those circumstances. Temperament is not an assignment rule for occupation, rank, abilities, or relationship initiative; a hobby is not a mandatory power or life theme. Circumstances need not symbolize the character. Avoid forced novelty, artificial reversals, and unnecessary suffering; familiar circumstances are valid when naturally appropriate.\nLet each person have a coherent independent life, rather than existing solely to serve a relationship trope.\n\n## Character Sheets\nFor complete profiles, retain the original sheets' useful structure, field coverage, order, and approximate detail level, adapting terminology where necessary. Use source sheets as formatting references, not biographical templates; populate their fields with coherent AU-native information.\nRespect culturally appropriate names, consistent chronology, independent character agency, and explicit user requirements. Write naturally in the requested language and genre register, without unnecessary explanation.\nIf an adult profile includes intimate-preference fields, preserve their function in concise, non-graphic terms. Do not invent such fields in unrelated requests.";
 const PROMPT_REVISION=9;
 const DEFAULT_PHRASES={"preserve":"SOURCE-FOCUSED CONTINUITY\n\nPreserve the character's recognizable present-day psychology, including foundational temperament and significant developed personality traits. Maintain central values, motivations, vulnerabilities, fears, emotional defenses, contradictions, and characteristic interpersonal responses where they are essential to their identity.\n\nConstruct an independently plausible AU life in which this psychological continuity can naturally exist. Comparable traits do not require recreating the same childhood, trauma, occupation, private habits, secrets, or experiences. Preserve the person's psychology—not the source biography that shaped it.","rebuild":"ESSENCE-ONLY CONTINUITY\n\nSelect at most THREE atomic foundational traits per person from temperament, underlying motivation, judgment, or characteristic response. Each item must express one trait, not a bundle. These selected traits are the ONLY source psychology carried into the AU. Let substantially different upbringing, relationships, and circumstances reshape developed personality and outward expression.\n\nCarry over ZERO source biographical facts by default: occupation, studies, hobbies, family circumstances, formative incidents, acquired coping habits, or private routines. Genre-renamed equivalents count as carryovers too. Do not turn a source skill into a new power or a personality trait into a compulsory profession. Use source headings only as sheet structure.\n\nExplicitly requested retained facts, including names or appearance when requested, and the selected original-relationship constraints are exceptions, kept separately from the three traits. Do not infer extra exceptions from prominence in the source. Other source details are not design seeds. Develop a plausible alternative life without forced inversion or novelty.","relationOn":"RELATIONSHIP INCLUDED\n\nWhen both the character and user persona are selected, establish their relationship within the AU according to the separately selected relationship option. Use the genre's familiar social roles and connection archetypes where appropriate, before constructing their detailed individual biographies.\n\nDo not automatically give either person higher status, greater initiative, passivity, or dependence based on their source personality. Each person's life must retain independent agency. Do not assume romance, hostility, or instant closeness without support from the requested relationship.","relationOff":"NO REQUESTED RELATIONSHIP\n\nDo not create or emphasize a new relationship between the character and user persona. Develop only the selected subjects and the social connections independently required by their AU lives.\n\nIf a source sheet contains relationship fields, retain their structural function where appropriate without fabricating shared history, intimacy, or dependence. Mention the counterpart only when explicitly required.","originalOn":"PRESERVE THE ORIGINAL RELATIONSHIP\n\nPreserve the established kind of relationship, including verified family ties (such as siblings or twins), familiarity, emotional bond, trust, conflict, boundaries, and defining interpersonal dynamics.\n\nReconstruct the surrounding social circumstances, meeting history, and practical arrangements in ways native to the AU. Preserving this relationship does not require copying its original incidents, occupations, living arrangements, or repeated interactions.","originalOff":"RECONSTRUCT THE RELATIONSHIP\n\nInvent a genre-native relationship or starting connection independent of the original interpersonal history. Consider familiar genre relationship roles without automatically repeating the original social hierarchy, initiative, emotional positions, shared events, or dependence.\n\nThe new connection may begin with cooperation, tension, distance, closeness, or unfamiliarity as appropriate to the AU. Do not reproduce the previous relationship by habit, assume romance, or force unusual novelty."};
 const DETAIL_HINTS={
 brief:'Be concise and concrete while preserving essential facts and required profile fields.',
 normal:'Give a complete result with natural detail and without padding or repetition.',
 detailed:'Offer useful specifics and nuance without forced decoration, invented lore, or changes to unrelated profile fields.'
 };
 const defaults={au:'',target:'character',degree:'preserve',relation:'none',relationship:false,originalRelationship:true,cautions:'',promptRevision:PROMPT_REVISION,prompt:DEFAULT_PROMPT,phrases:DEFAULT_PHRASES};
 // Upgrade known built-in v6/v7/v8 prompts while preserving individually edited fields.
 const PRIOR_DEFAULT_HASHES={6:3694554005,7:3357262026,8:1167324470};
 const PRIOR_PHRASE_HASHES={6:{"preserve":1276142293,"rebuild":1910236246,"relationOn":3740146082,"relationOff":2580058885,"originalOn":342339104,"originalOff":145196316},7:{"preserve":2138964834,"rebuild":4252734073,"relationOn":338849515,"relationOff":2721397651,"originalOn":999419594,"originalOff":1670044385},8:{"preserve":2138964834,"rebuild":4252734073,"relationOn":338849515,"relationOff":2721397651,"originalOn":999419594,"originalOff":1670044385}};
 function promptHash(value){let h=2166136261>>>0;const str=String(value||'');for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
 function clean(v={}){
  if(!v||typeof v!=='object')v={};
  const out={...defaults,phrases:{...defaults.phrases}};
  for(const k of ['au','cautions'])out[k]=String(v[k]??'').slice(0,12000);
  const savedPrompt=typeof v.prompt==='string'?v.prompt:'';
  const currentRevision=v.promptRevision===PROMPT_REVISION;
  const fromPrevious=Object.hasOwn(PRIOR_DEFAULT_HASHES,v.promptRevision);
  const userEditedPrompt=fromPrevious&&savedPrompt.trim()&&promptHash(savedPrompt)!==PRIOR_DEFAULT_HASHES[v.promptRevision];
  out.prompt=(currentRevision||userEditedPrompt)&&savedPrompt.trim()?savedPrompt.slice(0,32000):DEFAULT_PROMPT;
  out.target=['character','user','both'].includes(v.target)?v.target:'character';
  out.degree=v.degree==='rebuild'?'rebuild':'preserve';
  out.relation=['none','original','new'].includes(v.relation)?v.relation:v.relationship===true?(v.originalRelationship===false?'new':'original'):'none';
  out.relationship=out.relation!=='none';out.originalRelationship=out.relation!=='new';
  for(const k of Object.keys(out.phrases)){
   const saved=v.phrases?.[k];
   const userEditedPhrase=fromPrevious&&typeof saved==='string'&&promptHash(saved)!==PRIOR_PHRASE_HASHES[v.promptRevision][k];
   out.phrases[k]=currentRevision||userEditedPhrase?String(saved??DEFAULT_PHRASES[k]).slice(0,4000):DEFAULT_PHRASES[k];
  }
  return out;
 }
 function targetText(f,char,user){
  if(f.target==='user')return 'USER PERSONA ONLY: '+(user||'none')+'. Transform only the user persona source sheet. The character ('+(char||'none')+') is reference material, not a second target.';
  if(f.target==='both')return 'BOTH: character ('+(char||'none')+') and user persona ('+(user||'none')+'). Rewrite each in its own original source-sheet structure and keep them separate.';
  return 'CHARACTER ONLY: '+(char||'none')+'. Transform only the character source sheet. The user persona ('+(user||'none')+') is reference material, not a second target.';
 }
 function expand(v,{char='',user='',detail='normal'}={}){
  const f=clean(v),p=f.phrases,rel=f.relation,linked=!!char&&!!user;
  const relation=!linked||rel==='none'?p.relationOff:[p.relationOn,p[rel==='original'?'originalOn':'originalOff']].join('\n');
  const values={'설정된AU':f.au,'AU대상':targetText(f,char,user),'변경정도':p[f.degree],
   '관계설정':relation,'유저관계설정':!linked||rel==='none'?p.relationOff:p.relationOn,
   '원본관계반영':!linked||rel==='none'?'':p[rel==='original'?'originalOn':'originalOff'],
   '상세도':DETAIL_HINTS[detail]||DETAIL_HINTS.normal,'유의사항':f.cautions,char,user};
  return f.prompt.replace(/\{\{\s*(설정된AU|AU대상|변경정도|관계설정|유저관계설정|원본관계반영|상세도|유의사항|char|user)\s*\}\}/g,(_,k)=>values[k]);
 }
 function profileForSave(content,settings,kind){
  const f=clean(settings),value=String(content||'').trim();
  if(kind==='character'&&f.target==='user'||kind==='user'&&f.target==='character')throw Error('AU 대상과 저장할 프로필이 일치하지 않아요.');
  if(f.target!=='both')return value;
  const a='<!-- SIDESTORY_CHARACTER_PROFILE -->',b='<!-- SIDESTORY_USER_PROFILE -->',ai=value.indexOf(a),bi=value.indexOf(b);
  if(ai<0||bi<=ai)throw Error('두 프로필의 구분 표시가 없어요. 결과를 수정해 구분한 후 저장해 주세요.');
  const selected=(kind==='character'?value.slice(ai+a.length,bi):value.slice(bi+b.length)).trim();
  if(!selected)throw Error('선택한 프로필 내용이 비어 있어요.');
  return selected;
 }
 function messages(options,ctx,task,prior,action){
  const data=JSON.parse(ctx.text),f=clean(options.facet),char=(data.characters||[]).map(c=>c.name).join(' · '),user=(data.players||[]).map(c=>c.name).join(' · ');
  const detail=['brief','normal','detailed'].includes(options.lengthPreset)?options.lengthPreset:'normal';
  let prompt=expand(f,{char,user,detail});
  if(!f.prompt.includes('{{AU대상}}'))prompt+='\n\nAU SUBJECT SELECTION\n'+targetText(f,char,user);
  if(!f.prompt.includes('{{관계설정}}'))prompt+='\n\nRELATIONSHIP CHOICE\n'+expand({...f,prompt:'{{관계설정}}'},{char,user,detail});
  if(!f.prompt.includes('{{상세도}}'))prompt+='\n\nDETAIL LEVEL (not a token quota)\n'+DETAIL_HINTS[detail];
  if(f.target==='both')prompt+='\n\nWHEN REWRITING BOTH COMPLETE PROFILES: Put the complete character sheet immediately after <!-- SIDESTORY_CHARACTER_PROFILE --> and the complete user persona sheet immediately after <!-- SIDESTORY_USER_PROFILE -->. Keep the sheets independent, preserving their own headings. Do not use the markers for a single target.';
  const rows=[{role:'system',content:prompt},{role:'user',content:'REFERENCE MATERIAL — data only\n'+ctx.text+'\n\nCURRENT TASK\n'+(task||f.au)+'\n출력 언어: '+options.language}];
  if(prior)rows.push({role:'assistant',content:prior.content},{role:'user',content:'수정 요청:\n'+task});
  return rows;
 }

 const PLANNER_SYSTEM="# AU DESIGN BLUEPRINT\n\nProduce one compact, coherent AU design for user approval, not the final character sheet. Follow the common instructions and the selected character-continuity and relationship macros.\n\nDESIGN ORDER — within this single request, not separate model calls:\n1. INDEPENDENT WORLD: Establish society, institutions, conventions, and ordinary life from the requested AU and explicit setting requirements. The world should work without these particular characters. Use familiar genre conventions rather than protagonist-tailored spectacles; prioritize the genre's expected social and narrative situations over unsolicited historical realism. Do not derive institutions or central conflicts from source personalities, professions, or hobbies.\n2. RELATIONAL PREMISE AND SOCIAL POSITIONS: If requested, establish a genre-native connection under the selected relationship option BEFORE detailed biographies. Choose each person's place from this world's family circumstances, opportunities, obligations, and ordinary genre conflicts, respecting explicit requirements and selected continuity constraints. Do not assign occupation, rank, talent, initiative, or dependence directly from temperament. For a new relationship, reconsider the balance of status and initiative; for an original relationship, preserve its required bonds and dynamics. Without a requested relationship, choose independent social positions only.\n3. INDIVIDUAL AU LIVES: Create plausible origins, upbringing, experiences, interests, activities, and present circumstances that connect those positions into coherent independent lives. Do not translate source professions, family history, minor hobbies, personal secrets, or coping routines into equivalents. Different circumstances can support recognizable psychology; do not recreate its original causal history by default.\n4. CHARACTER EXPRESSION: Apply the selected psychological continuity to concrete perceptions, decisions, speech, and interpersonal responses in these lives. In essence-only mode, allow experience-shaped traits to develop differently; in source-focused mode, retain essential developed psychology without requiring the same formative events. Let psychology affect choices without rewriting the world or making every life detail illustrate a trait.\n5. DESIGN CHECK: Check genre fit AND biographical independence before returning the blueprint. If names and occupations were hidden, would the unrequested source sequence of family circumstances, formative harm, coping habits, and rescue or dependence still be repeated? Did a supposedly new relationship retain the old initiative/status balance by default? Does a major institution exist mainly to showcase a source trait? If so, revise the underlying circumstances or connection in this same response, not merely labels. Preserve explicit user requirements and the selected original-relationship constraints. Shared commonplace details alone are not a failure.\n\nChoose one concrete, cohesive design, not alternatives. Honor explicit user instructions and verified relationship constraints. Familiar tropes and naturally similar details are valid; avoid contrived novelty, forced reversals, or unnecessary tragedy. Keep checks brief; return only the resulting design, never rejected drafts or a source-biography recap.\n\nOUTPUT ONLY A COMPLETE JSON OBJECT:\n{\"world\":\"brief independent, genre-faithful setting\",\"subjects\":[{\"kind\":\"character or user\",\"name\":\"original identity\",\"au_name\":\"complete natural AU name\",\"name_reason\":\"brief naming reason\",\"core_identity\":[\"psychology retained under selected continuity mode\"],\"au_life\":[\"specific coherent AU biography, experience, interests and activities\"],\"sheet_layout\":[\"original headings and field keys in order\"],\"relationships\":[\"AU interpersonal dynamics under selected relationship option\"]}],\"relationship\":\"inter-subject relationship or none\",\"genre_checks\":[\"brief concrete checks of genre fit, independent life circumstances, and the selected relationship constraints; cite AU facts, not generic claims or copied source details\"]}\n\nKeep world under 450 Korean characters. Each person's core_identity: approximately 4–7 concise items; au_life: approximately 5–8 concrete items, each under 130 Korean characters. Keep remaining arrays short. sheet_layout MUST be a string array. Include only selected subjects. No markdown, preamble, explanations, rejected alternatives, or full profiles.";
 const WRITER_SYSTEM="# WRITE FROM APPROVED AU DESIGN\n\nWrite the requested final character material from the APPROVED AU DESIGN as the sole authoritative biography and world reference. Original source sheets, lore, and dialogue are intentionally absent from this writing stage.\n\nPreserve the approved psychological continuity, names, world, relationship framework, individual histories, and relevant social circumstances. Do not infer original occupations, hobbies, incidents, traumas, secrets, or coping routines from source names or familiar personality traits.\n\nFor complete profiles, follow the approved sheet_layout's field coverage and order, with natural AU-appropriate headings and the source's approximate specificity. Fill unspecified minor details with plausible AU-native information consistent with the approved design; do not restore the old biography by default.\n\nKeep subjects' independent agency and their shared facts consistent. Explicit revision requests may override approved details. Use the requested language and genre register. Return only the final artifact, without process commentary or unrelated alternatives.";
 const REBUILD_BUDGET="# ESSENCE-ONLY SOURCE BUDGET — applies to this selected rebuild mode\nThis budget overrides the generic 4–7 core_identity guidance: return 1–3 atomic core_identity items per subject, one trait per item. Select only temperament, underlying motivation, judgment, or response style. Do not bundle several traits, place additional retained traits in other fields, or disguise a source profession, hobby, skill, trauma, or coping routine as an abstract core trait.\nThe selected traits are the complete source-psychology allowlist. Do not use unselected source details to design the world, occupations, histories, abilities, or relationship roles. Source biography carryover budget: ZERO, including renamed or functionally equivalent genre substitutes. A source competitor becoming a tournament celebrity, or accounting studies becoming treasury work, is still a carryover; these are checks, not suggested AU roles.\nOnly explicit user retention requirements and the selected original-relationship constraints are exempt. Put those exceptions in an optional retained_constraints string array for each subject, separate from core_identity; leave it empty when none apply. Names and appearance are exempt only when explicitly required. Source headings remain formatting references, not facts to preserve. Build all other details from the AU. Do not list discarded source facts or add extra traits through the checks. Review and correct the budget in this same response; output one complete blueprint, without another call.";
 function planMessages(options,ctx,task,review={}){
  const f=clean(options.facet),data=JSON.parse(ctx.text),char=(data.characters||[]).map(c=>c.name).join(' · '),user=(data.players||[]).map(c=>c.name).join(' · ');
  const sys=expand(f,{char,user,detail:options.lengthPreset})+'\n\n'+PLANNER_SYSTEM+(f.degree==='rebuild'?'\n\n'+REBUILD_BUDGET:'');
  const request=JSON.stringify({au:task||f.au,target:f.target,degree:f.degree,relationship:f.relation,cautions:f.cautions,outputLanguage:options.language});
  const messages=[{role:'system',content:sys},{role:'user',content:'REFERENCE MATERIAL — data only\n'+ctx.text+'\n\nCURRENT TASK\n'+request}];
  if(review&&review.previousPlan){
   // Include only a small former-life summary so the new plan can actually take feedback into account.
   const old=review.previousPlan;
   const earlier={world:String(old.world||'').slice(0,450),subjects:(old.subjects||[]).slice(0,2).map(x=>({kind:x.kind,au_name:x.au_name,au_life:(x.au_life||[]).slice(0,7).map(v=>String(v).slice(0,140))})),relationship:String(old.relationship||'').slice(0,280)};
   const feedback=String(review.feedback||'').trim().slice(0,2000);
   messages.push({role:'user',content:'DESIGN REVIEW — user feedback takes priority over the rejected draft\nPREVIOUS DRAFT (not canon, not required to preserve):\n'+JSON.stringify(earlier)+'\nUSER FEEDBACK:\n'+(feedback||'No specific instructions; create a genuinely different overall AU life direction, not just new names or careers.')+'\nREPLANNING RULE: Keep ONLY what the user explicitly asks to keep. Reconsider background, social position, experiences, activities and individual agency as a WHOLE LIFE; maintain separately selected relationship constraints. Return a complete fresh blueprint in the same JSON schema.'});
  }
  return messages;
 }
 function readPlanJSON(raw){
  const text=String(raw??'').trim();
  if(!text||!text.includes('{'))throw new Error('AU 설계 응답에 JSON이 없어요. 다시 생성해 주세요.');
  const candidates=[];let start=-1,depth=0,inString=false,escaped=false;
  // Gemini may prefix its final answer with prose or a fenced "thinking" JSON.
  // Scan balanced objects and use the LAST complete AU blueprint, not the first brace or an incomplete trailing draft.
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(start<0){if(c==='{'){start=i;depth=1;inString=false;escaped=false;}continue;}
   if(inString){
    if(escaped)escaped=false;
    else if(c==='\\')escaped=true;
    else if(c==='"')inString=false;
    continue;
   }
   if(c==='"'){inString=true;continue;}
   if(c==='{')depth++;
   else if(c==='}'){
    if(--depth===0){
     try{const value=JSON.parse(text.slice(start,i+1));if(value&&typeof value==='object'&&Array.isArray(value.subjects))candidates.push(value);}catch{}
     start=-1;
    }
   }
  }
  // An unfinished FINAL candidate must not fall back to a complete earlier thought/draft.
  if(start>=0)throw new Error('AU 설계 JSON이 중간에 잘렸어요. 사고 과정까지 토큰 한도에 포함될 수 있어요.');
  if(candidates.length)return candidates.at(-1);
  throw new Error('AU 설계 JSON 형식이 올바르지 않아요. 다시 생성해 주세요.');
 }
 function parsePlan(raw,target='character',degree){
  const o=readPlanJSON(raw);
  const bounded=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
  const rows=(x,max=18,size=700)=>Array.isArray(x)?x.filter(v=>typeof v==='string').map(v=>bounded(v,size)).filter(Boolean).slice(0,max):[];
  // Some models return an ordered {"original heading":"AU heading"} object instead of the requested string array.
  const layout=x=>Array.isArray(x)?rows(x,40,450):x&&typeof x==='object'?Object.entries(x).slice(0,40).map(([key,value])=>bounded(key,180)+' → '+bounded(typeof value==='string'?value:Array.isArray(value)?value.join(', '):'',260)).filter(v=>v.trim()!=='→'): [];
  const expected=target==='both'?['character','user']:[target],subjects=[];
  for(const kind of expected){
   const item=Array.isArray(o?.subjects)?o.subjects.find(x=>x?.kind===kind):null;
   if(!item)throw new Error((kind==='user'?'페르소나':'캐릭터')+'의 AU 설계가 누락됐어요. 다시 생성해 주세요.');
   if(degree==='rebuild'&&rows(item.core_identity,100).length>3)throw new Error('새로운 인생 설계의 핵심이 3개를 초과했어요. 설계 다시 생성으로 재시도해 주세요.');
   const person={kind,name:bounded(item.name,150),au_name:bounded(item.au_name,160),name_reason:bounded(item.name_reason,350),core_identity:rows(item.core_identity,15),retained_constraints:rows(item.retained_constraints,15),au_life:rows(item.au_life,20,1100),sheet_layout:layout(item.sheet_layout),relationships:rows(item.relationships,15),avoid_copying:rows(item.avoid_copying,15)};
   if(!person.au_name||!person.core_identity.length||person.au_life.length<3||!person.sheet_layout.length)throw new Error('AU 설계에 인물의 핵심·새로운 삶·시트 구조가 부족해요. 다시 생성해 주세요.');
   subjects.push(person);
  }
  const plan={world:bounded(o?.world,3500),subjects,relationship:bounded(o?.relationship,1500),genre_checks:rows(o?.genre_checks,15,450)};
  if(!plan.world)throw new Error('AU 세계관 설계가 비어 있어요. 다시 생성해 주세요.');
  return plan;
 }
 function writeMessages(options,plan,task,prior,action='new'){
  const f=clean(options.facet),approved=parsePlan(JSON.stringify(plan),f.target);
  const char=approved.subjects.filter(x=>x.kind==='character').map(x=>x.au_name).join(' · '),user=approved.subjects.filter(x=>x.kind==='user').map(x=>x.au_name).join(' · ');
  let sys=expand(f,{char,user,detail:options.lengthPreset})+'\n\n'+WRITER_SYSTEM;
  if(f.target==='both')sys+='\n\nBOTH PROFILE OUTPUT: if writing complete sheets, put the character sheet after <!-- SIDESTORY_CHARACTER_PROFILE --> and the persona sheet after <!-- SIDESTORY_USER_PROFILE -->. Do not merge them.';
  const writingPlan={...approved,subjects:approved.subjects.map(({avoid_copying,...subject})=>subject)};
  const instruction='APPROVED AU DESIGN — the ONLY biography/world reference\n'+JSON.stringify(writingPlan,null,2)+'\n\nTASK\nAU: '+f.au+'\nAdditional requirements: '+f.cautions+'\nOutput language: '+options.language+'\n'+(action==='revise'?'Revise the prior artifact according to the follow-up request; that request may override planned details.':'Produce the requested artifact from the AU design.');
  const rows=[{role:'system',content:sys},{role:'user',content:instruction}];
  if(prior&&action==='revise')rows.push({role:'assistant',content:String(prior.content||'')},{role:'user',content:'수정 요청:\n'+task});
  return rows;
 }

 return {defaults,DETAIL_HINTS,clean,expand,messages,profileForSave,planMessages,readPlanJSON,parsePlan,writeMessages};
})();

function facetPlanPreview(record){
 const plan=record?.facetPlan;if(!plan)return '<div class="landing"><p>AU 설계 내용을 읽을 수 없어요.</p></div>';
 const escapeText=x=>E(String(x??''));
 const items=(values,limit=0)=>Array.isArray(values)&&values.length?'<ul class="facet-plan-list">'+(limit?values.slice(0,limit):values).map(x=>'<li>'+escapeText(x)+'</li>').join('')+'</ul>':'<p class="hint">별도 설정 없음</p>';
 const person=plan.subjects?.map(row=>'<section class="facet-plan-subject"><h3>'+(row.kind==='user'?'페르소나':'캐릭터')+' · '+escapeText(row.au_name||row.name)+'</h3><p class="hint">'+escapeText(row.name)+(row.name_reason?' · '+escapeText(row.name_reason):'')+'</p><h4>선택한 인물의 핵심 · '+(row.core_identity?.length||0)+'개</h4>'+items(row.core_identity)+(row.retained_constraints?.length?'<h4>명시적으로 유지할 조건</h4>'+items(row.retained_constraints):'')+'<h4>AU에서 살아온 삶</h4>'+items(row.au_life)+'<h4>관계 설계</h4>'+items(row.relationships)+'<details><summary>시트 항목 · 복제하지 않을 요소</summary><h4>시트 구성</h4>'+items(row.sheet_layout)+'<h4>원본에서 그대로 가져오지 않을 요소</h4>'+items(row.avoid_copying)+'</details></section>').join('')||'';
 return '<div class="facet-plan-preview"><div class="facet-plan-scroll"><header><p class="facet-plan-eyebrow">1 / 2 · AU DESIGN</p><h2>AU 설계안 확인</h2><p class="hint">이 단계에서는 최종 프로필을 아직 작성하지 않았어요. 마음에 들면 승인하고, 아니면 새 설계를 받아보세요.</p></header><section class="facet-plan-world"><h3>세계관 · 시대</h3><p>'+escapeText(plan.world)+'</p></section>'+person+'<section class="facet-plan-subject"><h3>전체 관계</h3><p>'+escapeText(plan.relationship||'별도 관계 지정 없음')+'</p><details><summary>세계관 적합성 검토 항목</summary>'+items(plan.genre_checks)+'</details></section></div><div class="facet-plan-actions"><button id="facet-plan-regenerate" class="facet-plan-secondary">'+smallIcon('refresh')+' 설계 다시 생성</button><button id="facet-plan-approve" class="primary">'+smallIcon('next')+' 이 설계로 본문 생성</button></div></div>';
}
function facetInputs(){const f=s.facet;const choices=(key,items,value)=>`<div class="facet-choices">${items.map(([v,label])=>`<button data-facet-choice="${key}" data-value="${v}" aria-pressed="${String(value)===v}">${label}</button>`).join('')}</div>`;return `<div class="facet-inputs">${field('변경할 AU 정하기',`<textarea data-facet="au" rows="3" maxlength="12000" placeholder="예: 센티넬 AU, 로판 AU, 헌터 AU">${E(f.au)}</textarea>`)}${field('AU 적용 대상',choices('target',[['character','캐릭터'],['user','유저'],['both','둘 다']],f.target))}${field('변경 정도',choices('degree',[['preserve','원본 기반 재구성'],['rebuild','새로운 인생으로 재구성']],f.degree))}${(s.characterIds||[]).length&&(s.personaIds||[]).length?field('상대와의 관계',choices('relation',[['none','설정 안 함'],['original','원본 유지'],['new','새로 설정']],f.relation)):'<p class="hint">캐릭터와 페르소나가 모두 있을 때 관계를 설정할 수 있어요.</p>'}${field('반드시 유의해야 할 점',`<textarea data-facet="cautions" rows="3" maxlength="12000">${E(f.cautions)}</textarea>`)}<details class="facet-prompt"><summary>프롬프트 · 매크로 설정</summary><p class="hint">{{AU대상}} · {{설정된AU}} · {{변경정도}} · {{관계설정}} · {{상세도}} · {{유의사항}} · {{char}} · {{user}}</p><textarea data-facet="prompt" rows="8" maxlength="32000" placeholder="기본 프롬프트가 제공됩니다. 필요하면 수정해 주세요.">${E(f.prompt)}</textarea><p class="hint">기존 {{유저관계설정}} / {{원본관계반영}} 매크로와 사용자 지침도 계속 지원해요.</p><details><summary>선택지별 치환 문구</summary>${[['preserve','원본 기반 재구성'],['rebuild','새로운 인생으로 재구성'],['relationOn','관계 설정'],['relationOff','설정 안 함'],['originalOn','원본 관계 유지'],['originalOff','새로 설정']].map(([k,n])=>field(n,`<textarea data-facet-phrase="${k}" rows="2" maxlength="4000">${E(f.phrases[k])}</textarea>`)).join('')}</details></details></div>`;}
async function saveFacetCharacter(){if(busy||!current||current.mode!=='facet')return;const record=current;let content;try{content=SideFacet.profileForSave(displayRecord().content,record.settings?.facet,'character');}catch(e){say(e.message,true);return;}const name=await askText('새 캐릭터로 저장','캐릭터 이름',(record.characterNames?.[0]||'캐릭터')+' AU','저장');if(!name?.trim())return;busy=true;try{const sourceAvatar=record.characterIds?.[0]||'';await stHost.createCharacterFromProfile({name:name.trim(),description:content,sourceAvatar});say('새 캐릭터로 저장했어요. 캐릭터 목록에서 확인할 수 있어요.');}finally{busy=false;if(alive)render();}}
async function saveFacetPersona(){if(busy||!current||current.mode!=='facet')return;const record=current;let content;try{content=SideFacet.profileForSave(displayRecord().content,record.settings?.facet,'user');}catch(e){say(e.message,true);return;}const sourceAvatar=String(record.settings?.personaIds?.[0]||'').replace(/^persona:/,'')||stHost.currentPersona();const sourceName=personas.find(p=>p.id===sourceAvatar)?.name||'페르소나';const name=await askText('새 페르소나로 저장','페르소나 이름',sourceName+' AU','저장');if(!name?.trim())return;busy=true;try{await stHost.createPersonaFromProfile({name:name.trim(),description:content,sourceAvatar});say('새 페르소나로 저장했어요. 페르소나 관리에서 확인할 수 있어요.');}finally{busy=false;if(alive)render();}}
