// Standalone audit: never import application startup, registration or migration code.
import { pathToFileURL } from 'node:url';

export const PROJECT = 'sehwa-health-portal-v2';
const SUFFIX = '_2026_2';
const ROLES = ['staff', 'homeroom', 'training_admin', 'health_teacher', 'admin'];
const FIELDS = ['uid', 'schoolYear', 'semester', 'active', 'roles', 'staffId', 'grade', 'classNo', 'assignmentSource', 'qaOnly'];

export function validateTarget(args, env) {
  if (args.length !== 4 || args[0] !== '--project' || args[2] !== '--confirm-read-only') throw new Error();
  const project = args[1];
  if (project === PROJECT) {
    if (args[3] !== `${PROJECT}:2026:2` || env.FIRESTORE_EMULATOR_HOST ||
        [env.GOOGLE_CLOUD_PROJECT, env.GCLOUD_PROJECT].some(x => x && x !== PROJECT)) throw new Error();
  } else if (project === 'demo-sehwa-rules-local') {
    if (args[3] !== `${project}:2026:2` || !/^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(env.FIRESTORE_EMULATOR_HOST || '') ||
        Number(env.FIRESTORE_EMULATOR_HOST.split(':')[1]) > 65535) throw new Error();
  } else throw new Error();
  return project;
}

// Projection + bounded, serial pages. No SDK writes and no document payload logging.
async function* pages(db, name, fields) {
  let cursor;
  for (;;) {
    let q = db.collection(name).select(...fields).orderBy('__name__').limit(200);
    if (cursor) q = q.startAfter(cursor);
    const snapshot = await q.get();
    for (const item of snapshot.docs) yield item;
    if (snapshot.size < 200) return;
    cursor = snapshot.docs.at(-1);
  }
}

export async function auditAssignments(db) {
  const counts = Object.fromEntries(['scanCompleted','scanFailed','usersRead','assignmentsRead','historicalSkipped',
    'currentChecked','compatible','incompatible','activeCompatible','inactive','pendingRegistration',
    'missingCurrentAssignment','assignmentWithoutUser','uidOrPathError','schoolYearError','semesterError',
    'activeTypeError','rolesError','staffIdError','staffIdWhitespace','homeroomFieldsError','qaOnlyInProduction',
    'trainingAdminOnly'].map(k => [k, 0]));
  const users = new Set(), covered = new Set();
  for await (const item of pages(db, 'users', [])) { users.add(item.id); counts.usersRead++; }
  for await (const item of pages(db, 'user_assignments', FIELDS)) {
    counts.assignmentsRead++;
    const d = item.data();
    if (!item.id.endsWith(SUFFIX) && !(String(d.schoolYear) === '2026' && String(d.semester) === '2')) {
      counts.historicalSkipped++; continue;
    }
    counts.currentChecked++;
    if (item.id.endsWith(SUFFIX)) covered.add(item.id.slice(0, -SUFFIX.length));
    let invalid = false;
    const check = (key, condition) => { if (condition) { counts[key]++; invalid = true; } };
    check('uidOrPathError', typeof d.uid !== 'string' || !d.uid || item.id !== `${d.uid}${SUFFIX}`);
    check('schoolYearError', d.schoolYear !== 2026);
    check('semesterError', d.semester !== 2);
    check('activeTypeError', typeof d.active !== 'boolean');
    if (d.active === false) counts.inactive++;
    if (typeof d.uid === 'string' && !users.has(d.uid)) counts.assignmentWithoutUser++;
    const pending = d.assignmentSource === 'google_signup_pending' && (!Array.isArray(d.roles) || !d.roles.length);
    if (pending && !invalid) { counts.pendingRegistration++; continue; }
    check('rolesError', !Array.isArray(d.roles) || !d.roles.length || d.roles.some(r => !ROLES.includes(r)));
    check('staffIdError', typeof d.staffId !== 'string' || !d.staffId.trim());
    if (typeof d.staffId === 'string' && d.staffId !== d.staffId.trim()) counts.staffIdWhitespace++;
    check('homeroomFieldsError', Array.isArray(d.roles) && d.roles.includes('homeroom') &&
      (!Number.isFinite(d.grade) || !Number.isFinite(d.classNo)));
    check('qaOnlyInProduction', d.qaOnly === true || (Array.isArray(d.roles) && d.roles.some(r => typeof r === 'string' && r.startsWith('qa_'))));
    if (Array.isArray(d.roles) && d.roles.length === 1 && d.roles[0] === 'training_admin') counts.trainingAdminOnly++;
    counts[invalid ? 'incompatible' : 'compatible']++;
    if (!invalid && d.active === true) counts.activeCompatible++;
  }
  for (const uid of users) if (!covered.has(uid)) counts.missingCurrentAssignment++;
  counts.scanCompleted = 1;
  return counts;
}

export async function runAudit({ args, env, connect, output }) {
  let db;
  try {
    const project = validateTarget(args, env); // Before ADC discovery or SDK initialization.
    db = await connect(project);
    if (db.projectId !== project) throw new Error();
    const result = await auditAssignments(db);
    await db.terminate(); db = null;
    output(JSON.stringify(result));
    return result.incompatible ? 2 : 0;
  } catch {
    // Never print SDK errors, identifiers, credentials, or incomplete aggregates.
    try { await db?.terminate(); } catch { /* Fixed output only. */ }
    output(JSON.stringify({scanCompleted: 0, scanFailed: 1}));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Suppress dependency diagnostics too; only aggregate JSON goes to stdout.
  const writeCounts = process.stdout.write.bind(process.stdout);
  process.stdout.write = process.stderr.write = () => true;
  console.log = console.info = console.warn = console.error = console.debug = () => {};
  process.exitCode = await runAudit({ args: process.argv.slice(2), env: process.env,
    output: line => writeCounts(`${line}\n`),
    connect: async projectId => {
      const { Firestore, setLogFunction } = await import('@google-cloud/firestore');
      setLogFunction(() => {});
      return new Firestore({ projectId, universeDomain: 'googleapis.com' });
    } });
}
