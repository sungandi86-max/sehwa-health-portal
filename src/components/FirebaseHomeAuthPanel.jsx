import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";
import FirebaseAccessRequestAction from "./FirebaseAccessRequestAction.jsx";
import FirebaseSignInActions from "./FirebaseSignInActions.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { auth } from "../lib/firebase.js";
import {
  getFriendlyAuthErrorMessage,
  getMicrosoftSchoolDomainBlockMessage,
  signInWithGoogle,
  signInWithMicrosoft,
  signOutFirebase,
} from "../lib/firebaseAuth.js";
import { getRoleLabels } from "../lib/firebaseRoles.js";
import { ensureTeamStaffAssignment } from "../lib/teamStaffAccess.js";
import { ensureUserProfile, getUserAssignmentResult, isHealthTeacher } from "../lib/userProfile.js";

const HOURLY_INSTRUCTOR_POSITIONS = new Set(["강사", "시간강사"]);

function normalizePosition(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function canOpenMySubmissionStatus(assignment) {
  return assignment?.active === true && !HOURLY_INSTRUCTOR_POSITIONS.has(normalizePosition(assignment.position));
}

function RoleSummary({ assignment }) {
  const labels = getRoleLabels(assignment?.roles);

  if (!assignment) return <span className="text-sm font-semibold text-[#627083]">권한 확인 필요</span>;
  if (!labels.length) return <span className="text-sm font-semibold text-[#627083]">역할 미등록</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <span key={label} className="rounded-full border border-[#BFEBDC] bg-[#F0FBF7] px-3 py-1 text-xs font-semibold text-[#08754B]">
          {label}
        </span>
      ))}
    </div>
  );
}

export default function FirebaseHomeAuthPanel({ className = "" }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [status, setStatus] = useState("loading");
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState("");

  const assignment = assignmentResult?.assignment || null;
  const displayName = user?.displayName || profile?.displayName || "교직원";
  const canOpenDashboard = useMemo(() => isHealthTeacher(assignment) && assignment?.active === true, [assignment]);
  const canOpenMyStatus = useMemo(() => canOpenMySubmissionStatus(assignment), [assignment]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfile(null);
      setAssignmentResult(null);
      setStatus(currentUser ? "loading" : "signed-out");
      if (currentUser) setMessage("");

      if (!currentUser) return;

      try {
        const blockedMessage = getMicrosoftSchoolDomainBlockMessage(currentUser);
        if (blockedMessage) {
          await signOutFirebase();
          setUser(null);
          setStatus("signed-out");
          setMessage(blockedMessage);
          return;
        }

        const ensuredProfile = await ensureUserProfile(currentUser);
        const teamStaffResult = await ensureTeamStaffAssignment(currentUser, ensuredProfile);
        if (teamStaffResult.ok === false) {
          setStatus("error");
          setMessage(teamStaffResult.message);
          return;
        }

        const nextAssignmentResult = await getUserAssignmentResult(currentUser.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
        setProfile(ensuredProfile);
        setAssignmentResult(nextAssignmentResult);
        setStatus("signed-in");
      } catch (error) {
        console.error("[firebase-home] auth load failed", error);
        setStatus("error");
        setMessage("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });

    return unsubscribe;
  }, []);

  const handleMicrosoftSignIn = async () => {
    setIsWorking(true);
    setMessage("");
    try {
      await signInWithMicrosoft();
    } catch (error) {
      console.error("[firebase-home] sign in failed", error);
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
      console.error("[firebase-home] google sign in failed", error);
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
      console.error("[firebase-home] sign out failed", error);
      setMessage("로그아웃 중 문제가 발생했습니다.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className={`rounded-[14px] border border-[#DDEAE7] bg-[#F7FBF9] p-3 text-[#102047] ${className}`}>
      <p className="text-[11px] font-semibold text-[#20A982]">교직원 로그인</p>
      <p className="mt-1 text-xs font-medium leading-5 text-[#627083]" style={{ wordBreak: "keep-all" }}>
        교사는 학교 Teams 계정을, 그 외 교직원은 등록된 Google 계정을 사용할 수 있습니다.
      </p>

      {status === "loading" && (
        <p className="mt-3 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 text-xs font-semibold text-[#627083]">
          로그인 상태 확인 중
        </p>
      )}

      {status !== "loading" && !user && (
        <FirebaseSignInActions
          compact
          isWorking={isWorking}
          message={message}
          onGoogleSignIn={handleGoogleSignIn}
          onMicrosoftSignIn={handleMicrosoftSignIn}
        />
      )}

      {user && (
        <div className="mt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#102047]">{displayName}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[#627083]">{user.email || "이메일 없음"}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isWorking}
              className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047] disabled:cursor-not-allowed disabled:opacity-50"
            >
              로그아웃
            </button>
          </div>
          <div className="mt-3">
            <p className="mb-2 text-xs font-semibold text-[#627083]">
              {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기 현재 권한
            </p>
            <RoleSummary assignment={assignment} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/firebase-submissions"
              className="inline-flex min-h-10 items-center rounded-[10px] bg-[#20A982] px-3 py-1.5 text-xs font-semibold text-white"
            >
              제출·보고 센터
            </Link>
            {canOpenMyStatus && (
              <Link
                to="/my-submission-status"
                className="inline-flex min-h-10 items-center rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047]"
              >
                나의 제출·이수 현황
              </Link>
            )}
            {canOpenDashboard && (
              <Link
                to="/firebase-dashboard"
                className="inline-flex min-h-10 items-center rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047]"
              >
                대시보드
              </Link>
            )}
          </div>
          {assignmentResult?.status === "not-found" && <FirebaseAccessRequestAction user={user} />}
          {message && (
            <p className="mt-3 rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2 text-xs font-semibold text-[#B42318]">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
