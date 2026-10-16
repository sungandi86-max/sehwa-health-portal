// Test-only SDK replacement; loaded solely by the loopback fixture server.
const q = new URLSearchParams(location.search);
const role = q.get('role') || sessionStorage.getItem('fixture-role') || 'staff';
sessionStorage.setItem('fixture-role',role);
const user = role === 'anonymous' ? null : {uid:'synthetic-'+role,email:'fixture@example.invalid',displayName:'Synthetic',providerData:[{providerId:'google.com'}],getIdToken:async()=> 'synthetic-'+role};
export const auth={currentUser:user},db={app:{options:{projectId:'isolated-health-qa'}}};
export const googleProvider={providerId:'google.com'},microsoftProvider={providerId:'microsoft.com',getCustomParameters:()=>({})};
export const assertAuthLoginBoundary=()=>{};
const callbacks = new Set();
export function onAuthStateChanged(_auth,cb){callbacks.add(cb);queueMicrotask(()=>cb(auth.currentUser));return ()=>callbacks.delete(cb);}
window.fixtureSignOut=()=>{auth.currentUser=null;for(const cb of callbacks)cb(null);};
export const signOut=async()=>window.fixtureSignOut();
export const browserLocalPersistence={};export const setPersistence=async()=>{};
export const getRedirectResult=async()=>null;
export const signInWithPopup=async()=>{throw Error('Live login forbidden');};export const signInWithRedirect=signInWithPopup;
export function doc(_db,...parts){return {path:parts.join('/')};}
export const collection=doc;
export async function getDoc(ref){
 if(q.get('hang')==='1' && ref.path.startsWith('user_assignments')) return new Promise(()=>{});
 if(q.get('delay')==='1')await new Promise(r=>setTimeout(r,800));
 let value=null;
 if(ref.path.startsWith('users/'))value={uid:user?.uid,displayName:'Synthetic',active:role!=='inactive'};
 if(ref.path.startsWith('user_assignments/') && !['missing','pending'].includes(role))value={uid:user.uid,schoolYear:2026,semester:2,staffId:'FIXTURE-A',active:role!=='inactive',roles:[{admin:'admin',health:'health_teacher',homeroom:'homeroom'}[role]||'staff'],grade:1,classNo:1};
 return {exists:()=>!!value,data:()=>value};
}
export async function getDocs(){return {docs:[{id:'fixture-faq',data:()=>({question:'합성 FAQ 질문',answer:'합성 FAQ 답변',enabled:true,order:1})}]};}
