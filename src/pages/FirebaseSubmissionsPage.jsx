import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import FirebaseSignInActions from "../components/FirebaseSignInActions.jsx";
import { auth } from "../lib/firebase.js";
import {
  getFriendlyAuthErrorMessage,
  getMicrosoftSchoolDomainBlockMessage,
  signInWithGoogle,
  signInWithMicrosoft,
  signOutFirebase,
} from "../lib/firebaseAuth.js";
import { getRoleLabels } from "../lib/firebaseRoles.js";
import { getActiveSubmissionItems } from "../lib/submissionItems.js";
import { ensureUserProfile, getUserAssignmentResult, isHealthTeacher, isHomeroom } from "../lib/userProfile.js";

const SUBMISSION_ROUTES = {
  cpr: "/firebase-submit/cpr",
  tb: "/firebase-submit/tb",
  recruit: "/firebase-submit/recruit",
  infection: "/firebase-submit/infection",
};

const ITEM_TONES = {
  cpr: "from-[#F0FBF7] to-white text-[#08754B]",
  tb: "from-[#EEF4FF] to-white text-[#3154A3]",
  recruit: "from-[#F8F3FF] to-white text-[#6A3BC2]",
  infection: "from-[#FFF7F7] to-white text-[#B42318]",
};

function isActiveAssignment(assignment) {
  return assignment?.active === true;
}

function canUseInfection(assignment) {
  return (
    (isHealthTeacher(assignment) && isActiveAssignment(assignment)) ||
    (
      isHomeroom(assignment) &&
      isActiveAssignment(assignment) &&
      Number.isFinite(Number(assignment.grade)) &&
      Number.isFinite(Number(assignment.classNo))
    )
  );
}

function canShowSubmissionItem(item, assignment) {
  if (item.submissionType === "infection") return canUseInfection(assignment);
  return ["cpr", "tb", "recruit"].includes(item.submissionType);
}

function AccessMessage({ title, description, action, message }) {
  return (
    <section className="min-h-full bg-[#F7FBF9] px-4 py-8 text-[#102047] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-xl rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 text-center shadow-[0_18px_48px_rgba(16,32,71,0.08)] sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#DFF8EF] to-[#EEF4FF] text-lg font-black text-[#20A982]">
          v2
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-[-0.02em] text-[#102047]">{title}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-[#627083]">{description}</p>
        {message && <p className="mt-4 rounded-2xl bg-[#FFF7F7] px-4 py-3 text-sm font-black text-[#B42318]">{message}</p>}
        {action}
      </div>
    </section>
  );
}

function RoleBadges({ roles }) {
  const labels = getRoleLabels(roles);
  if (!labels.length) return <span className="text-xs font-black text-[#8A96A8]">권한 미등록</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <span key={label} className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
          {label}
        </span>
      ))}
    </div>
  );
}

