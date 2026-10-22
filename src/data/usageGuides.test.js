import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { USAGE_GUIDES, getUsageGuide } from "./usageGuides.js";

test("usage guides have concise steps and troubleshooting content", () => {
  assert.ok(Object.keys(USAGE_GUIDES).length >= 8);
  for (const [key, guide] of Object.entries(USAGE_GUIDES)) {
    assert.ok(guide.audience, `${key} audience`);
    assert.ok(guide.title, `${key} title`);
    assert.ok(guide.steps.length > 0, `${key} steps`);
    assert.ok(guide.troubleshooting.length > 0, `${key} troubleshooting`);
    assert.equal(getUsageGuide(key), guide);
  }
  assert.equal(getUsageGuide("missing"), null);
});

test("guides use labels that exist in the product UI", async () => {
  const sources = await Promise.all([
    "../pages/FirebaseTrainingAdminPage.jsx",
    "../components/TrainingGroupManager.jsx",
    "../pages/TrainingAttendancePage.jsx",
    "../pages/FirebaseTrainingAttendanceAdminPage.jsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const productSource = sources.join("\n");
  for (const label of ["교육 등록", "내 교육", "묶음 관리", "묶음 QR 생성", "QR 인쇄", "서명 제출", "XLSX 다운로드", "PDF 다운로드"]) {
    assert.match(productSource, new RegExp(label));
  }
});

test("staff guides do not expose administrator commands", () => {
  const staffCopy = ["staffTraining", "attendanceSignature", "staffSubmissions", "staffStatus"]
    .map((key) => JSON.stringify(USAGE_GUIDES[key]))
    .join(" ");
  assert.doesNotMatch(staffCopy, /담당자 이관|자료 무효|권한 관리/);
});

test("context help keeps modal semantics, focus handling, and mobile touch targets", async () => {
  const source = await readFile(new URL("../components/ContextHelp.jsx", import.meta.url), "utf8");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  assert.match(source, /min-h-11/);
  assert.match(source, /min-w-11/);
});
