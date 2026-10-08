import { createHash, randomUUID } from "node:crypto";

const COLLECTION_PREFIX = "portal_roadmap";
const CONFIG_ID = "_config";
const STATUSES = new Set(["not_started", "in_progress", "done"]);
const TOOL_TYPES = new Set(["external", "internal", "sheet", "info"]);

export const ROADMAP_HEADERS = [
  "사용여부", "업무분류", "업무명", "단계", "지금할일", "온라인보건실_열메뉴",
  "온라인보건실_숨김메뉴", "안내대상", "메신저제목", "메신저문구", "개인정보주의",
  "관련시트", "관련메뉴ID", "정렬순서", "관련도구1_이름", "관련도구1_유형",
  "관련도구1_URL", "관련도구2_이름", "관련도구2_유형", "관련도구2_URL",
  "관련도구3_이름", "관련도구3_유형", "관련도구3_URL", "관련시트_URL",
];

export class RoadmapInputError extends Error {}

export function roadmapEnvironment(context = process.env) {
  if (context.VERCEL_ENV === "preview" && context.VERCEL_GIT_COMMIT_REF === "qa") return "qa";
  if (context.VERCEL_ENV === "production" && context.VERCEL_GIT_COMMIT_REF === "main") return "production";
  throw new RoadmapInputError("승인된 배포 환경에서만 업무 로드맵을 사용할 수 있습니다.");
}

export function roadmapCollection(context = process.env) {
  return `${COLLECTION_PREFIX}_${roadmapEnvironment(context)}`;
}

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const enabled = (value) => ["TRUE", "Y", "YES", "1", "사용"].includes(text(value).toUpperCase());
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const present = (row) => row.slice(1).some((value) => text(value));

export function roadmapItemView(item) {
  return {
    id: item.id,
    category: item.category,
    taskName: item.taskName,
    step: item.step,
    todo: item.todo,
    openMenus: item.openMenus || "",
    hideMenus: item.hideMenus || "",
    audience: item.audience || "",
    messageTitle: item.messageTitle || "",
    messageBody: item.messageBody || "",
    privacyNote: item.privacyNote || "",
    relatedSheet: item.relatedSheet || "",
    relatedMenuId: item.relatedMenuId || "",
    relatedSheetUrl: item.relatedSheetUrl || "",
    sheetUrl: item.relatedSheetUrl || "",
    tools: item.tools || [],
    sortOrder: Number(item.sortOrder) || 999,
    status: item.status || "not_started",
    scheduledDate: item.scheduledDate || "",
    dueDate: item.dueDate || "",
    owner: item.owner || "",
    note: item.note || "",
    visible: item.visible === true,
    active: item.active === true,
  };
}

export function roadmapViewFromRecords(records, { includeHidden = false } = {}) {
  const config = records.find((record) => record.id === CONFIG_ID);
  if (!config || config.kind !== "config") throw new RoadmapInputError("업무 로드맵 저장소가 아직 준비되지 않았습니다.");
  const items = records
    .filter((record) => record.kind === "item" && (includeHidden || (config.enabled === true && record.active === true && record.visible === true)))
    .map(roadmapItemView)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return { enabled: config.enabled === true, adminOnly: config.adminOnly === true, items };
}

export function planRoadmapMigration(values, settings, existingRecords = [], sourceName) {
  if (!sourceName) throw new RoadmapInputError("원본 식별자가 필요합니다.");
  const header = (values[0] || []).map(text);
  if (ROADMAP_HEADERS.some((name, index) => header[index] !== name)) {
    throw new RoadmapInputError("업무 로드맵 시트 헤더가 예상 구조와 다릅니다.");
  }
  const conflicts = [];
  const seen = new Set();
  const records = values.slice(1).flatMap((raw, index) => {
    const row = ROADMAP_HEADERS.map((_, col) => text(raw[col]));
    if (!present(row)) return [];
    const rowNumber = index + 2;
    const key = [row[1], row[2], row[3]].join("|");
    const order = Number(row[13]);
    if (!row[1] || !row[2] || !row[3] || !row[4] || !Number.isFinite(order) || seen.has(key)) {
      conflicts.push({ row: rowNumber, code: seen.has(key) ? "duplicate_step" : "invalid_required_field" });
      return [];
    }
    seen.add(key);
    const tools = [14, 17, 20].flatMap((col) => row[col] ? [{
      name: row[col], type: TOOL_TYPES.has(row[col + 1].toLowerCase()) ? row[col + 1].toLowerCase() : "info", url: row[col + 2],
    }] : []);
    return [{
      id: `step_2026_${String(rowNumber).padStart(3, "0")}`,
      kind: "item", schemaVersion: 1, schoolYear: 2026,
      category: row[1], taskName: row[2], step: row[3], todo: row[4],
      openMenus: row[5], hideMenus: row[6], audience: row[7], messageTitle: row[8],
      messageBody: row[9], privacyNote: row[10], relatedSheet: row[11], relatedMenuId: row[12],
      sortOrder: order, tools, relatedSheetUrl: row[23],
      status: "not_started", scheduledDate: "", dueDate: "", owner: "", note: "",
      visible: enabled(row[0]), active: true,
      legacy: { sheetName: sourceName, sheetRow: rowNumber, fingerprint: hash(row) },
    }];
  });
  const config = { id: CONFIG_ID, kind: "config", schemaVersion: 1, enabled: enabled(settings.enabled), adminOnly: enabled(settings.adminOnly) };
  const expected = [config, ...records];
  const alreadyMigrated = existingRecords.length === expected.length && expected.every((item) => {
    const actual = existingRecords.find((record) => record.id === item.id);
    return actual && Object.entries(item).every(([field, value]) => JSON.stringify(actual[field]) === JSON.stringify(value));
  });
  if (existingRecords.length && !alreadyMigrated) conflicts.push({ row: 0, code: "existing_firestore_docs" });
  return { records: expected, conflicts, alreadyMigrated, sourceRows: records.length };
}

