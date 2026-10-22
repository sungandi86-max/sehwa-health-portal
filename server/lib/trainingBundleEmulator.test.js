import test from "node:test";
import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { TrainingEventStore } from "./trainingEventStore.js";
import { TrainingEventGroupStore } from "./trainingEventGroupStore.js";
import { TrainingSignatureConflictError, TrainingSignatureLedger } from "./trainingSignatureLedger.js";

const enabled = process.env.SEHWA_TRAINING_BUNDLE_EMULATOR === "local-only";
const qaContext = {
  APP_ENV: "qa",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "qa",
  QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "EMULATOR_ONLY",
};

function event(eventId, ownerStaffId) {
  return { eventId, ownerStaffId, "교육연도": "2026", "교육명": eventId, "일자": "2026-10-21",
    "시작시간": "09:00", "종료시간": "10:00", "교육시간": "1", "장소": "Emulator", "담당부서": ownerStaffId,
    "담당자": ownerStaffId, "사용여부": "사용", "수정일시": "2026-10-21T00:00:00.000Z" };
}

function signature(signatureId, eventId) {
  return { signatureId, eventId, eventGroupId: "BUNDLE-EMU", "교직원ID": "STAFF-ATTENDEE",
    "서명일시": "2026-10-21T09:05:00.000Z", "출석방식": "qr", "서명파일ID": "PRIVATE-SIGNATURE-ONE",
    "상태": "완료", "취소여부": "N", "취소사유": "", "정정자": "", "정정일시": "",
    createdAt: "2026-10-21T09:05:00.000Z" };
}

test("Firestore Emulator commits one bundle signature to three owner-isolated ledgers", { skip: !enabled }, async () => {
  Object.assign(process.env, qaContext);
  const projectId = process.env.GCLOUD_PROJECT;
  assert.match(projectId || "", /^demo-/);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^127\.0\.0\.1:\d+$/);
  const app = initializeApp({ projectId }, `training-bundle-${Date.now()}`);
  const db = getFirestore(app);
  const events = new TrainingEventStore({ database: () => db, context: () => qaContext });
  const groups = new TrainingEventGroupStore({ database: () => db, context: () => qaContext });
  const ledger = new TrainingSignatureLedger({ database: () => db, context: () => qaContext });
  try {
    const rows = [event("EVENT-OWNER-A", "OWNER-A"), event("EVENT-OWNER-B", "OWNER-B"), event("EVENT-OWNER-C", "OWNER-C")];
    for (const row of rows) await events.saveEvent(row, null, { uid: `uid-${row.ownerStaffId}`, staffId: row.ownerStaffId });
    let group = await groups.createGroup({ groupId: "BUNDLE-EMU", name: "세 부서 공동 교육", eventIds: rows.map((row) => row.eventId),
      managerStaffId: "OWNER-A", actorUid: "uid-OWNER-A", actorStaffId: "OWNER-A", events: rows });
    group = await groups.approveEvent(group.groupId, "EVENT-OWNER-B", { actorStaffId: "OWNER-B", events: rows });
    group = await groups.approveEvent(group.groupId, "EVENT-OWNER-C", { actorStaffId: "OWNER-C", events: rows });
    const approvedRevision = group.revision;
    const approvedDigest = group.digest;
    const retried = await groups.approveEvent(group.groupId, "EVENT-OWNER-C", { actorStaffId: "OWNER-C", events: rows });
    assert.equal(retried.revision, approvedRevision);
    assert.equal(retried.digest, approvedDigest);

    await events.transferOwner("EVENT-OWNER-B", { expectedOwnerStaffId: "OWNER-B", newOwnerStaffId: "OWNER-D",
      actorUid: "uid-admin", actorStaffId: "ADMIN", reason: "담당 부서 이관" });
    const transferredRows = [rows[0], { ...rows[1], ownerStaffId: "OWNER-D" }, rows[2]];
    assert.equal((await groups.listGroupsForActor("OWNER-B", [])).length, 0);
    assert.equal((await groups.listGroupsForActor("OWNER-D", ["EVENT-OWNER-B"])).length, 1);
    group = await groups.getGroup(group.groupId);
    assert.equal(group.ready, false);
    group = await groups.approveEvent(group.groupId, "EVENT-OWNER-B", { actorStaffId: "OWNER-D", events: transferredRows });
    assert.equal(group.ready, true);

    await groups.beginAttendance(group.groupId, { revision: group.revision, digest: group.digest,
      requestId: "REQUEST-EMU-ONE", actorStaffId: "STAFF-ATTENDEE" });
    const records = transferredRows.map((row, index) => signature(`SIGNATURE-EMU-${index + 1}`, row.eventId));
    await ledger.appendSignatures(records);
    await groups.completeAttendance(group.groupId, { requestId: "REQUEST-EMU-ONE" });
    const written = await ledger.listSignaturesForEvents(transferredRows.map((row) => row.eventId));
    assert.equal(written.length, 3);
    assert.equal(new Set(written.map((row) => row.signatureFileId)).size, 1);
    await assert.rejects(ledger.appendSignatures(records), TrainingSignatureConflictError);
    const locked = await groups.getGroup(group.groupId);
    assert.ok(locked.lockedAt);

    await events.transferOwner("EVENT-OWNER-A", { expectedOwnerStaffId: "OWNER-A", newOwnerStaffId: "OWNER-E",
      actorUid: "uid-admin", actorStaffId: "ADMIN", reason: "서명 후 담당 부서 이관" });
    const historical = await groups.getGroup(group.groupId);
    assert.equal(historical.managerStaffId, "OWNER-E");
    assert.equal(historical.revision, locked.revision);
    assert.equal(historical.digest, locked.digest);
    assert.equal(historical.approvals.find((item) => item.eventId === "EVENT-OWNER-A").ownerStaffId, "OWNER-A");
  } finally {
    await deleteApp(app);
  }
});
