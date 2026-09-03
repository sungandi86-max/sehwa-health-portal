import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { Link } from "react-router-dom";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { formatAnnouncementEndDate, getActiveAnnouncements } from "../lib/announcements.js";
import { auth, googleProvider } from "../lib/firebase.js";
import { getRoleLabels } from "../lib/firebaseRoles.js";
import { ensureUserProfile, getUserAssignmentResult, isHealthTeacher } from "../lib/userProfile.js";

const PLACEHOLDER_SUMMARY = [
  { label: "오늘 입실", value: "0명", note: "Firestore 연결 전" },
  { label: "신규 제출", value: "0건", note: "Firestore 연결 전" },
  { label: "감염병 관리", value: "0건", note: "Firestore 연결 전" },
  { label: "오늘 할 일", value: "0건", note: "Firestore 연결 전" },
];

const QUICK_MENUS = [
  { title: "오늘의 보건실", description: "진행 중인 보건실 안내", status: "연결됨", href: "/firebase-dashboard" },
  { title: "검진·검사", description: "Firestore v2 검진 안내", status: "연결됨", href: "/firebase-checkups" },
  { title: "교육자료", description: "Firestore v2 교육자료", status: "연결됨", href: "/firebase-education" },
  { title: "FAQ", description: "Firestore v2 자주 묻는 질문", status: "연결됨", href: "/firebase-faq" },
  { title: "제출·보고 센터", description: "CPR, 결핵검진, 채용검진, 감염병 보고", status: "연결됨", href: "/firebase-submissions" },
  { title: "입실현황", description: "보건실 입실 기록 관리", status: "준비 중" },
  { title: "권한 관리", description: "역할·담임·보직 관리 예정", status: "준비 중" },
];

function RoleBadges({ roles }) {
  const roleLabels = getRoleLabels(roles);

  if (!roleLabels.length) {
    return <span className="text-sm font-bold text-[#6B7684]">역할 미등록</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {roleLabels.map((roleLabel) => (
        <span
          key={roleLabel}
          className="rounded-full border border-[#BFEBDC] bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]"
        >
          {roleLabel}
        </span>
      ))}
    </div>
  );
}

