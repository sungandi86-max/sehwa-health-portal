// Offline-only query SDK for the real admin pages. Never imported by production.
export const enabled = new URLSearchParams(location.search).get('audit') === '1' || sessionStorage.getItem('submission-audit') === '1';
if (enabled) sessionStorage.setItem('submission-audit', '1');
const missingIndex = new URLSearchParams(location.search).get('indexMissing') === '1';
const records = new Map(JSON.parse(sessionStorage.getItem('submission-audit-records') || '[]'));
const persist = () => sessionStorage.setItem('submission-audit-records', JSON.stringify([...records]));
const add = (path, data) => records.set(path, data);
if (enabled && !records.size) {
 for (let i=0;i<32;i++) {
  const uid=`u${String(i).padStart(2,'0')}`;
  add(`users/${uid}`, {uid,displayName:`교직원 ${uid}`,email:`${uid}@example.invalid`});
  add(`user_assignments/${uid}_2026_2`, {uid,schoolYear:2026,semester:2,staffId:`S${i}`,active:true,roles:['staff']});
 }
 for(let i=0;i<620;i++)add(`staff_submissions/r${String(i).padStart(3,'0')}`, {
  itemId:'cpr',staffId:'UNLINKED',submitter:{uid:'unlinked',displayName:`접수 r${String(i).padStart(3,'0')}`},
  submittedAt:{seconds:1700000000+i},status:i<120?'submitted':'completed',trainingDate:'2026-01-01',institution:'합성기관'});
 add('staff_submissions/tb-exact', {itemId:'tb',staffId:'S0',schoolYear:2026,documentType:'공단 확인서',checkupDate:'2026-10-01',
  submitter:{uid:'u00',displayName:'정확한 TB 접수'},submittedAt:{seconds:1800000000},status:'submitted'});
 add('staff_submissions/cpr-individual', {itemId:'cpr',staffId:'S0',submitter:{uid:'u00',displayName:'개별 CPR 접수'},
  submittedAt:{seconds:1800000001},status:'submitted',trainingDate:'2026-10-01',institution:'합성기관'});
 add('staff_submission_status_qa/S0_cpr-training-2026', {staffId:'S0',taskId:'cpr-training-2026',status:'completed',
  training:{completionMethod:'group',eventId:'GROUP-CPR',completionDate:'2026-09-01',evidenceStatus:'completed',note:'단체교육 완료'}});
 add('submission_items/cpr',{submissionType:'cpr',title:'심폐소생술',enabled:true});add('submission_items/tb',{submissionType:'tb',title:'건강검진',enabled:true});
 add('staff_submission_tasks/cpr-training-2026',{taskId:'cpr-training-2026',title:'심폐소생술',enabled:true});persist();
}
export const snapshot = (path) => ({id:path.split('/').at(-1),ref:{path},exists:()=>records.has(path),data:()=>records.get(path)});
const field = (s,key) => {
 const value=key==='__name__'?s.id:key.split('.').reduce((v,k)=>v?.[k],s.data());
 return value?.seconds !== undefined ? value.seconds*1e9+(value.nanoseconds||0) : value;
};
export function execute(q) {
 const cs=q.conditions||[];
 if(missingIndex && cs.some(c=>c.kind==='where') && cs.some(c=>c.kind==='order'))throw Object.assign(Error('The query requires an index'),{code:'failed-precondition'});
 let docs=[...records.keys()].filter(p=>p.startsWith(q.path+'/')&&p.split('/').length===2).map(snapshot);
 for(const c of cs.filter(c=>c.kind==='where'))docs=docs.filter(s=>c.op==='array-contains'?field(s,c.field)?.includes(c.value):field(s,c.field)===c.value);
 const orders=cs.filter(c=>c.kind==='order');
 for(const c of orders)docs=docs.filter(s=>field(s,c.field)!==undefined);
 docs.sort((a,b)=>{for(const c of orders){const x=field(a,c.field),y=field(b,c.field);if(x!==y)return(x<y?-1:1)*(c.direction==='desc'?-1:1);}return 0;});
 const cursor=cs.find(c=>c.kind==='cursor');if(cursor)docs=docs.slice(docs.findIndex(s=>s.id===cursor.value.id)+1);
 const bound=cs.find(c=>c.kind==='limit');return bound?docs.slice(0,bound.value):docs;
}
export async function transaction(_db, fn) {
 const writes=[];await fn({get:async ref=>snapshot(ref.path),update:(ref,data)=>writes.push([ref,data]),set:(ref,data)=>writes.push([ref,data])});
 for(const[ref,data]of writes)add(ref.path,{...records.get(ref.path),...data});persist();
}
window.submissionAudit={record:path=>records.get(path),set:(path,data)=>{add(path,data);persist();},records:()=>[...records]};
