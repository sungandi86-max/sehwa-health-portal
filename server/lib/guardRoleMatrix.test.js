import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingHandler} from './trainingCenterApi.js';
import {createTrainingPhase2Handler} from './trainingCenterPhase2Api.js';
import {trainingCenterSheetFixture} from '../../tests/fixtures/trainingCenterFixture.js';
const prior={APP_ENV:process.env.APP_ENV,QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID:process.env.QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID};
process.env.APP_ENV='qa';process.env.QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID='fixture-source';
process.on('exit',()=>{for(const [k,v] of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
for(const role of ['anonymous','pending','staff','homeroom','admin','health','inactive','missing'])test(`actual training API permits only current approved synthetic ${role} authority`,async()=>{
 const assignment={uid:'fixture',staffId:'T001',schoolYear:2026,semester:2,active:role!=='inactive',roles:[{health:'health_teacher',admin:'admin',homeroom:'homeroom'}[role]||'staff']};
 if(role==='pending')assignment.roles=[];
 const options={auth:()=>({verifyIdToken:async()=>({uid:'fixture'})}),db:()=>({collection:()=>({doc:()=>({get:async()=>({exists:role!=='missing',data:()=>assignment})})})}),
 directory:async()=>({directory:[{staffId:'T001',name:'synthetic',employmentStatus:'재직'}],stats:{duplicateStaffIds:0}})};
 const handler=createTrainingHandler({...options,workbook:()=> 'fixture-source',sheets:async()=>trainingCenterSheetFixture});
 const admin=createTrainingPhase2Handler({...options,store:{}});
 const run=async(handler,resource)=>{const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'GET',headers:role==='anonymous'?{}:{authorization:'Bearer fixture'},query:{resource}},res);return res;};
 const result=await run(handler,'training-list');
 assert.equal(result.code,role==='anonymous'?401:['pending','inactive','missing'].includes(role)?403:200);
 const management=await run(admin,'training-admin-directory');
 assert.equal(management.code,role==='anonymous'?401:['admin','health'].includes(role)?200:403);
});
