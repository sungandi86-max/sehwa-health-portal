import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDirectory } from "./staffDirectory.js";

const header = ["교직원ID", "제출대상", "직책", "성명", "소속부서", "재직상태"];

test("canonical reader preserves rows and exposes valid employment status", () => {
  const result = normalizeDirectory([
    header,
    ["T001", "대상", "교사", "재직교사", "교무부", "재직"],
    ["T002", "대상", "교사", "휴직교사", "교무부", "휴직"],
    ["T003", "대상", "교사", "퇴직교사", "교무부", "퇴직"],
  ]);

  assert.equal(result.directory.length, 3);
  assert.deepEqual(result.stats.employmentStatus, { 재직: 1, 휴직: 1, 퇴직: 1 });
  assert.equal(result.stats.invalidEmploymentStatus, 0);
  assert.equal(result.directory[0].employmentStatus, "재직");
});

test("canonical reader fails closed on blank or unknown employment status", () => {
  const values = [
    header,
    ["T001", "대상", "교사", "공란", "교무부", ""],
    ["T002", "대상", "교사", "오류", "교무부", "재직중"],
  ];

  assert.throws(() => normalizeDirectory(values), /재직상태/);
  const diagnostic = normalizeDirectory(values, { allowInvalidEmploymentStatus: true });
  assert.equal(diagnostic.directory.length, 2);
  assert.equal(diagnostic.stats.invalidEmploymentStatus, 2);
});

test("canonical reader exposes report classification columns without changing staff identity", () => {
  const values = [
    [...header, "고위직여부", "신규자여부", "비정규직여부"],
    ["T001", "대상", "교장", "가교장", "관리자", "재직", "O", "", ""],
  ];
  const result = normalizeDirectory(values);
  assert.equal(result.stats.reportFlagColumnsPresent, true);
  assert.equal(result.directory[0].staffId, "T001");
  assert.equal(result.directory[0].seniorLeader, "O");
  assert.equal(result.directory[0].newEmployee, "");
  assert.equal(result.directory[0].nonRegular, "");
});
