import { getApps, initializeApp } from "firebase/app";
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  normalizeHealthCheckClass,
  normalizeHealthCheckSession,
  sortHealthCheckClasses,
} from "./healthCheckPublicSchedule.js";

const APP_NAME = "health-check-public-schedule";
const EXPECTED_PROJECT_ID = "school-health-check-scheduler";
const PUBLIC_SCHEDULES = "health_check_public_schedules";

export class HealthCheckScheduleConfigurationError extends Error {
  constructor() {
    super("별도검사 일정 연결 설정을 확인해 주세요.");
    this.name = "HealthCheckScheduleConfigurationError";
  }
}

function getScheduleFirestore() {
  const config = {
    apiKey: import.meta.env.VITE_HEALTH_CHECK_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_HEALTH_CHECK_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_HEALTH_CHECK_FIREBASE_APP_ID,
  };
  if (config.projectId !== EXPECTED_PROJECT_ID || Object.values(config).some((value) => typeof value !== "string" || !value.trim())) {
    throw new HealthCheckScheduleConfigurationError();
  }
  const existing = getApps().find((app) => app.name === APP_NAME);
  const app = existing || initializeApp(config, APP_NAME);
  if (app.options.projectId !== EXPECTED_PROJECT_ID) throw new HealthCheckScheduleConfigurationError();
  return getFirestore(app);
}

export function subscribeHealthCheckSessions({ onData, onError }) {
  let db;
  try {
    db = getScheduleFirestore();
  } catch (error) {
    queueMicrotask(() => onError(error));
    return () => {};
  }
  const sessionsQuery = query(
    collection(db, PUBLIC_SCHEDULES),
    orderBy("examDate", "desc"),
    limit(24),
  );
  return onSnapshot(sessionsQuery, (snapshot) => {
    const sessions = snapshot.docs
      .map((item) => normalizeHealthCheckSession(item.id, item.data(), { expectedSchoolKey: EXPECTED_PROJECT_ID }))
      .filter(Boolean);
    onData(sessions, { fromCache: snapshot.metadata.fromCache });
  }, onError);
}

export function subscribeHealthCheckClasses(sessionId, { onData, onError }) {
  let db;
  try {
    db = getScheduleFirestore();
  } catch (error) {
    queueMicrotask(() => onError(error));
    return () => {};
  }
  const classesQuery = query(
    collection(db, PUBLIC_SCHEDULES, sessionId, "classes"),
    orderBy("order", "asc"),
    limit(40),
  );
  return onSnapshot(classesQuery, (snapshot) => {
    const classes = snapshot.docs
      .map((item) => normalizeHealthCheckClass(sessionId, item.id, item.data()))
      .filter(Boolean);
    onData(sortHealthCheckClasses(classes), { fromCache: snapshot.metadata.fromCache });
  }, onError);
}
