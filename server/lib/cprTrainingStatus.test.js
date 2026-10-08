import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCprExternalSubmissionStatus,
  buildCprGroupTrainingStatus,
  isCprTrainingEvent,
  saveCompletedCprGroupTraining,
} from "./cprTrainingStatus.js";

test("CPR event classification uses the education title, not staff identity", () => {
  assert.equal(isCprTrainingEvent({ "교육명": "교직원 심폐소생술 실습" }), true);
  assert.equal(isCprTrainingEvent({ "교육명": "아동학대 신고의무자교육" }), false);
});

test("external submission remains pending until administrator review", () => {
  const pending = buildCprExternalSubmissionStatus({ staffId: "T001", trainingDate: "2026-04-01" });
  assert.equal(pending.status, "pending");
  assert.equal(pending.training.completionMethod, "individual");
  assert.equal(pending.training.completionDate, "");
  const completed = buildCprExternalSubmissionStatus({ staffId: "T001", trainingDate: "2026-04-01", submissionStatus: "completed" });
  assert.equal(completed.status, "completed");
  assert.equal(completed.training.completionDate, "2026-04-01");
});

test("group completion stores an exact staffId and event date", () => {
  const payload = buildCprGroupTrainingStatus({ staffId: "T002", event: { eventId: "CPR-1", "교육명": "CPR 교육", "일자": "2026-05-03" } });
  assert.deepEqual(payload.training, {
    completionMethod: "group", completionDate: "2026-05-03", eventId: "CPR-1", evidenceStatus: "completed", note: "학교 단체교육 출석 확인",
  });
});

test("non-CPR attendance performs no Firestore write", async () => {
  let writes = 0;
  const result = await saveCompletedCprGroupTraining({
    db: { collection() { writes += 1; } }, staffId: "T001", events: [{ eventId: "E1", "교육명": "안전교육" }],
  });
  assert.equal(result, false);
  assert.equal(writes, 0);
});
