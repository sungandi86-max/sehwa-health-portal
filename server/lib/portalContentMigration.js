import { createHash } from "node:crypto";
import { CmsInputError, dateKey, isSafeLink } from "./portalContentCms.js";

export const CMS_SHEETS = {
  notice: { name: "앱_공지", headers: ["사용여부", "제목", "제목1줄", "제목2줄", "일시", "대상", "내용", "이동안내", "상태", "배지색", "정렬순서", "노출시작일", "노출종료일", "노출상태"] },
  faq: { name: "앱_FAQ", headers: ["사용여부", "질문", "답변", "정렬순서"] },
  health_event: { name: "앱_건강정보/이벤트", headers: ["사용여부", "제목", "카테고리", "설명", "버튼명", "링크", "정렬순서"] },
  education: { name: "앱_교육자료", headers: ["사용여부", "교육명", "대상", "소요시간", "일정", "설명", "확인방법", "버튼명", "링크", "상태", "정렬순서"] },
};

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const enabled = (value) => ["TRUE", "Y", "YES", "1", "사용"].includes(text(value).toUpperCase());
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function sourceRecord(type, row, headers, rowNumber, sheetName) {
  const value = (name) => text(row[headers.indexOf(name)]);
  const title = value(type === "faq" ? "질문" : type === "education" ? "교육명" : "제목");
  const content = value(type === "faq" ? "답변" : type === "notice" ? "내용" : "설명");
  if (!title || !content) throw new CmsInputError("제목과 내용이 없는 행은 이관할 수 없습니다.");
  const order = Number(value("정렬순서"));
  const fields = type === "notice" ? {
    titleLine1: value("제목1줄"), titleLine2: value("제목2줄"), date: value("일시"),
    target: value("대상"), actionText: value("이동안내"), status: value("상태"), badgeType: value("배지색"),
  } : type === "education" ? {
    target: value("대상"), duration: value("소요시간"), schedule: value("일정"),
    confirmation: value("확인방법"), buttonText: value("버튼명"), status: value("상태"),
  } : type === "health_event" ? { buttonText: value("버튼명") } : {};
  const active = enabled(value("사용여부"));
  if (active && ["education", "health_event"].includes(type) && !isSafeLink(value("링크"))) {
    throw new CmsInputError("공개 링크가 안전한 주소가 아닙니다.");
  }
  return {
    id: `${type}_${digest([type, title]).slice(0, 20)}`, kind: "item", schemaVersion: 1,
    type, title, content, category: type === "health_event" ? value("카테고리") : "",
    link: ["education", "health_event"].includes(type) ? value("링크") : "",
    attachment: "", fields, active, visible: active,
    startAt: type === "notice" ? dateKey(value("노출시작일")) : "",
    endAt: type === "notice" ? dateKey(value("노출종료일")) : "",
    sortOrder: Number.isFinite(order) && order > 0 ? order : 999,
    legacy: { sheetName, sourceRow: rowNumber, fingerprint: digest(row.map(text)) },
  };
}

export function planCmsMigration(sheets, existingRecords = []) {
  const records = [];
  const conflicts = [];
  const counts = {};
  const seen = new Set();
  for (const [type, definition] of Object.entries(CMS_SHEETS)) {
    const values = sheets[type] || [];
    const headers = (values[0] || []).map(text);
    if (definition.headers.some((header, index) => headers[index] !== header)) {
      conflicts.push({ type, row: 1, code: "header_mismatch" });
      continue;
    }
    counts[type] = 0;
    values.slice(1).forEach((row, index) => {
      if (!row.some((cell) => text(cell))) return;
      try {
        const record = sourceRecord(type, row, headers, index + 2, definition.name);
        if (seen.has(record.id)) { conflicts.push({ type, row: index + 2, code: "duplicate_title" }); return; }
        seen.add(record.id);
        records.push(record);
        counts[type] += 1;
      } catch (error) {
        conflicts.push({ type, row: index + 2, code: error instanceof CmsInputError ? "invalid_row" : "unknown_row_error" });
      }
    });
  }
  const config = { id: "_config", kind: "config", schemaVersion: 1, migrationComplete: true, counts };
  const expected = [config, ...records];
  const alreadyMigrated = existingRecords.length === expected.length && expected.every((item) => {
    const actual = existingRecords.find((record) => record.id === item.id);
    return actual && Object.entries(item).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
  });
  if (existingRecords.length && !alreadyMigrated) conflicts.push({ type: "all", row: 0, code: "existing_firestore_docs" });
  return { records: expected, counts, conflicts, alreadyMigrated };
}
