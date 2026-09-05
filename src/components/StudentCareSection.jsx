import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { studentCareIntro } from "../data/fallbackData.js";
import { auth } from "../lib/firebase.js";
import {
  getFriendlyAuthErrorMessage,
  getMicrosoftSchoolDomainBlockMessage,
  signInWithGoogle,
  signInWithMicrosoft,
  signOutFirebase,
} from "../lib/firebaseAuth.js";
import { ensureTeamStaffAssignment } from "../lib/teamStaffAccess.js";
import {
  getHomeroomHealthRoomPresence,
  getHomeroomMonthlyVisitRecords,
  getPublicHealthRoomPresence,
} from "../lib/studentCarePresence.js";
import { ensureUserProfile, getUserAssignmentResult, isAdmin, isHealthTeacher, isHomeroom, isStaff } from "../lib/userProfile.js";
import FirebaseAccessRequestAction from "./FirebaseAccessRequestAction.jsx";
import FirebaseSignInActions from "./FirebaseSignInActions.jsx";
import { AppCard, Badge, SectionTitle } from "./ui.jsx";

const inputCls =
  "w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2.5 text-sm text-[#102047] outline-none transition focus:border-[#20A982] focus:ring-2 focus:ring-[#20A982]/10 placeholder:text-[#8A97A8]";

const btnCls =
  "mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-[#102047] bg-[#102047] px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-[#183B8F] md:mt-0 md:w-auto";

const HEALTH_ROOM_BUTTON = "보건실 소재 확인하기";
const HEALTH_ROOM_BUTTON_LEGACY = "蹂닿굔???낆떎?꾪솴 ?닿린";
const HEALTH_ROOM_STATUS_API = "/api/health-room-status";

const MONTHLY_VISIT_CARD = {
  title: "담임용 월별 보건실 입실 확인",
  description: "월말 출결 처리를 위해 우리 반 학생의 보건실 입실 기록을 월별로 확인합니다.",
  privacyNotice: "증상 및 처치 내용은 표시하지 않고, 입실·복귀 시각과 결과 처리 여부만 확인할 수 있습니다.",
  buttonText: "월별 입실 기록 조회하기",
  status: "권한 필요",
};

const ADMIN_STATS_CARD = {
  title: "관리자용 보건실 입실 통계",
  description: "학교 전체 보건실 입실 현황을 월별 통계로 확인합니다.",
  privacyNotice: "학생별 증상 및 처치 내용은 표시하지 않고, 월별 통계만 확인할 수 있습니다.",
  buttonText: "통계 조회하기",
  status: "권한 필요",
};

const DEFAULT_HEALTH_ROOM_CARD = {
  title: "보건실 소재 확인",
  description:
    "수업 중 보건실을 이용 중인 학생의 소재와 복귀 여부를 확인할 수 있습니다. 학생 건강정보, 증상, 처치내용은 표시하지 않습니다.",
  privacyNotice: "권한 있는 교직원에게만 최소정보를 제한적으로 표시합니다.",
  buttonText: HEALTH_ROOM_BUTTON,
  status: "권한 필요",
  url: "",
};

const ACCESS_TABS = [
  { value: "subject", label: "교과교사용" },
  { value: "homeroom", label: "담임교사용" },
  { value: "admin", label: "보건교사용" },
];

function hasActiveAssignment(assignment) {
  return assignment?.active === true;
}

function canUseSubjectScope(assignment) {
  return hasActiveAssignment(assignment) && (
    isStaff(assignment) ||
    isHomeroom(assignment) ||
    isHealthTeacher(assignment) ||
    isAdmin(assignment)
  );
}

function canUseHomeroomScope(assignment) {
  return (
    hasActiveAssignment(assignment) &&
    isHomeroom(assignment) &&
    Number.isFinite(Number(assignment.grade)) &&
    Number.isFinite(Number(assignment.classNo))
  );
}

function canUseAdminScope(assignment) {
  return hasActiveAssignment(assignment) && (isHealthTeacher(assignment) || isAdmin(assignment));
}

