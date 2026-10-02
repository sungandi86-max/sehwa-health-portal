import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSnapshotPlan,
  summarizePlan,
  summarizeSourceOnlyExceptions,
} from "./healthMandatoryTrainingAnalysis.js";
import { assertSafeApply, writeSnapshotPlan } from "./healthMandatoryTrainingDryRun.js";

const exceptionHeader = [["적용연도", "성명", "직책", "제외사유", "확인상태", "비고"]];

function directoryItem(staffId, name, position, employmentStatus, target = "대상") {
  return { staffId, name, position, department: "부서", employmentStatus, target };
}

function sourceRow(realName, position, sourceStatus = "이수완료") {
  return { realName, position, department: "부서", sourceStatus };
}

test("employment status and target rules classify source rows without weakening exact matching", () => {
  const directory = [
    directoryItem("T001", "재직교사", "교사", "재직"),
    directoryItem("T002", "휴직교사", "교사", "휴직"),
    directoryItem("T003", "퇴직교사", "교사", "퇴직"),
    directoryItem("T004", "시간강사", "시간강사", "재직"),
    directoryItem("T005", "누락교사", "교사", "재직"),
  ];
  const sourceRows = [
    sourceRow("재직교사", "교사"),
    sourceRow("휴직교사", "교사"),
    sourceRow("퇴직교사", "교사"),
    sourceRow("시간강사", "시간강사"),
  ];
  const exceptions = summarizeSourceOnlyExceptions(exceptionHeader, 2026);
  const plan = summarizePlan(sourceRows, directory, exceptions, { taskYear: 2026 });
  const snapshot = buildSnapshotPlan(sourceRows, directory, exceptions, { taskYear: 2026 });

  assert.equal(plan.matchedActive, 1);
  assert.equal(plan.excludedLeave, 1);
  assert.equal(plan.excludedRetired, 1);
  assert.equal(plan.excludedByTargetRule, 1);
  assert.equal(plan.canonicalActiveMissingFromSource, 1);
  assert.equal(snapshot.docs.length, 1);
  assert.equal(snapshot.docs[0].data.staffId, "T001");
});

test("only confirmed current-year exact name and position exceptions exclude source-only rows", () => {
  const exceptions = summarizeSourceOnlyExceptions(
    [
      ...exceptionHeader,
      [2026, "확인퇴직자", "교사", "퇴직", "확인완료", ""],
      [2026, "직책불일치", "행정실", "퇴직", "확인완료", ""],
      [2025, "과거연도", "교사", "퇴직", "확인완료", ""],
    ],
    2026
  );
  const plan = summarizePlan(
    [
      sourceRow("확인퇴직자", "교사"),
      sourceRow("직책불일치", "교사"),
      sourceRow("과거연도", "교사"),
    ],
    [],
    exceptions,
    { taskYear: 2026 }
  );

  assert.equal(plan.confirmedSourceOnlyExcluded, 1);
  assert.equal(plan.unresolvedSourceOnly, 2);
});

test("invalid employment status, ambiguous matches, and duplicate staff ids remain blocking signals", () => {
  const exceptions = summarizeSourceOnlyExceptions(exceptionHeader, 2026);
  const directory = [
    directoryItem("T001", "상태오류", "교사", ""),
    directoryItem("T002", "동명이인", "교사", "재직"),
    directoryItem("T003", "동명이인", "교사", "재직"),
    directoryItem("T004", "중복A", "교사", "재직"),
    directoryItem("T004", "중복B", "교사", "재직"),
  ];
  const plan = summarizePlan(
    [sourceRow("상태오류", "교사"), sourceRow("동명이인", "교사"), sourceRow("중복A", "교사"), sourceRow("중복B", "교사")],
    directory,
    exceptions,
    { taskYear: 2026 }
  );

  assert.equal(plan.invalidEmploymentStatus, 1);
  assert.equal(plan.ambiguous, 1);
  assert.equal(plan.duplicateStaffIds, 1);
  assert.equal(plan.duplicateCanonicalStaffIds, 1);
});

test("safe apply requires no unresolved source-only or canonical active source gaps", () => {
  const source = {
    headerInfo: { parseStatus: "success", indexes: { realName: 0, position: 1, status: 2 } },
    stats: { validRows: 1 },
  };
  const exceptions = summarizeSourceOnlyExceptions(exceptionHeader, 2026);
  const safePlan = {
    matchedActive: 1,
    invalidEmploymentStatus: 0,
    invalidExceptionRows: 0,
    duplicateConfirmedExceptions: 0,
    unresolvedSourceOnly: 0,
    canonicalActiveMissingFromSource: 0,
    ambiguous: 0,
    duplicateStaffIds: 0,
    duplicateCanonicalStaffIds: 0,
  };
  const snapshot = { docs: [{ id: "T001_health-mandatory-training-2026" }], duplicateStaffIds: 0 };

  assert.doesNotThrow(() => assertSafeApply(source, exceptions, safePlan, snapshot, true));
  assert.throws(
    () => assertSafeApply(source, exceptions, { ...safePlan, canonicalActiveMissingFromSource: 1 }, snapshot, true),
    /연구부 명단에 없는 현재 재직 대상자/
  );
  assert.throws(
    () => assertSafeApply(source, exceptions, { ...safePlan, unresolvedSourceOnly: 1 }, snapshot, true),
    /source-only/
  );
  assert.throws(
    () => assertSafeApply({ ...source, stats: { validRows: 1, missingNameRows: 1 } }, exceptions, safePlan, snapshot, true),
    /성명 또는 직책/
  );
  assert.throws(() => assertSafeApply(source, exceptions, safePlan, snapshot, false), /활성화/);
  assert.throws(
    () => assertSafeApply(source, exceptions, safePlan, { docs: [], duplicateStaffIds: 0 }, true),
    /문서 수/
  );
});

test("snapshot writer only upserts planned documents and never deletes existing history", async () => {
  const calls = { set: 0, delete: 0, commit: 0 };
  const db = {
    batch() {
      return {
        set() {
          calls.set += 1;
        },
        delete() {
          calls.delete += 1;
        },
        async commit() {
          calls.commit += 1;
        },
      };
    },
    collection() {
      return { doc: (id) => ({ id }) };
    },
  };

  await writeSnapshotPlan({
    db,
    docs: [
      { id: "T001_health-mandatory-training-2026", data: { staffId: "T001" } },
      { id: "T002_health-mandatory-training-2026", data: { staffId: "T002" } },
    ],
  });

  assert.deepEqual(calls, { set: 2, delete: 0, commit: 1 });
});
