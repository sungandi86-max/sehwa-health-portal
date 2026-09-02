import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase.js";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { ensureUserProfile, getUserAssignmentResult } from "../lib/userProfile.js";

const ROLE_LABELS = {
  staff: "교직원",
  homeroom: "담임교사",
  admin: "관리자",
  health_teacher: "보건교사",
};

function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function StatusNotice({ result, schoolYear, semester }) {
  if (!result) return null;

  const noticeStyle = {
    found: "border-[#B8E8D6] bg-[#F0FBF7] text-[#08754B]",
    "not-found": "border-[#F6D99A] bg-[#FFF9EC] text-[#9A5A00]",
    "permission-denied": "border-[#F8B9C8] bg-[#FFF3F6] text-[#B42355]",
    error: "border-[#F8B9C8] bg-[#FFF3F6] text-[#B42355]",
  };

  const message =
    result.status === "found"
      ? `${schoolYear}학년도 ${semester}학기 권한이 확인되었습니다.`
      : result.message;

  return (
    <div className={`rounded-[22px] border px-4 py-3 text-sm font-bold ${noticeStyle[result.status] || noticeStyle.error}`}>
      {message}
    </div>
  );
}

export default function FirebaseTestPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState("");

  const assignment = assignmentResult?.assignment || null;
  const roleLabels = useMemo(() => {
    if (!Array.isArray(assignment?.roles)) return [];
    return assignment.roles.map(getRoleLabel);
  }, [assignment]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfile(null);
      setAssignmentResult(null);
      setMessage("");
      setIsLoading(false);

      if (!currentUser) return;

      setIsProfileLoading(true);
      try {
        const ensuredProfile = await ensureUserProfile(currentUser);
        setProfile(ensuredProfile);

        const currentAssignmentResult = await getUserAssignmentResult(
          currentUser.uid,
          CURRENT_SCHOOL_YEAR,
          CURRENT_SEMESTER
        );
        setAssignmentResult(currentAssignmentResult);
      } catch (error) {
        console.error("[firebase-test] profile load failed", error);
        setMessage("사용자 기본 정보를 불러오지 못했습니다. Firestore 보안 설정을 확인해 주세요.");
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
    <section className="min-h-full bg-[#F7FBF9] px-4 py-6 text-[#102047] sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[30px] border border-[#DDEAE7] bg-white/90 p-6 shadow-[0_18px_48px_rgba(16,32,71,0.08)] sm:p-8">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#20A982]">
                Online Health Office v2
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-[#102047] sm:text-4xl">
                온라인 보건실 v2
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[#627083]">
                교직원 Google 계정으로 로그인해 Firebase 기반 권한 연결 상태를 확인합니다.
              </p>
            </div>
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#DFF8EF] to-[#EEF4FF] text-2xl font-black text-[#20A982] shadow-[0_12px_28px_rgba(32,169,130,0.16)] sm:flex">
              v2
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-[24px] border border-[#E4EEEB] bg-[#FAFDFC] px-5 py-4 text-sm font-bold text-[#627083]">
              로그인 상태를 확인하는 중입니다.
            </div>
          ) : !user ? (
            <div className="rounded-[26px] border border-[#DDEAE7] bg-gradient-to-br from-white to-[#F0FBF7] p-5">
              <h2 className="text-xl font-black text-[#102047]">교직원 Google 계정으로 로그인</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-[#627083]">
                로그인 후 사용자 기본 정보와 현재 학년도/학기 권한 문서를 확인합니다.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isWorking}
                className="mt-5 min-h-12 rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.22)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWorking ? "처리 중..." : "Google 로그인"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-[26px] border border-[#DDEAE7] bg-gradient-to-br from-white to-[#F7FBF9] p-5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#20A982]">
                  Login profile
                </p>
                <h2 className="mt-2 text-2xl font-black text-[#102047]">
                  {user.displayName || profile?.displayName || "이름 미등록"}
                </h2>
                <p className="mt-1 break-all text-sm font-bold text-[#627083]">
                  {user.email || "이메일 없음"}
                </p>
              </div>

              <div className="rounded-[26px] border border-[#DDEAE7] bg-white p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[#20A982]">
                      Current term
                    </p>
                    <h2 className="mt-2 text-xl font-black text-[#102047]">
                      {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기
                    </h2>
                  </div>
                  {isProfileLoading && (
                    <span className="w-fit rounded-full bg-[#EAF8F3] px-3 py-1 text-xs font-black text-[#08754B]">
                      권한 확인 중
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <StatusNotice
                    result={assignmentResult}
                    schoolYear={CURRENT_SCHOOL_YEAR}
                    semester={CURRENT_SEMESTER}
                  />
                </div>

                {assignment && (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold text-[#7B8797]">현재 역할</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {roleLabels.length ? (
                          roleLabels.map((roleLabel) => (
                            <span
                              key={roleLabel}
                              className="rounded-full border border-[#B8E8D6] bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]"
                            >
                              {roleLabel}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm font-bold text-[#627083]">역할 미등록</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#7B8797]">보직</p>
                      <p className="mt-2 text-sm font-black text-[#102047]">
                        {assignment.position || "보직 미등록"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#7B8797]">권한 상태</p>
                      <p className="mt-2 text-sm font-black text-[#102047]">
                        {assignment.active === true ? "활성" : "비활성"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#7B8797]">담임 정보</p>
                      <p className="mt-2 text-sm font-black text-[#102047]">
                        {assignment.grade ? `${assignment.grade}학년 ${assignment.classNo || "-"}반` : "해당 없음"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isWorking}
                  className="min-h-12 rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.2)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isWorking ? "처리 중..." : "Google 로그인"}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isWorking}
                  className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-white px-5 py-3 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  로그아웃
                </button>
              </div>
            </div>
          )}

          {message && (
            <p className="mt-5 rounded-[22px] border border-[#B8E8D6] bg-[#F0FBF7] px-4 py-3 text-sm font-bold text-[#08754B]">
              {message}
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-[28px] border border-[#DDEAE7] bg-white/90 p-5 shadow-[0_14px_36px_rgba(16,32,71,0.06)]">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#20A982]">권한 문서</p>
            <p className="mt-2 text-lg font-black text-[#102047]">
              {user ? assignmentResult?.assignmentId || "확인 중" : `${CURRENT_SCHOOL_YEAR}_${CURRENT_SEMESTER}`}
            </p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#627083]">
              현재 화면은 사용자 기본 정보와 학기별 권한 문서를 분리해서 확인합니다.
            </p>
          </div>

          <div className="rounded-[28px] border border-[#DDEAE7] bg-[#F0FBF7] p-5">
            <p className="text-sm font-black text-[#08754B]">개인정보 저장 최소화</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#31584C]">
              역할과 보직은 학년도/학기별 권한 문서에서만 관리하고, 사용자 문서에는 고정 역할을 저장하지 않습니다.
            </p>
          </div>

          {user && (
            <details className="rounded-[24px] border border-[#DDEAE7] bg-white p-4">
              <summary className="cursor-pointer text-sm font-black text-[#102047]">개발 정보 보기</summary>
              <dl className="mt-4 space-y-3 text-xs">
                <div>
                  <dt className="font-bold text-[#7B8797]">UID</dt>
                  <dd className="mt-1 break-all font-black text-[#102047]">{user.uid}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#7B8797]">assignment status</dt>
                  <dd className="mt-1 font-black text-[#102047]">{assignmentResult?.status || "checking"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#7B8797]">error code</dt>
                  <dd className="mt-1 font-black text-[#102047]">{assignmentResult?.errorCode || "-"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#7B8797]">users.active</dt>
                  <dd className="mt-1 font-black text-[#102047]">
                    {profile ? String(profile.active === true) : "확인 중"}
                  </dd>
                </div>
              </dl>
            </details>
          )}
        </aside>
      </div>
    </section>
  );
}
