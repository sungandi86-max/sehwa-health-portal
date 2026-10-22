import test from 'node:test';
import assert from 'node:assert/strict';
import {manualCprFixture} from '../../tests/fixtures/manualCprDb.js';
import {runManualCprBatch,manualCprInput,MANUAL_CPR_MODE} from './cprManualBatch.js';
import {TrainingEventStore} from './trainingEventStore.js';
import {TrainingSignatureLedger} from './trainingSignatureLedger.js';
import {finalSheetModel,signatureKey,attendanceEligibility} from './trainingCenterPhase2.js';
import {buildCprAdminSummary} from '../../src/lib/cprTrainingStatusModel.js';
import {createTrainingPhase2Handler} from './trainingCenterPhase2Api.js';
const context={APP_ENV:'qa',QA_FIREBASE_PROJECT_ID:'isolated-health-qa'},now=new Date('2026-10-16T06:00:00Z');
const input={requestId:'fixture-request-2026',schoolYear:2026,title:'학교 단체 CPR 교육',date:'2026-05-20',startTime:'13:00',endTime:'15:00',basis:'기존 오프라인 참석 명부 대조 확인',staffIds:Array.from({length:80},(_,i)=>`S${String(i).padStart(3,'0')}`)};
function harness(){const f=manualCprFixture();const events=new TrainingEventStore({database:()=>f.db,context:()=>context});return {...f,async call(body=input,commit=false){return runManualCprBatch({...f,context,actor:'S000',input:body,commit,now,events:await events.listEvents()});},events};}
const statusPath=id=>`staff_submission_status_qa/${id}_cpr-training-2026`;
async function confirmed(f,body=input){const preview=await f.call(body);return {...body,reviewFingerprint:preview.reviewFingerprint,confirmedOfflineRoster:true};}
test('100 synthetic staff: exactly 80 offline originals and completion statuses; 20 absentees untouched',async()=>{
 const f=harness(),body=await confirmed(f);assert.equal(f.db.records.size,101,'preview does not write');
 const result=await f.call(body,true);assert.deepEqual(result.counts,{success:80,skipped:0,failed:0,registered:80});
 assert.equal([...f.db.records.keys()].filter(k=>k.startsWith('staff_submission_status_qa/')).length,80);
 assert.equal(f.db.records.has(statusPath('S099')),false);
 const entries=[...f.db.records].filter(([p])=>/\/signatures\/[^/]+$/.test(p));assert.equal(entries.length,80);
 for(const[,entry]of entries){assert.equal(entry.sourceType,MANUAL_CPR_MODE);assert.equal(entry.signedAt,'');assert.equal(entry.signatureFileId,null);assert.equal(entry.manualEvidence.actor,'S000');assert.equal(entry.manualEvidence.basis,input.basis);}
 const summary=buildCprAdminSummary([...f.db.records].filter(([p])=>p.startsWith('staff_submission_status_qa/')).map(([,v])=>v));assert.equal(summary.completed,80);assert.equal(summary.group,80);
 const retry=await f.call(body,true);assert.deepEqual(retry.counts,{success:0,skipped:80,failed:0,registered:80});assert.equal([...f.db.records.keys()].filter(p=>/\/signatures\/[^/]+$/.test(p)).length,80);
});
test('individual/group completed originals and ambiguous/inactive/unlinked subjects are skipped unchanged',async()=>{
 const f=harness();const a={staffId:'S001',status:'completed',training:{completionMethod:'individual',eventId:''}},b={staffId:'S002',status:'completed',training:{completionMethod:'group',eventId:'OLD'}};
 f.db.records.set(statusPath('S001'),a);f.db.records.set(statusPath('S002'),b);f.directory[3].employmentStatus='휴직';f.db.records.delete('user_assignments/U004_2026_2');f.db.records.get('user_assignments/U005_2026_2').active=false;
 f.db.records.set('user_assignments/OTHER_2026_2',{uid:'OTHER',staffId:'S006',schoolYear:2026,semester:2,active:true,roles:['staff']});
 const result=await f.call(await confirmed(f),true);assert.equal(result.counts.success,74);assert.equal(result.counts.skipped,6);assert.deepEqual(f.db.records.get(statusPath('S001')),a);assert.deepEqual(f.db.records.get(statusPath('S002')),b);
});
test('duplicate concurrent requests and different batch requests cannot create double completion',async()=>{
 const f=harness(),body=await confirmed(f);const results=await Promise.all([f.call(body,true),f.call(body,true)]);
 assert.equal(results.reduce((n,r)=>n+r.counts.success,0),80);assert.equal([...f.db.records.keys()].filter(p=>/\/signatures\/[^/]+$/.test(p)).length,80);
 const other={...input,requestId:'different-request'};const second=await f.call(await confirmed(f,other),true);assert.equal(second.counts.success,0);assert.equal(second.counts.skipped,80);
});
test('per-person failed transaction rolls back original and projection; same request retries only missing originals',async()=>{
 const f=harness(),body=await confirmed(f);f.db.failures.set('set:'+statusPath('S010'),1);
 const first=await f.call(body,true);assert.equal(first.counts.success,79);assert.equal(first.counts.failed,1);assert.equal(f.db.records.has(statusPath('S010')),false);
 const pair=`training_signature_ledger_qa/${signatureKey(first.eventId,'S010')}`;assert.equal(f.db.records.has(pair),false);
 const second=await f.call(body,true);assert.equal(second.counts.success,1);assert.equal(second.counts.registered,80);assert.equal([...f.db.records.keys()].filter(p=>/\/signatures\/[^/]+$/.test(p)).length,80);
});
test('year/date/duplicate subject/attestation and stale preview are rejected without registration',async()=>{
 for(const patch of [{schoolYear:2027},{schoolYear:'2026'},{date:'2026-02-30'},{date:'2027-01-01'},{staffIds:['S001','S001']},{basis:''}])assert.throws(()=>manualCprInput({...input,...patch},'S000',now));
 const f=harness(),body=await confirmed(f);await assert.rejects(f.call({...body,confirmedOfflineRoster:false},true));
 f.db.records.get('user_assignments/U003_2026_2').active=false;await assert.rejects(f.call(body,true),{code:'MANUAL_CPR_PREVIEW_CHANGED'});assert.equal([...f.db.records.keys()].some(p=>p.startsWith('training_events_')),false);
});
test('lost response, changed request, revoked assignment and cancelled attendance never overwrite originals',async()=>{
 const f=harness(),body=await confirmed(f);const result=await f.call(body,true);
 await assert.rejects(f.call({...body,title:'another training'},true),{code:'MANUAL_CPR_REQUEST_CONFLICT'});
 const pair=`training_signature_ledger_qa/${signatureKey(result.eventId,'S001')}`;f.db.records.set(pair,{...f.db.records.get(pair),activeSignatureId:null});f.db.records.set(statusPath('S001'),{status:'incomplete'});
 const again=await f.call(body,true);assert.equal(again.results.find(r=>r.staffId==='S001').reason,'attendance_changed');assert.equal(f.db.records.get(statusPath('S001')).status,'incomplete');
});
test('unknown/mismatched DB and unready ledger fail before registration',async()=>{
 const f=harness();f.db.app.options.projectId='sehwa-health-portal-v2';await assert.rejects(runManualCprBatch({...f,context,actor:'S000',input,now,events:[]}));assert.equal(f.db.calls.length,0);
 const g=harness();g.db.records.delete('training_signature_ledger_qa/__migration');await assert.rejects(g.call(),{code:'MANUAL_CPR_LEDGER_NOT_READY'});
});
test('manual attendance is labeled separately from signatures and QR eligibility remains denied',async()=>{
 const f=harness(),result=await f.call(await confirmed(f),true),event=(await f.events.listEvents())[0];
 const ledger=new TrainingSignatureLedger({database:()=>f.db,context:()=>context});const signatures=await ledger.listSignatures(result.eventId);
 const source={trainings:[event],signatures,targets:event.targetSnapshot.members.map(m=>({eventId:event.eventId,'교직원ID':m.staffId,'대상상태':m.targetStatus,'제외여부':'N'}))};
 const model=finalSheetModel(source,f.directory,event.eventId);assert.equal(model.counts.signed,0);assert.equal(model.counts.manual,80);assert.ok(model.rows.every(r=>r.status==='관리자 등록'&&r.signedAt===''&&r.fileId===''));
 assert.equal(attendanceEligibility(source,[{...event,signatureOpenAt:'2026-10-16T00:00:00Z',signatureCloseAt:'2026-10-17T00:00:00Z'}],'S000',now)[0].eligible,false);
});
test('real handler denies ordinary staff and delegated training administrator before batch access',async()=>{
 Object.assign(process.env,{APP_ENV:'qa',QA_FIREBASE_PROJECT_ID:'isolated-health-qa',QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID:'QA_WORKBOOK_TEST_ONLY'});
 const f=harness();const handler=createTrainingPhase2Handler({auth:()=>({verifyIdToken:async token=>({uid:token})}),db:()=>f.db,directory:async()=>({directory:f.directory,stats:{duplicateStaffIds:0}}),store:{events:f.events},now:()=>now});
 const call=async(token,resource='training-manual-cpr-preview',body=input)=>{const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};await handler({method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},query:{resource},body},res);return res;};
 assert.equal((await call('U001')).code,403);assert.equal((await call('')).code,401);
 f.db.records.get('user_assignments/U001_2026_2').roles=['training_admin'];assert.equal((await call('U001')).code,403);
 f.db.records.get('user_assignments/U001_2026_2').roles=['staff'];
 const preview=await call('U000');assert.equal(preview.code,200);assert.equal(preview.body.rows.length,80);
 const result=await call('U000','training-manual-cpr-commit',{...input,reviewFingerprint:preview.body.reviewFingerprint,confirmedOfflineRoster:true});assert.equal(result.code,200);assert.equal(result.body.counts.success,80);
});

