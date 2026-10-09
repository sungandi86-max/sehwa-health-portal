import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SUBMISSION_FILE_SIZE, prepareSubmissionFile, validateSelectableSubmissionFile, validateSubmissionFile } from "./submissionFiles.js";

test("PDF and image selection enforce the effective 3MiB upload contract", () => {
  const size = MAX_SUBMISSION_FILE_SIZE;
  assert.equal(validateSubmissionFile({ type: "application/pdf", size }), "");
  assert.equal(validateSelectableSubmissionFile({ type: "application/pdf", size }), "");
  assert.match(validateSubmissionFile({ type: "application/pdf", size: size + 1 }), /3MiB/);
  assert.match(validateSelectableSubmissionFile({ type: "application/pdf", size: size + 1 }), /자동 압축되지/);
  assert.equal(validateSelectableSubmissionFile({ type: "image/png", size: size + 1 }), "");
  assert.match(validateSelectableSubmissionFile({ type: "image/jpeg", size: 11 * 1024 * 1024 }), /10MiB/);
  assert.match(validateSubmissionFile({ type: "text/plain", size: 1 }), /PDF, JPG, PNG/);
});

test("oversized JPEG and PNG become bounded JPEG files before upload", async () => {
  const originalBitmap = globalThis.createImageBitmap;
  const originalDocument = globalThis.document;
  globalThis.createImageBitmap = async () => ({ width: 3200, height: 2400, close() {} });
  globalThis.document = { createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_value) {} }),
    toBlob: (callback) => callback(new Blob([new Uint8Array(1024)], { type: "image/jpeg" })),
  }) };
  try {
    for (const type of ["image/jpeg", "image/png"]) {
      const output = await prepareSubmissionFile({ name: type === "image/png" ? "검사.png" : "검사.jpeg", type, size: MAX_SUBMISSION_FILE_SIZE + 1 });
      assert.equal(output.type, "image/jpeg");
      assert.equal(output.name, "검사.jpg");
      assert.equal(validateSubmissionFile(output), "");
    }
  } finally {
    globalThis.createImageBitmap = originalBitmap;
    globalThis.document = originalDocument;
  }
});

test("PDF never enters image compression and oversize images fail after attempts", async () => {
  await assert.rejects(prepareSubmissionFile({ type: "application/pdf", size: MAX_SUBMISSION_FILE_SIZE + 1 }), /자동 압축되지/);
  const originalBitmap = globalThis.createImageBitmap;
  const originalDocument = globalThis.document;
  globalThis.createImageBitmap = async () => ({ width: 3200, height: 2400, close() {} });
  globalThis.document = { createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_value) {} }),
    toBlob: (callback) => callback(new Blob([new Uint8Array(MAX_SUBMISSION_FILE_SIZE + 1)], { type: "image/jpeg" })),
  }) };
  try {
    await assert.rejects(prepareSubmissionFile({ name: "large.png", type: "image/png", size: MAX_SUBMISSION_FILE_SIZE + 1 }), /압축 후에도/);
  } finally {
    globalThis.createImageBitmap = originalBitmap;
    globalThis.document = originalDocument;
  }
});
