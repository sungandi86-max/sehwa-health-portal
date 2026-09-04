import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";

function normalizeOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 999;
}

function sortHealthResources(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title, "ko");
}

export function normalizeHealthResource(docSnapshot) {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    title: data.title || "",
    category: data.category || "기타",
    description: data.description || "",
    buttonText: data.buttonText || data.buttonLabel || "자료 열기",
    url: data.url || data.linkUrl || "",
    active: data.active === true,
    order: normalizeOrder(data.sortOrder ?? data.order),
    source: data.source || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getAllHealthResources() {
  const snapshot = await getDocs(collection(db, "health_resources"));

  return snapshot.docs.map(normalizeHealthResource).sort(sortHealthResources);
}

export async function getActiveHealthResources() {
  const resources = await getAllHealthResources();

  return resources.filter((resource) => resource.active);
}
