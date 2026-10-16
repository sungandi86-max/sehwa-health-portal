import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
const state={value:null};globalThis.__assignmentGuardFixture=state;
const mock=`export const db={},auth={},googleProvider={},microsoftProvider={},assertAuthLoginBoundary=()=>{};
export const doc=(_db,...p)=>p.join('/');export const getDoc=async()=>({exists:()=>!!globalThis.__assignmentGuardFixture.value,data:()=>globalThis.__assignmentGuardFixture.value});`;
const hook=registerHooks({resolve(specifier,context,next){if(specifier==='firebase/firestore'||specifier==='./firebase.js')return {url:'data:text/javascript,'+encodeURIComponent(mock),shortCircuit:true};return next(specifier,context);}});
const {getUserAssignmentResult}=await import('./userProfile.js');hook.deregister();
const valid={uid:'synthetic',staffId:'FIXTURE-A',schoolYear:2026,semester:2,roles:['staff'],active:true};
test('current approved staff and inactive assignment are distinguished without broadening role authority',async()=>{
 for(const active of [true,false]){state.value={...valid,active};const r=await getUserAssignmentResult('synthetic',2026,2);assert.equal(r.status,'found');assert.equal(r.assignment.active,active);}
});
test('foreign UID, stale/wrong-type term, missing canonical staffId and malformed role/approval never produce an authorized assignment',async()=>{
 for(const patch of [{uid:'foreign'},{uid:undefined},{schoolYear:'2026'},{schoolYear:2025},{semester:'2'},{semester:1},{staffId:''},{staffId:undefined},{roles:[]},{roles:['unknown']},{roles:'admin'},{active:'true'}]){
 state.value={...valid,...patch};const r=await getUserAssignmentResult('synthetic',2026,2);assert.equal(r.status,'error');assert.equal(r.assignment,null);
 }
});
test('missing and pending registration remain unapproved rather than becoming staff',async()=>{
 for(const value of [null,{...valid,assignmentSource:'google_signup_pending',roles:[]}]){state.value=value;assert.equal((await getUserAssignmentResult('synthetic',2026,2)).status,'not-found');}
});
