import test from "node:test";
import assert from "node:assert/strict";
import {
  applyHealthScreeningTypeBackfill,
  buildHealthScreeningTypeBackfillPlan,
  LEGACY_SCREENING_BACKFILL_SOURCE,
} from "./healthScreeningTypeBackfill.js";

const roster = [
  { staffId: "T001", employmentStatus: "재직" },
  { staffId: "T002", employmentStatus: "재직" },
  { staffId: "T003", employmentStatus: "재직" },
  { staffId: "T004", employmentStatus: "재직" },
  { staffId: "T005", employmentStatus: "재직" },
  { staffId: "T006", employmentStatus: "재직" },
  { staffId: "T007", employmentStatus: "휴직" },
];

const legacy = (staffId, screeningType) => ({
  id: `${staffId}_tb-screening-2026`, staffId, taskId: "tb-screening-2026",
  status: "completed", screening: { screeningType, completed: true },
});
const annual = (staffId, screeningType) => ({ staffId, schoolYear: 2026, screeningType,
  screeningTypeConfirmed: true, environment: "production", schemaVersion: 1, revision: 1, source: "self" });
test("dry-run classifies only unambiguous legacy routes as create candidates", () => {
  const plan = buildHealthScreeningTypeBackfillPlan({
    schoolYear: 2026,
    roster,
    legacyRecords: [
      legacy("T001", "national"), legacy("T002", "individual"), legacy("T003", "group"),
      legacy("T004", "none"), legacy("T005", "employment"), legacy("T006", "other"),
      legacy("T007", "national"), legacy("T999", "national"),
    ],
    annualRecords: [],
  });

  assert.deepEqual(plan.summary.createByType, { nhis: 1, individual: 1, employment: 1, other: 1 });
  assert.equal(plan.summary.create, 4);
  assert.equal(plan.summary.unknown, 2);
  assert.deepEqual(plan.summary.unknownByRaw, { group: 1, none: 1 });
  assert.equal(plan.summary.excludedInactive, 1);
  assert.equal(plan.summary.unmatched, 1);
  assert.equal(plan.summary.annualUnconfirmedAfterWrite, 2);
  assert.equal(plan.entries.find((item) => item.staffId === "T001").mappedType, "nhis");
  assert.equal(plan.entries.find((item) => item.staffId === "T002").mappedType, "individual");
});

test("dry-run skips matching annual records and reports mismatches as conflicts", () => {
  const plan = buildHealthScreeningTypeBackfillPlan({
    schoolYear: 2026,
    roster: roster.slice(0, 2),
    legacyRecords: [legacy("T001", "national"), legacy("T002", "individual")],
    annualRecords: [
      annual("T001", "nhis"),
      annual("T002", "employment"),
    ],
  });

  assert.equal(plan.summary.existingSkip, 1);
  assert.equal(plan.summary.conflict, 1);
  assert.equal(plan.summary.create, 0);
});

test("manifest and migrated records are deterministic and do not carry completion or evidence", () => {
  const input = { schoolYear: 2026, roster: roster.slice(0, 1), legacyRecords: [legacy("T001", "national")], annualRecords: [] };
  const first = buildHealthScreeningTypeBackfillPlan(input);
  const second = buildHealthScreeningTypeBackfillPlan(input);
  assert.equal(first.manifestHash, second.manifestHash);
  assert.equal(first.migrationId, second.migrationId);
  const record = first.creates[0].record;
  assert.equal(record.source, LEGACY_SCREENING_BACKFILL_SOURCE);
  assert.equal(record.selfChoice, null);
  assert.equal(record.confirmedBy, null);
  assert.equal(record.confirmedAt, null);
  assert.equal("status" in record, false);
  assert.equal("evidence" in record, false);
  assert.equal(record.migration.manifestHash, first.manifestHash);
});

function transactionDb(existing = new Map()) {
  const records = new Map(existing);
  const writes = [];
  const ref = (path) => ({
    path,
    collection(name) { return { doc: (id) => ref(`${path}/${name}/${id}`) }; },
  });
  return {
    records,
    writes,
    collection(name) { return { doc: (id) => ref(`${name}/${id}`) }; },
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        get: async (target) => ({ exists: records.has(target.path), data: () => records.get(target.path) }),
        create(target, value) { pending.push([target.path, value]); },
      });
      for (const [path, value] of pending) { records.set(path, value); writes.push(path); }
      return result;
    },
  };
}

test("planner refuses a non-2026 or malformed canonical roster", () => {
  const input = { schoolYear: 2026, roster: roster.slice(0, 1), legacyRecords: [legacy("T001", "national")], annualRecords: [] };
  assert.throws(() => buildHealthScreeningTypeBackfillPlan({ ...input, schoolYear: 2027 }));
  for (const invalid of [[...input.roster, ...input.roster], [{ staffId: "", employmentStatus: "재직" }], [{ staffId: "QA-STAFF", employmentStatus: "재직" }]]) {
    assert.throws(() => buildHealthScreeningTypeBackfillPlan({ ...input, roster: invalid }));
  }
});

test("planner blocks inconsistent legacy identity and duplicate annual records", () => {
  const input = { schoolYear: 2026, roster: roster.slice(0, 1), legacyRecords: [legacy("T001", "national")], annualRecords: [] };
  for (const override of [{ id: "other_tb-screening-2026" }, { id: "" }, { taskId: "tb-screening-2027" }, { schoolYear: 2027 }]) {
    const plan = buildHealthScreeningTypeBackfillPlan({ ...input, legacyRecords: [{ ...input.legacyRecords[0], ...override }] });
    assert.equal(plan.summary.create, 0);
    assert.equal(plan.summary.unmatched, 1);
  }
  const missing = buildHealthScreeningTypeBackfillPlan({ ...input, legacyRecords: [...input.legacyRecords, { id: "missing", taskId: "tb-screening-2026" }] });
  assert.equal(missing.summary.unmatched, 1);
  const annual = { staffId: "T001", schoolYear: 2026, screeningType: "nhis" };
  for (const annualRecords of [[annual, annual], [{ ...annual, schoolYear: 2027 }], [{ ...annual, id: "other_2026" }]]) {
    const plan = buildHealthScreeningTypeBackfillPlan({ ...input, annualRecords });
    assert.equal(plan.summary.create, 0);
    assert.equal(plan.summary.conflict, 1);
  }
});

