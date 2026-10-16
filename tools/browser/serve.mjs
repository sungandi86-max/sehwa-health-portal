import {manualCprMiddleware} from "./manualCprServer.mjs";
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=path.join(root,'tools/browser/fixtureFirebase.js');
const server=await createServer({root,configFile:false,optimizeDeps:{entries:['tools/browser/entry.jsx']},plugins:[{name:'offline-browser-fixtures',enforce:'pre',
 resolveId(id,importer){if(['firebase/auth','firebase/firestore','firebase/messaging'].includes(id)||(id.endsWith('/firebase.js')&&id.startsWith('.')))return fixture;},
 configureServer(server){server.middlewares.use(manualCprMiddleware);server.middlewares.use(async(req,res,next)=>{if(req.url.startsWith('/tests/fixtures/')||!req.headers.accept?.includes('text/html'))return next();
 const html=await server.transformIndexHtml(req.url,'<html><meta charset="UTF-8"><div id="root"></div><script type="module" src="/tools/browser/entry.jsx"></script></html>');res.setHeader('Content-Type','text/html');res.end(html);});}},react()],server:{host:'127.0.0.1',port:Number(process.env.BROWSER_FIXTURE_PORT || 4179),strictPort:true},define:{__FIREBASE_RUNTIME_POLICY__:JSON.stringify({environment:process.env.BROWSER_FIXTURE_ENV === 'production' ? 'production' : 'qa',qaProjectId:'isolated-health-qa'})}});
await server.listen();console.log('OFFLINE_BROWSER_READY loopback fixture');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
