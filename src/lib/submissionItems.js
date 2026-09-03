import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";
import { isContentVisible } from "./contentVisibility.js";

const V2_SUBMISSION_ITEM_IDS = new Set(["cpr", "tb", "recruit", "infection"]);

export function normalizeSubmissionItem(docSnapshot) {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    title: data.title || "",
    titleLine1: data.titleLine1 || null,
    titleLine2: data.titleLine2 || null,
    description: data.description || null,
    target: data.target || null,
    documentType: data.documentType || null,
    deadlineLabel: data.deadlineLabel || null,
    guideText: data.guideText || null,
    buttonLabel: data.buttonLabel || null,
    legacyLink: data.legacyLink || null,
    status: data.status || null,
    legacyType: data.legacyType || null,
    submissionType: data.submissionType || docSnapshot.id,
    highlight: data.highlight === true,
    order: Number.isFinite(Number(data.order)) ? Number(data.order) : 999,
    enabled: data.enabled === true,
    startAt: data.startAt || null,
    endAt: data.endAt || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getSubmissionItem(itemId, now = new Date()) {
  const snapshot = await getDoc(doc(db, "submission_items", itemId));
  if (!snapshot.exists()) return null;

  const item = normalizeSubmissionItem(snapshot);
  return isContentVisible(item, now) ? item : null;
}

export async function getActiveSubmissionItems(now = new Date()) {
  const snapshot = await getDocs(collection(db, "submission_items"));

  return snapshot.docs
    .map(normalizeSubmissionItem)
    .filter((item) => V2_SUBMISSION_ITEM_IDS.has(item.submissionType))
    .filter((item) => isContentVisible(item, now))
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.title.localeCompare(right.title, "ko");
    });
}
