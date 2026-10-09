import test from "node:test";
import assert from "node:assert/strict";
import { activateEmptyProductionLedger, inspectProductionSignatureDrive } from "./trainingSignatureProductionDrive.js";

test("Production Drive scan counts nested orphan files without writing", async () => {
  const queries = [];
  const request = async ({ url }) => {
    const q = new URL(url).searchParams.get("q");
    queries.push(q);
    if (q.startsWith("name =")) return { data: { files: [{ id: "root", mimeType: "application/vnd.google-apps.folder" }] } };
    if (q.startsWith("'root'")) return { data: { files: [{ id: "year", mimeType: "application/vnd.google-apps.folder" }] } };
    return { data: { files: [{ id: "orphan", mimeType: "image/png" }] } };
  };
  assert.deepEqual(await inspectProductionSignatureDrive(request), { rootCount: 1, folderCount: 2, fileCount: 1 });
  assert.equal(queries.length, 3);
});

test("orphan file prevents Production readiness marker creation", async () => {
  let markerWrites = 0;
  const safe = { sourceRows: 0, existingPairs: 0, lockDocs: 0,
    counts: { create: 0, update: 0, skip: 0, conflict: 0 }, mark: async () => { markerWrites += 1; } };
  await assert.rejects(activateEmptyProductionLedger({ ...safe, driveFileCount: 1 }), /production_signature_conflict/);
  assert.equal(markerWrites, 0);
  await activateEmptyProductionLedger({ ...safe, driveFileCount: 0 });
  assert.equal(markerWrites, 1);
});
