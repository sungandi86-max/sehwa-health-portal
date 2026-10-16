import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT, validateTarget, runAudit } from './auditAssignmentsReadOnly.mjs';

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
