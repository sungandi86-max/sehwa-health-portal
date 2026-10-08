import assert from "node:assert/strict";
import test from "node:test";
import { CHECKUP_HEADERS, planCheckupCmsMigration } from "./checkupCmsMigration.js";
import { cmsPublicItems } from "./portalContentCms.js";

const row = (values) => CHECKUP_HEADERS.map((header) => values[header] ?? "");
const values = [CHECKUP_HEADERS,
  row({ 사용여부: "TRUE", 제목: "1학년 건강검진 안내", 설명: "검진 안내", 대상: "1학년", 세부항목: "일정 확인\n준비 안내", 버튼명: "안내 보기", 링크: "https://example.org/checkup", 상태: "안내 중", 정렬순서: "1", 표시방식: "link", 운영표상태: "확정" }),
  row({ 사용여부: "TRUE", 제목: "2·3학년 결핵검진 안내", 설명: "결핵 안내", 대상: "2·3학년", 세부항목: "6월 26일(금) 검진버스에서\n학급별 운영표 업데이트 예정", 버튼명: "운영표 보기", 링크: "안내문 링크", 상태: "안내 중", 정렬순서: "2", 표시방식: "pending", 운영표상태: "업데이트 예정", 업데이트안내: "D-3에 업데이트 예정" }),
];
const config = { id: "_config", kind: "config", migrationComplete: true, counts: { notice: 3, faq: 9, health_event: 3, education: 9 } };
const existingNotice = { id: "notice_existing", kind: "item", type: "notice", title: "기존 공지" };

test("checkup migration maps exact headers, legacy placeholders and public output", () => {
  const plan = planCheckupCmsMigration(values, [config, existingNotice]);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.operations, { create: 2, update: 1, skip: 1, conflict: 0 });
  assert.equal(plan.records.length, 2);
  assert.equal(plan.records[0].legacy.sourceRow, 2);
  assert.equal(plan.records[0].link, "https://example.org/checkup");
  assert.equal(plan.records[1].link, "");
  assert.equal(plan.records[1].fields.linkText, "안내문 링크");
  assert.equal(plan.records[1].fields.displayMode, "pending");
  assert.deepEqual(cmsPublicItems(plan.records, "checkup")[1], {
    title: "2·3학년 결핵검진 안내", description: "결핵 안내", target: "2·3학년",
    schedule: "6월 26일(금) 검진버스에서", details: ["6월 26일(금) 검진버스에서", "학급별 운영표 업데이트 예정"],
    buttonText: "운영표 보기", url: "안내문 링크", status: "안내 중", displayMode: "pending",
    operatingStatus: "업데이트 예정", imageUrl: "", downloadUrl: "", secondaryText: "",
    secondaryAction: "", copyText: "", updateNotice: "D-3에 업데이트 예정",
  });
});

test("checkup migration is additive, conflict-aware and idempotent", () => {
  const first = planCheckupCmsMigration(values, [config, existingNotice]);
  const migrated = [existingNotice, ...first.records, { ...config, counts: first.configCounts }];
  const second = planCheckupCmsMigration(values, migrated);
  assert.deepEqual(second.operations, { create: 0, update: 0, skip: 4, conflict: 0 });
  assert.deepEqual(second.conflicts, []);
  assert.equal(migrated[0], existingNotice);
  const conflicting = planCheckupCmsMigration(values, [config, existingNotice, { ...first.records[0], content: "관리자 수정" }]);
  assert.equal(conflicting.operations.conflict, 1);
  assert.equal(conflicting.operations.create, 1);
});

test("checkup migration fails closed on schema drift and unsafe media links", () => {
  const changed = values.map((item) => [...item]);
  changed[0][0] = "잘못된 헤더";
  assert.equal(planCheckupCmsMigration(changed, [config]).operations.conflict > 0, true);
  const unsafe = values.map((item) => [...item]);
  unsafe[1][CHECKUP_HEADERS.indexOf("이미지URL")] = "javascript:alert(1)";
  assert.equal(planCheckupCmsMigration(unsafe, [config]).operations.conflict > 0, true);
});

test("checkup migration does not disguise unexpected parser failures as row conflicts", () => {
  const broken = [...values[1]];
  Object.defineProperty(broken, 1, { get() { throw new Error("parser failure"); } });
  assert.throws(() => planCheckupCmsMigration([CHECKUP_HEADERS, broken], [config]), /parser failure/);
});
