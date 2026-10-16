// Offline extraction only: never calls clasp, Google APIs or a deployment tool.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';
import { fileURLToPath } from 'node:url';
const source = readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8');
const ast = parse(source);
const functions = new Map(ast.program.body.filter(n => n.type === 'FunctionDeclaration').map(n => [n.id.name, source.slice(n.start,n.end)]));
const overrides = new Set(['getSpreadsheet_', 'getStudentCareSyncEndpoint_', 'verifyStudentCareProxySecret_']);
const roots = ['verifySubmissionProxy_', 'reserveSubmissionProxy_', 'validateSubmissionBlob_', 'appendStudentFileSubmission_',
  'getPortalData_', 'getHealthRoomLocationByAssignment_', 'confirmHealthRoomHomeroomByAssignment_',
  'getMonthlyVisitRecordsByAssignment_', 'getAdminVisitStatsByRole_', 'syncStudentCareMonthlyAggregateFromRequest_',
  'syncStudentCarePresencePublicFromRequest_', 'syncStudentCarePresenceHomeroomFromRequest_'];
const selected = new Set();
function visit(name) {
  if (selected.has(name) || overrides.has(name)) return;
  const body = functions.get(name); if (!body) throw new Error('Missing upstream function: '+name);
  selected.add(name);
  for (const other of functions.keys()) if (new RegExp('\\b'+other+'\\s*\\(').test(body)) visit(other);
}
roots.forEach(visit);
// Preserve schemas/algorithms. Only reroute the callback I/O and select the QA
// secret binding. No production constants or top-level initialization is copied.
const bodies = [...selected].sort().map(name => (name.startsWith('syncStudentCare')
  ? functions.get(name).replace('{', '{\n  qaEnvironment_("studentCare"); qaWorkbook_(); qaSecret_("studentCare"); getStudentCareSyncEndpoint_();')
  : functions.get(name))
  .replaceAll('"STUDENT_CARE_PROXY_SECRET"','"QA_STUDENT_CARE_PROXY_SECRET"')
  .replaceAll('UrlFetchApp.fetch(', 'qaFetch_('));
const identifiers = [...source.matchAll(/"([A-Za-z0-9_-]{28,})"/g)].map(m=>m[1]);
const resourceSource = readFileSync(new URL('../../server/lib/environmentResources.js',import.meta.url),'utf8');
identifiers.push(...[...readFileSync(new URL('../../common/firebaseEnvironment.js',import.meta.url),'utf8').matchAll(/"([A-Za-z0-9_-]{6,})"/g)].map(m=>m[1]));
identifiers.push(...[...resourceSource.matchAll(/"([A-Za-z0-9_-]{28,})"/g)].map(m=>m[1]));
const hashes=[...new Set(identifiers.map(x=>createHash('sha256').update(x).digest('hex')))].sort();
export const generatedShared = '// Generated from selected production functions by tools/qa-gas/shared.mjs. Do not deploy production Code.gs with this bundle.\n'+
  '// Upstream source SHA256: '+createHash('sha256').update(source).digest('hex')+'\n'+
  'const QA_PRODUCTION_RESOURCE_HASHES = '+JSON.stringify(hashes)+';\n'+
  'const TIMEZONE = "Asia/Seoul";\nconst CURRENT_STUDENT_CARE_SEMESTER = 2;\n'+
  'const SHEET_NAMES = { visit: "학생 보건실 입실현황", portalMessages: "앱_메신저문구" };\n'+
  'const HEALTH_ROOM_SUBJECT_SCOPE = "today";\nconst HEALTH_ROOM_HOMEROOM_SCOPE = "recent7";\n\n'+bodies.join('\n\n')+'\n';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const target=new URL('../../apps-script-qa/Shared.gs',import.meta.url);
 if(process.argv.includes('--check')) { if(readFileSync(target,'utf8')!==generatedShared) throw new Error('QA shared source drift'); }
 else writeFileSync(target,generatedShared);
 console.log('QA shared functions:',selected.size);
}
