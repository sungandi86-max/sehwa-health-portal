import { randomUUID } from "node:crypto";
import { isCurrentPortalItem } from "../../src/lib/portalSchedule.js";

const COLLECTION_PREFIX = "portal_content";
const CONFIG_ID = "_config";
const TYPE_FIELDS = {
  notice: ["titleLine1", "titleLine2", "date", "target", "actionText", "status", "badgeType"],
  faq: [],
  health_event: ["buttonText"],
  education: ["target", "duration", "schedule", "confirmation", "buttonText", "status"],
  checkup: ["target", "details", "buttonLabel", "linkText", "status", "displayMode", "operationStatus",
    "imageUrl", "downloadUrl", "secondaryButtonLabel", "secondaryAction", "copyText", "updateNotice"],
};

export class CmsInputError extends Error {}

const text = (value) => String(value ?? "").normalize("NFKC").trim();

export function cmsEnvironment(context = process.env) {
  if (context.VERCEL_ENV === "production" && context.VERCEL_GIT_COMMIT_REF === "main") return "production";
  if (context.VERCEL_ENV === "preview" && context.VERCEL_GIT_COMMIT_REF === "qa") return "qa";
  throw new CmsInputError("승인된 배포 환경에서만 콘텐츠를 사용할 수 있습니다.");
}

export function cmsCollection(context = process.env) {
  return `${COLLECTION_PREFIX}_${cmsEnvironment(context)}`;
}

export function dateKey(value) {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?$/);
  if (!match) throw new CmsInputError("노출일은 YYYY-MM-DD 형식이어야 합니다.");
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new CmsInputError("유효한 노출일을 입력해 주세요.");
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function sorted(records) {
  return [...records].sort((a, b) => a.sortOrder - b.sortOrder
    || Number(a.legacy?.sourceRow || 9999) - Number(b.legacy?.sourceRow || 9999)
    || a.id.localeCompare(b.id));
}

function publicItem(record) {
  const f = record.fields || {};
  const publicUrl = [record.link, record.attachment].find((value) => isSafeLink(value)) || "";
  if (record.type === "checkup") {
    const details = String(f.details || "").split(/\r?\n|<br\s*\/?>/i).map((item) => item.trim()).filter(Boolean);
    const schedule = details.find((detail) => /(?:\d{4}\s*[.\/-]\s*)?\d{1,2}\s*(?:월|[.\/-])\s*\d{1,2}\s*일?/.test(detail)) || "";
    const checkupLink = isSafeLink(record.link) ? record.link : "";
    return {
      title: record.title, description: record.content, target: f.target || "", schedule, details,
      buttonText: f.buttonLabel || "", url: checkupLink || (f.linkText === "안내문 링크" ? f.linkText : ""), status: f.status || "안내 중",
      displayMode: (f.displayMode || "link").toLowerCase(), operatingStatus: f.operationStatus || "",
      imageUrl: isSafeLink(f.imageUrl) ? f.imageUrl || "" : "", downloadUrl: isSafeLink(f.downloadUrl) ? f.downloadUrl || "" : "",
      secondaryText: f.secondaryButtonLabel || "",
      secondaryAction: (f.secondaryAction || "").toLowerCase(), copyText: f.copyText || "",
      updateNotice: f.updateNotice || "",
    };
  }
  if (record.type === "notice") return {
    title: record.title, titleLines: [f.titleLine1, f.titleLine2].filter(Boolean),
    date: f.date || "", target: f.target || "", description: record.content,
    actionText: f.actionText || "", status: f.status || "안내 중", badgeType: f.badgeType || "blue",
  };
  if (record.type === "faq") return { question: record.title, answer: record.content };
  if (record.type === "health_event") return {
    title: record.title, category: record.category || "기타", description: record.content,
    buttonText: f.buttonText || "자료 열기", url: publicUrl,
  };
  return {
    title: record.title, target: f.target || "", duration: f.duration || "",
    schedule: f.schedule || "", description: record.content, confirmation: f.confirmation || "",
    buttonText: f.buttonText || "", url: publicUrl, status: f.status || "자료",
  };
}

function isPublic(record, now) {
  if (record.active !== true || record.visible !== true) return false;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (record.startAt && today < record.startAt) return false;
  if (record.endAt && today > record.endAt) return false;
  return record.type !== "notice" || isCurrentPortalItem(publicItem(record), now);
}

export function cmsPublicItems(records, type, now = new Date()) {
  if (!Object.hasOwn(TYPE_FIELDS, type)) throw new CmsInputError("알 수 없는 콘텐츠 유형입니다.");
  return sorted(records.filter((record) => record.type === type && isPublic(record, now))).map(publicItem);
}

export function cmsRecordsFromSnapshot(snapshot) {
  const records = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  const config = records.find((record) => record.id === CONFIG_ID);
  if (!config || config.kind !== "config" || config.migrationComplete !== true) {
    throw new CmsInputError("콘텐츠 저장소가 아직 준비되지 않았습니다.");
  }
  return records.filter((record) => record.kind === "item");
}

