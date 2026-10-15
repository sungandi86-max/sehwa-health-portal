import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { validatedSchoolYear, tbWorkflowTaskId } from "./tbScreeningWorkflowModel.js";
import { normalizeTbScreening } from "./tbScreeningStatusModel.js";

const QA_HOST = "sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app";
const FIXTURE_UID = "qa-tb-certificate-test-001";
const FIXTURE_STAFF_ID = "QA-TB-CERT-TEST-001";
const FIXTURE_ROLE = "qa_tb_certificate_synthetic_staff";
const QA_PATHS = new Set(["/firebase-submit/tb", "/my-submission-status"]);

export function isQaTbSyntheticUser(user) {
  return user?.uid === FIXTURE_UID;
}

export function isQaTbSyntheticOptIn(location = globalThis.location) {
  return location?.hostname === QA_HOST && QA_PATHS.has(location.pathname)
    && new URLSearchParams(location.search || "").get("qa-tb-test") === "1";
}

export async function loadQaTbPageAccess({ user, schoolYear, location = globalThis.location, fetchImpl = fetch }) {
  const year = validatedSchoolYear(schoolYear);
  if (!user || !isQaTbSyntheticOptIn(location)) throw new Error("QA 결핵검진 이용 경로를 확인해주세요.");
  const token = await user.getIdToken();
  const query = new URLSearchParams({ resource: "tb-screening-workflow", scope: "self", schoolYear: String(year), accessOnly: "true" });
  const response = await fetchImpl(`/api/firebase/staff-directory?${query}`, {
    method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  const access = result?.access;
  if (!response.ok || result?.ok !== true || access?.authorized !== true || access.schoolYear !== year
    || access.assignment?.schoolYear !== year || access.assignment?.semester !== CURRENT_SEMESTER
    || !access.assignment?.staffId || access.identity?.staffId !== access.assignment.staffId) {
    throw new Error("QA 결핵검진 이용 권한을 확인하지 못했습니다.");
  }
  const synthetic = access.qaTbCertificateSynthetic === true;
  if (synthetic) {
    if (!isQaTbSyntheticUser(user) || year !== CURRENT_SCHOOL_YEAR || access.assignment.active !== false
      || access.assignment.staffId !== FIXTURE_STAFF_ID || access.staffType !== "교직원"
      || !Array.isArray(access.assignment.roles) || access.assignment.roles.length !== 1 || access.assignment.roles[0] !== FIXTURE_ROLE) {
      throw new Error("QA 합성 계정의 결핵검진 권한이 예상과 다릅니다.");
    }
  } else if (isQaTbSyntheticUser(user) || access.assignment.active !== true) {
    throw new Error("QA 결핵검진 이용 권한이 비활성 상태입니다.");
  }
  return { ...access, qaSyntheticAccess: synthetic };
}

export async function signInQaTbSynthetic(user) {
  if (!user || !isQaTbSyntheticOptIn()) throw new Error("QA 관리자 로그인이 필요합니다.");
  const token = await user.getIdToken();
  const response = await fetch("/api/firebase/staff-directory?resource=qa-tb-certificate-login", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true || !result.customToken) throw new Error("QA 결핵검진 계정으로 전환하지 못했습니다.");
  const { ensureAuthLocalPersistence } = await import("./firebaseAuth.js");
  const { signInWithCustomToken } = await import("firebase/auth");
  const { auth } = await import("./firebase.js");
  await ensureAuthLocalPersistence();
  return signInWithCustomToken(auth, result.customToken);
}

export function qaTbSyntheticOverview(workflow, staffId, schoolYear) {
  const year = validatedSchoolYear(schoolYear);
  if (staffId !== FIXTURE_STAFF_ID || workflow?.staffId !== staffId || workflow.schoolYear !== year) throw new Error("QA 결핵검진 현황을 확인하지 못했습니다.");
  const status = workflow.completed ? "completed" : workflow.status?.status === "pending" ? "pending" : "incomplete";
  const item = { taskId: tbWorkflowTaskId(year), title: "결핵검진", category: "screening", status,
    statusLabel: status === "completed" ? "완료" : status === "pending" ? "확인중" : "미완료",
    screening: normalizeTbScreening(workflow.status?.screening), workflow,
    action: { href: "/firebase-submit/tb?qa-tb-test=1", label: "확인자료 제출" },
  };
  return { items: [item], tbWorkflow: workflow, summary: { incomplete: status === "incomplete" ? 1 : 0,
    pending: status === "pending" ? 1 : 0, unknown: 0, completed: workflow.completed ? 1 : 0 } };
}
