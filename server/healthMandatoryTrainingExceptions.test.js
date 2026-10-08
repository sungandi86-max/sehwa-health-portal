import test from "node:test";
import assert from "node:assert/strict";
import {
  exceptionCollection,
  exceptionDocumentId,
  saveSourceOnlyException,
  saveCanonicalStaffException,
  releaseSourceOnlyException,
  sourceRowFingerprint,
  summarizeStoredExceptions,
  validateSourceOnlyException,
} from "./healthMandatoryTrainingExceptions.js";
import { summarizeSourceOnlyExceptions, summarizePlan } from "./healthMandatoryTrainingAnalysis.js";
import { planLegacyExceptionMigration } from "./healthMandatoryTrainingExceptionMigration.js";

const candidate = {
  year: 2026,
  sourceName: "과거 직원",
  sourcePosition: "교사",
  reason: "퇴직",
  confirmationStatus: "확인완료",
  note: "",
};
const sourceRow = { sourceRow: 2, realName: "과거 직원", position: "교사", department: "" };
const fingerprint = sourceRowFingerprint(2026, sourceRow);

test("source-only exception requires a unique research row and no canonical roster match", () => {
  const sourceRows = [sourceRow];
  assert.deepEqual(validateSourceOnlyException(candidate, sourceRows, []), { ...candidate, sourceRow: 2, sourceFingerprint: fingerprint });
  assert.throws(() => validateSourceOnlyException(candidate, [], []), /유일하게/);
  assert.throws(() => validateSourceOnlyException(candidate, [...sourceRows, ...sourceRows], []), /유일하게/);
  assert.throws(() => validateSourceOnlyException(candidate, sourceRows, [{ staffId: "T001", name: "과거 직원", position: "교사" }]), /현행 교직원명단/);
  assert.throws(() => validateSourceOnlyException({ ...candidate, reason: "임의" }, sourceRows, []), /예외 정보/);
});

test("Firestore projection preserves legacy exception matching without a staffId guess", () => {
  const legacy = summarizeSourceOnlyExceptions([
    ["적용연도", "성명", "직책", "제외사유", "확인상태", "비고"],
    ["2026", "과거 직원", "교사", "퇴직", "확인완료", ""],
  ], 2026);
  const stored = summarizeStoredExceptions([{
    taskId: "health-mandatory-training-2026",
    identityType: "source_only_exact",
    sourceName: "과거 직원",
    sourceTitle: "교사",
    year: 2026,
    exceptionReason: "퇴직",
    confirmationStatus: "확인완료",
    staffId: null,
    legacySourceOnly: true,
    sourceRow: 2,
    sourceFingerprint: fingerprint,
    active: true,
  }], 2026);
  const sourceRows = [{ ...sourceRow, sourceFingerprint: fingerprint, sourceStatus: "미이수" }];
  const fromLegacy = summarizePlan(sourceRows, [], legacy, { taskYear: 2026 });
  const fromStored = summarizePlan(sourceRows, [], stored, { taskYear: 2026 });
  assert.equal(fromLegacy.confirmedSourceOnlyExcluded, 1);
  assert.equal(fromStored.confirmedSourceOnlyExcluded, fromLegacy.confirmedSourceOnlyExcluded);
  assert.equal(fromStored.unresolvedSourceOnly, fromLegacy.unresolvedSourceOnly);
  assert.equal(stored.stats.confirmedRows, legacy.stats.confirmedRows);
});

test("source-only fingerprint cannot exclude a moved row or a current namesake", () => {
  const record = {
    taskId: "health-mandatory-training-2026", identityType: "source_only_exact",
    sourceName: "과거 직원", sourceTitle: "교사", exceptionReason: "퇴직",
    year: 2026, confirmationStatus: "확인완료", active: true,
    legacySourceOnly: true, staffId: null, sourceRow: 2, sourceFingerprint: fingerprint,
  };
  const exceptions = summarizeStoredExceptions([record]);
  const movedSource = { ...sourceRow, sourceRow: 3, sourceFingerprint: sourceRowFingerprint(2026, { ...sourceRow, sourceRow: 3 }) };
  assert.equal(summarizePlan([movedSource], [], exceptions, { taskYear: 2026 }).unresolvedSourceOnly, 1);
  const currentStaff = [{ staffId: "T001", name: "과거 직원", position: "교사", employmentStatus: "재직", target: "대상" }];
  const currentSource = { ...sourceRow, sourceFingerprint: fingerprint, sourceStatus: "이수완료" };
  const plan = summarizePlan([currentSource], currentStaff, exceptions, { taskYear: 2026 });
  assert.equal(plan.confirmedSourceOnlyExcluded, 0);
  assert.equal(plan.matchedActive, 1);
});

