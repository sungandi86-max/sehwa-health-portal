import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";
import AdminNotificationPanel from "../components/AdminNotificationPanel.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import FirebaseAccessRequestAction from "../components/FirebaseAccessRequestAction.jsx";
import FirebaseSignInActions from "../components/FirebaseSignInActions.jsx";
import { getDashboardSummary } from "../lib/dashboardSummary.js";
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

const QUICK_MENUS = [
  { title: "제출·보고 관리", description: "제출 확인과 감염병 보고 처리", status: "관리자", href: "/firebase-admin/submissions" },
  { title: "제출 현황", description: "대상자별 제출·미제출 확인", status: "관리자", href: "/firebase-admin/submission-status" },
  { title: "교직원 제출·이수 현황", description: "결핵검진·CPR 이수 상태", status: "관리자", href: "/firebase-admin/staff-submission-status" },
  { title: "권한 신청", description: "기본·담임 권한 신청 승인", status: "관리자", href: "/firebase-admin/access-requests" },
  { title: "교직원 권한 관리", description: "역할·담임·보직 학기별 관리", status: "관리자", href: "/firebase-admin/users" },
  { title: "사용자 관리", description: "계정·staffId·표시 이름 관리", status: "관리자", href: "/firebase-admin/users" },
  { title: "감염병 사례관리", description: "감염병 보고 사례와 복귀 상태 관리", status: "관리자", href: "/firebase-admin/infections" },
];

const MENU_GROUPS = [
  {
    title: "제출·이수 관리",
    items: QUICK_MENUS.filter((menu) =>
      ["제출·보고 관리", "제출 현황", "교직원 제출·이수 현황"].includes(menu.title)
    ),
  },
  {
    title: "권한·사용자 관리",
    items: QUICK_MENUS.filter((menu) => ["권한 신청", "교직원 권한 관리", "사용자 관리"].includes(menu.title)),
  },
  {
    title: "학생 건강관리",
    items: QUICK_MENUS.filter((menu) => menu.title === "감염병 사례관리"),
  },
];

const SUMMARY_LINKS = {
  "처리 대기 제출": "/firebase-admin/submissions?tab=staff&status=submitted",
};

