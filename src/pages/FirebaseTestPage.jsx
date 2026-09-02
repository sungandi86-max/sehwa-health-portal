import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase.js";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { ensureUserProfile, getUserAssignment } from "../lib/userProfile.js";

export default function FirebaseTestPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfile(null);
      setAssignment(null);
      setIsLoading(false);

      if (!currentUser) return;

      setIsProfileLoading(true);
      try {
        const ensuredProfile = await ensureUserProfile(currentUser);
        const currentAssignment = await getUserAssignment(
          currentUser.uid,
          CURRENT_SCHOOL_YEAR,
          CURRENT_SEMESTER
        );

        setProfile(ensuredProfile);
        setAssignment(currentAssignment);
      } catch (error) {
        console.error("[firebase-test] profile load failed", error);
        setMessage("사용자 권한 정보를 불러오지 못했습니다. Firestore Rules와 문서 권한을 확인해 주세요.");
      } finally {
        setIsProfileLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const handleSignIn = async () => {
    setIsWorking(true);
    setMessage("");

    try {
      await signInWithPopup(auth, googleProvider);
      setMessage("Google 로그인이 완료되었습니다.");
    } catch (error) {
      console.error("[firebase-test] sign in failed", error);
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
      setMessage("로그아웃되었습니다.");
    } catch (error) {
      console.error("[firebase-test] sign out failed", error);
      setMessage("로그아웃 중 문제가 발생했습니다.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
      <div className="rounded-[28px] border border-[rgba(120,140,180,0.14)] bg-white/80 p-6 shadow-[var(--shh-shadow)] backdrop-blur sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--shh-violet)]">
          Firebase v2 test
        </p>
        <h1 className="mt-2 text-2xl font-black text-[#0F1F4B] sm:text-3xl">
          Google 로그인 테스트
        </h1>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
          기존 온라인 보건실 기능과 분리된 Firebase v2 개발용 확인 화면입니다.
          로그인 시 사용자 기본 문서만 확인하고, 학년도/학기별 권한은 별도 문서로 조회합니다.
        </p>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-[#F8FAFF] p-5">
          {isLoading ? (
            <p className="text-sm font-semibold text-slate-600">로그인 상태를 확인하는 중입니다.</p>
          ) : user ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold text-slate-500">Email</p>
                <p className="break-all text-sm font-black text-[#183B8F]">{user.email || "이메일 없음"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500">UID</p>
                <p className="break-all text-sm font-black text-[#183B8F]">{user.uid}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500">Display name</p>
                <p className="break-all text-sm font-black text-[#183B8F]">
                  {user.displayName || profile?.displayName || "이름 없음"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500">users.active</p>
                <p className="text-sm font-black text-[#183B8F]">
                  {profile ? String(profile.active === true) : "확인 중"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-600">현재 로그인된 사용자가 없습니다.</p>
          )}
        </div>

        {user && (
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500">현재 학년도/학기</p>
                <p className="text-sm font-black text-[#183B8F]">
                  {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기
                </p>
              </div>
              {isProfileLoading && (
                <span className="rounded-full bg-[#EEF1FF] px-3 py-1 text-xs font-black text-[#183B8F]">
                  권한 확인 중
                </span>
              )}
            </div>

            {!isProfileLoading && assignment ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-slate-500">roles</p>
                  <p className="break-all text-sm font-black text-[#183B8F]">
                    {Array.isArray(assignment.roles) && assignment.roles.length
                      ? assignment.roles.join(", ")
                      : "역할 없음"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500">assignment.active</p>
                  <p className="text-sm font-black text-[#183B8F]">{String(assignment.active === true)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500">grade / classNo</p>
                  <p className="text-sm font-black text-[#183B8F]">
                    {assignment.grade || "-"}학년 {assignment.classNo || "-"}반
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500">position</p>
                  <p className="break-all text-sm font-black text-[#183B8F]">
                    {assignment.position || "보직 미등록"}
                  </p>
                </div>
              </div>
            ) : (
              !isProfileLoading && (
                <p className="mt-4 rounded-2xl bg-[#FFF8E8] px-4 py-3 text-sm font-bold text-[#9A5A00]">
                  현재 학년도/학기 권한이 등록되지 않았습니다.
                </p>
              )
            )}
          </div>
        )}

        {message && (
          <p className="mt-4 rounded-2xl bg-[#EEF8F4] px-4 py-3 text-sm font-bold text-[#08754B]">
            {message}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isWorking}
            className="min-h-12 rounded-2xl bg-[var(--shh-primary)] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(24,59,143,0.24)] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? "처리 중..." : "Google 로그인"}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isWorking || !user}
            className="min-h-12 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-[#183B8F] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            로그아웃
          </button>
        </div>
      </div>
    </section>
  );
}