test("manifest is stable when canonical source input order changes", () => {
  const input = { schoolYear: 2026, roster: roster.slice(0, 2), legacyRecords: [legacy("T001", "national"), legacy("T002", "individual")], annualRecords: [] };
  assert.equal(buildHealthScreeningTypeBackfillPlan(input).manifestHash, buildHealthScreeningTypeBackfillPlan({ ...input, roster: [...input.roster].reverse(), legacyRecords: [...input.legacyRecords].reverse() }).manifestHash);
});

test("writer rejects unresolved plans before any database operation", async () => {
  const input = { schoolYear: 2026, roster: roster.slice(0, 1), legacyRecords: [legacy("T001", "national")], annualRecords: [] };
  const db = { collection() { assert.fail("unsafe plan must not access database"); } };
  const plan = buildHealthScreeningTypeBackfillPlan(input);
  for (const unsafe of [{ ...plan, schoolYear: 2027 }, { ...plan, summary: { ...plan.summary, conflict: 1 } }, { ...plan, summary: { ...plan.summary, unmatched: 1 } }]) {
    await assert.rejects(applyHealthScreeningTypeBackfill({ db, plan: unsafe, importedAt: "2026-10-15T00:00:00.000Z" }), /Unresolved or non-2026/);
  }
});

test("orphan history blocks create and a concurrently existing target is never overwritten", async () => {
  const plan = buildHealthScreeningTypeBackfillPlan({ schoolYear: 2026, roster: roster.slice(0, 1), legacyRecords: [legacy("T001", "national")], annualRecords: [] });
  for (const [path, original, expected] of [
    ["staff_health_screening_types/T001_2026/history/1", { screeningType: "employment" }, { created: 0, skipped: 0, conflicts: 1 }],
    ["staff_health_screening_types/T001_2026", annual("T001", "nhis"), { created: 0, skipped: 1, conflicts: 0 }],
  ]) {
    const db = transactionDb(new Map([[path, original]]));
    assert.deepEqual(await applyHealthScreeningTypeBackfill({ db, plan, importedAt: "2026-10-15T00:00:00.000Z" }), expected);
    assert.deepEqual(db.writes, []);
    assert.deepEqual(db.records.get(path), original);
  }
});

test("malformed existing annual record is a conflict rather than confirmed skip", () => {
  const plan = buildHealthScreeningTypeBackfillPlan({ schoolYear: 2026, roster: roster.slice(0, 1), legacyRecords: [legacy("T001", "national")],
    annualRecords: [{ staffId: "T001", schoolYear: 2026, screeningType: "nhis" }] });
  assert.equal(plan.summary.conflict, 1);
  assert.equal(plan.summary.existingSkip, 0);
  assert.equal(plan.summary.create, 0);
});

test("divergent or malformed concurrent target is conflict without overwrite", async () => {
  const plan = buildHealthScreeningTypeBackfillPlan({ schoolYear: 2026, roster: roster.slice(0, 1), legacyRecords: [legacy("T001", "national")], annualRecords: [] });
  const path = "staff_health_screening_types/T001_2026";
  for (const original of [annual("T001", "employment"), { screeningType: "nhis" }]) {
    const db = transactionDb(new Map([[path, original]]));
    assert.deepEqual(await applyHealthScreeningTypeBackfill({ db, plan, importedAt: "2026-10-15T00:00:00.000Z" }), { created: 0, skipped: 0, conflicts: 1 });
    assert.deepEqual(db.writes, []);
    assert.deepEqual(db.records.get(path), original);
  }
});

test("create-only writer is idempotent and creates record plus history atomically", async () => {
  const plan = buildHealthScreeningTypeBackfillPlan({
    schoolYear: 2026, roster: roster.slice(0, 1), legacyRecords: [legacy("T001", "national")], annualRecords: [],
  });
  const untouchedStatus = { status: "completed", screening: { completed: true } };
  const untouchedEvidence = { reviewState: "confirmed", fileId: "evidence" };
  const db = transactionDb(new Map([
    ["staff_submission_status/T001_tb-screening-2026", untouchedStatus],
    ["tb_certificate_submissions_production/evidence", untouchedEvidence],
  ]));
  const first = await applyHealthScreeningTypeBackfill({ db, plan, importedAt: "2026-10-15T12:00:00.000Z" });
  const second = await applyHealthScreeningTypeBackfill({ db, plan, importedAt: "2026-10-15T12:01:00.000Z" });
  assert.deepEqual(first, { created: 1, skipped: 0, conflicts: 0 });
  assert.deepEqual(second, { created: 0, skipped: 1, conflicts: 0 });
  assert.deepEqual(db.writes, [
    "staff_health_screening_types/T001_2026",
    "staff_health_screening_types/T001_2026/history/1",
  ]);
  assert.equal(db.records.get("staff_health_screening_types/T001_2026").createdAt, "2026-10-15T12:00:00.000Z");
  assert.deepEqual(db.records.get("staff_submission_status/T001_tb-screening-2026"), untouchedStatus);
  assert.deepEqual(db.records.get("tb_certificate_submissions_production/evidence"), untouchedEvidence);
});
