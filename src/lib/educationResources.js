import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";

function normalizeOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 999;
}

function sortEducationResources(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title, "ko");
}

export function normalizeEducationResource(docSnapshot) {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    title: data.title || "",
    description: data.description || "",
    category: data.category || null,
    target: data.target || null,
    duration: data.duration || null,
    schedule: data.schedule || null,
    confirmation: data.confirmation || null,
    status: data.status || null,
    enabled: data.enabled === true,
    linkUrl: data.linkUrl || null,
    linkLabel: data.linkLabel || data.buttonText || null,
    order: normalizeOrder(data.order),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getAllEducationResources() {
  const snapshot = await getDocs(collection(db, "education_resources"));

  return snapshot.docs.map(normalizeEducationResource).sort(sortEducationResources);
}

export async function getActiveEducationResources() {
  const resources = await getAllEducationResources();

  return resources.filter((resource) => resource.enabled);
}
