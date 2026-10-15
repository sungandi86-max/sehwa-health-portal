import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTbCertificateStatus,
  buildTbRegistrationStatus,
  getTbStatusFromSubmissionState,
  saveTbScreeningStatus,
  buildQaTbCertificateReceiptStatus,
} from "./tbScreeningStatus.js";

test("registration status uses the authenticated canonical staffId", () => {
  const result = buildTbRegistrationStatus({
    staffId: "STAFF-001",
    registrationType: "단체검진 신청",
  });

  assert.equal(result.staffId, "STAFF-001");
  assert.equal(result.taskId, "tb-screening-2026");
  assert.equal(result.status, "incomplete");
  assert.equal(result.screening.screeningType, "group");
  assert.equal(result.screening.registrationStatus, "applied");
});

test("certificate status records pending individual screening details", () => {
  const result = buildTbCertificateStatus({
    staffId: "STAFF-002",
    checkupDate: "2026-09-17",
    documentType: "건강검진 결과 확인서",
  });

  assert.equal(result.status, "pending");
  assert.equal(result.screening.screeningType, "individual");
  assert.equal(result.screening.screeningDate, "2026-09-17");
  assert.equal(result.screening.note, "건강검진 결과 확인서");
});

test("admin submission state maps to the TB screening status", () => {
  assert.deepEqual(getTbStatusFromSubmissionState("completed"), {
    status: "completed",
    completed: true,
  });
  assert.deepEqual(getTbStatusFromSubmissionState("reviewing"), {
    status: "pending",
    completed: false,
  });
  assert.deepEqual(getTbStatusFromSubmissionState("rejected"), {
    status: "incomplete",
    completed: false,
  });
});

test("TB status builders reject missing canonical staffId", () => {
  assert.throws(
    () => buildTbRegistrationStatus({ staffId: "", registrationType: "단체검진 신청" }),
    /staffId/
  );
});

test("TB status writer allows only the production and isolated QA collections", async () => {
  const writes = [];
  const db = { collection: (name) => ({ doc: (id) => ({
    id,
    get: async () => ({ exists: false }),
    set: async () => writes.push({ name, id }),
  }) }) };
  const payload = buildTbRegistrationStatus({ staffId: "QA-001", registrationType: "QA" });
  await saveTbScreeningStatus({ db, payload, collectionName: "staff_submission_status_qa" });
  assert.equal(writes[0].name, "staff_submission_status_qa");
  await assert.rejects(
    saveTbScreeningStatus({ db, payload, collectionName: "staff_submission_status_untrusted" }),
    /not allowed/
  );
});

test("QA opt-in status writer scopes year and preserves completed approval", async () => {
  const writes = [];
  const db = { collection: (name) => ({ doc: (id) => ({ id,
    get: async () => ({ exists: true, data: () => ({ status: "completed", screening: { completed: true } }) }),
    set: async (item) => writes.push({ name, id, item }),
  }) }) };
  const payload = buildTbCertificateStatus({ staffId: "QA-001", checkupDate: "2027-09-01", documentType: "QA" });
  const id = await saveTbScreeningStatus({ db, payload, collectionName: "staff_submission_status_qa", qaWorkflow: true, schoolYear: 2027 });
  assert.equal(id, "QA-001_tb-screening-2027");
  assert.equal(writes.length, 0);
  await assert.rejects(saveTbScreeningStatus({ db, payload, qaWorkflow: true, schoolYear: 2027 }), /requires QA/);
});

test("QA transaction writer uses supplied snapshot and retains certificate fields", async () => {
  const writes = [];
  const ref = { id: "QA-001_tb-screening-2026", get: async () => { throw new Error("transaction must own reads"); } };
  const db = { collection: () => ({ doc: () => ref }) };
  const payload = buildQaTbCertificateReceiptStatus({ submission: { staffId: "QA-001", schoolYear: 2026,
    documentType: "결핵검진 확인증", checkupDate: "2026-10-01" }, current: { screening: { targetStatus: "exception", latentStatus: "completed" } } });
  const currentSnapshot = { exists: false };
  await saveTbScreeningStatus({ db, payload, collectionName: "staff_submission_status_qa", qaWorkflow: true, schoolYear: 2026,
    transaction: { set: (target, value) => writes.push({ target, value }) }, currentSnapshot });
  assert.equal(writes[0].value.screening.targetStatus, "exception");
  assert.equal(writes[0].value.screening.latentStatus, "completed");
  assert.equal(writes[0].value.screening.registrationStatus, "submitted");
});
