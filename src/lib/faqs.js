import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";

function normalizeOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 999;
}

function sortFaqs(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.question.localeCompare(b.question, "ko");
}

export function normalizeFaq(docSnapshot) {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    question: data.question || "",
    answer: data.answer || "",
    category: data.category || null,
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    enabled: data.enabled === true,
    order: normalizeOrder(data.order),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getAllFaqs() {
  const snapshot = await getDocs(collection(db, "faqs"));

  return snapshot.docs.map(normalizeFaq).sort(sortFaqs);
}

export async function getActiveFaqs() {
  const faqs = await getAllFaqs();

  return faqs.filter((faq) => faq.enabled);
}

export function searchFaqs(items, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return items;

  return items.filter((item) => {
    const question = String(item.question || "").toLowerCase();
    const answer = String(item.answer || "").toLowerCase();
    return question.includes(normalizedQuery) || answer.includes(normalizedQuery);
  });
}
