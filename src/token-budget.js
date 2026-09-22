/** Final input fitting uses ST's asynchronous tokenizer. */
async function fitTokenBudget(messages,limit,counter){
 const rows=messages.map(m=>({...m}));let count=await counter.messages(rows),dropped=0;
 if(count<=limit)return {messages:rows,tokens:count,dropped};
 for(const m of rows){
  let data;try{data=JSON.parse(m.content);}catch{continue;}
  const dialogue=data?.reference?.dialogue;if(!Array.isArray(dialogue)||!dialogue.length)continue;
  const make=n=>JSON.stringify({...data,reference:{...data.reference,dialogue:dialogue.slice(n)}});
  let lo=1,hi=dialogue.length,best=dialogue.length;
  while(lo<=hi){const mid=Math.floor((lo+hi)/2);m.content=make(mid);const n=await counter.messages(rows);if(n<=limit){best=mid;hi=mid-1;}else lo=mid+1;}
  m.content=make(best);dropped+=best;count=await counter.messages(rows);if(count<=limit)break;
 }
 return {messages:rows,tokens:count,dropped};
}