function getAllowedAccessTabs(assignment) {
  return ACCESS_TABS.filter((tab) => {
    if (tab.value === "subject") return canUseSubjectScope(assignment);
    if (tab.value === "homeroom") return canUseHomeroomScope(assignment);
    if (tab.value === "admin") return canUseAdminScope(assignment);
    return false;
  });
}

function getGasErrorMessage(error, fallback) {
  if (error?.userMessage) return error.userMessage;
  if (error?.name === "SyntaxError") {
    return "Apps Script 응답을 JSON으로 읽을 수 없습니다. 배포 URL이나 접근 권한을 확인해 주세요.";
  }
  return fallback;
}

async function requestGasJson(params, debugLabel, user) {
  if (!user) {
    const error = new Error("missing user");
    error.userMessage = "로그인이 필요한 기능입니다.";
    throw error;
  }

  const idToken = await user.getIdToken();

  let response;
  try {
    response = await fetch(HEALTH_ROOM_STATUS_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Object.fromEntries(params.entries())),
    });
  } catch (error) {
    console.error(`[${debugLabel}] fetch failed`, error);
    const wrapped = new Error("fetch failed");
    wrapped.userMessage = "보건실 소재 확인 프록시 요청에 실패했습니다. 네트워크 또는 Vercel API 상태를 확인해 주세요.";
    wrapped.cause = error;
    throw wrapped;
  }

  const body = await response.text();
  console.info(`[${debugLabel}] response`, {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.userMessage = `보건실 소재 확인 응답 상태가 ${response.status}입니다. 로그인 권한 또는 서버 설정을 확인해 주세요.`;
    console.error(`[${debugLabel}] bad status`, error);
    throw error;
  }

  const trimmed = body.trim();
  if (trimmed.startsWith("<") || /<html|<!doctype/i.test(trimmed)) {
    const error = new Error("HTML response from proxy");
    error.userMessage = "보건실 소재 확인 프록시가 JSON이 아닌 HTML을 반환했습니다. Vercel 배포 또는 API 경로를 확인해 주세요.";
    console.error(`[${debugLabel}] non-json html response`, error);
    throw error;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    error.userMessage = "보건실 소재 확인 응답을 JSON으로 해석할 수 없습니다. 서버 로그를 확인해 주세요.";
    console.error(`[${debugLabel}] json parse failed`, error);
    throw error;
  }
}

function isGasSuccess(json) {
  return json?.success === true || json?.result === "success";
}

