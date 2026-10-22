// Offline Admin SDK subset: query reads, atomic rollback, serialized concurrency.
export function manualCprDb() {
 const records=new Map(),calls=[],failures=new Map();let queue=Promise.resolve();
 const fail=(op,path)=>{const key=`${op}:${path}`,n=failures.get(key)||0;if(n){failures.set(key,n-1);throw Error('synthetic failure');}};
 const snapshot=(path)=>({id:path.split('/').at(-1),ref:ref(path),exists:records.has(path),data:()=>records.get(path)});
 function query(path,conditions=[],bound=Infinity){return {path,where:(key,op,value)=>query(path,[...conditions,{key,op,value}],bound),limit:n=>query(path,conditions,n),doc:id=>ref(`${path}/${id}`),
  get:async()=>{calls.push(['query',path]);fail('query',path);return {docs:[...records].filter(([key,data])=>key.startsWith(path+'/')&&key.split('/').length===path.split('/').length+1&&conditions.every(c=>(c.op==='=='&&data[c.key]===c.value || c.op==='in'&&c.value.includes(data[c.key])))).slice(0,bound).map(([key])=>snapshot(key))};}};}
 function ref(path){return {path,id:path.split('/').at(-1),collection:name=>query(`${path}/${name}`),get:async()=>{calls.push(['get',path]);fail('get',path);return snapshot(path);}};}
 const db={app:{options:{projectId:'isolated-health-qa'}},records,calls,failures,collection:name=>query(name),runTransaction:async fn=>{
  const prior=queue;let release;queue=new Promise(done=>{release=done;});await prior;
  const writes=[];try{const result=await fn({get:r=>r.get(),create:(r,data)=>writes.push(['create',r,data]),set:(r,data,options)=>writes.push(['set',r,data,options]),update:(r,data)=>writes.push(['update',r,data,{merge:true}])});
   const old=new Map(records);try{for(const[op,r,data,options]of writes){calls.push([op,r.path]);fail(op,r.path);if(op==='create'&&records.has(r.path))throw Error('exists');if(op==='update'&&!records.has(r.path))throw Error('missing');records.set(r.path,options?.merge?{...records.get(r.path),...data}:data);}}catch(error){records.clear();for(const[k,v]of old)records.set(k,v);throw error;}return result;
  }finally{release();}
 }};return db;
}
export function manualCprFixture(){
 const db=manualCprDb(),directory=[];
 db.records.set('training_signature_ledger_qa/__migration',{environment:'qa',status:'ready',sourceCount:1,sourceSignatures:['fixture-marker']});
 for(let i=0;i<100;i++){const staffId=`S${String(i).padStart(3,'0')}`,uid=`U${String(i).padStart(3,'0')}`;
  directory.push({staffId,name:`합성 교직원 ${String(i).padStart(3,'0')}`,department:i<50?'교무부':'행정실',position:'교직원',employmentStatus:'재직'});
  db.records.set(`user_assignments/${uid}_2026_2`,{uid,staffId,schoolYear:2026,semester:2,active:true,roles:i===0?['health_teacher']:['staff']});}
 return {db,directory};
}