export async function readCms(db, { context = process.env } = {}) {
  const snapshot = await db.collection(cmsCollection(context)).get();
  return sorted(cmsRecordsFromSnapshot(snapshot));
}

function bounded(value, limit, label) {
  const normalized = text(value);
  if (normalized.length > limit) throw new CmsInputError(`${label} 입력 길이를 확인해 주세요.`);
  return normalized;
}

export function isSafeLink(value) {
  const link = text(value);
  if (!link || /^\/(?!\/)[a-z0-9/_-]*$/i.test(link) || link === "inbody") return true;
  try {
    const url = new URL(link);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function safeLink(value) {
  const link = bounded(value, 1000, "링크");
  if (!isSafeLink(link)) {
    throw new CmsInputError("링크는 HTTPS 주소 또는 포털 내부 경로여야 합니다.");
  }
  return link;
}

export function validateCmsInput(input) {
  const type = text(input?.type);
  if (!Object.hasOwn(TYPE_FIELDS, type)) throw new CmsInputError("콘텐츠 유형을 확인해 주세요.");
  const title = bounded(input.title, 200, "제목");
  const content = bounded(input.content, 5000, "내용");
  if (!title || !content) throw new CmsInputError("제목과 내용이 필요합니다.");
  const sortOrder = Number(input.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 100000) throw new CmsInputError("정렬순서를 확인해 주세요.");
  const startAt = dateKey(input.startAt);
  const endAt = dateKey(input.endAt);
  if (startAt && endAt && startAt > endAt) throw new CmsInputError("노출 종료일이 시작일보다 빠릅니다.");
  const fields = Object.fromEntries(TYPE_FIELDS[type].map((key) => [key, bounded(input.fields?.[key], 1000, key)]));
  if (type === "checkup") {
    if (!["link", "pending", "image"].includes(fields.displayMode || "link")
      || !["", "notice"].includes(fields.secondaryAction)) throw new CmsInputError("검진 안내 동작을 확인해 주세요.");
    if (!isSafeLink(fields.imageUrl) || !isSafeLink(fields.downloadUrl)) {
      throw new CmsInputError("검진 안내 이미지·다운로드 링크를 확인해 주세요.");
    }
    if (fields.linkText && fields.linkText !== "안내문 링크") {
      throw new CmsInputError("링크 준비 문구를 확인해 주세요.");
    }
  }
  return { type, title, content, category: bounded(input.category, 100, "카테고리"),
    link: safeLink(input.link), attachment: safeLink(input.attachment), fields,
    visible: input.visible === true, sortOrder, startAt, endAt };
}

export async function saveCmsItem(db, { action, id, input, actorUid, context = process.env }) {
  const collection = db.collection(cmsCollection(context));
  const now = new Date().toISOString();
  if (["deactivate", "restore", "hide", "show"].includes(action)) {
    const ref = collection.doc(id);
    const current = await ref.get();
    if (!current.exists || current.data()?.kind !== "item") throw new CmsInputError("콘텐츠 항목을 찾지 못했습니다.");
    if (["restore", "show"].includes(action) && (!isSafeLink(current.data()?.link) || !isSafeLink(current.data()?.attachment)
      || (current.data()?.type === "checkup" && (!isSafeLink(current.data()?.fields?.imageUrl)
        || !isSafeLink(current.data()?.fields?.downloadUrl))))) {
      throw new CmsInputError("공개하기 전에 링크를 안전한 주소로 수정해 주세요.");
    }
    const change = action === "deactivate" ? { active: false }
      : action === "restore" ? { active: true }
        : { visible: action === "show" };
    await ref.update({ ...change, updatedAt: now, updatedBy: actorUid });
    return { id };
  }
  if (!["add", "update"].includes(action)) throw new CmsInputError("지원하지 않는 변경입니다.");
  const validated = validateCmsInput(input);
  const records = await readCms(db, { context });
  if (records.some((item) => item.id !== id && item.type === validated.type && item.title === validated.title)) {
    throw new CmsInputError("같은 유형에 동일한 제목이 이미 있습니다.");
  }
  if (action === "add") {
    const itemId = `${validated.type}_${randomUUID()}`;
    await collection.doc(itemId).create({ kind: "item", schemaVersion: 1, ...validated,
      active: true, createdAt: now, updatedAt: now, createdBy: actorUid, updatedBy: actorUid });
    return { id: itemId };
  }
  const ref = collection.doc(id);
  const current = await ref.get();
  if (!current.exists || current.data()?.kind !== "item" || current.data()?.type !== validated.type) {
    throw new CmsInputError("수정할 콘텐츠를 찾지 못했습니다.");
  }
  await ref.update({ ...validated, updatedAt: now, updatedBy: actorUid });
  return { id };
}
