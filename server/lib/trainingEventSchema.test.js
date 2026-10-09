import assert from "node:assert/strict";
import test from "node:test";
import { trainingEventFingerprint, trainingEventFromSheetRow, trainingEventToSheetRow } from "./trainingEventSchema.js";

const source = {
  rowNumber: 2,
  eventId: "QA-TRAINING-001",
  eventGroupId: "QA-GROUP-001",
  "교육연도": "2026",
  "사용여부": "미사용",
  "상태": "진행중",
  "교육명": "[QA] 이벤트 mirror",
  "담당부서": "QA",
  "담당자": "",
  "일자": "2026-10-10",
  "시작시간": "09:00",
  "종료시간": "10:00",
  "장소": "QA",
  "교육내용": "테스트",
  "이수기준": "전자서명",
  signatureOpenAt: "2026-10-10T09:00:00+09:00",
  signatureCloseAt: "2026-10-10T10:00:00+09:00",
  "정렬순서": "0",
};

test("training event schema preserves all 17 Sheet fields and separates migration metadata", () => {
  const event = trainingEventFromSheetRow(source);
  assert.equal(event.eventId, source.eventId);
  assert.equal(event.enabled, false);
  assert.equal(event.status, "진행중");
  assert.equal(event.trainingYear, 2026);
  assert.equal("sourceType" in event, false);
  assert.equal("sourceRow" in event, false);
  assert.equal("sourceFingerprint" in event, false);
  assert.deepEqual(trainingEventToSheetRow(event), Object.fromEntries(Object.entries(source).filter(([key]) => key !== "rowNumber")));
  assert.equal("createdAt" in event, false);
  assert.equal("qrSecret" in event, false);
});

test("training event fingerprint changes when source event content changes", () => {
  assert.notEqual(trainingEventFingerprint(source), trainingEventFingerprint({ ...source, "사용여부": "사용" }));
  const aliases = { ...source, "사용여부": "Y", "정렬순서": "00" };
  assert.equal(trainingEventFromSheetRow(aliases).enabled, true);
  assert.deepEqual(trainingEventToSheetRow(trainingEventFromSheetRow(aliases)), Object.fromEntries(Object.entries(aliases).filter(([key]) => key !== "rowNumber")));
});