function useStudentCareAuth() {
  const [state, setState] = useState({
    user: null,
    profile: null,
    assignmentResult: null,
    loading: true,
    working: false,
    message: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setState((prev) => ({
        ...prev,
        user: currentUser,
        profile: null,
        assignmentResult: null,
        loading: Boolean(currentUser),
        message: currentUser ? "" : prev.message,
      }));

      if (!currentUser) {
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      try {
        const blockedMessage = getMicrosoftSchoolDomainBlockMessage(currentUser);
        if (blockedMessage) {
          await signOutFirebase();
          setState((prev) => ({ ...prev, user: null, loading: false, message: blockedMessage }));
          return;
        }

        const profile = await ensureUserProfile(currentUser);
        const teamStaffResult = await ensureTeamStaffAssignment(currentUser, profile);
        if (teamStaffResult.ok === false) {
          setState((prev) => ({ ...prev, loading: false, message: teamStaffResult.message }));
          return;
        }

        const assignmentResult = await getUserAssignmentResult(
          currentUser.uid,
          CURRENT_SCHOOL_YEAR,
          CURRENT_SEMESTER
        );
        setState((prev) => ({ ...prev, profile, assignmentResult, loading: false }));
      } catch (error) {
        console.error("[student-care] auth load failed", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          message: "사용자 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        }));
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async (provider) => {
    setState((prev) => ({ ...prev, working: true, message: "" }));
    try {
      if (provider === "microsoft") await signInWithMicrosoft();
      else await signInWithGoogle();
    } catch (error) {
      console.error("[student-care] sign in failed", error);
      const fallback = provider === "microsoft"
        ? "학교 Teams 계정으로 로그인하지 못했습니다."
        : "Google 계정으로 로그인하지 못했습니다.";
      setState((prev) => ({ ...prev, message: getFriendlyAuthErrorMessage(error, fallback) }));
    } finally {
      setState((prev) => ({ ...prev, working: false }));
    }
  };

  return {
    ...state,
    assignment: state.assignmentResult?.assignment || null,
    signInWithMicrosoft: () => signIn("microsoft"),
    signInWithGoogle: () => signIn("google"),
  };
}

function formatClassLabel(assignment) {
  if (!assignment?.grade || !assignment?.classNo) return "담임 학급 미등록";
  return `${assignment.grade}학년 ${assignment.classNo}반`;
}

function AccessNotice({ authState }) {
  if (authState.loading) {
    return (
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-4 text-center text-sm font-semibold text-[#627083]">
        로그인 상태와 현재 학기 권한을 확인하는 중입니다.
      </div>
    );
  }

  if (!authState.user) {
    return (
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-4 text-center">
        <p className="text-base font-semibold text-[#102047]">로그인이 필요한 기능입니다.</p>
        <p className="mt-2 text-sm font-medium leading-6 text-[#627083]">
          교사는 학교 Teams 계정을, 그 외 교직원은 등록된 Google 계정을 사용할 수 있습니다.
        </p>
        <FirebaseSignInActions
          isWorking={authState.working}
          message={authState.message}
          onGoogleSignIn={authState.signInWithGoogle}
          onMicrosoftSignIn={authState.signInWithMicrosoft}
        />
      </div>
    );
  }

  if (authState.assignmentResult?.status === "not-found") {
    return (
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-4 text-center">
        <p className="text-base font-semibold text-[#102047]">현재 학년도/학기 이용 권한이 등록되지 않았습니다.</p>
        <p className="mt-2 text-sm font-medium leading-6 text-[#627083]">
          등록된 Google 계정은 보건실에 현재 학기 이용 권한을 신청할 수 있습니다.
        </p>
        <FirebaseAccessRequestAction user={authState.user} />
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-[#F6D8D8] bg-[#FFF7F7] p-4 text-center text-sm font-semibold text-[#B42318]">
      {authState.message || authState.assignmentResult?.message || "학생 건강관리 접근 권한이 없습니다."}
    </div>
  );
}

function HealthRoomLocationModal({ onClose, authState }) {
  const allowedTabs = useMemo(() => getAllowedAccessTabs(authState.assignment), [authState.assignment]);
  const [accessType, setAccessType] = useState(() => allowedTabs[0]?.value || "subject");
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState("");
  const overlayRef = useRef(null);

  useModalLifecycle(onClose);

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.some((tab) => tab.value === accessType)) {
      setAccessType(allowedTabs[0]?.value || "subject");
      resetResult();
    }
  }, [accessType, allowedTabs]);

  const resetResult = () => {
    setRows([]);
    setMessage("");
    setError("");
  };

  const handleTab = (nextType) => {
    setAccessType(nextType);
    resetResult();
  };

  const fetchRows = async () => {
    if (!allowedTabs.length) {
      setError("보건실 소재 확인 권한이 없습니다.");
      return;
    }

    setLoading(true);
    resetResult();
    try {
      let fallbackMessage = "";
      if (accessType === "subject" || accessType === "homeroom") {
        try {
          const presence = accessType === "homeroom"
            ? await getHomeroomHealthRoomPresence({ assignment: authState.assignment })
            : await getPublicHealthRoomPresence();
          if (presence.stale) {
            throw new Error(`stale ${accessType} presence projection`);
          }
          setRows(presence.rows);
          setMessage(presence.rows.length ? "" : "조회된 보건실 소재 기록이 없습니다.");
          return;
        } catch (projectionError) {
          console.warn("[HealthRoom:getHealthRoomLocation] Firestore projection fallback", {
            code: projectionError?.code || "",
            message: projectionError?.message || "unknown",
          });
          fallbackMessage = "최신 조회 정보를 불러오지 못해 기존 방식으로 확인했습니다.";
          setMessage(fallbackMessage);
        }
      }

      const params = new URLSearchParams({
        action: "getHealthRoomLocation",
        accessType,
      });
      const json = await requestGasJson(params, "HealthRoom:getHealthRoomLocation", authState.user);
      if (isGasSuccess(json)) {
        setRows(Array.isArray(json.items) ? json.items : []);
        setMessage(fallbackMessage || json.message || (Array.isArray(json.items) && json.items.length ? "" : "조회된 보건실 소재 기록이 없습니다."));
      } else {
        setError(json.message || json.debug || "조회할 수 없습니다.");
      }
    } catch (error) {
      console.error("[HealthRoom:getHealthRoomLocation] error", error);
      setError(getGasErrorMessage(error, "조회 중 오류가 발생했습니다. 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  };

  const confirmHomeroom = async (row) => {
    setCheckingId(row.rowId);
    setError("");
    try {
      const params = new URLSearchParams({
        action: "confirmHealthRoomHomeroom",
        rowId: row.rowId,
      });
      const json = await requestGasJson(params, "HealthRoom:confirmHealthRoomHomeroom", authState.user);
      if (isGasSuccess(json)) {
        setRows((prev) =>
          prev.map((item) =>
            item.rowId === row.rowId ? { ...item, homeroomConfirmed: true } : item
          )
        );
      } else {
        setError(json.message || json.debug || "담임 확인을 기록할 수 없습니다.");
      }
    } catch (error) {
      console.error("[HealthRoom:confirmHealthRoomHomeroom] error", error);
      setError(getGasErrorMessage(error, "담임 확인 기록 중 오류가 발생했습니다."));
    } finally {
      setCheckingId("");
    }
  };

  return (
    <ModalShell overlayRef={overlayRef} onClose={onClose} title="보건실 소재 확인">
      <div className="space-y-5">
        <div className="rounded-[10px] border border-[#C8D8FF] bg-[#EEF4FF] p-3 text-sm leading-6 text-[#3154A3]">
          이 화면은 수업 중 학생 소재 확인 및 담임 출결 참고를 위한 제한 열람 화면입니다.
          학생 개인정보가 포함될 수 있으므로 화면 캡처, 저장, 출력, 재공유를 금합니다.
        </div>

        {allowedTabs.length ? (
        <div className="grid gap-1 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-1" style={{ gridTemplateColumns: `repeat(${allowedTabs.length}, minmax(0, 1fr))` }}>
          {allowedTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTab(tab.value)}
              className={`rounded-[8px] px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                accessType === tab.value
                  ? "bg-white text-[#102047]"
                  : "text-[#627083] hover:text-[#102047]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        ) : (
          <AccessNotice authState={authState} />
        )}

        {accessType === "homeroom" && allowedTabs.length > 0 && (
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm font-semibold text-[#102047]">
            담임 학급 <span className="ml-2 text-[#1A3B8B]">{formatClassLabel(authState.assignment)}</span>
          </div>
        )}

        {allowedTabs.length > 0 && (
          <SubmitButton loading={loading} onClick={fetchRows}>
            보건실 소재 확인하기
          </SubmitButton>
        )}

        {message && (
          <p className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm font-semibold text-[#627083]">{message}</p>
        )}
        {error && (
          <p className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] p-3 text-sm font-semibold text-[#B42318]">{error}</p>
        )}

        <HealthRoomList
          accessType={accessType}
          rows={rows}
          checkingId={checkingId}
          onConfirm={confirmHomeroom}
        />
      </div>
    </ModalShell>
  );
}

function MonthlyVisitModal({ onClose, authState }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef(null);

  useModalLifecycle(onClose);

  const fetchRecords = async () => {
    if (!canUseHomeroomScope(authState.assignment)) {
      setError("담임 학급 월별 조회 권한이 없습니다.");
      return;
    }
    if (!month.trim()) {
      setError("조회 월을 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setRecords([]);
    setSummary(null);

    try {
      let fallbackMessage = "";
      try {
        const projection = await getHomeroomMonthlyVisitRecords({
          assignment: authState.assignment,
          month: month.trim(),
        });
        if (projection.stale) {
          throw new Error("stale homeroom monthly projection");
        }
        const nextRecords = projection.records;
        setRecords(nextRecords);
        setSummary({
          grade: String(authState.assignment.grade || ""),
          classNo: String(authState.assignment.classNo || ""),
          month: projection.month || month.trim(),
          total: projection.summary.total,
          diseaseCount: nextRecords.filter(r => r.result?.includes("질병")).length,
          periodCount:  nextRecords.filter(r => r.result?.includes("생리")).length,
          noResultCount: nextRecords.filter(r => !r.result || r.result === "-").length,
        });
        setMessage(nextRecords.length ? "" : "조회된 월별 보건실 입실 기록이 없습니다.");
        return;
      } catch (projectionError) {
        console.warn("[HealthRoom:monthlyVisit] Firestore projection fallback", {
          code: projectionError?.code || "",
          message: projectionError?.message || "unknown",
        });
        fallbackMessage = "최신 조회 정보를 불러오지 못해 기존 방식으로 확인했습니다.";
        setMessage(fallbackMessage);
      }

      const params = new URLSearchParams({
        mode: "monthlyVisit",
        month: month.trim(),
      });
      const json = await requestGasJson(params, "HealthRoom:monthlyVisit", authState.user);
      if (isGasSuccess(json)) {
        const nextRecords = Array.isArray(json.records) ? json.records : [];
        setRecords(nextRecords);
        setSummary({
          grade: json.grade || String(authState.assignment.grade || ""),
          classNo: json.classNo || String(authState.assignment.classNo || ""),
          month: json.month || month.trim(),
          total: json.summary?.total || nextRecords.length,
          diseaseCount: nextRecords.filter(r => r.result?.includes("질병")).length,
          periodCount:  nextRecords.filter(r => r.result?.includes("생리")).length,
          noResultCount: nextRecords.filter(r => !r.result || r.result === "-").length,
        });
        setMessage(fallbackMessage || (nextRecords.length ? "" : "조회된 월별 보건실 입실 기록이 없습니다."));
      } else {
        setError(json.message || json.debug || "월별 입실 기록을 조회할 수 없습니다.");
      }
    } catch (error) {
      console.error("[HealthRoom:monthlyVisit] error", error);
      setError(getGasErrorMessage(error, "월별 입실 기록 조회 중 오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell overlayRef={overlayRef} onClose={onClose} title="담임용 월별 보건실 입실 확인">
      <div className="space-y-5">
        <div className="rounded-[10px] border border-[#C8D8FF] bg-[#EEF4FF] p-3 text-sm leading-6 text-[#3154A3]">
          이 화면은 담임교사의 월별 출결 확인을 위한 조회 화면입니다.
          증상 및 처치 내용은 표시하지 않으며, 입실·복귀 시각과 결과 처리 여부만 확인할 수 있습니다.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2.5">
            <p className="text-xs font-semibold text-[#08754B]">담임 학급</p>
            <p className="mt-1 text-sm font-semibold text-[#102047]">{formatClassLabel(authState.assignment)}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#263238]">조회 월</label>
            <input className={inputCls} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>

        <SubmitButton loading={loading} onClick={fetchRecords}>
          월별 입실 기록 조회하기
        </SubmitButton>

        {summary && (
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm font-semibold text-[#627083]">
            {formatMonthlySummaryTitle(summary.month, summary.grade, summary.classNo)}
            <div className="mt-1 text-[#1A3B8B]">
              총 {summary.total}건 / 질병결과 {summary.diseaseCount}건 / 생리결과 {summary.periodCount}건 / 결과처리없음 {summary.noResultCount}건
            </div>
          </div>
        )}
        {message && <p className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm font-semibold text-[#627083]">{message}</p>}
        {error && <p className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] p-3 text-sm font-semibold text-[#B42318]">{error}</p>}

        <MonthlyVisitList records={records} />
      </div>
    </ModalShell>
  );
}

function formatMonthlySummaryTitle(month, grade, classNo) {
  const [year, monthNo] = String(month || "").split("-");
  if (year && monthNo) return `${year}년 ${Number(monthNo)}월 ${grade}학년 ${classNo}반 보건실 입실 기록`;
  return `${grade}학년 ${classNo}반 보건실 입실 기록`;
}

function ResultBadge({ result }) {
  if (!result || result === "-" || result === "") return <Badge type="gray">없음</Badge>;
  if (result.includes("질병")) return <Badge type="blue">{result}</Badge>;
  if (result.includes("생리")) return <Badge type="pink">{result}</Badge>;
  return <Badge type="gray">{result}</Badge>;
}

function MonthlyVisitList({ records }) {
  if (!records.length) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#DDEAE7] bg-white p-5 text-center text-sm text-[#627083]">
        조회 결과가 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record, index) => (
        <div key={`${record.date}-${record.number}-${record.inTime}-${index}`} className="rounded-[12px] border border-[#DDEAE7] bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold text-[#102047]">
                {record.number}번 · {record.name}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-400">{record.date}</p>
            </div>
            <Badge type={record.teacherChecked === "확인" ? "green" : "blue"}>{record.teacherChecked}</Badge>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <Info label="입실 시각" value={record.inTime || "-"} />
            <Info label="복귀 시각" value={record.outTime || "-"} />
            <Info label="체류시간" value={record.stay || "-"} />
            <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-[#08754B]">결과 처리</span>
              <ResultBadge result={record.result} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminVisitStatsModal({ onClose, authState }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [stats, setStats] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef(null);

  useModalLifecycle(onClose);

  const fetchStats = async () => {
    if (!canUseAdminScope(authState.assignment)) {
      setError("관리자 통계 권한이 없습니다.");
      return;
    }
    if (!month.trim()) {
      setError("조회 월을 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setStats(null);

    try {
      const params = new URLSearchParams({
        mode: "adminVisitStats",
        month: month.trim(),
      });
      const json = await requestGasJson(params, "HealthRoom:adminVisitStats", authState.user);
      if (isGasSuccess(json)) {
        setStats({
          month: json.month || month.trim(),
          summary: json.summary || {},
          gradeStats: Array.isArray(json.gradeStats) ? json.gradeStats : [],
          classStats: Array.isArray(json.classStats) ? json.classStats : [],
        });
        setMessage(json.summary?.total ? "" : "조회된 보건실 입실 통계가 없습니다.");
      } else {
        setError(json.message || json.debug || "관리자 통계를 조회할 수 없습니다.");
      }
    } catch (error) {
      console.error("[HealthRoom:adminVisitStats] error", error);
      setError(getGasErrorMessage(error, "관리자 통계 조회 중 오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell overlayRef={overlayRef} onClose={onClose} title="관리자용 보건실 입실 통계">
      <div className="space-y-5">
        <div className="rounded-[10px] border border-[#C8D8FF] bg-[#EEF4FF] p-3 text-sm leading-6 text-[#3154A3]">
          이 화면은 학교 전체 보건실 이용 현황을 통계로 확인하는 관리자용 화면입니다.
          학생별 증상 및 처치 내용은 표시하지 않습니다.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#263238]">조회 월</label>
            <input className={inputCls} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>

        <SubmitButton loading={loading} onClick={fetchStats}>
          통계 조회하기
        </SubmitButton>

        {message && <p className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm font-semibold text-[#627083]">{message}</p>}
        {error && <p className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] p-3 text-sm font-semibold text-[#B42318]">{error}</p>}
        {stats && <AdminVisitStatsResult stats={stats} />}
      </div>
    </ModalShell>
  );
}

function AdminVisitStatsResult({ stats }) {
  const summary = stats.summary || {};
  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm font-semibold text-[#627083]">
        {formatAdminStatsTitle(stats.month)}
        <div className="mt-1 text-[#1A3B8B]">
          전체 {summary.total || 0}건 / 질병결과 {summary.diseaseCount || 0}건 / 생리결과 {summary.periodCount || 0}건 / 결과처리 없음 {summary.noResultCount || 0}건 / 담임 미확인 {summary.uncheckedCount || 0}건
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-[#102047]">학년별 통계</h4>
        <div className="grid gap-2 sm:grid-cols-3">
          {stats.gradeStats.map((item) => (
            <div key={item.grade} className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 text-sm font-semibold text-[#627083]">
              <span className="text-[#1A3B8B]">{item.grade}학년</span>
              <div className="mt-1 text-lg font-bold text-[#102047]">{item.total || 0}건</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-[#102047]">반별 통계</h4>
        <div className="space-y-2">
          {stats.classStats.map((item) => (
            <div key={`${item.grade}-${item.classNo}`} className="rounded-[12px] border border-[#DDEAE7] bg-white p-3">
              <div className="font-semibold text-[#102047]">{item.grade}학년 {item.classNo}반</div>
              <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <Info label="총 입실" value={`${item.total || 0}건`} />
                <Info label="질병결과" value={`${item.diseaseCount || 0}건`} />
                <Info label="생리결과" value={`${item.periodCount || 0}건`} />
                <Info label="결과처리 없음" value={`${item.noResultCount || 0}건`} />
                <Info label="담임 미확인" value={`${item.uncheckedCount || 0}건`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatAdminStatsTitle(month) {
  const [year, monthNo] = String(month || "").split("-");
  if (year && monthNo) return `${year}년 ${Number(monthNo)}월 보건실 입실 통계`;
  return "보건실 입실 통계";
}

function HealthRoomList({ accessType, rows, checkingId, onConfirm }) {
  if (!rows.length) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#DDEAE7] bg-white p-4 text-center text-sm text-[#627083]">
        조회 결과가 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.rowId || `${row.studentNo}-${row.enteredAt}`} className="rounded-[12px] border border-[#DDEAE7] bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold text-[#102047]">
                {row.studentNo} · {row.maskedName}
              </p>
              {row.date && <p className="mt-1 text-xs font-bold text-slate-400">{row.date}</p>}
            </div>
            <Badge type={row.status === "현재 이용중" ? "pink" : "green"}>{row.status}</Badge>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <Info label="입실 시각" value={row.enteredAt} />
            <Info label="복귀 시각" value={row.returnedAt || "-"} />
            {accessType === "homeroom" && <Info label="체류시간" value={row.duration || "-"} />}
            {accessType === "homeroom" && <Info label="출결 참고" value={row.attendanceNote || "-"} />}
            {accessType === "admin" && <Info label="주요 증상" value={row.symptom || "-"} />}
            {accessType === "admin" && <Info label="처치 내용" value={row.treatment || "-"} />}
            {accessType === "admin" && <Info label="결과 처리" value={row.resultDetail || "-"} />}
          </div>

          {accessType === "homeroom" && (
            <button
              type="button"
              disabled={row.homeroomConfirmed || checkingId === row.rowId}
              onClick={() => onConfirm(row)}
              className={`mt-3 rounded-[10px] px-4 py-2 text-xs font-semibold transition ${
                row.homeroomConfirmed
                  ? "cursor-not-allowed bg-[#E8F6EE] text-[#2E7D32]"
                  : "bg-[#EAF3FF] text-[#1A3B8B] hover:bg-[#DDEBFF]"
              }`}
            >
              {row.homeroomConfirmed
                ? "담임 확인 완료"
                : checkingId === row.rowId
                  ? "기록 중..."
                  : "담임 확인 체크"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
      <span className="mr-2 text-xs font-semibold text-[#08754B]">{label}</span>
      <span className="font-semibold text-[#102047]">{value}</span>
    </div>
  );
}

function SubmitButton({ loading, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition ${
        loading
          ? "cursor-not-allowed bg-slate-300"
          : "bg-[#102047] hover:bg-[#183B8F]"
      }`}
    >
      {loading ? "확인 중..." : children}
    </button>
  );
}

function ModalShell({ overlayRef, onClose, title, children }) {
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[18px] bg-white shadow-xl sm:rounded-[18px]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#DDEAE7] px-5 py-4">
          <p className="text-lg font-semibold text-[#102047]">{title}</p>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#F8FAFA] text-[#627083] hover:bg-[#EEF4FF]"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function useModalLifecycle(onClose) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
}

function isHealthRoomCard(item) {
  return (
    item.buttonText === HEALTH_ROOM_BUTTON ||
    item.buttonText === HEALTH_ROOM_BUTTON_LEGACY ||
    item.title === "보건실 소재 확인" ||
    item.title === "보건실 입실 현황 확인"
  );
}

export default function StudentCareSection({ items }) {
  const authState = useStudentCareAuth();
  const [activeModal, setActiveModal] = useState(null);
  const healthRoomSource = items.find(isHealthRoomCard);
  const healthRoomCard = {
    ...DEFAULT_HEALTH_ROOM_CARD,
    ...(healthRoomSource || {}),
    title: DEFAULT_HEALTH_ROOM_CARD.title,
    description: DEFAULT_HEALTH_ROOM_CARD.description,
    privacyNotice: DEFAULT_HEALTH_ROOM_CARD.privacyNotice,
    buttonText: DEFAULT_HEALTH_ROOM_CARD.buttonText,
    url: "",
  };
  const canShowMonthlyVisit = canUseHomeroomScope(authState.assignment);
  const canShowAdminStats = canUseAdminScope(authState.assignment);
  const canShowHealthRoom =
    !authState.user ||
    authState.loading ||
    authState.assignmentResult?.status === "not-found" ||
    canUseSubjectScope(authState.assignment) ||
    canUseHomeroomScope(authState.assignment) ||
    canUseAdminScope(authState.assignment);
  const visibleCards = [
    ...(canShowMonthlyVisit ? [{ ...MONTHLY_VISIT_CARD, modalType: "monthlyVisit", status: "담임 권한" }] : []),
    ...(canShowAdminStats ? [{ ...ADMIN_STATS_CARD, modalType: "adminStats", status: "관리자 권한" }] : []),
    ...(canShowHealthRoom ? [{
      ...healthRoomCard,
      modalType: "healthRoom",
      status: authState.user ? "권한 확인" : "로그인 필요",
    }] : []),
  ];

  return (
    <section id="studentCare" className="mx-auto max-w-6xl scroll-mt-24 px-3 py-5 sm:px-4 md:py-8">
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-4 md:p-5">
        <SectionTitle
          eyebrow="STUDENT CARE"
          title={studentCareIntro.title}
          description={studentCareIntro.description}
        />
        <div className="mb-3 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2.5 text-xs font-semibold leading-5 text-[#627083] md:hidden" style={{ wordBreak: "keep-all" }}>
          학생 개인정보와 건강정보는 권한 있는 교직원에게만 최소한으로 표시합니다.
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-2">
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm leading-6 text-[#102047]">
            {studentCareIntro.privacyNotice}
          </div>
          <div className="rounded-[10px] border border-[#DDEAE7] bg-white p-3 text-sm leading-6 text-[#627083]">
            {studentCareIntro.guide}
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
          {!visibleCards.length && <AccessNotice authState={authState} />}
          {visibleCards.map((card, index) => (
            <div key={card.title} className={`grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${index > 0 ? "border-t border-[#DDEAE7]" : ""}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-semibold leading-6 text-[#102047] md:text-base">{card.title}</h3>
                  <span className="inline-flex shrink-0 whitespace-nowrap rounded-[8px] border border-[#C8D8FF] bg-[#EEF4FF] px-2 py-0.5 text-[11px] font-semibold text-[#3154A3] md:hidden">
                    {card.status}
                  </span>
                  <span className="hidden md:inline-flex">
                    <Badge type="blue">{card.status}</Badge>
                  </span>
                </div>
                <p className="student-care-card-description mt-1 text-sm leading-6 text-[#627083]">{card.description}</p>
                <p className="mt-1 text-xs leading-5 text-[#627083]">
                  {card.privacyNotice}
                </p>
              </div>
              <button
                onClick={() => setActiveModal({ type: card.modalType })}
                className={btnCls}
              >
                {card.buttonText}
              </button>
            </div>
          ))}
        </div>
      </div>

      {activeModal?.type === "monthlyVisit" && (
        <MonthlyVisitModal authState={authState} onClose={() => setActiveModal(null)} />
      )}
      {activeModal?.type === "adminStats" && (
        <AdminVisitStatsModal authState={authState} onClose={() => setActiveModal(null)} />
      )}
      {activeModal?.type === "healthRoom" && (
        <HealthRoomLocationModal authState={authState} onClose={() => setActiveModal(null)} />
      )}
    </section>
  );
}
