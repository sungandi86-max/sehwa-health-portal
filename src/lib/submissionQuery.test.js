import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const records=new Map(),calls=[],allQueries=[];
const snap=(path)=>({id:path.split('/').at(-1),ref:{path},exists:()=>records.has(path),data:()=>records.get(path)});
const value=(data,key,id)=>key==='__name__'?id:key.split('.').reduce((v,k)=>v?.[k],data);
const sdk={
 collection:(_db,name)=>({name}),doc:(db,...parts)=>({path:db.name?[db.name,...parts].join('/'):parts.join('/')}),
 where:(field,op,val)=>({kind:'where',field,op,val}),orderBy:(field,direction='asc')=>({kind:'order',field,direction}),
 documentId:()=>'__name__',limit:(n)=>({kind:'limit',n}),startAfter:(cursor)=>({kind:'cursor',cursor}),
 query:(ref,...conditions)=>({...ref,conditions}),getDoc:async(ref)=>{calls.push({doc:ref.path});return snap(ref.path);},
 serverTimestamp:()=>({seconds:999}),
};
function execute(q){
 let docs=[...records.keys()].filter(p=>p.startsWith(q.name+'/')&&p.split('/').length===2).map(snap);
 const conditions=q.conditions||[],orders=conditions.filter(c=>c.kind==='order');
 for(const c of conditions.filter(c=>c.kind==='where'))docs=docs.filter(d=>c.op==='array-contains'?value(d.data(),c.field,d.id)?.includes(c.val):value(d.data(),c.field,d.id)===c.val);
 for(const c of orders)docs=docs.filter(d=>value(d.data(),c.field,d.id)!==undefined);
 docs.sort((a,b)=>{for(const c of orders){const x=value(a.data(),c.field,a.id),y=value(b.data(),c.field,b.id);const v=x===y?0:x<y?-1:1;if(v)return c.direction==='desc'?-v:v;}return 0;});
 const cursor=conditions.find(c=>c.kind==='cursor');if(cursor)docs=docs.slice(docs.findIndex(d=>d.id===cursor.cursor.id)+1);
 const bound=conditions.find(c=>c.kind==='limit');if(bound)docs=docs.slice(0,bound.n);
 return docs;
}
sdk.getDocs=async(q)=>{calls.push(q);allQueries.push(q);return {docs:execute(q)};};
sdk.getCountFromServer=async(q)=>({data:()=>({count:execute(q).length})});
sdk.runTransaction=async(_db,fn)=>{const writes=[];await fn({get:sdk.getDoc,update:(ref,data)=>writes.push([ref,data]),set:(ref,data)=>writes.push([ref,data])});for(const[ref,data]of writes)records.set(ref.path,{...records.get(ref.path),...data});};
sdk.updateDoc=async(ref,data)=>records.set(ref.path,{...records.get(ref.path),...data});
sdk.writeBatch=()=>{throw new Error('unexpected batch');};
globalThis.__querySdk=sdk;globalThis.__FIREBASE_RUNTIME_POLICY__={environment:'qa',qaProjectId:'isolated-health-qa'};
const sdkCode=Object.keys(sdk).map(k=>`export const ${k}=(...args)=>globalThis.__querySdk.${k}(...args);`).join('\n');
const hook=registerHooks({resolve(id,ctx,next){if(id==='firebase/firestore')return{url:'data:text/javascript,'+encodeURIComponent(sdkCode),shortCircuit:true};if(id==='./firebase.js')return{url:'data:text/javascript,'+encodeURIComponent('export const db={app:{options:{projectId:"isolated-health-qa"}}};'),shortCircuit:true};return next(id,ctx);}});
const {getStaffSubmissionPage,updateStaffSubmissionStatus}=await import('./adminSubmissions.js');
const {getSubmissionStatusOverview,compareSubmissionRecency}=await import('./submissionStatus.js');hook.deregister();
function clear(){records.clear();calls.length=0;}
function add(id,data){records.set('staff_submissions/'+id,data);}
test('status filter precedes 50-row limit, cursor visits old pending receipts without duplicates',async()=>{
 clear();for(let i=0;i<620;i++)add('r'+String(i).padStart(3,'0'),{status:i<120?'submitted':'completed',submittedAt:i,itemId:'cpr'});
 let cursor=null,ids=[];do{const page=await getStaffSubmissionPage({status:'submitted',cursor});assert.equal(page.total,120);assert.ok(page.items.length<=50);ids.push(...page.items.map(x=>x.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(ids.length,120);assert.equal(new Set(ids).size,120);assert.ok(calls.every(q=>q.conditions?.some(c=>c.field==='status'&&c.kind==='where')));
});
test('direct receipt fetch bypasses list cap and state filters without falling back to another receipt',async()=>{
 clear();add('old-receipt',{status:'completed',submittedAt:1,itemId:'tb',staffId:'S1',schoolYear:2026});
 assert.equal((await getStaffSubmissionPage({submissionId:'old-receipt',status:'submitted'})).items[0].id,'old-receipt');
 assert.equal((await getStaffSubmissionPage({submissionId:'absent'})).items.length,0);
 await assert.rejects(getStaffSubmissionPage({submissionId:'../other'}));assert.equal(calls.length,2);
});
test('paged target count differs from receipt count; staffId proxy and tied latest receipt remain stable beyond 300 rows',async()=>{
 clear();for(let i=0;i<32;i++){const uid='u'+String(i).padStart(2,'0');records.set(`user_assignments/${uid}_2026_2`,{uid,schoolYear:2026,semester:2,roles:['staff'],active:true,staffId:'S'+i});}
 for(let i=0;i<650;i++)add('irrelevant'+i,{itemId:'cpr',submitter:{uid:'unlinked'},submittedAt:i,status:'submitted'});
 add('a',{itemId:'cpr',staffId:'S0',submissionMode:'admin_proxy',submittedAt:700,status:'completed'});add('z',{itemId:'cpr',staffId:'S0',submittedAt:700,status:'reviewing'});
 const page=await getSubmissionStatusOverview('cpr',2026,2);assert.equal(page.totalTargets,32);assert.equal(page.receiptCount,652);assert.equal(page.roster.length,25);assert.equal(page.roster.find(x=>x.uid==='u00').submission.id,'z');
 const next=await getSubmissionStatusOverview('cpr',2026,2,{page:1,cursor:page.nextCursor});assert.equal(next.roster.length,7);assert.equal(next.hasNext,false);assert.equal(new Set([...page.roster,...next.roster].map(x=>x.uid)).size,32);
 assert.ok(calls.filter(q=>q.name==='staff_submissions').every(q=>q.conditions.some(c=>c.kind==='limit'&&c.n===1)));
});
test('individual review never replaces group event and rejection preserves another completed receipt',async()=>{
 clear();const path='staff_submission_status_qa/S1_cpr-training-2026';const group={staffId:'S1',taskId:'cpr-training-2026',status:'completed',training:{completionMethod:'group',eventId:'E1'}};
 records.set(path,group);add('individual',{itemId:'cpr',staffId:'S1',status:'submitted',submittedAt:1,trainingDate:'2026-01-01'});
 await updateStaffSubmissionStatus({id:'individual',itemId:'cpr',staffId:'S1',status:'submitted'},'completed');assert.equal(records.get(path).training.eventId,'E1');assert.equal(records.get('staff_submissions/individual').status,'completed');
 records.set(path,{...group,training:{completionMethod:'individual'},evidenceSubmissionId:'new'});add('new',{itemId:'cpr',staffId:'S1',status:'submitted',submittedAt:2});
 await updateStaffSubmissionStatus({id:'new',itemId:'cpr',staffId:'S1',status:'submitted'},'rejected');assert.equal(records.get(path).status,'completed');assert.equal(records.get(path).evidenceSubmissionId,'individual');
 await assert.rejects(updateStaffSubmissionStatus({id:'new',itemId:'cpr',staffId:'S1',status:'submitted'},'completed'));
});

test('latest receipt comparison preserves nanosecond ordering and Firestore document-ID tie order',()=>{
 assert.ok(compareSubmissionRecency({id:'A',submittedAt:{seconds:100,nanoseconds:2}},{id:'z',submittedAt:{seconds:100,nanoseconds:1}})<0);
 assert.ok(compareSubmissionRecency({id:'a',submittedAtMillis:100},{id:'Z',submittedAtMillis:100})<0);
});

test('five reviewed composite indexes cover the actual executed filtered ordered queries without duplicates',()=>{
 const definitions=JSON.parse(readFileSync(new URL('../../firestore.indexes.json',import.meta.url),'utf8')).indexes;
 assert.equal(definitions.length,5);assert.equal(new Set(definitions.map(index=>JSON.stringify(index))).size,5);
 const used=new Set();
 for(const q of allQueries.filter(q=>q.conditions?.some(c=>c.kind==='order')&&q.conditions?.some(c=>c.kind==='where'))){
  const equal=q.conditions.filter(c=>c.kind==='where'&&c.op==='==').map(c=>c.field).sort();
  const array=q.conditions.find(c=>c.kind==='where'&&c.op==='array-contains')?.field;
  const order=q.conditions.filter(c=>c.kind==='order').map(c=>[c.field,c.direction==='desc'?'DESCENDING':'ASCENDING']);
  const index=definitions.findIndex(d=>d.collectionGroup===q.name&&d.queryScope==='COLLECTION'&&
   JSON.stringify(d.fields.filter(f=>equal.includes(f.fieldPath)).map(f=>f.fieldPath).sort())===JSON.stringify(equal)&&
   d.fields.find(f=>f.arrayConfig==='CONTAINS')?.fieldPath===array&&
   JSON.stringify(d.fields.filter(f=>!equal.includes(f.fieldPath)&&!f.arrayConfig).map(f=>[f.fieldPath,f.order]))===JSON.stringify(order));
  assert.notEqual(index,-1,JSON.stringify(q));used.add(index);
 }
 assert.equal(used.size,5,'every definition is exercised by a current real helper query');
});
