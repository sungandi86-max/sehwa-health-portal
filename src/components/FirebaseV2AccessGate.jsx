import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { auth, googleProvider } from "../lib/firebase.js";
import { ensureUserProfile, getUserAssignmentResult, isHealthTeacher } from "../lib/userProfile.js";

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

export default function FirebaseV2AccessGate({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState("");

  const assignment = assignmentResult?.assignment || null;
  const hasHealthTeacherAccess = isHealthTeacher(assignment) && assignment?.active === true;
  const displayName = useMemo(() => user?.displayName || profile?.displayName || "교직원", [profile, user]);

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
        console.error("[firebase-v2] profile load failed", error);
        setMessage("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const handleSignIn = async () => {
    setIsWorking(true);
    setMessage("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("[firebase-v2] sign in failed", error);
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
      console.error("[firebase-v2] sign out failed", error);
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
        description="Firebase v2 화면은 교직원 Google 계정 로그인 후 사용할 수 있습니다."
        action={
          <>
            {message && <p className="mt-4 text-sm font-bold text-[#B42318]">{message}</p>}
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isWorking}
              className="mt-6 min-h-12 rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.22)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isWorking ? "처리 중..." : "Google 로그인"}
            </button>
          </>
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
        description="현재 계정은 온라인 보건실 v2 콘텐츠 화면에 접근할 수 없습니다."
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

  return children({ user, profile, assignment, displayName, handleSignOut, isWorking });
}