test('malformed UID/year/semester and QA-only assignments are never accepted as canonical attendance',async()=>{
 for(const patch of [{uid:'OTHER'},{schoolYear:'2026'},{semester:'2'},{schoolYear:2025},{semester:1},{qaOnly:true},{roles:['training_admin']}]){
  const f=harness();Object.assign(f.db.records.get('user_assignments/U001_2026_2'),patch);
  const preview=await f.call({...input,staffIds:['S001']});assert.equal(preview.rows[0].reason,'unlinked_or_inactive');
 }
 const f=harness();await assert.rejects(runManualCprBatch({...f,context:{},actor:'S000',input,now,events:[]}));assert.equal(f.db.calls.length,0);
});
test('revocation or administrator completion after preview but during commit is preserved',async()=>{
 for(const revoke of [true,false]){
  const f=harness(),body=await confirmed(f);const original=f.db.runTransaction;let count=0;
  f.db.runTransaction=async fn=>{if(++count===2){if(revoke)f.db.records.get('user_assignments/U000_2026_2').active=false;
   else f.db.records.set(statusPath('S000'),{staffId:'S000',status:'completed',training:{completionMethod:'individual'},note:'newer admin decision'});}
   return original(fn);};
  const result=await f.call(body,true);assert.equal(result.counts.success,79);assert.equal(result.results[0].outcome,'skipped');
  if(revoke)assert.equal(f.db.records.has(statusPath('S000')),false);
  else assert.equal(f.db.records.get(statusPath('S000')).note,'newer admin decision');
 }
});
test('production policy uses existing production ledgers and leaves QA ledgers untouched (mock only)',async()=>{
 const f=manualCprFixture();f.db.app.options.projectId='sehwa-health-portal-v2';
 f.db.records.set('training_signature_ledger_production/__migration',{environment:'production',status:'ready',schemaVersion:1,sourceCount:0,sourceSignatures:[]});
 const args={...f,context:{APP_ENV:'production'},actor:'S000',input:{...input,staffIds:['S001']},now,events:[]};
 const preview=await runManualCprBatch(args);const result=await runManualCprBatch({...args,commit:true,input:{...args.input,reviewFingerprint:preview.reviewFingerprint,confirmedOfflineRoster:true}});
 assert.equal(result.counts.success,1);assert.ok(f.db.records.has('staff_submission_status/S001_cpr-training-2026'));
 assert.equal([...f.db.records.keys()].some(p=>p.startsWith('staff_submission_status_qa/')),false);
 assert.ok(f.db.records.has('training_events_production/'+result.eventId));
});
