import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";
import AdminNotificationPanel from "../components/AdminNotificationPanel.jsx";
import { AdminWorkspaceLayout } from "../components/AdminWorkspaceLayout.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import FirebaseAccessRequestAction from "../components/FirebaseAccessRequestAction.jsx";
import FirebaseSignInActions from "../components/FirebaseSignInActions.jsx";
import { getDashboardSummary } from "../lib/dashboardSummary.js";
import { buildDashboardTaskCards, getTbDashboardCounts } from "../lib/dashboardTasks.js";
import { loadHealthScreeningTypes } from "../lib/healthScreeningTypes.js";
import { auth } from "../lib/firebase.js";
import { getPendingAccessRequestCount } from "../lib/accessRequests.js";
import {
  getFriendlyAuthErrorMessage,
  getMicrosoftSchoolDomainBlockMessage,
  signInWithGoogle,
  signInWithMicrosoft,
  signOutFirebase,
} from "../lib/firebaseAuth.js";
import { getRoleLabels } from "../lib/firebaseRoles.js";
import { ensureUserProfile, getInternalDisplayName, getUserAssignmentResult, isAdmin, isHealthTeacher } from "../lib/userProfile.js";
import { ensureTeamStaffAssignment } from "../lib/teamStaffAccess.js";

const QUICK_ACTIONS = [
  { label: "제출 관리", href: "/firebase-admin/submissions" },
  { label: "교직원 제출·이수 현황", href: "/firebase-admin/staff-submission-status" },
  { label: "교직원 교육 관리", href: "/firebase-admin/trainings" },
  { label: "권한 관리", href: "/firebase-admin/users" },
  { label: "감염병 사례관리", href: "/firebase-admin/infections" },
];

function RoleBadges({ roles }) {
  const roleLabels = getRoleLabels(roles);

  if (!roleLabels.length) {
    return <span className="text-sm font-semibold text-[#6B7684]">역할 미등록</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {roleLabels.map((roleLabel) => (
        <span
          key={roleLabel}
          className="rounded-[8px] border border-[#BFEBDC] bg-[#F0FBF7] px-2.5 py-1 text-xs font-semibold text-[#08754B]"
        >
          {roleLabel}
        </span>
      ))}
    </div>
  );
}

function AccessMessage({ title, description, action }) {
  return (
    <section className="firebase-v2-surface min-h-full bg-[#F8FAFA] px-4 py-8 text-[#102047] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-xl rounded-[12px] border border-[#DDEAE7] bg-white p-5 text-center shadow-[var(--shh-soft-shadow)] sm:p-6">
        <h1 className="text-xl font-bold text-[#102047]">{title}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-[#627083]">{description}</p>
        {action}
      </div>
    </section>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <article
          key={item}
          className="h-24 animate-pulse rounded-[10px] border border-[#DDEAE7] bg-white p-3"
        >
          <div className="h-4 w-24 rounded-[6px] bg-[#E8F2EF]" />
          <div className="mt-4 h-7 w-14 rounded-[8px] bg-[#DFF8EF]" />
          <div className="mt-3 h-3 w-28 rounded-[6px] bg-[#EEF4FF]" />
        </article>
      ))}
    </div>
  );
}