function SubmissionCard({ item }) {
  const tone = ITEM_TONES[item.submissionType] || ITEM_TONES.cpr;
  const href = SUBMISSION_ROUTES[item.submissionType];

  return (
    <Link
      to={href}
      className={`group flex min-h-[260px] flex-col rounded-[30px] border border-[#DDEAE7] bg-gradient-to-br ${tone} p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] transition hover:-translate-y-[1px] hover:shadow-[0_22px_54px_rgba(16,32,71,0.1)] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 sm:p-6`}
      aria-label={`${item.title} 열기`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.status && <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-black">{item.status}</span>}
        {item.deadlineLabel && (
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black text-[#3154A3]">
            {item.deadlineLabel}
          </span>
        )}
      </div>
      <h2 className="mt-5 text-xl font-black tracking-[-0.02em] text-[#102047]">{item.title}</h2>
      {item.description && <p className="mt-3 line-clamp-3 text-sm font-medium leading-6 text-[#627083]">{item.description}</p>}
      <dl className="mt-5 space-y-3 text-sm">
        {item.target && (
          <div>
            <dt className="font-black text-[#102047]">대상</dt>
            <dd className="mt-1 font-medium text-[#627083]">{item.target}</dd>
          </div>
        )}
        {item.documentType && (
          <div>
            <dt className="font-black text-[#102047]">제출자료</dt>
            <dd className="mt-1 font-medium text-[#627083]">{item.documentType}</dd>
          </div>
        )}
        {item.guideText && (
          <div>
            <dt className="font-black text-[#102047]">안내</dt>
            <dd className="mt-1 line-clamp-2 whitespace-pre-line font-medium text-[#627083]">{item.guideText}</dd>
          </div>
        )}
      </dl>
      <span className="mt-auto inline-flex items-center pt-5 text-sm font-black">
        {item.buttonLabel || "제출하기"}
        <span className="ml-2 transition group-hover:translate-x-1" aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

export default function FirebaseSubmissionsPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [items, setItems] = useState([]);
  const [authState, setAuthState] = useState({ status: "loading", message: "" });
  const [itemsState, setItemsState] = useState({ status: "idle", message: "" });
  const [isWorking, setIsWorking] = useState(false);

  const assignment = assignmentResult?.assignment || null;
  const visibleItems = useMemo(() => items.filter((item) => canShowSubmissionItem(item, assignment)), [assignment, items]);
  const displayName = user?.displayName || profile?.displayName || "교직원";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfile(null);
      setAssignmentResult(null);
      setAuthState({ status: currentUser ? "loading" : "signed-out", message: "" });

      if (!currentUser) return;

      try {
        const blockedMessage = getMicrosoftSchoolDomainBlockMessage(currentUser);
        if (blockedMessage) {
          await signOutFirebase();
          setUser(null);
          setAuthState({ status: "signed-out", message: blockedMessage });
          return;
        }

        const ensuredProfile = await ensureUserProfile(currentUser);
        const nextAssignment = await getUserAssignmentResult(currentUser.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
        setProfile(ensuredProfile);
        setAssignmentResult(nextAssignment);
        setAuthState({ status: "signed-in", message: "" });
      } catch (error) {
        console.error("[firebase-submissions] auth load failed", error);
        setAuthState({
          status: "error",
          message: "사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setItemsState({ status: "idle", message: "" });
      return;
    }

    let shouldIgnore = false;

    async function loadItems() {
      setItemsState({ status: "loading", message: "" });
      try {
        const nextItems = await getActiveSubmissionItems();
        if (shouldIgnore) return;
        setItems(nextItems);
        setItemsState({ status: "success", message: "" });
      } catch (error) {
        if (shouldIgnore) return;
        setItems([]);
        setItemsState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message:
            error?.code === "permission-denied"
              ? "제출 항목을 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
              : "제출 항목을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
        });
      }
    }

    loadItems();

    return () => {
      shouldIgnore = true;
    };
  }, [user]);

  const handleMicrosoftSignIn = async () => {
    setIsWorking(true);
    try {
      await signInWithMicrosoft();
    } catch (error) {
      console.error("[firebase-submissions] sign in failed", error);
      setAuthState({
        status: "signed-out",
        message: getFriendlyAuthErrorMessage(error, "Microsoft Teams 로그인에 실패했습니다."),
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsWorking(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("[firebase-submissions] google sign in failed", error);
      setAuthState({
        status: "signed-out",
        message: getFriendlyAuthErrorMessage(error, "Google 관리자 로그인에 실패했습니다."),
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleSignOut = async () => {
    setIsWorking(true);
    try {
      await signOutFirebase();
    } finally {
      setIsWorking(false);
    }
  };

  if (authState.status === "loading") {
    return <AccessMessage title="제출·보고 센터" description="로그인 상태와 현재 학기 권한을 확인하고 있습니다." />;
  }

  if (!user) {
    return (
      <AccessMessage
        title="제출·보고 센터"
        description="교직원은 학교 Teams 계정으로 로그인하고, Google은 관리자 예비 로그인으로 사용합니다."
        action={
          <FirebaseSignInActions
            isWorking={isWorking}
            message={authState.message}
            onGoogleSignIn={handleGoogleSignIn}
            onMicrosoftSignIn={handleMicrosoftSignIn}
          />
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
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#20A982]">Firebase Submission Center</p>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-[#102047] sm:text-4xl">제출·보고 센터</h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[#627083]">
                Firebase v2에서 사용하는 교직원 제출과 학생 감염병 보고 항목만 모았습니다.
              </p>
            </div>
            <div className="rounded-[24px] border border-[#DDEAE7] bg-[#F7FBF9] p-4 sm:min-w-64">
              <p className="text-sm font-black text-[#102047]">{displayName} 선생님</p>
              <p className="mt-1 text-xs font-bold text-[#627083]">{CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기</p>
              <div className="mt-3"><RoleBadges roles={assignment?.roles} /></div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isWorking}
                className="mt-4 min-h-11 rounded-2xl border border-[#DDEAE7] bg-white px-4 py-2 text-xs font-black text-[#102047] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                로그아웃
              </button>
            </div>
          </div>
        </header>

        {assignmentResult?.status === "not-found" && (
          <p className="rounded-[24px] border border-[#DDEAE7] bg-white/95 p-4 text-sm font-bold text-[#627083]">
            현재 학기 권한이 등록되지 않아 감염병 발생 보고 항목은 숨김 처리됩니다.
          </p>
        )}
        {(authState.status === "error" || assignmentResult?.status === "permission-denied" || assignmentResult?.status === "error") && (
          <p className="rounded-[24px] border border-[#F6D8D8] bg-[#FFF7F7] p-4 text-sm font-black text-[#B42318]">
            {authState.message || assignmentResult?.message || "권한 정보를 확인하지 못했습니다."}
          </p>
        )}

        <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#20A982]">Active submissions</p>
              <h2 className="mt-2 text-xl font-black text-[#102047]">현재 사용 중인 제출 항목</h2>
            </div>
            <span className="w-fit rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
              {visibleItems.length}개 항목
            </span>
          </div>

          {itemsState.status === "loading" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-[30px] border border-[#DDEAE7] bg-[#F7FBF9]" />
              ))}
            </div>
          )}

          {(itemsState.status === "permission-denied" || itemsState.status === "error") && (
            <p className="mt-5 rounded-[24px] border border-[#F6D8D8] bg-[#FFF7F7] p-5 text-sm font-black text-[#B42318]">
              {itemsState.message}
            </p>
          )}

          {itemsState.status === "success" && visibleItems.length === 0 && (
            <p className="mt-5 rounded-[24px] border border-[#DDEAE7] bg-[#F7FBF9] p-5 text-sm font-black text-[#627083]">
              현재 표시할 제출 항목이 없습니다.
            </p>
          )}

          {itemsState.status === "success" && visibleItems.length > 0 && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {visibleItems.map((item) => <SubmissionCard key={item.id} item={item} />)}
            </div>
          )}
        </section>

        <Link
          to="/firebase-dashboard"
          className="inline-flex min-h-11 items-center rounded-2xl border border-[#DDEAE7] bg-white px-4 py-2 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
        >
          대시보드로 돌아가기
        </Link>
      </div>
    </section>
  );
}