export async function readRoadmap(db, { context = process.env, includeHidden = false } = {}) {
  const snapshot = await db.collection(roadmapCollection(context)).get();
  return roadmapViewFromRecords(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })), { includeHidden });
}

const FIELD_LIMITS = {
  category: 80, taskName: 120, step: 120, todo: 2000, openMenus: 300, hideMenus: 300,
  audience: 300, messageTitle: 200, messageBody: 3000, privacyNote: 1000,
  relatedSheet: 300, relatedMenuId: 80, relatedSheetUrl: 500, owner: 100, note: 1000,
};

export function validateRoadmapInput(input) {
  const result = Object.fromEntries(Object.entries(FIELD_LIMITS).map(([field, limit]) => {
    const value = text(input?.[field]);
    if (value.length > limit) throw new RoadmapInputError(`${field} 입력 길이를 확인해 주세요.`);
    return [field, value];
  }));
  if (!result.category || !result.taskName || !result.step || !result.todo) {
    throw new RoadmapInputError("업무분류·업무명·단계·지금할 일을 입력해 주세요.");
  }
  const sortOrder = Number(input?.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 100000) throw new RoadmapInputError("정렬순서를 확인해 주세요.");
  if (!STATUSES.has(input?.status)) throw new RoadmapInputError("업무 상태를 확인해 주세요.");
  for (const field of ["scheduledDate", "dueDate"]) {
    const date = text(input?.[field]);
    const parsed = date ? new Date(`${date}T00:00:00Z`) : null;
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== date)) {
      throw new RoadmapInputError("일정과 마감일은 YYYY-MM-DD 형식으로 입력해 주세요.");
    }
    result[field] = date;
  }
  const tools = Array.isArray(input?.tools) ? input.tools : [];
  if (tools.length > 3) throw new RoadmapInputError("관련 도구는 최대 3개입니다.");
  result.tools = tools.map((tool) => {
    const name = text(tool?.name), type = text(tool?.type).toLowerCase(), url = text(tool?.url);
    if (name.length > 120 || url.length > 500 || !TOOL_TYPES.has(type)) throw new RoadmapInputError("관련 도구 정보를 확인해 주세요.");
    if ((type === "external" || type === "sheet") && url && !/^https?:\/\//i.test(url)) throw new RoadmapInputError("관련 도구 URL은 http 또는 https만 사용할 수 있습니다.");
    return { name, type, url };
  }).filter((tool) => tool.name);
  if (result.relatedSheetUrl && !/^https?:\/\//i.test(result.relatedSheetUrl)) throw new RoadmapInputError("관련 시트 URL은 http 또는 https만 사용할 수 있습니다.");
  result.sortOrder = sortOrder;
  result.status = input.status;
  result.visible = input.visible === true;
  return result;
}

export async function saveRoadmapItem(db, { action, id, input, actorUid, context = process.env }) {
  const collection = db.collection(roadmapCollection(context));
  const config = await collection.doc(CONFIG_ID).get();
  if (!config.exists || config.data()?.kind !== "config") throw new RoadmapInputError("업무 로드맵 저장소가 아직 준비되지 않았습니다.");
  if (action === "update-config") {
    if (typeof input?.adminOnly !== "boolean") throw new RoadmapInputError("교직원 조회 설정을 확인해 주세요.");
    await collection.doc(CONFIG_ID).update({ adminOnly: input.adminOnly, updatedAt: new Date().toISOString(), updatedBy: actorUid });
    return { id: CONFIG_ID };
  }
  if (action === "add" || action === "update") {
    const data = validateRoadmapInput(input);
    const snapshot = await collection.get();
    const normalizedKey = [data.category, data.taskName, data.step].join("|");
    if (snapshot.docs.some((doc) => doc.id !== id && doc.data()?.kind === "item" && doc.data()?.active !== false
      && [doc.data().category, doc.data().taskName, doc.data().step].join("|") === normalizedKey)) {
      throw new RoadmapInputError("같은 업무와 단계가 이미 등록되어 있습니다.");
    }
    const itemId = action === "add" ? `step_${randomUUID()}` : String(id || "");
    const ref = collection.doc(itemId);
    const existing = action === "update" ? await ref.get() : null;
    if (action === "update" && (!existing.exists || existing.data()?.kind !== "item")) throw new RoadmapInputError("수정할 업무를 찾을 수 없습니다.");
    const now = new Date().toISOString();
    const next = { ...existing?.data(), ...data, kind: "item", schemaVersion: 1, id: itemId,
      active: existing?.data()?.active !== false, createdAt: existing?.data()?.createdAt || now, updatedAt: now, updatedBy: actorUid };
    if (action === "add") await ref.create(next);
    else await ref.set(next);
    return { id: itemId };
  }
  if (action === "deactivate" || action === "restore") {
    if (!/^step_[a-zA-Z0-9_-]{1,80}$/.test(String(id || ""))) throw new RoadmapInputError("업무 식별자가 올바르지 않습니다.");
    const ref = collection.doc(id);
    const existing = await ref.get();
    if (!existing.exists || existing.data()?.kind !== "item") throw new RoadmapInputError("업무를 찾을 수 없습니다.");
    await ref.update({ active: action === "restore", visible: action === "restore" ? existing.data()?.previousVisible === true : false,
      previousVisible: action === "deactivate" ? existing.data()?.visible === true : null,
      updatedAt: new Date().toISOString(), updatedBy: actorUid });
    return { id };
  }
  throw new RoadmapInputError("지원하지 않는 업무 작업입니다.");
}
