import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { isHealthScreeningTypeQaHost } from "./healthScreeningTypes.js";
const qaHost = "sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app";

function fixture(result, ok = true, hostname = qaHost) {
  let writes = 0; let refs = 0; let posted;
  const source = fs.readFileSync(new URL("./staffSubmissions.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/^export \{[^}]+\};\r?\n/gm, "").replace(/\bexport /g, "");
  const context = vm.createContext({ CURRENT_SCHOOL_YEAR: 2026, location: { hostname }, isHealthScreeningTypeQaHost,
    auth: { currentUser: { getIdToken: async () => "fixture-token" } }, db: {},
    doc: () => { refs++; return { id: "production-client-id" }; }, setDoc: async () => { writes++; }, serverTimestamp: () => "now",
    validateSubmissionFile: () => "", validateSelectableSubmissionFile: () => "", prepareSubmissionFile: async (file) => file,
    FileReader: class { readAsDataURL() { this.result = "data:application/pdf;base64,Zml4dHVyZQ=="; this.onload(); } },
    fetch: async (_url, request) => { posted = JSON.parse(request.body); return { ok, status: ok ? 200 : 503, json: async () => result }; },
    window: { setTimeout, clearTimeout }, AbortController, DOMException, crypto: { randomUUID: () => "client-id" },
  });
  vm.runInContext(`${source}\nthis.submitTb = createTbSubmission;`, context);
  return { submit: () => context.submitTb({ user: { uid: "qa-user", email: "qa@example.test" }, checkupDate: "2026-10-14",
    documentType: "결핵검진 확인증", file: { name: "qa.pdf", type: "application/pdf" } }), counts: () => ({ writes, refs }), payload: () => posted };
}
test("QA TB client uses server receipt and never allocates/writes a Production document", async () => {
  const f = fixture({ status: "success", environment: "qa", schoolYear: 2026, submissionId: "QA-STABLE-ID", fileId: "qa-file" });
  const result = await f.submit(); assert.equal(result.id, "QA-STABLE-ID"); assert.equal(result.file.driveFileId, "qa-file");
  assert.deepEqual(f.counts(), { writes: 0, refs: 0 }); assert.equal(f.payload().schoolYear, 2026);
});
test("QA receipt failure and malformed server receipt never trigger client fallback", async () => {
  for (const [body, ok] of [[{ status: "error", message: "receipt failed" }, false],
    [{ status: "success", environment: "qa", schoolYear: 2026 }, true]]) {
    const f = fixture(body, ok); await assert.rejects(f.submit()); assert.deepEqual(f.counts(), { writes: 0, refs: 0 });
  }
});
test("fixed QA host rejects success with missing or Production environment marker before doc/setDoc", async () => {
  for (const environment of [undefined, "production", "preview"]) {
    const f = fixture({ status: "success", environment, schoolYear: 2026, submissionId: "QA-STABLE-ID", fileId: "qa-file" });
    await assert.rejects(f.submit()); assert.deepEqual(f.counts(), { writes: 0, refs: 0 });
  }
});
test("unknown Preview server failure never allocates or writes a Production document", async () => {
  const f = fixture({ status: "error", message: "unapproved deployment" }, false, "sehwa-health-portal-git-feature-preview.vercel.app");
  await assert.rejects(f.submit()); assert.deepEqual(f.counts(), { writes: 0, refs: 0 });
});
test("Production TB client still saves the existing staff submission document", async () => {
  const f = fixture({ status: "success", staffId: "T001", fileId: "production-file" }, true, "sehwa-health-portal.vercel.app");
  assert.equal((await f.submit()).id, "production-client-id"); assert.deepEqual(f.counts(), { writes: 1, refs: 1 });
});
