// Loopback fixture only: real API/ledger/projection functions, synthetic Admin DB.
import {manualCprFixture} from '../../tests/fixtures/manualCprDb.js';
import {createTrainingPhase2Handler} from '../../server/lib/trainingCenterPhase2Api.js';
import {TrainingEventStore} from '../../server/lib/trainingEventStore.js';
import {TrainingSignatureLedger} from '../../server/lib/trainingSignatureLedger.js';
import {readTrainingSheets,TARGET_HEADERS} from '../../server/lib/trainingCenter.js';
import {SIGNATURE_HEADERS} from '../../server/lib/trainingCenterPhase2.js';
let fixture,events,ledger,handler;
function reset(){
 fixture=manualCprFixture();
 events=new TrainingEventStore({database:()=>fixture.db});
 ledger=new TrainingSignatureLedger({database:()=>fixture.db});
 const base=()=>readTrainingSheets({events,targets:async()=>[TARGET_HEADERS],workbook:()=> 'QA_WORKBOOK_TEST_ONLY'});
 const source=async(eventId='')=>({...await base(),signatures:[SIGNATURE_HEADERS,...(await ledger.listSignatures(eventId)).map(row=>SIGNATURE_HEADERS.map(header=>row[header]||''))]});
 const store={events,readBase:base,readSource:source,readSourceForEvents:async()=>source()};
 handler=createTrainingPhase2Handler({auth:()=>({verifyIdToken:async token=>({uid:token==='synthetic-admin'?'U000':'U001'})}),db:()=>fixture.db,directory:async()=>({directory:fixture.directory,stats:{duplicateStaffIds:0}}),store});
}
reset();
export async function manualCprMiddleware(req,res,next){
 if(req.headers['x-offline-cpr-test']!=='1')return next();
 const url=new URL(req.url,'http://127.0.0.1:4179');
 const send=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(url.pathname==='/__offline-cpr-control'){
  const action=url.searchParams.get('action');if(action==='reset')reset();
  if(action==='fail')fixture.db.failures.set('set:staff_submission_status_qa/S010_cpr-training-2026',1);
  if(action==='completed'){
   fixture.db.records.set('staff_submission_status_qa/S001_cpr-training-2026',{staffId:'S001',status:'completed',training:{completionMethod:'individual'}});
   fixture.db.records.set('staff_submission_status_qa/S002_cpr-training-2026',{staffId:'S002',status:'completed',training:{completionMethod:'group',eventId:'OLD-GROUP'}});
  }
  const statuses=[...fixture.db.records].filter(([key])=>key.startsWith('staff_submission_status_qa/')).map(([,value])=>value);
  return send({count:statuses.filter(row=>row.status==='completed').length,entries:[...fixture.db.records.keys()].filter(key=>/\/signatures\/[^/]+$/.test(key)).length,
   fakeSignatures:[...fixture.db.records].filter(([key,value])=>/\/signatures\/[^/]+$/.test(key)&&(value.signedAt||value.signatureFileId)).length});
 }
 if(url.pathname!=='/api/firebase/staff-directory')return next();
 const resource=url.searchParams.get('resource');
 if(!['training-admin-directory','training-admin-list','training-manual-cpr-preview','training-manual-cpr-commit'].includes(resource)){
  res.statusCode=503;return send({ok:false,message:'Offline fixture does not run this resource'});
 }
 req.query=Object.fromEntries(url.searchParams);
 if(req.method==='POST'){let text='';for await(const chunk of req)text+=chunk;req.body=JSON.parse(text);}
 const response={setHeader:(name,value)=>res.setHeader(name,value),status(code){res.statusCode=code;return this;},json:send,end:()=>res.end()};
 try{await handler(req,response);}catch{res.statusCode=500;send({ok:false,message:'Synthetic fixture failure'});}
}
