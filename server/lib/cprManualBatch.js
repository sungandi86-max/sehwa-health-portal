import { createHash } from "node:crypto";
import { serverFirestoreResource } from "./firestoreResources.js";
import { requireTrainingEnvironment, trainingLockCollection } from "./trainingDeployment.js";
import { TrainingSignatureLedger } from "./trainingSignatureLedger.js";
import { trainingEventFromSheetRow } from "./trainingEventSchema.js";
import { signatureKey } from "./trainingCenterPhase2.js";
import { buildCprGroupTrainingStatus } from "./cprTrainingStatus.js";
import { isCprEvent } from "../../common/cprProjection.js";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "./staffDirectory.js";

export const MANUAL_CPR_MODE = "admin_offline_cpr_2026";
export class ManualCprError extends Error {
  constructor(code, status = 400) { super("학교 단체교육 등록 내용을 다시 확인해 주세요."); this.code = code; this.status = status; }
}
const hash = (input) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const id = (input) => typeof input === "string" && /^[A-Za-z0-9_-]{2,120}$/.test(input);
const text = (input) => typeof input === "string" ? input.normalize("NFKC").trim() : "";
export function manualCprInput(input, actor, now = new Date()) {
  if (!input || input.schoolYear !== 2026 || !id(input.requestId) || !id(actor) ||
      !Array.isArray(input.staffIds) || !input.staffIds.length || input.staffIds.length > 100 ||
      input.staffIds.some((value) => !id(value)) || new Set(input.staffIds).size !== input.staffIds.length) throw new ManualCprError("MANUAL_CPR_INPUT");
  const title = text(input.title), basis = text(input.basis), date = text(input.date);
  const time = (value) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const parsed = new Date(`${date}T00:00:00+09:00`);
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0,10);
  if (!title || title.length > 150 || basis.length < 5 || basis.length > 200 || !/^2026-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) || new Date(parsed.getTime() + 9 * 3600000).toISOString().slice(0,10) !== date || date > today ||
      !time(input.startTime) || !time(input.endTime) || input.startTime >= input.endTime) throw new ManualCprError("MANUAL_CPR_DETAILS");
  return { requestId: input.requestId, schoolYear: 2026, title, date, startTime: input.startTime, endTime: input.endTime,
    basis, actor, staffIds: [...input.staffIds].sort() };
}
function assignmentFor(docs, staffId) {
  const valid = docs.filter((doc) => { const a = doc.data(); return a.staffId === staffId && a.schoolYear === CURRENT_SCHOOL_YEAR && a.semester === CURRENT_SEMESTER &&
    a.active === true && id(a.uid) && doc.id === `${a.uid}_${CURRENT_SCHOOL_YEAR}_${CURRENT_SEMESTER}` && Array.isArray(a.roles) &&
    a.roles.some((role) => ["staff", "homeroom", "health_teacher", "admin"].includes(role)) && !a.qaOnly; });
  return docs.length <= 100 && valid.length === 1 ? valid[0] : null;
}
function statusReason(status) {
  if (status?.status === "completed") return status.training?.completionMethod === "group" ? "existing_group" : "existing_individual";
  if (status && (!["unknown", "incomplete"].includes(status.status) || status.evidenceSubmissionId || status.training?.eventId || status.training?.evidenceStatus)) return "needs_review";
  return "ready";
}
function pairReason(docs, events, environment) {
  if (docs.length > 100) return "needs_review";
  for (const doc of docs) {
    const pair = doc.data();
    if (pair.environment !== environment) return "needs_review";
    if (!pair.activeSignatureId) continue;
    const event = events.get(pair.eventId);
    if (!event) return "needs_review";
    if (isCprEvent(event)) return "existing_group_source";
  }
  return "ready";
}
export async function runManualCprBatch({ db, context = process.env, actor, directory, input, commit = false, now = new Date(), events }) {
  const environment = requireTrainingEnvironment(context);
  // Validate injected DB before even a roster, status or marker read.
  const statuses = serverFirestoreResource(db, "statuses", context);
  const spec = manualCprInput(input, actor, now);
  const eventId = `MANUAL-CPR-2026-${hash(spec.requestId).slice(0,24)}`;
  const fingerprint = hash(spec), eventRef = db.collection(`training_events_${environment}`).doc(eventId);
  const ledger = new TrainingSignatureLedger({ database: () => db, context: () => context });
  if (!await ledger.isReady()) throw new ManualCprError("MANUAL_CPR_LEDGER_NOT_READY", 503);
  const stored = await eventRef.get();
  const batch = stored.exists ? stored.data() : null;
  if (batch && (batch.environment !== environment || batch.manualCprBatch?.fingerprint !== fingerprint || batch.ownerStaffId !== actor)) throw new ManualCprError("MANUAL_CPR_REQUEST_CONFLICT",409);
  const eventMap = new Map(events.map((event) => [event.eventId, event]));
  const roster = new Map();
  for (const person of directory) { const matches = roster.get(person.staffId) || []; matches.push(person); roster.set(person.staffId,matches); }
  const assignments = (staffId) => db.collection("user_assignments").where("staffId","==",staffId).limit(101);
  const pairs = (staffId) => ledger.collection.where("staffId","==",staffId).limit(101);
  const rows = [];
  if (batch) rows.push(...batch.manualCprBatch.plan);
  else for (let offset = 0; offset < spec.staffIds.length; offset += 5) {
    rows.push(...await Promise.all(spec.staffIds.slice(offset,offset+5).map(async (staffId) => {
      const people = roster.get(staffId) || [], person = people[0];
      if (people.length !== 1 || person.employmentStatus !== "재직" || person.target === "FALSE") return { staffId, name: person?.name || staffId, reason: "inactive_or_ambiguous" };
      const [links, status, prior] = await Promise.all([assignments(staffId).get(), db.collection(statuses).doc(`${staffId}_cpr-training-2026`).get(), pairs(staffId).get()]);
      const link = assignmentFor(links.docs,staffId);
      const reason = !link ? "unlinked_or_inactive" : statusReason(status.exists ? status.data() : null);
      return { staffId, name: person.name, department: person.department || "", position: person.position || "", uid: link?.data().uid || "",
        reason: reason !== "ready" ? reason : pairReason(prior.docs,eventMap,environment),
        revision: status.exists ? hash(status.data()) : "missing" };
    })));
  }
  const reviewFingerprint = hash([fingerprint, rows]);
  if (!commit) return { ok: true, eventId, reviewFingerprint, rows, saved: Boolean(batch) };
  if (input.confirmedOfflineRoster !== true) throw new ManualCprError("MANUAL_CPR_ATTESTATION_REQUIRED");
  if (!batch && input.reviewFingerprint !== reviewFingerprint) throw new ManualCprError("MANUAL_CPR_PREVIEW_CHANGED",409);
  const event = { eventId, completionTaskId: "cpr-training-2026", "교육명": spec.title, "일자": spec.date };
  const eventData = { ...trainingEventFromSheetRow({ eventId, "교육연도":"2026", "사용여부":"미사용", "상태":"완료", "교육명":spec.title,
    "담당부서":"보건실", "담당자":actor, "일자":spec.date, "시작시간":spec.startTime, "종료시간":spec.endTime,
    "이수기준":"관리자 확인 오프라인 참석 명부", "교육내용":spec.basis, "정렬순서":"0" }),
    environment, completionTaskId:"cpr-training-2026", registrationMode:MANUAL_CPR_MODE, ownerStaffId:actor, sourceType:MANUAL_CPR_MODE,
    targetSnapshot:{ schemaVersion:1, confirmedAt:now.toISOString(), members:rows.map((row)=>({staffId:row.staffId,name:row.name,department:row.department || "",position:row.position || "",
      targetStatus:row.reason === "ready" ? "대상":"제외",required:true,excludedReason:row.reason === "ready" ? "":row.reason})) },
    targetStaffIds:rows.filter(row=>row.reason === "ready").map(row=>row.staffId),
    manualCprBatch:{ fingerprint, requestId:spec.requestId, basis:spec.basis, actor, confirmedAt:now.toISOString(), plan:rows }, firestoreCreatedAt:now, firestoreUpdatedAt:now };
  await db.runTransaction(async tx => {
    const current = await tx.get(eventRef);
    if (current.exists) { if (current.data().manualCprBatch?.fingerprint !== fingerprint) throw new ManualCprError("MANUAL_CPR_REQUEST_CONFLICT",409); }
    else tx.create(eventRef,eventData);
  });
  const results = [];
  // Per-person atomic transactions: bounded cost and recoverable partial batches.
  for (const row of rows) {
    if (row.reason !== "ready") { results.push({...row,outcome:"skipped",registered:false}); continue; }
    const staffId = row.staffId, person = roster.get(staffId) || [];
    if (person.length !== 1 || person[0].employmentStatus !== "재직" || person[0].target === "FALSE") { results.push({...row,outcome:"skipped",reason:"inactive_or_ambiguous",registered:false}); continue; }
    const signatureId = `MANUAL-${hash([eventId,staffId]).slice(0,32)}`;
    const record = {signatureId,eventId,eventGroupId:"","교직원ID":staffId,"서명일시":"","출석방식":MANUAL_CPR_MODE,"서명파일ID":"",
      "상태":"완료","취소여부":"N","취소사유":spec.basis,"정정자":actor,"정정일시":now.toISOString(),createdAt:now.toISOString()};
    const statusRef = db.collection(statuses).doc(`${staffId}_cpr-training-2026`), lockRef = db.collection(trainingLockCollection(context)).doc(signatureKey(eventId,staffId));
    try {
      const result = await ledger.appendSignatures([record], {
        source:{type:MANUAL_CPR_MODE,manualEvidence:{basis:spec.basis,actor,registeredAt:now.toISOString(),requestId:spec.requestId,fingerprint}},
        prepare:async (tx, {snapshots,entries}) => {
          const [currentStatus, currentEvent, links, prior, lock] = await Promise.all([tx.get(statusRef),tx.get(eventRef),tx.get(assignments(staffId)),tx.get(pairs(staffId)),tx.get(lockRef)]);
          if (currentEvent.data()?.manualCprBatch?.fingerprint !== fingerprint || currentEvent.data()?.registrationMode !== MANUAL_CPR_MODE) throw new ManualCprError("MANUAL_CPR_EVENT_CHANGED",409);
          const current = currentStatus.exists ? currentStatus.data() : null;
          if (entries[0].exists || snapshots[0].exists) {
            const same = entries[0].exists && entries[0].data().manualEvidence?.fingerprint === fingerprint && snapshots[0].data()?.activeSignatureId === signatureId;
            return {skip:true,outcome:"skipped",reason:same ? "already_registered":"attendance_changed",registered:same && current?.status === "completed"};
          }
          const link = assignmentFor(links.docs,staffId);
          if (!link || link.data().uid !== row.uid) return {skip:true,outcome:"skipped",reason:"assignment_changed",registered:false};
          const reason = statusReason(current);
          if (reason !== "ready") return {skip:true,outcome:"skipped",reason,registered:false};
          if ((currentStatus.exists ? hash(current) : "missing") !== row.revision) return {skip:true,outcome:"skipped",reason:"status_changed",registered:false};
          const priorReason = pairReason(prior.docs,eventMap,environment);
          if (priorReason !== "ready") return {skip:true,outcome:"skipped",reason:priorReason,registered:false};
          if (lock.exists && ["pending","completed","cancelled"].includes(lock.data().state)) return {skip:true,outcome:"skipped",reason:"attendance_locked",registered:false};
          return {outcome:"success",reason:"registered",registered:true,revision:current?.cprProjectionRevision || 0};
        },
        applyWrites:(tx, prepared)=> {
          tx.set(statusRef,{...buildCprGroupTrainingStatus({staffId,event}),registrationMode:MANUAL_CPR_MODE,
            cprProjectionRevision:prepared.revision+1,syncedAt:now,updatedAt:now},{merge:true});
          tx.set(lockRef,{eventId,eventIds:[eventId],staffId,state:"completed",requestId:signatureId,leaseUntil:0,signatureIds:[signatureId],
            registrationMode:MANUAL_CPR_MODE,createdAt:now.toISOString(),updatedAt:now.toISOString()});
        },
      });
      results.push({...row,...result});
    } catch { results.push({...row,outcome:"failed",reason:"retryable_failure",registered:false}); }
  }
  return {ok:true,eventId,results,counts:{success:results.filter(r=>r.outcome === "success").length,skipped:results.filter(r=>r.outcome === "skipped").length,
    failed:results.filter(r=>r.outcome === "failed").length,registered:results.filter(r=>r.registered).length}};
}
