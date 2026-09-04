import { collection, getDocs, query, where } from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { db } from "./firebase.js";

const COLLECTION_NAME = "student_care_presence_public";
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

function getKstToday() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

function sortPresenceRows(a, b) {
  const aCurrent = a.status === "현재 이용중" ? 0 : 1;
  const bCurrent = b.status === "현재 이용중" ? 0 : 1;
  if (aCurrent !== bCurrent) return aCurrent - bCurrent;
  return String(b.enteredAt || "").localeCompare(String(a.enteredAt || ""));
}

function mapPresenceDocument(snapshot) {
  const data = snapshot.data();
  return {
    rowId: data.sourceRef?.rowNumber ? String(data.sourceRef.rowNumber) : snapshot.id,
    studentNo: data.studentNo || [data.grade, data.classNo, data.number].filter(Boolean).join("-"),
    maskedName: data.maskedName || "",
    enteredAt: data.enteredAt || "",
    returnedAt: data.returnedAt || "",
    status: data.status || "",
    syncedAt: data.syncedAt || null,
  };
}

export async function getPublicHealthRoomPresence({ date = getKstToday() } = {}) {
  const snapshot = await getDocs(query(
    collection(db, COLLECTION_NAME),
    where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
    where("semester", "==", CURRENT_SEMESTER),
    where("date", "==", date)
  ));

  const rows = snapshot.docs.map(mapPresenceDocument).sort(sortPresenceRows);
  const syncedTimes = snapshot.docs
    .map((docSnapshot) => toMillis(docSnapshot.data().syncedAt))
    .filter((value) => value !== null);
  const latestSyncedAt = syncedTimes.length ? Math.max(...syncedTimes) : null;
  const stale = latestSyncedAt !== null && Date.now() - latestSyncedAt > STALE_THRESHOLD_MS;

  return {
    rows,
    date,
    stale,
    latestSyncedAt,
  };
}
