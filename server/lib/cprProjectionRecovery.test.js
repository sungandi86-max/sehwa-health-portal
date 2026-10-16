import test from 'node:test';
import assert from 'node:assert/strict';
import {staffReceiptDb} from '../../tests/fixtures/staffReceiptDb.js';
import {isCprTrainingEvent,saveCprTrainingStatus,buildCprGroupTrainingStatus,buildCprExternalSubmissionStatus,reconcileCprTrainingStatus} from './cprTrainingStatus.js';
const context={APP_ENV:'qa',QA_FIREBASE_PROJECT_ID:'isolated-health-qa'};
const path='staff_submission_status_qa/S1_cpr-training-2026';
function fixture() {
 const db=staffReceiptDb(); const base=db.collection;
 db.collection=(name)=>({...base(name), where:(key,op,value)=>({get:async()=>({
  docs:[...db.records].filter(([p,v])=>p.startsWith(name+'/')&&v[key]===value).map(([p,v])=>({id:p.split('/').at(-1),ref:base(name).doc(p.split('/').at(-1)),data:()=>v}))
 })})});
 return db;
}
const event={eventId:'E1',completionTaskId:'cpr-training-2026',title:'제목 변경',date:'2026-10-01'};
test('explicit CPR binding overrides title, legacy title remains compatible',()=>{
 assert.equal(isCprTrainingEvent(event),true);assert.equal(isCprTrainingEvent({title:'CPR',completionTaskId:'none'}),false);
 assert.equal(isCprTrainingEvent({title:'CPR'}),true);assert.equal(isCprTrainingEvent({title:'other'}),false);
});
test('concurrent group and individual projections keep the group event and preserve originals',async()=>{
 const db=fixture();db.records.set('staff_submissions/original',{itemId:'cpr',staffId:'S1',status:'completed'});
 await Promise.all([saveCprTrainingStatus({db,context,payload:buildCprGroupTrainingStatus({staffId:'S1',event})}),saveCprTrainingStatus({db,context,payload:buildCprExternalSubmissionStatus({staffId:'S1',submissionStatus:'completed'})})]);
 assert.equal(db.records.get(path).training.eventId,'E1');assert.equal(db.records.get('staff_submissions/original').status,'completed');
});
test('failed projection can be replayed without touching signature or upload originals',async()=>{
 const db=fixture();db.failures.set('set:'+path,1);const payload=buildCprGroupTrainingStatus({staffId:'S1',event});
 await assert.rejects(saveCprTrainingStatus({db,context,payload}));assert.equal(db.records.has(path),false);
 await saveCprTrainingStatus({db,context,payload});assert.equal(db.records.get(path).status,'completed');
 assert.ok(db.calls.every(([op,p])=>p===path));
});
test('cancelled group rebuild uses an older valid individual completion, not a newer rejected one',async()=>{
 const db=fixture();db.records.set(path,buildCprGroupTrainingStatus({staffId:'S1',event}));
 db.records.set('staff_submissions/accepted',{staffId:'S1',itemId:'cpr',status:'completed',trainingDate:'2026-01-01'});
 db.records.set('staff_submissions/rejected',{staffId:'S1',itemId:'cpr',status:'rejected',updatedAt:{toMillis:()=>999}});
 const originals=[...db.records].filter(([p])=>p.startsWith('staff_submissions/'));
 await reconcileCprTrainingStatus({db,context,staffId:'S1',source:{trainings:[event],signatures:[]},expectedProjection:db.records.get(path)});
 assert.equal(db.records.get(path).evidenceSubmissionId,'accepted');assert.equal(db.records.get(path).status,'completed');
 assert.deepEqual([...db.records].filter(([p])=>p.startsWith('staff_submissions/')),originals);
});
test('stale rebuild and foreign DB fail before writing derived state',async()=>{
 const db=fixture();db.records.set(path,buildCprGroupTrainingStatus({staffId:'S1',event}));
 await assert.rejects(saveCprTrainingStatus({db,context,payload:buildCprExternalSubmissionStatus({staffId:'S1'}),replaceGroup:true,expectedProjection:{}}));
 assert.equal(db.records.get(path).training.eventId,'E1');
 const foreign=staffReceiptDb('sehwa-health-portal-v2');await assert.rejects(saveCprTrainingStatus({db:foreign,context,payload:buildCprGroupTrainingStatus({staffId:'S1',event})}));assert.equal(foreign.calls.length,0);
});

test('cancelled or concurrently changed attendance cannot resurrect a group projection',async()=>{
 const {TrainingSignatureLedger}=await import('./trainingSignatureLedger.js');
 const {signatureKey}=await import('./trainingCenterPhase2.js');
 const {saveCompletedCprGroupTraining}=await import('./cprTrainingStatus.js');
 const db=fixture();const ledger=new TrainingSignatureLedger({database:()=>db,context:()=>context});
 const key=signatureKey('E1','S1'),record={eventId:'E1',signatureId:'SIGN-1','교직원ID':'S1','상태':'완료','취소여부':'N'};
 db.records.set('training_signature_ledger_qa/'+key,{eventId:'E1',staffId:'S1',environment:'qa',activeSignatureId:null});
 await assert.rejects(saveCompletedCprGroupTraining({db,context,staffId:'S1',events:[event],verifySource:(tx)=>ledger.assertRecordsActive(tx,'S1',[record])}));
 assert.equal(db.records.has(path),false);
 db.records.set('training_signature_ledger_qa/'+key,{eventId:'E1',staffId:'S1',environment:'qa',activeSignatureId:'NEWER-SIGNATURE'});
 await assert.rejects(reconcileCprTrainingStatus({db,context,staffId:'S1',source:{trainings:[event],signatures:[record]},verifySource:(tx)=>ledger.assertStaffSourceCurrent(tx,'S1',[record])}));
 assert.equal(db.records.has(path),false);
});
