import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSubmissionEvidenceFiles } from "./submissionEvidenceFiles.js";

test("normalizes current, ledger, and legacy submission file references", () => {
  assert.deepEqual(normalizeSubmissionEvidenceFiles({
    file: { driveFileId: "current-file", fileName: "certificate.pdf", mimeType: "application/pdf" },
    evidenceFiles: [
      { fileId: "image-file", fileName: "front.png", mimeType: "image/png" },
      { fileId: "image-file", fileName: "duplicate.png", mimeType: "image/png" },
    ],
    files: [{ driveFileId: "back-file", name: "back.jpg", type: "image/jpeg" }],
  }), [
    { fileId: "current-file", fileName: "certificate.pdf", mimeType: "application/pdf" },
    { fileId: "back-file", fileName: "back.jpg", mimeType: "image/jpeg" },
    { fileId: "image-file", fileName: "front.png", mimeType: "image/png" },
  ]);
});

test("extracts private Drive ids from legacy links without retaining arbitrary URLs", () => {
  assert.deepEqual(normalizeSubmissionEvidenceFiles({ file: {
    driveUrl: "https://drive.google.com/file/d/legacy-file-id/view?usp=sharing",
    fileName: "legacy.pdf",
  } }), [{ fileId: "legacy-file-id", fileName: "legacy.pdf", mimeType: "" }]);
  assert.deepEqual(normalizeSubmissionEvidenceFiles({ file: {
    driveUrl: "https://example.com/not-drive.pdf",
  } }), []);
});