test("current-staff exceptions require canonical staffId and never act as source-only exceptions", async () => {
  const record = {
    taskId: "health-mandatory-training-2026", identityType: "canonical_staff",
    legacySourceOnly: false, year: 2026, staffId: "T001", exceptionReason: "기타",
    confirmationStatus: "확인완료", active: true,
  };
  const exceptions = summarizeStoredExceptions([record]);
  const directory = [{ staffId: "T001", name: "현행 교사", position: "교사", employmentStatus: "재직", target: "대상" }];
  const source = [{ realName: "현행 교사", position: "교사", sourceStatus: "이수완료" }];
  const plan = summarizePlan(source, directory, exceptions, { taskYear: 2026 });
  assert.equal(plan.excludedCanonicalException, 1);
  assert.equal(plan.confirmedSourceOnlyExcluded, 0);
  assert.equal(plan.matchedActive, 0);
  assert.equal(summarizePlan([{ ...sourceRow, sourceStatus: "미이수" }], [], exceptions, { taskYear: 2026 }).unresolvedSourceOnly, 1);
  await assert.rejects(() => saveCanonicalStaffException({
    db: {}, candidate: { year: 2026, staffId: "T999", reason: "기타" }, directory, actorUid: "admin",
  }), /재직자 staffId/);
});

test("released or invalid stored exceptions cannot silently exclude source rows", () => {
  const sourceRows = [{ ...sourceRow, sourceFingerprint: fingerprint, sourceStatus: "미이수" }];
  const record = {
    taskId: "health-mandatory-training-2026", identityType: "source_only_exact",
    sourceName: "과거 직원", sourceTitle: "교사", year: 2026,
    exceptionReason: "퇴직", confirmationStatus: "확인완료", active: true,
    legacySourceOnly: true, staffId: null, sourceRow: 2, sourceFingerprint: fingerprint,
  };
  const released = summarizeStoredExceptions([{ ...record, active: false }]);
  const invalid = summarizeStoredExceptions([{ ...record, exceptionReason: "임의" }]);
  assert.equal(summarizePlan(sourceRows, [], released, { taskYear: 2026 }).unresolvedSourceOnly, 1);
  assert.equal(summarizePlan(sourceRows, [], invalid, { taskYear: 2026 }).unresolvedSourceOnly, 1);
  assert.equal(invalid.stats.invalidRows, 1);
});

test("exception document IDs avoid names and QA and Production collections are isolated", () => {
  const id = exceptionDocumentId(2026, "과거 직원", "교사");
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(id.includes("과거"), false);
  assert.equal(exceptionCollection({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }), "health_mandatory_training_exceptions_qa");
  assert.equal(exceptionCollection({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }), "health_mandatory_training_exceptions_production");
  assert.throws(() => exceptionCollection({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/x" }), /승인된 배포 환경/);
});

test("legacy migration dry-run preserves row metadata and blocks unknown or ambiguous identities", () => {
  const legacyValues = [
    ["적용연도", "성명", "직책", "제외사유", "확인상태", "비고"],
    ["2026", "과거 직원", "교사", "퇴직", "확인완료", "검토 기록"],
  ];
  const sourceRows = [sourceRow];
  const safe = planLegacyExceptionMigration({ legacyValues, sourceRows, directory: [] });
  assert.equal(safe.conflicts.length, 0);
  assert.equal(safe.candidates.length, 1);
  assert.equal(safe.candidates[0].data.staffId, null);
  assert.deepEqual(safe.candidates[0].data.legacy, {
    sourceSheet: "법정의무연수_예외", sourceRow: 2, confirmationStatus: "확인완료",
  });
  assert.equal(planLegacyExceptionMigration({ legacyValues, sourceRows: [], directory: [] }).conflicts.length, 1);
  assert.equal(planLegacyExceptionMigration({ legacyValues, sourceRows: [...sourceRows, ...sourceRows], directory: [] }).conflicts.length, 1);
  assert.equal(planLegacyExceptionMigration({ legacyValues, sourceRows, directory: [{ name: "과거 직원", position: "교사", staffId: "T001" }] }).conflicts.length, 1);
});

test("admin add and release retain audit history without hard delete or cross-environment writes", async () => {
  const documents = new Map();
  const collections = [];
  let deleteCalls = 0;
  const db = {
    collection(name) {
      collections.push(name);
      return {
        doc(id) {
          return {
            async get() { return { exists: documents.has(id), data: () => documents.get(id) }; },
            async set(data) { documents.set(id, data); },
            async update(data) { documents.set(id, { ...documents.get(id), ...data }); },
            async delete() { deleteCalls += 1; },
          };
        },
      };
    },
  };
  const context = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
  const { id } = await saveSourceOnlyException({
    db, candidate, sourceRows: [sourceRow],
    directory: [], actorUid: "admin-uid", context,
  });
  assert.equal(documents.get(id).active, true);
  assert.equal(documents.get(id).staffId, null);
  const result = await releaseSourceOnlyException({ db, id, actorUid: "admin-uid", context });
  assert.equal(result.alreadyReleased, false);
  assert.equal(documents.get(id).active, false);
  assert.ok(documents.get(id).releasedAt);
  assert.equal((await releaseSourceOnlyException({ db, id, actorUid: "admin-uid", context })).alreadyReleased, true);
  assert.equal(deleteCalls, 0);
  assert.deepEqual(new Set(collections), new Set(["health_mandatory_training_exceptions_qa"]));
});
