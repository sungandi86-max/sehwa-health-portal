import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import {generatedShared} from '../../tools/qa-gas/shared.mjs';
import {buildSubmissionProxyEnvelope} from '../../server/lib/submissionProxyEnvelope.js';
import {PRODUCTION_SHEETS,PRODUCTION_DRIVE_FOLDERS} from '../../server/lib/environmentResources.js';
import {PRODUCTION_FIREBASE_PROJECT_ID} from '../../common/firebaseEnvironment.js';
const source=readFileSync(new URL('../../apps-script-qa/Code.gs',import.meta.url),'utf8');
const shared=readFileSync(new URL('../../apps-script-qa/Shared.gs',import.meta.url),'utf8');
const secret='fixture-only-qa-submission-secret-32bytes';
const base={APP_ENV:'qa',QA_GAS_ROLE:'submission',QA_RESOURCES_VERIFIED:'true',QA_SPREADSHEET_ID:'fixture-qa-workbook',
 QA_SUBMISSION_PROXY_SECRET:secret,QA_STUDENT_CARE_PROXY_SECRET:secret,QA_CPR_DRIVE_FOLDER_ID:'fixture-qa-cpr-folder',
 QA_TB_CERTIFICATE_DRIVE_FOLDER_ID:'fixture-qa-tb-folder',QA_STUDENT_REPLY_DRIVE_FOLDER_ID:'fixture-qa-student-folder',
 QA_CALLBACK_HOST:'fixture-git-qa.example.vercel.app',QA_STUDENT_CARE_SYNC_ENDPOINT:'https://fixture-git-qa.example.vercel.app/api/firebase/student-care-sync',QA_FIREBASE_PROJECT_ID:'isolated-health-qa'};
const payload=(type='cpr')=>({type,runtimeEnvironment:'qa',recordMode:'firestore',qaEvidenceFolderId:base[type==='cpr'?'QA_CPR_DRIVE_FOLDER_ID':type==='tb'?'QA_TB_CERTIFICATE_DRIVE_FOLDER_ID':'QA_STUDENT_REPLY_DRIVE_FOLDER_ID'],
 fields:{name:'synthetic',completionDate:'2026-10-01',checkupDate:'2026-10-01',grade:'1',classNumber:'1',studentNumber:'1',studentName:'fixture'},
 fileName:'fixture.pdf',fileBase64:Buffer.from('%PDF-fixture').toString('base64'),fileMimeType:'application/pdf',
 qaRequestFingerprint:'a'.repeat(64),qaSubmissionId:'QA-STUDENT-TB-'+'a'.repeat(32)});
