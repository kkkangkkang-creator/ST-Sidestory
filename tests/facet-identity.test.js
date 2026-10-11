import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const {I,F}=new Function(read('facet.js')+';return {I:SideIdentity,F:SideFacet};')();
const C=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return SideCore;')();
const identity=()=>({schema:I.SCHEMA,subjects:['character','user'].map(kind=>({kind,name:kind==='character'?'A':'B',gender:'female',age:'adult',relative_age:kind==='character'?'older':'younger',alignment:'善',hair:'silver',eyes:'blue',height:'tall',build:'slender',design:'quiet',temperament:['proud','sensitive','guarded','playful'],speech:'soft',interpersonal:['teasing affection'],sheet_layout:['Name','Skills','History'],occupation:'FORBIDDEN_OCCUPATION',au_life:['FORBIDDEN_PAST'],raw_card:'FORBIDDEN_CARD'})),relationship:'siblings',world:'FORBIDDEN_WORLD',counterpart:null});
const options=(relation='none',target='both')=>({facet:F.clean({...F.defaults,au:'Mafia AU',relation,relationInput:'estranged siblings',target}),language:'한국어',lengthPreset:'normal'});
test('extraction only receives references; AU construction receives only allowlisted reviewed fields',()=>{
 const o=options(),ctx={text:JSON.stringify({characters:[{name:'A',description:'FORBIDDEN_CARD'}],players:[{name:'B',description:'FORBIDDEN_OCCUPATION'}],dialogue:['FORBIDDEN_DIALOGUE'],world:['FORBIDDEN_WORLD']})};
 const first=F.planMessages(o,ctx,'Mafia AU');assert.equal(first.length,2);assert(first[1].content.includes('FORBIDDEN_CARD'));
 assert(!first[1].content.includes('Mafia AU'),'extraction must not design an AU');
 const clean=I.parse(identity(),'both','none');assert.equal(clean.subjects[0].temperament.length,4);assert.equal(clean.relationship,'');
 const second=F.writeMessages(o,clean,'Mafia AU');assert.equal(second.length,2);
 for(const row of second)assert(!row.content.includes('FORBIDDEN_'));
 assert(second[1].content.includes('Mafia AU'));assert(second[1].content.includes('silver'));
 assert(second[0].content.includes('SIDESTORY_CHARACTER_PROFILE'));
});
test('all four relationship modes survive settings and only original receives the extracted bond',()=>{
 for(const mode of ['none','original','custom','new']){
  const o=options(mode),rows=F.writeMessages(o,identity(),'AU');
  const data=JSON.parse(rows[1].content.split('reference\n')[1].split('\n\nAU REQUEST')[0]);
  assert.equal(data.relationship,mode==='original'?'siblings':'');
  const request=JSON.parse(rows[1].content.split('AU REQUEST\n')[1]);
  assert.equal(request.relationshipMode,mode);assert.equal(request.relationshipInput,mode==='custom'?'estranged siblings':'');
  assert.equal(C.recordSettings(o).facet.relation,mode);
 }
 assert.equal(F.clean({relationship:true,originalRelationship:false}).relation,'new');
});
test('missing values stay empty, arrays are sanitized, source fields cannot cross through counterpart',()=>{
 const input=identity();input.subjects[0].hair=undefined;input.subjects[0].temperament.push({raw:'FORBIDDEN_NESTED'});
 input.counterpart={name:'B',gender:'female',age:'adult',occupation:'FORBIDDEN_COUNTERPART'};
 const clean=I.parse(input,'character','none');assert.equal(clean.subjects.length,1);assert.equal(clean.subjects[0].hair,'');
 assert(!JSON.stringify(clean).includes('FORBIDDEN'));assert.equal(clean.counterpart.name,'B');
 assert.throws(()=>I.parse({...input,schema:'old'},'character'),/형식/);
 assert.throws(()=>I.parse({...input,subjects:[]},'character'),/누락/);
});
test('manual field edits survive review, writing, export and archive backup',()=>{
 const o=options('original'),plan=I.parse(identity(),'both','original');plan.subjects[1].temperament=['USER EDIT'];plan.subjects[1].hair='green';
 const record={id:'id',mode:'facet',title:'Extracted',content:I.markdown(plan),createdAt:1,status:'complete',settings:o,facetPlan:plan,facetPhase:'plan'};
 const restored=C.backup({kind:'st-sidestory-backup',version:2,records:[record]})[0];
 assert.equal(restored.facetPhase,'plan');assert.equal(restored.facetPlan.subjects[1].hair,'green');
 const rows=F.writeMessages(o,restored.facetPlan,'AU');assert(rows[1].content.includes('USER EDIT'));assert(I.markdown(restored.facetPlan).includes('USER EDIT'));
 assert.deepEqual(restored.facetPlan,plan);
});
test('re-extraction feedback does not reintroduce rejected AU biographies',()=>{
 const rows=F.planMessages(options(),{text:'{}'},'AU',{previousPlan:{world:'FORBIDDEN_OLD_WORLD',subjects:[{au_life:['FORBIDDEN_OLD_LIFE']}]},feedback:'correct eye color'});
 assert.equal(rows.length,3);assert(rows[2].content.includes('correct eye color'));assert(!JSON.stringify(rows).includes('FORBIDDEN'));
});
test('generation bypasses source collection after review and never uses ST context for facet',()=>{
 const code=read('generation.js');assert(code.includes('approvedFacetPlan:useApprovedFacetPlan'));
 assert(code.includes("bundle.cid==='st-current'&&options.mode!=='facet'"));
 assert(code.includes('SideIdentity.parse(SideFacet.readPlanJSON(planText),facet.target,facet.relation)'));
});