function dashboardErrorMessage(error) {
  const message = error?.message || "";
  if (error?.code === "permission-denied") {
    return {
      status: "permission-denied",
      message: "대시보드 집계 정보를 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요.",
    };
  }
  if (message.includes("requires an index")) {
    return {
      status: "index-required",
      message: "대시보드 집계 쿼리에 필요한 Firestore index를 확인해 주세요.",
    };
  }
  return {
    status: "error",
    message: "대시보드 집계 정보를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  };
}

export default function FirebaseDashboardPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [pendingAccessCount, setPendingAccessCount] = useState(null);
  const [tbCounts, setTbCounts] = useState(null);
  const [summaryState, setSummaryState] = useState({ status: "idle", message: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState("");

  const assignment = assignmentResult?.assignment || null;
  const hasAdminAccess = assignment?.active === true && (isHealthTeacher(assignment) || isAdmin(assignment));

  const displayName = useMemo(() => {
    return getInternalDisplayName({ profile, user }) || "교직원";
  }, [profile, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfile(null);
      setAssignmentResult(null);
      if (currentUser) setMessage("");
      setIsLoading(false);

      if (!currentUser) return;

      setIsLoading(true);
      try {
        const blockedMessage = getMicrosoftSchoolDomainBlockMessage(currentUser);
        if (blockedMessage) {
          await signOutFirebase();
          setUser(null);
          setMessage(blockedMessage);
          return;
        }

        const ensuredProfile = await ensureUserProfile(currentUser);
        const teamStaffResult = await ensureTeamStaffAssignment(currentUser, ensuredProfile);
        if (teamStaffResult.ok === false) {
          setMessage(teamStaffResult.message);
          return;
        }

        const currentAssignmentResult = await getUserAssignmentResult(
          currentUser.uid,
          CURRENT_SCHOOL_YEAR,
          CURRENT_SEMESTER
        );

        setProfile(ensuredProfile);
        setAssignmentResult(currentAssignmentResult);
      } catch (error) {
        console.error("[firebase-dashboard] profile load failed", error);
        setMessage("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!hasAdminAccess) {
      setDashboardSummary(null);
      setPendingAccessCount(null);
      setTbCounts(null);
      setSummaryState({ status: "idle", message: "" });
      return;
    }

    let shouldIgnore = false;

    async function loadDashboardSummary() {
      setSummaryState({ status: "loading", message: "" });

      try {
        const [nextSummary, nextPendingAccessCount, screeningData] = await Promise.all([
          getDashboardSummary(),
          getPendingAccessRequestCount(),
          loadHealthScreeningTypes({ schoolYear: CURRENT_SCHOOL_YEAR, scope: "admin" }),
        ]);
        if (shouldIgnore) return;

        setDashboardSummary(nextSummary);
        setPendingAccessCount(nextPendingAccessCount);
        setTbCounts(getTbDashboardCounts(screeningData.items));
        setSummaryState({ status: "success", message: "" });
      } catch (error) {
        if (shouldIgnore) return;

        console.error("[firebase-dashboard] summary load failed", error);
        setDashboardSummary(null);
        setPendingAccessCount(null);
        setTbCounts(null);
        setSummaryState(dashboardErrorMessage(error));
      }
    }

    loadDashboardSummary();

    return () => {
      shouldIgnore = true;
    };
  }, [hasAdminAccess]);

  const handleMicrosoftSignIn = async () => {
    setIsWorking(true);
    setMessage("");

    try {
      await signInWithMicrosoft();
    } catch (error) {
      console.error("[firebase-dashboard] sign in failed", error);
      setMessage(getFriendlyAuthErrorMessage(error, "Microsoft Teams 로그인에 실패했습니다."));
    } finally {
      setIsWorking(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsWorking(true);
    setMessage("");

    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("[firebase-dashboard] google sign in failed", error);
      setMessage(getFriendlyAuthErrorMessage(error, "Google 계정으로 로그인하지 못했습니다."));
    } finally {
      setIsWorking(false);
    }
  };

  const handleSignOut = async () => {
    setIsWorking(true);
    setMessage("");

    try {
      await signOutFirebase();
    } catch (error) {
      console.error("[firebase-dashboard] sign out failed", error);
      setMessage("로그아웃 중 문제가 발생했습니다.");
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading) {
    return (
      <AccessMessage
        title="온라인 보건실"
        description="로그인 상태와 현재 학기 권한을 확인하는 중입니다."
      />
    );
  }

  if (!user) {
    return (
      <AccessMessage
        title="온라인 보건실"
        description="교사: Teams · 그 외 교직원: Google"
        action={
          <FirebaseSignInActions
            isWorking={isWorking}
            message={message}
            onGoogleSignIn={handleGoogleSignIn}
            onMicrosoftSignIn={handleMicrosoftSignIn}
          />
        }
      />
    );
  }

  if (assignmentResult?.status === "not-found") {
    return (
      <AccessMessage
        title="현재 학기 이용 권한이 등록되지 않았습니다."
        description="등록된 Google 계정은 보건실에 현재 학기 이용 권한을 신청할 수 있습니다."
        action={<FirebaseAccessRequestAction user={user} />}
      />
    );
  }

  if (assignmentResult?.status === "permission-denied" || assignmentResult?.status === "error" || message) {
    return (
      <AccessMessage
        title="권한 정보를 확인할 수 없습니다."
        description={message || assignmentResult?.message || "Firestore 보안 설정과 권한 문서를 확인해 주세요."}
        action={
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isWorking}
            className="mt-5 min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-4 py-2 text-sm font-semibold text-[#102047] transition hover:border-[#20A982] disabled:cursor-not-allowed disabled:opacity-50"
          >
            로그아웃
          </button>
        }
      />
    );
  }

  if (!hasAdminAccess) {
    return (
      <AccessMessage
        title="보건교사 관리자 권한이 없습니다."
        description="현재 계정은 온라인 보건실 관리자 대시보드에 접근할 수 없습니다."
        action={
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isWorking}
            className="mt-5 min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-4 py-2 text-sm font-semibold text-[#102047] transition hover:border-[#20A982] disabled:cursor-not-allowed disabled:opacity-50"
          >
            로그아웃
          </button>
        }
      />
    );
  }

  return (
    <AdminWorkspaceLayout
      label="관리자"
      title="관리자 대시보드"
      description="오늘 확인할 보건업무와 관리 항목을 한곳에서 확인합니다."
      displayName={displayName}
    >
      <div className="space-y-5">
        <section className="flex flex-col gap-3 border-b border-[#DDEAE7] pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#102047]">{displayName}님</p>
            <p className="mt-1 text-xs font-medium text-[#627083]">
              {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기 · 오늘 처리할 업무를 확인하세요.
            </p>
          </div>
          <nav aria-label="빠른 이동" className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.href} to={action.href}
                className="inline-flex min-h-9 items-center rounded-[8px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047] transition hover:border-[#0D4EA6] hover:text-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15">
                {action.label}
              </Link>
            ))}
          </nav>
        </section>

        <section aria-labelledby="dashboard-tasks-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="dashboard-tasks-title" className="text-[17px] font-semibold text-[#102047]">오늘 확인할 업무</h2>
              <p className="mt-1 text-xs font-medium text-[#627083]">처리할 항목이 있는 업무부터 확인합니다.</p>
            </div>
          </div>
          {summaryState.status === "loading" && <SummarySkeleton />}
          {["permission-denied", "index-required", "error"].includes(summaryState.status) && (
            <div className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] p-4">
              <p className="text-sm font-semibold text-[#B42318]">{summaryState.message}</p>
            </div>
          )}
          {summaryState.status === "success" && dashboardSummary && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {buildDashboardTaskCards({ counts: dashboardSummary.counts, pendingAccessCount, tbCounts }).map((task) => {
                const needsAttention = typeof task.count === "number" && task.count > 0;
                return (
                  <Link key={task.id} to={task.href}
                    className={`group min-h-24 rounded-[10px] border p-3 transition focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15 ${needsAttention
                      ? "border-[#C8D8FF] bg-white hover:border-[#0D4EA6]"
                      : "border-[#DDEAE7] bg-[#FAFCFC] hover:border-[#B8D8C9]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`break-keep text-xs font-semibold leading-5 ${needsAttention ? "text-[#102047]" : "text-[#627083]"}`}>{task.label}</p>
                      {needsAttention && <span className="shrink-0 text-[11px] font-semibold text-[#0D4EA6]">확인</span>}
                    </div>
                    <p className={`mt-2 text-2xl font-semibold tabular-nums ${needsAttention ? "text-[#0D4EA6]" : "text-[#8A96A8]"}`}>
                      {task.count === null ? "-" : task.count}<span className="ml-0.5 text-xs font-semibold">건</span>
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <section aria-labelledby="recent-activity-title" className="rounded-[10px] border border-[#DDEAE7] bg-white p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="recent-activity-title" className="text-[16px] font-semibold text-[#102047]">최근 활동</h2>
                <p className="mt-1 text-xs font-medium text-[#627083]">최근 제출 중 확인이 필요한 항목입니다.</p>
              </div>
              <Link to="/firebase-admin/submissions" className="shrink-0 text-xs font-semibold text-[#0D4EA6] hover:text-[#183B8F]">전체 보기</Link>
            </div>
            {summaryState.status === "loading" && <div className="mt-3 h-36 animate-pulse rounded-[8px] bg-[#F3F8F6]" />}
            {summaryState.status === "success" && dashboardSummary?.recentSubmissions.length === 0 && (
              <p className="mt-3 rounded-[8px] bg-[#F8FAFA] px-3 py-3 text-sm font-medium text-[#627083]">확인할 최근 활동이 없습니다.</p>
            )}
            {summaryState.status === "success" && dashboardSummary?.recentSubmissions.length > 0 && (
              <div className="mt-3 divide-y divide-[#DDEAE7]">
                {dashboardSummary.recentSubmissions.map((submission) => (
                  <article key={`${submission.source}-${submission.id}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${submission.status === "submitted" ? "bg-[#0D4EA6]" : "bg-[#20A982]"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#102047]">{submission.typeLabel}</p>
                        <time className="text-[11px] font-medium text-[#8A96A8]">{submission.submittedAtLabel}</time>
                      </div>
                      <p className="mt-1 truncate text-xs font-medium text-[#627083]">{submission.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside aria-label="관리자 알림" className="rounded-[10px] border border-[#DDEAE7] bg-white p-3">
            <AdminNotificationPanel user={user} enabled={hasAdminAccess} compact maxItems={3} />
          </aside>
        </div>

        <section className="border-t border-[#DDEAE7] pt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#627083]">현재 권한</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RoleBadges roles={assignment.roles} />
                <span className="rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1 text-xs font-semibold text-[#627083]">
                  {assignment.position || "보직 미등록"}
                </span>
                <span className="rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1 text-xs font-semibold text-[#627083]">
                  {assignment.active === true ? "활성" : "비활성"}
                </span>
                <span className="rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1 text-xs font-semibold text-[#627083]">
                  {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기
                </span>
              </div>
            </div>
            <Link
              to="/firebase-admin/users"
              className="inline-flex min-h-9 w-fit items-center rounded-[9px] border border-[#C8D8FF] bg-white px-3 py-1.5 text-xs font-semibold text-[#0D4EA6] transition hover:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15"
            >
              교직원 권한 관리
            </Link>
          </div>
        </section>
      </div>
    </AdminWorkspaceLayout>
  );
}
