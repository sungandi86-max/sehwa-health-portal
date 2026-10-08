import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTbCertificateStatus,
  buildTbRegistrationStatus,
  getTbStatusFromSubmissionState,
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