function AccessMessage({ title, description, action }) {
  return (
    <section className="min-h-full bg-[#F7FBF9] px-4 py-8 text-[#102047] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-xl rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 text-center shadow-[0_18px_48px_rgba(16,32,71,0.08)] sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#DFF8EF] to-[#EEF4FF] text-lg font-black text-[#20A982]">
          v2
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-[-0.02em] text-[#102047]">{title}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-[#627083]">{description}</p>
        {action}
      </div>
    </section>
  );
}

function announcementBadgeClassName(badgeType) {
  if (badgeType === "pink") return "rounded-full bg-[#FFF1F7] px-3 py-1 text-xs font-black text-[#C02E6F]";
  if (badgeType === "green") return "rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]";
  if (badgeType === "blue") return "rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-black text-[#3154A3]";
  return "rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]";
}

export default function FirebaseDashboardPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsState, setAnnouncementsState] = useState({ status: "idle", message: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState("");

  const assignment = assignmentResult?.assignment || null;
  const hasHealthTeacherAccess = isHealthTeacher(assignment) && assignment?.active === true;

  const displayName = useMemo(() => {
    return user?.displayName || profile?.displayName || "교직원";
  }, [profile, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfile(null);
      setAssignmentResult(null);
      setMessage("");
      setIsLoading(false);

      if (!currentUser) return;

      setIsLoading(true);
      try {
        const ensuredProfile = await ensureUserProfile(currentUser);
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
    if (!hasHealthTeacherAccess) {
      setAnnouncements([]);
      setAnnouncementsState({ status: "idle", message: "" });
      return;
    }

    let shouldIgnore = false;

    async function loadAnnouncements() {
      setAnnouncementsState({ status: "loading", message: "" });

      try {
        const activeAnnouncements = await getActiveAnnouncements();
        if (shouldIgnore) return;

        setAnnouncements(activeAnnouncements);
        setAnnouncementsState({ status: "success", message: "" });
      } catch (error) {
        if (shouldIgnore) return;

        console.error("[firebase-dashboard] announcements load failed", error);
        setAnnouncements([]);
        setAnnouncementsState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message:
            error?.code === "permission-denied"
              ? "공지 정보를 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
              : "공지 정보를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
        });
      }
    }

    loadAnnouncements();

    return () => {
      shouldIgnore = true;
    };
  }, [hasHealthTeacherAccess]);

  const handleSignIn = async () => {
    setIsWorking(true);
    setMessage("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("[firebase-dashboard] sign in failed", error);
      setMessage("Google 로그인에 실패했습니다. Firebase 설정과 승인된 도메인을 확인해 주세요.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleSignOut = async () => {
    setIsWorking(true);
    setMessage("");

    try {
      await signOut(auth);
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
        title="온라인 보건실 v2"
        description="로그인 상태와 현재 학기 권한을 확인하는 중입니다."
      />
    );
  }

  if (!user) {
    return (
      <AccessMessage
        title="온라인 보건실 v2"
        description="보건교사 전용 대시보드는 교직원 Google 계정 로그인 후 사용할 수 있습니다."
        action={
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isWorking}
            className="mt-6 min-h-12 rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.22)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? "처리 중..." : "Google 로그인"}
          </button>
        }
      />
    );
  }

  if (assignmentResult?.status === "not-found") {
    return (
      <AccessMessage
        title="현재 학기 이용 권한이 등록되지 않았습니다."
        description={`${CURRENT_SCHOOL_YEAR}학년도 ${CURRENT_SEMESTER}학기 권한 문서를 먼저 등록해 주세요.`}
        action={
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isWorking}
            className="mt-6 min-h-12 rounded-2xl border border-[#DDEAE7] bg-white px-5 py-3 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            로그아웃
          </button>
        }
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
            className="mt-6 min-h-12 rounded-2xl border border-[#DDEAE7] bg-white px-5 py-3 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            로그아웃
          </button>
        }
      />
    );
  }

  if (!hasHealthTeacherAccess) {
    return (
      <AccessMessage
        title="보건교사 관리자 권한이 없습니다."
        description="현재 계정은 온라인 보건실 v2 보건교사 대시보드에 접근할 수 없습니다."
        action={
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isWorking}
            className="mt-6 min-h-12 rounded-2xl border border-[#DDEAE7] bg-white px-5 py-3 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            로그아웃
          </button>
        }
      />
    );
  }

  return (
    <section className="min-h-full bg-[#F7FBF9] px-4 py-6 text-[#102047] sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="rounded-[32px] border border-[#DDEAE7] bg-white/95 p-6 shadow-[0_18px_48px_rgba(16,32,71,0.08)] sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#20A982]">
                Online Health Office v2
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-[#102047] sm:text-4xl">
                온라인 보건실 v2
              </h1>
              <p className="mt-3 text-sm font-medium leading-6 text-[#627083]">
                {displayName} 선생님, 오늘 확인할 보건 업무를 차분하게 점검하세요.
              </p>
            </div>

            <div className="rounded-[24px] border border-[#DDEAE7] bg-[#F7FBF9] p-4 sm:min-w-64">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#102047]">{displayName}</p>
                  <p className="mt-1 text-xs font-bold text-[#20A982]">보건교사</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isWorking}
                  className="min-h-11 rounded-2xl border border-[#DDEAE7] bg-white px-4 py-2 text-xs font-black text-[#102047] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  로그아웃
                </button>
              </div>
              <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#102047]">
                {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기
              </p>
            </div>
          </div>
        </header>

        <section aria-label="오늘의 요약">
          <h2 className="mb-3 px-1 text-lg font-black text-[#102047]">오늘의 요약</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLACEHOLDER_SUMMARY.map((item) => (
              <article
                key={item.label}
                className="rounded-[26px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_14px_36px_rgba(16,32,71,0.06)]"
              >
                <p className="text-sm font-black text-[#102047]">{item.label}</p>
                <p className="mt-3 text-3xl font-black text-[#20A982]">{item.value}</p>
                <p className="mt-2 text-xs font-bold text-[#8A96A8]">{item.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#20A982]">
                Announcements
              </p>
              <h2 className="mt-2 text-xl font-black text-[#102047]">진행 중인 안내</h2>
            </div>
            <span className="w-fit rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
              Firestore v2
            </span>
          </div>

          {announcementsState.status === "loading" && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[0, 1].map((item) => (
                <div
                  key={item}
                  className="h-36 animate-pulse rounded-[24px] border border-[#DDEAE7] bg-[#F7FBF9]"
                />
              ))}
            </div>
          )}

          {(announcementsState.status === "permission-denied" || announcementsState.status === "error") && (
            <div className="mt-5 rounded-[24px] border border-[#F6D8D8] bg-[#FFF7F7] p-5">
              <p className="text-sm font-black text-[#9F2525]">{announcementsState.message}</p>
            </div>
          )}

          {announcementsState.status === "success" && announcements.length === 0 && (
            <div className="mt-5 rounded-[24px] border border-[#DDEAE7] bg-[#F7FBF9] p-5">
              <p className="text-sm font-black text-[#627083]">현재 진행 중인 보건실 안내가 없습니다.</p>
            </div>
          )}

          {announcementsState.status === "success" && announcements.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {announcements.map((announcement) => (
                <article
                  key={announcement.id}
                  className="rounded-[24px] border border-[#DDEAE7] bg-[#FAFDFC] p-5 shadow-[0_12px_30px_rgba(16,32,71,0.05)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#08754B]">
                      {announcement.target || "전체"}
                    </span>
                    {announcement.status && (
                      <span className={announcementBadgeClassName(announcement.badgeType)}>
                        {announcement.status}
                      </span>
                    )}
                    <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-black text-[#3154A3]">
                      {announcement.dateLabel || formatAnnouncementEndDate(announcement)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-black leading-7 text-[#102047]">
                    {announcement.title || "제목 없는 안내"}
                  </h3>
                  {announcement.description && (
                    <p className="mt-2 line-clamp-3 text-sm font-medium leading-6 text-[#627083]">
                      {announcement.description}
                    </p>
                  )}
                  {announcement.actionText && (
                    <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#08754B]">
                      {announcement.actionText}
                    </p>
                  )}
                  {announcement.linkUrl && (
                    <a
                      href={announcement.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex min-h-11 items-center rounded-2xl bg-[#20A982] px-4 py-2 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] hover:bg-[#178C6C]"
                    >
                      {announcement.linkLabel || "링크 열기"}
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#20A982]">Quick menu</p>
              <h2 className="mt-2 text-xl font-black text-[#102047]">빠른 메뉴</h2>
            </div>
            <span className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
              v2 준비 화면
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_MENUS.map((menu) => {
              const content = (
                <>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#8A96A8]">
                  {menu.status}
                </span>
                <span className="mt-4 block text-lg font-black text-[#102047]">{menu.title}</span>
                <span className="mt-2 block text-sm font-medium leading-5 text-[#627083]">{menu.description}</span>
                </>
              );

              return menu.href ? (
                <Link
                  key={menu.title}
                  to={menu.href}
                  className="min-h-28 rounded-[24px] border border-[#DDEAE7] bg-[#FAFDFC] p-5 text-left transition hover:-translate-y-[1px] hover:shadow-[0_14px_30px_rgba(16,32,71,0.07)] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15"
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={menu.title}
                  type="button"
                  disabled
                  className="min-h-28 cursor-not-allowed rounded-[24px] border border-[#DDEAE7] bg-[#FAFDFC] p-5 text-left opacity-80"
                >
                  {content}
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <article className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#20A982]">Term access</p>
            <h2 className="mt-2 text-xl font-black text-[#102047]">이번 학기 권한</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold text-[#7B8797]">역할</p>
                <div className="mt-2">
                  <RoleBadges roles={assignment.roles} />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-[#7B8797]">보직</p>
                <p className="mt-2 text-sm font-black text-[#102047]">{assignment.position || "보직 미등록"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-[#7B8797]">상태</p>
                <p className="mt-2 text-sm font-black text-[#102047]">
                  {assignment.active === true ? "활성" : "비활성"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-[#7B8797]">학기</p>
                <p className="mt-2 text-sm font-black text-[#102047]">
                  {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-[30px] border border-[#DDEAE7] bg-[#F0FBF7] p-5 sm:p-6">
            <p className="text-sm font-black text-[#08754B]">권한 관리 준비</p>
            <p className="mt-3 text-sm font-medium leading-6 text-[#31584C]">
              교직원 목록, 역할 지정, 담임 학년·반, 활성 상태, 학년도/학기 선택, 전년도 권한 복사 기능을 이 영역에서 확장할 예정입니다.
            </p>
          </article>
        </section>
      </div>
    </section>
  );
}
