import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { USAGE_GUIDES, getUsageGuide } from "./usageGuides.js";

test("usage guides have steps and troubleshooting content", () => {
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
  for (const label of ["교육 등록", "대상자 설정", "대상자 확인", "교육 생성", "내 교육", "묶음 관리", "묶음 만들기", "내 교육 승인", "묶음 QR 생성", "QR 인쇄", "서명 제출", "XLSX 다운로드", "PDF 다운로드", "담당자 이관"]) {
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
  assert.match(source, /min-h-\[44px\]/);
  assert.match(source, /min-w-\[44px\]/);
  assert.match(source, /BookOpen/);
  assert.match(source, /label = "이용 방법"/);
});

test("training manager card reuses the complete guide inside the protected manager screen", async () => {
  const page = await readFile(new URL("../pages/FirebaseTrainingAdminPage.jsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../components/TrainingManagerGuideCard.jsx", import.meta.url), "utf8");
  const staffPage = await readFile(new URL("../pages/TrainingCenterPage.jsx", import.meta.url), "utf8");
  const guide = USAGE_GUIDES.trainingManagerComplete;
  assert.equal(guide.steps.length, 7);
  assert.match(page, /FirebaseAdminRoleAccessGate allowTrainingAdmin/);
  assert.match(page, /<TrainingManagerGuideCard \/>/);
  assert.match(card, /guide="trainingManagerComplete"/);
  assert.match(card, /교육 담당자이신가요\?/);
  assert.doesNotMatch(staffPage, /TrainingManagerGuideCard|trainingManagerComplete/);
});

test("page shells keep help beside the title and outside identity metadata", async () => {
  const shell = await readFile(new URL("../components/FirebaseV2PageShell.jsx", import.meta.url), "utf8");
  const portal = await readFile(new URL("../components/PortalSubpageLayout.jsx", import.meta.url), "utf8");
  assert.match(shell, /<h1[\s\S]*<ContextHelp guide=\{guide\}/);
  assert.match(portal, /<h1[\s\S]*<ContextHelp guide=\{guide\}/);
  const userMeta = shell.slice(shell.indexOf("firebase-v2-user-meta"), shell.indexOf("</div>", shell.indexOf("firebase-v2-user-meta")));
  assert.doesNotMatch(userMeta, /ContextHelp/);
});
