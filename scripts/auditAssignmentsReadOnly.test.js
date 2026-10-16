import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT, validateTarget, runAudit, auditAssignments } from './auditAssignmentsReadOnly.mjs';

test('audit target requires exact project and explicit confirmation before connecting', async () => {
  const valid = ['--project', PROJECT, '--confirm-read-only', `${PROJECT}:2026:2`];
  assert.equal(validateTarget(valid, {}), PROJECT);
  for (const [args, env] of [[[], {}], [valid, {FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}],
    [valid, {GCLOUD_PROJECT:'another-project'}], [[...valid, '--write'], {}],
    [['--project','unapproved-project','--confirm-read-only','unapproved-project:2026:2'], {}]]) {
    let calls = 0; const lines = [];
    assert.equal(await runAudit({args, env, connect:()=>{calls++;}, output:x=>lines.push(x)}), 1);
    assert.equal(calls, 0); assert.deepEqual(lines.map(JSON.parse), [{scanCompleted:0,scanFailed:1}]);
  }
});

test('active issue buckets are disjoint, preserve old totals and never serialize role/source identifiers', async () => {
  const base = uid => ({uid,schoolYear:2026,semester:2,active:true,roles:['staff'],staffId:'PRIVATE_STAFF_SENTINEL'});
  const fixtures = [
    ['a',{qaOnly:true}],
    ['b',{qaOnly:true,roles:['qa_PRIVATE_ROLE_SENTINEL']}],
    ['c',{staffId:null}],
    ['d',{roles:'PRIVATE_ROLE_SENTINEL'}],
    ['inactive',{active:false,qaOnly:true,staffId:null}],
    ['pending',{active:false,assignmentSource:'google_signup_pending',roles:[],staffId:null}],
    ['valid',{}],
    ['mixed',{roles:['staff','PRIVATE_ROLE_SENTINEL']}]
  ];
  const data = {users:['c','d','inactive','pending','valid','mixed'].map(id=>({id,data:()=>({})})),
    user_assignments:fixtures.map(([uid,patch])=>({id:`${uid}_2026_2`,data:()=>({...base(uid),...patch})}))};
  const db = {collection:name=>({select:()=>({orderBy:()=>({limit:()=>({get:async()=>({docs:data[name],size:data[name].length})})})})})};
  const c = await auditAssignments(db);
  assert.equal(c.incompatible,6); assert.equal(c.activeIncompatible,5); assert.equal(c.pendingRegistration,1);
  const groups = Object.entries(c).filter(([key])=>key.startsWith('activeIssues__'));
  assert.equal(groups.length,5); assert.equal(groups.reduce((n,[,v])=>n+v,0),c.activeIncompatible);
  for (const key of [
    'activeIssues__qaOnlyInProduction__supportedRolePresent__profileAbsent',
    'activeIssues__rolesError__qaOnlyInProduction__noSupportedRole__profileAbsent',
    'activeIssues__staffIdError__supportedRolePresent__profilePresent',
    'activeIssues__rolesError__rolesMalformed__profilePresent',
    'activeIssues__rolesError__supportedRolePresent__profilePresent']) assert.equal(c[key],1);
  assert.equal(c.rolesError,3); assert.equal(c.staffIdError,2); assert.equal(c.qaOnlyInProduction,3);
  assert.ok(Object.values(c).every(Number.isInteger));
  assert.doesNotMatch(JSON.stringify(c),/SENTINEL|google_signup_pending|qa_PRIVATE/);
});
test('audit errors and injected project mismatch emit fixed counts, never partial data or SDK errors', async () => {
  const args = ['--project', PROJECT, '--confirm-read-only', `${PROJECT}:2026:2`];
  for (const connect of [async()=>{throw new Error('UID_SENTINEL email@example.invalid SECRET');},
    async()=>({projectId:'wrong',terminate:async()=>{throw new Error('SECRET');}}),
    async()=>({projectId:PROJECT,collection:()=>{throw new Error('PRIVATE_DOCUMENT');},terminate:async()=>{}})]) {
    const lines=[];
    assert.equal(await runAudit({args,env:{},connect,output:x=>lines.push(x)}),1);
    assert.deepEqual(lines,[JSON.stringify({scanCompleted:0,scanFailed:1})]);
  }
});
