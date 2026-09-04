import { collection, getDocs, query, where } from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { db } from "./firebase.js";

const PUBLIC_COLLECTION_NAME = "student_care_presence_public";
const HOMEROOM_COLLECTION_NAME = "student_care_presence_homeroom";
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

function sortMonthlyRows(a, b) {
  const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
  if (dateCompare !== 0) return dateCompare;
  return Number(a.number || 0) - Number(b.number || 0);
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

function mapHomeroomPresenceDocument(snapshot) {
  const data = snapshot.data();
  return {
    rowId: data.sourceRef?.rowNumber ? String(data.sourceRef.rowNumber) : snapshot.id,
    studentNo: data.studentNo || [data.grade, data.classNo, data.number].filter(Boolean).join("-"),
    maskedName: data.maskedName || "",
    enteredAt: data.enteredAt || "",
    returnedAt: data.returnedAt || "",
    status: data.status || "",
    date: data.date || "",
    duration: data.duration || "",
    attendanceNote: data.attendanceNote || "",
    homeroomConfirmed: data.homeroomConfirmed === true,
    syncedAt: data.syncedAt || null,
  };
}

function mapHomeroomMonthlyDocument(snapshot) {
  const data = snapshot.data();
  return {
    rowId: data.sourceRef?.rowNumber ? String(data.sourceRef.rowNumber) : snapshot.id,
    date: formatMonthlyDate(data.date),
    number: String(data.number || ""),
    name: data.maskedName || "",
    inTime: data.enteredAt || "",
    outTime: data.returnedAt || "",
    stay: data.duration || "",
    result: data.resultCategory || "",
    teacherChecked: data.homeroomConfirmed === true ? "확인" : "미확인",
    syncedAt: data.syncedAt || null,
  };
}

function formatMonthlyDate(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(date || "");
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function getPreviousMonth(month) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 2, 1));
  return date.toISOString().slice(0, 7);
}

function getRecentStartDate(date) {
  const current = new Date(`${date}T00:00:00+09:00`);
  current.setUTCDate(current.getUTCDate() - 7);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(current);
}

function getLatestSyncedAt(docs) {
  const syncedTimes = docs
    .map((docSnapshot) => toMillis(docSnapshot.data().syncedAt))
    .filter((value) => value !== null);
  return syncedTimes.length ? Math.max(...syncedTimes) : null;
}

function isStale(latestSyncedAt) {
  return latestSyncedAt !== null && Date.now() - latestSyncedAt > STALE_THRESHOLD_MS;
}

export async function getPublicHealthRoomPresence({ date = getKstToday() } = {}) {
  const snapshot = await getDocs(query(
    collection(db, PUBLIC_COLLECTION_NAME),
    where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
    where("semester", "==", CURRENT_SEMESTER),
    where("date", "==", date)
  ));

  const rows = snapshot.docs.map(mapPresenceDocument).sort(sortPresenceRows);
  const latestSyncedAt = getLatestSyncedAt(snapshot.docs);

  return {
    rows,
    date,
    stale: isStale(latestSyncedAt),
    latestSyncedAt,
  };
}

export async function getHomeroomHealthRoomPresence({ assignment, date = getKstToday() } = {}) {
  const grade = Number(assignment?.grade);
  const classNo = Number(assignment?.classNo);
  if (!Number.isFinite(grade) || !Number.isFinite(classNo)) {
    throw new Error("missing homeroom assignment");
  }

  const month = date.slice(0, 7);
  const months = Array.from(new Set([month, getPreviousMonth(month)].filter(Boolean)));
  const snapshots = await Promise.all(months.map((targetMonth) => getDocs(query(
    collection(db, HOMEROOM_COLLECTION_NAME),
    where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
    where("semester", "==", CURRENT_SEMESTER),
    where("grade", "==", grade),
    where("classNo", "==", classNo),
    where("month", "==", targetMonth)
  ))));

  const docs = snapshots.flatMap((snapshot) => snapshot.docs);
  const recentStartDate = getRecentStartDate(date);
  const rows = docs
    .map(mapHomeroomPresenceDocument)
    .filter((row) => row.date >= recentStartDate && row.date <= date)
    .sort(sortPresenceRows);
  const latestSyncedAt = getLatestSyncedAt(docs);

  return {
    rows,
    date,
    stale: isStale(latestSyncedAt),
    latestSyncedAt,
  };
}

export async function getHomeroomMonthlyVisitRecords({ assignment, month }) {
  const grade = Number(assignment?.grade);
  const classNo = Number(assignment?.classNo);
  if (!Number.isFinite(grade) || !Number.isFinite(classNo) || !/^\d{4}-\d{2}$/.test(String(month || ""))) {
    throw new Error("missing homeroom monthly query");
  }

  const snapshot = await getDocs(query(
    collection(db, HOMEROOM_COLLECTION_NAME),
    where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
    where("semester", "==", CURRENT_SEMESTER),
    where("grade", "==", grade),
    where("classNo", "==", classNo),
    where("month", "==", month)
  ));

  const records = snapshot.docs.map(mapHomeroomMonthlyDocument).sort(sortMonthlyRows);
  const latestSyncedAt = getLatestSyncedAt(snapshot.docs);
  const summary = {
    total: records.length,
    resultCount: records.filter((record) => record.result).length,
    unchecked: records.filter((record) => record.teacherChecked !== "확인").length,
  };

  return {
    records,
    summary,
    month,
    stale: isStale(latestSyncedAt),
    latestSyncedAt,
  };
}
