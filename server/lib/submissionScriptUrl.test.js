import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { submissionScriptUrl } from "./submissionScriptUrl.js";
import { verifyQaTbScriptEvidence } from "./qaTbEvidenceMetadata.js";
const common = "https://script.google.com/macros/s/common-fixture/exec";
const qaUrl = "https://script.google.com/macros/s/qa-submission-fixture/exec";
const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", GAS_URL: common,
  VITE_GAS_BASE_URL: common, QA_SUBMISSION_GAS_URL: qaUrl };
test("QA submission resolver uses only dedicated QA URL and never common fallback", () => {
  assert.equal(submissionScriptUrl(qa), qaUrl);
  for (const value of [undefined, "", "https://example.test/exec"]) {
    assert.equal(submissionScriptUrl({ ...qa, QA_SUBMISSION_GAS_URL: value }), "");
  }
});
test("Production resolver ignores QA URL and preserves common GAS then VITE precedence", () => {
  const production = { ...qa, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    VITE_GAS_BASE_URL: "https://script.google.com/macros/s/vite-fallback-fixture/exec" };
  assert.equal(submissionScriptUrl(production), common);
  assert.equal(submissionScriptUrl({ ...production, GAS_URL: "" }), production.VITE_GAS_BASE_URL);
  assert.equal(submissionScriptUrl({ ...production, GAS_URL: "", VITE_GAS_BASE_URL: "" }), "");
});
test("unknown branch or deployment cannot use any submission destination", () => {
  for (const change of [{ VERCEL_GIT_COMMIT_REF: "feature" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: "production" }]) {
    assert.equal(submissionScriptUrl({ ...qa, ...change }), "");
  }
});
test("QA approval metadata posts only to dedicated URL and absent QA URL never calls common", async () => {
  const configured = { ...qa, QA_TB_CERTIFICATE_DRIVE_FOLDER_ID: "QA-PRIVATE-FOLDER", SUBMISSION_PROXY_SECRET: "fixture-only-secret-at-least-32-bytes" };
  let calls = 0;
  const postScript = async (url) => { calls++; assert.equal(url, qaUrl); return { ok: true, json: async () => ({
    status: "success", verified: true, fileId: "qa-file", folderId: configured.QA_TB_CERTIFICATE_DRIVE_FOLDER_ID, private: true, trashed: false }) }; };
  assert.equal(await verifyQaTbScriptEvidence("qa-file", { context: configured, postScript }), true);
  assert.equal(await verifyQaTbScriptEvidence("qa-file", { context: { ...configured, QA_SUBMISSION_GAS_URL: "" }, postScript }), false);
  assert.equal(calls, 1);
});
test("common portal and healthroom handlers retain existing common URL configuration", () => {
  for (const path of ["../../api/portal.js", "../../api/health-room-status.js"]) {
    const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /process\.env\.GAS_URL \|\| process\.env\.VITE_GAS_BASE_URL \|\| ""/);
    assert.doesNotMatch(source, /QA_SUBMISSION_GAS_URL|submissionScriptUrl/);
  }
});
