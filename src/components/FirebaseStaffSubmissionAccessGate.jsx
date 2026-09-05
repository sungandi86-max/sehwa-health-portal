import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import FirebaseAccessRequestAction from "./FirebaseAccessRequestAction.jsx";
import FirebaseSignInActions from "./FirebaseSignInActions.jsx";
import { auth } from "../lib/firebase.js";
import {
  getFriendlyAuthErrorMessage,
  getMicrosoftSchoolDomainBlockMessage,
  signInWithGoogle,
  signInWithMicrosoft,
  signOutFirebase,
} from "../lib/firebaseAuth.js";
import { ensureTeamStaffAssignment } from "../lib/teamStaffAccess.js";
import { getAuthenticatedStaffIdentity } from "../lib/staffIdentity.js";
import { ensureUserProfile, getUserAssignmentResult } from "../lib/userProfile.js";

function AccessMessage({ title, description, action }) {
  return (
    <section className="firebase-v2-surface min-h-full bg-[#F7FBF9] px-4 py-8 text-[#102047] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-xl rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 text-center shadow-[0_18px_48px_rgba(16,32,71,0.08)] sm:p-8">
        <h1 className="mt-5 text-2xl font-black tracking-[-0.02em] text-[#102047]">{title}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-[#627083]">{description}</p>
        {action}
      </div>
    </section>
  );
}

function SignOutButton({ disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-4 min-h-12 rounded-2xl border border-[#DDEAE7] bg-white px-5 py-3 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
    >
      로그아웃
    </button>
  );
}

export default function FirebaseStaffSubmissionAccessGate({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [staffIdentity, setStaffIdentity] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState("");

  const assignment = assignmentResult?.assignment || null;
  const hasActiveStaffAccess = assignment?.active === true;
  const displayName = useMemo(() => user?.displayName || profile?.displayName || "교직원", [profile, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfile(null);
      setStaffIdentity(null);
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

        let currentStaffIdentity = null;
        if (currentAssignmentResult.assignment?.staffId) {
          try {
            currentStaffIdentity = await getAuthenticatedStaffIdentity();
          } catch (error) {
            currentStaffIdentity = null;
          }
        }

        setProfile(ensuredProfile);
        setStaffIdentity(currentStaffIdentity);
        setAssignmentResult(currentAssignmentResult);
      } catch (error) {
        console.error("[firebase-staff-submission] access load failed", error);
        setMessage("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setIsLoading(false);
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
      console.error("[firebase-staff-submission] sign in failed", error);
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
      console.error("[firebase-staff-submission] google sign in failed", error);
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
      console.error("[firebase-staff-submission] sign out failed", error);
      setMessage("로그아웃 중 문제가 발생했습니다.");
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading) {
    return <AccessMessage title="온라인 보건실" description="로그인 상태와 현재 학기 권한을 확인하는 중입니다." />;
  }

  if (!user) {
    return (
      <AccessMessage
        title="교직원 제출"
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
        action={
          <>
            <FirebaseAccessRequestAction user={user} />
            <SignOutButton disabled={isWorking} onClick={handleSignOut} />
          </>
        }
      />
    );
  }

  if (assignmentResult?.status === "permission-denied" || assignmentResult?.status === "error" || message) {
    return (
      <AccessMessage
        title="권한 정보를 확인할 수 없습니다."
        description={message || assignmentResult?.message || "Firestore 보안 설정과 권한 문서를 확인해 주세요."}
        action={<SignOutButton disabled={isWorking} onClick={handleSignOut} />}
      />
    );
  }

  if (!hasActiveStaffAccess) {
    return (
      <AccessMessage
        title="현재 학기 이용 권한이 비활성 상태입니다."
        description="보건실에서 현재 학기 권한을 확인한 뒤 다시 이용해 주세요."
        action={<SignOutButton disabled={isWorking} onClick={handleSignOut} />}
      />
    );
  }

  return children({ user, profile, assignment, staffIdentity, displayName, handleSignOut, isWorking });
}