function getSummaryCount(summaryItem) {
  const parsed = Number.parseInt(String(summaryItem?.value || "0").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <article
          key={item}
          className="h-24 animate-pulse rounded-[12px] border border-[#DDEAE7] bg-white p-4 shadow-[var(--shh-soft-shadow)]"
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
      setSummaryState({ status: "idle", message: "" });
      return;
    }

    let shouldIgnore = false;

    async function loadDashboardSummary() {
      setSummaryState({ status: "loading", message: "" });

      try {
        const nextSummary = await getDashboardSummary();
        if (shouldIgnore) return;

        setDashboardSummary(nextSummary);
        setSummaryState({ status: "success", message: "" });

        try {
          const nextPendingAccessCount = await getPendingAccessRequestCount();
          if (!shouldIgnore) setPendingAccessCount(nextPendingAccessCount);
        } catch (error) {
          if (!shouldIgnore) setPendingAccessCount(null);
        }
      } catch (error) {
        if (shouldIgnore) return;

        console.error("[firebase-dashboard] summary load failed", error);
        setDashboardSummary(null);
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
    <section className="firebase-v2-surface min-h-full bg-[#F8FAFA] px-3 py-4 text-[#102047] sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-6xl space-y-3">
        <header className="border-b border-[#DDEAE7] bg-transparent pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#102047] sm:text-[1.625rem]">
                보건교사 대시보드
              </h1>
              <p className="mt-1 text-sm font-medium leading-5 text-[#627083]">
                오늘 확인할 보건업무와 관리 항목을 확인합니다.
              </p>
            </div>

            <div className="rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 sm:min-w-64">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#102047]">{displayName}</p>
                  <p className="mt-0.5 text-xs font-medium text-[#627083]">
                    {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isWorking}
                  className="min-h-9 rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047] transition hover:border-[#0D4EA6] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </header>

        <AdminNotificationPanel user={user} enabled={hasAdminAccess} />

        <section aria-label="오늘의 요약">
          <h2 className="mb-2 px-1 text-[16px] font-semibold text-[#102047]">오늘의 요약</h2>
          {summaryState.status === "loading" && <SummarySkeleton />}

          {(summaryState.status === "permission-denied" ||
            summaryState.status === "index-required" ||
            summaryState.status === "error") && (
            <div className="rounded-[12px] border border-[#F6D8D8] bg-[#FFF7F7] p-4 shadow-[var(--shh-soft-shadow)]">
              <p className="text-sm font-semibold text-[#B42318]">{summaryState.message}</p>
            </div>
          )}

          {summaryState.status === "success" && dashboardSummary && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {dashboardSummary.cards.map((item) => {
                const summaryLink = item.href || SUMMARY_LINKS[item.label];
                const count = getSummaryCount(item);
                const needsAttention = count > 0 && ["처리 대기 제출", "감염병 관리"].includes(item.label);
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102047]">{item.label}</p>
                      {needsAttention ? (
                        <span className="rounded-[7px] border border-[#C8D8FF] bg-[#EEF4FF] px-2 py-0.5 text-[11px] font-semibold text-[#0D4EA6]">
                          확인
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={`mt-1 text-xl font-semibold tabular-nums ${
                        needsAttention ? "text-[#0D4EA6]" : "text-[#102047]"
                      }`}
                    >
                      {item.value}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-4 text-[#8A96A8]">{item.note}</p>
                    {item.metrics && (
                      <dl className="mt-2 grid gap-1 text-xs font-medium text-[#627083]">
                        {item.metrics.map((metric) => (
                          <div key={metric.label} className="flex items-center justify-between gap-3">
                            <dt>{metric.label}</dt>
                            <dd className={metric.priority && metric.value > 0 ? "text-[#B42318]" : "text-[#102047]"}>
                              {metric.value}건
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {summaryLink && (
                      <span className="mt-2 inline-flex text-xs font-semibold text-[#0D4EA6]">
                        관리 화면 열기
                      </span>
                    )}
                  </>
                );

                return summaryLink ? (
                  <Link
                    key={item.label}
                    to={summaryLink}
                    className="rounded-[10px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)] transition hover:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15"
                  >
                    {content}
                  </Link>
                ) : (
                  <article
                    key={item.label}
                    className="rounded-[10px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]"
                  >
                    {content}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-[#102047]">최근 제출</h2>
              <p className="mt-1 text-xs font-medium text-[#627083]">최근 접수된 제출 중 확인이 필요한 항목입니다.</p>
            </div>
            <Link
              to="/firebase-admin/submissions"
              className="w-fit rounded-[8px] border border-[#C8D8FF] bg-white px-2.5 py-1 text-xs font-semibold text-[#0D4EA6] transition hover:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15"
            >
              관리 화면
            </Link>
          </div>

          {summaryState.status === "loading" && (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-16 animate-pulse rounded-[12px] border border-[#DDEAE7] bg-[#F3F8F6]"
                />
              ))}
            </div>
          )}

          {(summaryState.status === "permission-denied" ||
            summaryState.status === "index-required" ||
            summaryState.status === "error") && (
            <div className="mt-4 rounded-[12px] border border-[#F6D8D8] bg-[#FFF7F7] p-4">
              <p className="text-sm font-semibold text-[#B42318]">{summaryState.message}</p>
            </div>
          )}

          {summaryState.status === "success" && dashboardSummary?.recentSubmissions.length === 0 && (
            <div className="mt-3 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
              <p className="text-sm font-semibold text-[#627083]">확인할 최근 제출이 없습니다.</p>
            </div>
          )}

          {summaryState.status === "success" && dashboardSummary?.recentSubmissions.length > 0 && (
            <div className="mt-3 space-y-2">
              {dashboardSummary.recentSubmissions.map((submission) => (
                <article
                  key={`${submission.source}-${submission.id}`}
                  className="flex flex-col gap-2 rounded-[10px] border border-[#DDEAE7] bg-[#FAFDFC] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[8px] border border-[#BFEBDC] bg-[#F0FBF7] px-2.5 py-1 text-xs font-semibold text-[#08754B]">
                        {submission.typeLabel}
                      </span>
                      <span className="rounded-[8px] border border-[#C8D8FF] bg-[#EEF4FF] px-2.5 py-1 text-xs font-semibold text-[#3154A3]">
                        {submission.statusLabel}
                      </span>
                    </div>
                    <p className="mt-2 break-keep text-sm font-semibold leading-6 text-[#102047]">
                      {submission.detail}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-bold text-[#8A96A8]">{submission.submittedAtLabel}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section aria-label="관리 메뉴" className="space-y-3">
          <div>
            <h2 className="px-1 text-[16px] font-semibold text-[#102047]">관리 메뉴</h2>
            <p className="mt-1 px-1 text-xs font-medium text-[#627083]">조회·처리·관리 업무별로 바로 이동합니다.</p>
          </div>

          {MENU_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-1 text-xs font-semibold text-[#627083]">{group.title}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((menu) => {
                  const statusText =
                    menu.href === "/firebase-admin/access-requests" && typeof pendingAccessCount === "number"
                      ? `${pendingAccessCount}건 대기`
                      : "";
                  const content = (
                    <>
                      <span className="block text-[15px] font-semibold text-[#102047]">{menu.title}</span>
                      <span className="mt-1 block truncate text-sm font-medium leading-5 text-[#627083]">
                        {menu.description}
                      </span>
                      {statusText ? (
                        <span className="mt-2 inline-flex rounded-[7px] border border-[#C8D8FF] bg-[#EEF4FF] px-2 py-0.5 text-[11px] font-semibold text-[#0D4EA6]">
                          {statusText}
                        </span>
                      ) : null}
                    </>
                  );

                  return menu.href ? (
                    <Link
                      key={menu.title}
                      to={menu.href}
                      className="rounded-[10px] border border-[#DDEAE7] bg-white p-3 text-left shadow-[var(--shh-soft-shadow)] transition hover:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15"
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      key={menu.title}
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-[10px] border border-[#DDEAE7] bg-white p-3 text-left opacity-80 shadow-[var(--shh-soft-shadow)]"
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]">
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
    </section>
  );
}