function fixture(patch={}){
 const props=new Map(Object.entries({...base,...patch})),calls=[],files=[],propertyReads=[];let failCreate=false,redirect=false,busy=false;
 const blob=(data,mime='application/octet-stream',name='fixture')=>({bytes:typeof data==='string'?[...Buffer.from(data)]:[...data],name,
  getBytes(){return this.bytes;},getContentType(){return mime;},setName(n){this.name=n;return this;}});
 const emptySheet={getDataRange:()=>({getDisplayValues:()=>[]}),getLastRow:()=>0};
 const services={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>{propertyReads.push(k);return props.get(k)||null;},getKeys:()=>[...props.keys()],setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},base64Decode:s=>[...Buffer.from(s,'base64')],
   base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),computeDigest:(_,v)=>[...createHash('sha256').update(v).digest()],
   computeHmacSha256Signature:(v,k)=>[...createHmac('sha256',k).update(v).digest()],newBlob:blob,
   formatDate:(_d,_tz,f)=>f==='yyyy-MM'?'2026-10':f==='yyyy-MM-dd'?'2026-10-01':'2026. 10. 01'},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:body=>({body,setMimeType(){return this;}})},
  LockService:{getScriptLock:()=>({tryLock:()=>!busy,releaseLock(){}})},
  SpreadsheetApp:{openById:id=>{calls.push(['sheet',id]);return {getSheetByName:()=>emptySheet};},getActiveSpreadsheet:()=>{throw Error('forbidden active workbook');}},
  DriveApp:{getFolderById:id=>{calls.push(['folder',id]);return {getId:()=>id,getFilesByName:name=>{const list=files.filter(f=>f.name===name);return {hasNext:()=>list.length>0,next:()=>list.shift()};},
   createFile:b=>{calls.push(['create',id]);const file={name:b.name,getId:()=>`fixture-file-${files.length}`,getUrl:()=>'',getMimeType:()=>b.getContentType(),getSize:()=>b.getBytes().length};files.push(file);if(failCreate)throw Error('SECRET-SENTINEL ack lost');return file;}};},
   getFileById:()=>{throw Error('forbidden file lookup');}},
  UrlFetchApp:{fetch:(url,options)=>{calls.push(['fetch',url,options]);return {getResponseCode:()=>redirect?302:200,getContentText:()=>'{"ok":true}'};}},
  ScriptApp:new Proxy({}, {get(){throw Error('forbidden trigger API');}})
 };
 const ctx=vm.createContext(services);vm.runInContext(shared+'\n'+source,ctx);
 return {ctx,props,calls,files,propertyReads,setFailCreate(v){failCreate=v;},setRedirect(v){redirect=v;},setBusy(v){busy=v;},
  post:(body,opts={})=>{const envelope=buildSubmissionProxyEnvelope(body,secret,{visitor:body.type==='student-file'?'v'.repeat(43):'',...opts});return JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(envelope)}}).body);},
  get:params=>JSON.parse(ctx.doGet({parameter:params}).body)};
}
test('generated shared functions match the offline source extraction; production constants are absent',()=>{
 assert.equal(shared,generatedShared);
 for(const id of [...Object.values(PRODUCTION_SHEETS),...PRODUCTION_DRIVE_FOLDERS,PRODUCTION_FIREBASE_PROJECT_ID]) assert.ok(!(source+shared).includes(id));
 assert.doesNotMatch(source+shared,/SpreadsheetApp\.getActiveSpreadsheet|DriveApp\.getFileById|ScriptApp\.|firestore\.googleapis|identitytoolkit/);
 assert.equal((shared.match(/qaFetch_\(endpoint,/g)||[]).length,3);
});
for(const [name,patch] of [['unknown',{APP_ENV:''}],['production',{APP_ENV:'production'}],['wrong role',{QA_GAS_ROLE:'portal'}],['unreviewed',{QA_RESOURCES_VERIFIED:''}],['workbook missing',{QA_SPREADSHEET_ID:''}],['production workbook',{QA_SPREADSHEET_ID:PRODUCTION_SHEETS.staff}],['folder missing',{QA_CPR_DRIVE_FOLDER_ID:''}],['production folder',{QA_CPR_DRIVE_FOLDER_ID:PRODUCTION_DRIVE_FOLDERS[0]}],['secret missing',{QA_SUBMISSION_PROXY_SECRET:''}]])
 test(`submission blocks ${name} before data APIs`,()=>{const f=fixture(patch);assert.equal(f.post(payload()).success,false);assert.equal(f.calls.length,0);});
test('dedicated QA CPR/TB select only configured folders, use existing signed envelope and reject exact replay without another upload',()=>{
 for(const type of ['cpr','tb']){const f=fixture();const first=f.post(payload(type));assert.equal(first.status,'success');assert.ok(first.fileId);
  assert.equal(f.calls.filter(c=>c[0]==='create').length,1);assert.equal(f.calls[0][1],payload(type).qaEvidenceFolderId);
  assert.equal(f.calls.filter(c=>c[0]==='sheet'||c[0]==='fetch').length,0);
  const requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const g=fixture();assert.equal(g.post(payload(type),{requestId}).status,'success');
  assert.equal(g.post(payload(type),{requestId}).status,'error');assert.equal(g.files.length,1);
  assert.ok(!g.propertyReads.includes('SUBMISSION_PROXY_SECRET'));
 }
});
test('invalid signature, stale envelope, production payload and foreign folder are blocked before all data calls',()=>{
 for(const variant of ['signature','stale','environment','folder','unsigned']){
  const f=fixture(),body=payload();if(variant==='environment')body.runtimeEnvironment='production';if(variant==='folder')body.qaEvidenceFolderId='foreign-folder';
  const envelope=buildSubmissionProxyEnvelope(body,secret,{now:variant==='stale'?1:Date.now()});
  if(variant==='signature')envelope.signature='forged';
  const output=JSON.parse(f.ctx.doPost({postData:{contents:JSON.stringify(variant==='unsigned'?body:envelope)}}).body);
  assert.equal(output.success,false);assert.equal(f.calls.length,0);assert.doesNotMatch(JSON.stringify(output),/SECRET|signature|fixture-qa-workbook/);
 }
});
test('ambiguous staff upload retains replay reservation and never automatically creates another file',()=>{
 const f=fixture(),requestId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';f.setFailCreate(true);
 assert.equal(f.post(payload(),{requestId}).success,false);f.setFailCreate(false);
 assert.equal(f.post(payload(),{requestId}).success,false);assert.equal(f.files.length,1);
});
test('retired student aliases reject raw and signed requests before configuration or side effects',()=>{
 for(const type of ['student-file','student_tb_reply','student_file','studentfile','tbreply',' STUDENT-FILE ']){
  for(const signed of [false,true]){
   const f=fixture({APP_ENV:''}),body=payload(type);
   const request=signed?buildSubmissionProxyEnvelope(body,secret):body;
   const result=JSON.parse(f.ctx.doPost({postData:{contents:JSON.stringify(request)}}).body);
   assert.equal(result.code,'STUDENT_TB_REPLY_RETIRED');assert.equal(result.success,false);
   assert.equal(f.propertyReads.length,0);assert.equal(f.calls.length,0);assert.equal(f.files.length,0);
  }
 }
});
test('portal read requires only reviewed QA workbook, never Drive/callback/secrets',()=>{
 const f=fixture({QA_GAS_ROLE:'portal',QA_CPR_DRIVE_FOLDER_ID:'',QA_STUDENT_CARE_SYNC_ENDPOINT:'',QA_SUBMISSION_PROXY_SECRET:'',QA_STUDENT_CARE_PROXY_SECRET:''});
 const result=f.get({mode:'portal'});assert.ok(result.updatedAt);assert.deepEqual(f.calls,[['sheet',base.QA_SPREADSHEET_ID]]);
 for(const patch of [{APP_ENV:''},{QA_SPREADSHEET_ID:''},{QA_SPREADSHEET_ID:PRODUCTION_SHEETS.staff}]){
  const g=fixture({QA_GAS_ROLE:'portal',...patch});assert.equal(g.get({mode:'portal'}).success,false);assert.equal(g.calls.length,0);
 }
});
test('student-care read is signed by QA shared-secret contract; wrong secret blocks data calls without requiring callback or Drive',()=>{
 const f=fixture({QA_GAS_ROLE:'studentCare',QA_STUDENT_CARE_SYNC_ENDPOINT:'',QA_CPR_DRIVE_FOLDER_ID:''});
 assert.equal(f.get({mode:'adminVisitStatsByRole',month:'2026-10',proxySecret:'wrong'}).success,false);assert.equal(f.calls.length,0);
 assert.equal(f.get({mode:'adminVisitStatsByRole',month:'2026-10',proxySecret:secret}).result,'success');assert.deepEqual(f.calls,[['sheet',base.QA_SPREADSHEET_ID]]);
});
for(const [name,patch] of [['missing endpoint',{QA_STUDENT_CARE_SYNC_ENDPOINT:''}],['production host',{QA_CALLBACK_HOST:'sehwa-health-portal.vercel.app',QA_STUDENT_CARE_SYNC_ENDPOINT:'https://sehwa-health-portal.vercel.app/api/firebase/student-care-sync'}],['foreign host',{QA_STUDENT_CARE_SYNC_ENDPOINT:'https://foreign.example.invalid/api/firebase/student-care-sync'}],['production project',{QA_FIREBASE_PROJECT_ID:PRODUCTION_FIREBASE_PROJECT_ID}],['missing project',{QA_FIREBASE_PROJECT_ID:''}]])
 test(`callback rejects ${name} before workbook or fetch, including direct sync helper entry`,()=>{
  const f=fixture({QA_GAS_ROLE:'studentCare',...patch});assert.equal(f.get({mode:'syncStudentCareMonthlyAggregate',schoolYear:'2026',month:'2026-10',proxySecret:secret}).success,false);assert.equal(f.calls.length,0);
  assert.throws(()=>f.ctx.syncStudentCareMonthlyAggregate_('2026','2026-10'));assert.equal(f.calls.length,0);
 });
test('QA callback uses exact reviewed Preview endpoint and disables redirects; arbitrary fetch and maintenance routes are denied',()=>{
 const f=fixture({QA_GAS_ROLE:'studentCare'});
 assert.equal(f.get({mode:'syncStudentCareMonthlyAggregate',schoolYear:'2026',month:'2026-10',proxySecret:secret}).result,'success');
 const fetch=f.calls.find(c=>c[0]==='fetch');assert.equal(fetch[1],base.QA_STUDENT_CARE_SYNC_ENDPOINT);assert.equal(fetch[2].followRedirects,false);
 assert.equal(fetch[2].headers['x-student-care-proxy-secret'],secret);
 const before=f.calls.length;assert.throws(()=>f.ctx.qaFetch_('https://foreign.example.invalid',{}));assert.equal(f.calls.length,before);
 assert.equal(f.get({mode:'setupStudentCareProjectionTriggers',proxySecret:secret}).success,false);assert.equal(f.calls.length,before);
});
test('QA auto-trigger/backup entrypoints and production role refuse all data and trigger APIs',()=>{
 for(const patch of [{},{APP_ENV:'production'},{APP_ENV:''}]){
  const f=fixture(patch);
  for(const name of ['onEdit','syncStudentCareProjectionOnEdit_','syncStudentCareRecentProjectionBatch_','rebuildStudentCareProjectionsNightly_','rebuildStudentCareProjectionsNightly','backupHealthRoomSpreadsheetNightly_','backupHealthRoomSpreadsheetNow','backupHealthRoomSpreadsheetDryRun','setupStudentCareProjectionTriggers','removeStudentCareProjectionTriggers']) assert.throws(()=>f.ctx[name]());
  assert.equal(f.calls.length,0);
 }
});
test('callback redirect is treated as failure; no follow-up request and safe error body',()=>{
 const f=fixture({QA_GAS_ROLE:'studentCare'});f.setRedirect(true);
 assert.equal(f.get({mode:'syncStudentCareMonthlyAggregate',schoolYear:'2026',month:'2026-10',proxySecret:secret}).success,false);
 assert.equal(f.calls.filter(c=>c[0]==='fetch').length,1);
});

for(const mode of ['syncStudentCarePresencePublic','syncStudentCarePresenceHomeroom']) test(`QA ${mode} preserves projection payload and only calls the reviewed endpoint`,()=>{
 const f=fixture({QA_GAS_ROLE:'studentCare'});
 const result=f.get({mode,schoolYear:'2026',month:'2026-10',date:'2026-10-01',proxySecret:secret});
 assert.equal(result.result,'success');assert.equal(f.calls.filter(c=>c[0]==='fetch').length,1);
 const sent=JSON.parse(f.calls.find(c=>c[0]==='fetch')[2].payload);
 assert.equal(sent.type,mode==='syncStudentCarePresencePublic'?'presencePublic':'presenceHomeroom');
});
test('missing student-care secret, non-QA roles, malformed callback and prototype actions do not call data APIs',()=>{
 for(const [patch,params] of [
  [{QA_STUDENT_CARE_PROXY_SECRET:''},{mode:'adminVisitStatsByRole',month:'2026-10',proxySecret:secret}],
  [{QA_GAS_ROLE:'portal'},{mode:'adminVisitStatsByRole',month:'2026-10',proxySecret:secret}],
  [{QA_STUDENT_CARE_SYNC_ENDPOINT:base.QA_STUDENT_CARE_SYNC_ENDPOINT+'?target=production'},{mode:'syncStudentCareMonthlyAggregate',schoolYear:'2026',month:'2026-10',proxySecret:secret}],
  [{},{mode:'constructor',proxySecret:secret}],
 ]) { const f=fixture({QA_GAS_ROLE:'studentCare',...patch}); assert.equal(f.get(params).success,false);assert.equal(f.calls.length,0); }
});
test('busy script lock does not upload or release a lock owned by another request',()=>{
 const f=fixture();f.setBusy(true);assert.equal(f.post(payload()).code,'QA_BUSY');assert.equal(f.calls.length,0);
});
