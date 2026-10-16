import { enabled as submissionAudit, snapshot, execute, transaction } from "./submissionFixture.js";
// Test-only SDK replacement; loaded solely by the loopback fixture server.
const q = new URLSearchParams(location.search);
let role = q.get('role') || sessionStorage.getItem('fixture-role') || 'staff';
sessionStorage.setItem('fixture-role',role);
let user = role === 'anonymous' ? null : {uid:'synthetic-'+role,email:'fixture@example.invalid',displayName:'Synthetic',providerData:[{providerId:'google.com'}],getIdToken:async()=> 'synthetic-'+role};
export const auth={currentUser:user},db={app:{options:{projectId:__FIREBASE_RUNTIME_POLICY__.environment === 'production' ? 'sehwa-health-portal-v2' : 'isolated-health-qa'}}};
export const googleProvider={providerId:'google.com'},microsoftProvider={providerId:'microsoft.com',getCustomParameters:()=>({})};
export const assertAuthLoginBoundary=()=>{};
const callbacks = new Set();
export function onAuthStateChanged(_auth,cb){callbacks.add(cb);queueMicrotask(()=>cb(auth.currentUser));return ()=>callbacks.delete(cb);}
window.fixtureSignOut=()=>{auth.currentUser=null;for(const cb of callbacks)cb(null);};
window.fixtureSwitchRole=(next)=>{role=next;sessionStorage.setItem('fixture-role',next);user=next==='anonymous'?null:{uid:'synthetic-'+next,email:'fixture@example.invalid',displayName:'Synthetic',providerData:[{providerId:'google.com'}],getIdToken:async()=> 'synthetic-'+next};auth.currentUser=user;for(const cb of callbacks)cb(user);};
export const signOut=async()=>window.fixtureSignOut();
export const browserLocalPersistence={};export const setPersistence=async()=>{};
export const getRedirectResult=async()=>null;
export const signInWithPopup=async()=>{throw Error('Live login forbidden');};export const signInWithRedirect=signInWithPopup;
export function doc(_db,...parts){return {path:(_db?.path ? [_db.path,...parts] : parts).join('/')};}
export const collection=doc;
export async function getDoc(ref){
 if(submissionAudit && snapshot(ref.path).exists())return snapshot(ref.path);
 if(q.get('hang')==='1' && ref.path.startsWith('user_assignments')) return new Promise(()=>{});
 if(q.get('delay')==='1')await new Promise(r=>setTimeout(r,800));
 let value=null;
 if(ref.path.startsWith('users/'))value={uid:user?.uid,displayName:'Synthetic',active:role!=='inactive'};
 if(ref.path.startsWith('user_assignments/') && !['missing','pending'].includes(role))value={uid:user.uid,schoolYear:2026,semester:2,staffId:'FIXTURE-A',active:role!=='inactive',roles:[{admin:'admin',health:'health_teacher',homeroom:'homeroom'}[role]||'staff'],grade:1,classNo:1};
 return {exists:()=>!!value,data:()=>value};
}
export async function getDocs(ref){if(submissionAudit)return {docs:execute(ref)};return {docs:[{id:'fixture-faq',data:()=>({question:'합성 FAQ 질문',answer:'합성 FAQ 답변',enabled:true,order:1})}]};}

export const where=(field,op,value)=>({kind:'where',field,op,value});
export const orderBy=(field,direction='asc')=>({kind:'order',field,direction});
export const limit=value=>({kind:'limit',value});
export const startAfter=value=>({kind:'cursor',value});
export const documentId=()=>'__name__';
export const query=(ref,...conditions)=>({...ref,conditions});
export const getCountFromServer=async ref=>({data:()=>({count:execute(ref).length})});
export const serverTimestamp=()=>({seconds:1900000000});
export const runTransaction=transaction;
export const setDoc=async()=>{throw Error('Unexpected fixture write');};
export const updateDoc=setDoc;
export const writeBatch=()=>{throw Error('Unexpected fixture batch');};
// Home notification imports stay offline too; messaging registration is unsupported.
export const app={options:db.app.options};
export const isSupported=async()=>false;
export const getMessaging=()=>({});
export const onMessage=()=>()=>{};
export const getToken=async()=>{throw Error('Live messaging forbidden in synthetic browser');};
