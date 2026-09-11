import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { firebaseV2SubmissionItems } from "../data/firebaseV2Navigation.js";
import FirebaseAccessRequestAction from "../components/FirebaseAccessRequestAction.jsx";
import FirebaseSignInActions from "../components/FirebaseSignInActions.jsx";
import SubmitModal from "../components/SubmitModal.jsx";
import {
  PortalBackToHome,
  PortalPageHeader,
  PortalPageLayout,
  PortalSubmissionCard,
} from "../components/PortalSubpageLayout.jsx";
import { auth } from "../lib/firebase.js";
import {
  getFriendlyAuthErrorMessage,
  getMicrosoftSchoolDomainBlockMessage,
  signInWithGoogle,
  signInWithMicrosoft,
  signOutFirebase,
} from "../lib/firebaseAuth.js";
import { getRoleLabels } from "../lib/firebaseRoles.js";
import { fetchPortalUploads } from "../lib/portalContent.js";
import { ensureUserProfile, getInternalDisplayName, getUserAssignmentResult, isHealthTeacher, isHomeroom } from "../lib/userProfile.js";
import { ensureTeamStaffAssignment } from "../lib/teamStaffAccess.js";

const SUBMISSION_ROUTES = {
  cpr: "/firebase-submit/cpr",
  tb: "/firebase-submit/tb",
  recruit: "/firebase-submit/recruit",
  infection: "/firebase-submit/infection",
};

const SUBMISSION_ACTION_LABELS = {
  cpr: "이수증 제출하기",
  tb: "확인증 제출하기",
  recruit: "확인 요청하기",
  infection: "발생 보고하기",
  tb_registration: "단체검진 신청하기",
};

const cardActionClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-[#0D4EA6] bg-[#0D4EA6] px-4 py-2 text-sm font-semibold text-white transition hover:border-[#183B8F] hover:bg-[#183B8F] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15 sm:w-fit";

const INTERNAL_TB_REGISTRATION_GUIDE_MARKERS = [
  "노출시작일",
  "노출종료일",
];

const SHEET_SUBMISSION_TYPES = {
  cpr: {
    sheetName: "응답_심폐소생술이수증",
    aliases: ["cpr", "cpr_certificate", "심폐소생술", "심폐소생술이수증"],
    keywords: ["심폐소생술", "cpr", "이수증"],
  },
  tb_registration: {
    sheetName: "응답_교직원결핵검진유형선택",
    aliases: ["tb_registration", "tb-registration", "tb_reply", "tb_response", "결핵검진유형선택"],
    keywords: ["교직원 결핵검진 단체검진", "교직원 결핵검진 유형", "단체검진 신청", "결핵검진 유형 선택"],
  },
  tb: {
    sheetName: "응답_결핵검진확인증",
    aliases: ["tb", "tb_certificate", "tuberculosis_certificate", "결핵검진확인증"],
    keywords: ["결핵검진 확인증", "결핵검진확인증", "흉부 x-ray", "흉부x-ray"],
  },
  recruit: {
    sheetName: "응답_채용검진확인요청",
    aliases: ["recruit", "recruit_checkup", "employment_checkup", "채용검진"],
    keywords: ["채용검진", "대체 인정", "확인 요청"],
  },
  infection: {
    sheetName: "응답_감염병발생보고",
    aliases: ["infection", "infection_report", "감염병"],
    keywords: ["감염병"],
  },
};

const SHEET_SUBMISSION_TYPE_ORDER = ["cpr", "tb_registration", "tb", "recruit", "infection"];
const STAFF_SUBMISSION_TYPES = new Set(["cpr", "tb_registration", "tb", "recruit"]);

function getCanonicalSubmissionItems(items) {
  const remoteItemsByType = new Map(items.map((item) => [item.submissionType, item]));

  const fixedItems = firebaseV2SubmissionItems.flatMap((baseItem) => {
    const remoteItem = remoteItemsByType.get(baseItem.submissionType);
    if (!remoteItem) return [];

    return {
      ...remoteItem,
      ...baseItem,
      status: remoteItem?.status || baseItem.status,
      deadlineLabel: remoteItem?.deadlineLabel || baseItem.deadlineLabel,
    };
  });

  const extraItems = items.filter((item) => item.submissionType === "tb_registration");

  return [...fixedItems, ...extraItems].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return left.title.localeCompare(right.title, "ko");
  });
}

function normalizeSubmitValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveSheetSubmissionType(item) {
  const explicitType = normalizeSubmitValue(item.uploadType || item.submissionType || item.type);
  if (SHEET_SUBMISSION_TYPE_ORDER.includes(explicitType)) return explicitType;

  const sheetName = normalizeSubmitValue(item.sheetName);
  const sheetMatch = SHEET_SUBMISSION_TYPE_ORDER.find(
    (type) => normalizeSubmitValue(SHEET_SUBMISSION_TYPES[type].sheetName) === sheetName,
  );
  if (sheetMatch) return sheetMatch;

  const identityText = [item.submitType, item.id, item.key, item.url].map(normalizeSubmitValue);
  const aliasMatch = SHEET_SUBMISSION_TYPE_ORDER.find((type) =>
    SHEET_SUBMISSION_TYPES[type].aliases.some((alias) => identityText.includes(normalizeSubmitValue(alias))),
  );
  if (aliasMatch) return aliasMatch;

  const searchableText = normalizeSubmitValue(
    [item.title, ...(item.titleLines || []), item.documentType, item.buttonText, item.fileGuide, item.url]
      .filter(Boolean)
      .join(" "),
  );

  const keywordMatch = SHEET_SUBMISSION_TYPE_ORDER.find((type) =>
    SHEET_SUBMISSION_TYPES[type].keywords.some((keyword) => searchableText.includes(normalizeSubmitValue(keyword))),
  );
  if (keywordMatch) return keywordMatch;

  if (normalizeSubmitValue(item.uploadType) === "request") return "recruit";
  return "";
}

function normalizePortalSubmissionItem(item, index) {
  const submissionType = resolveSheetSubmissionType(item);
  if (!submissionType) return null;
  const guideText = item.fileGuide || item.guideText || "";

  return {
    id: item.id || `${submissionType}-${index}`,
    title: item.title || (submissionType === "tb_registration" ? "교직원 결핵검진 단체검진 신청" : ""),
    description:
      item.description ||
      (submissionType === "tb_registration" ? "교직원 단체 결핵검진 참여 여부를 신청합니다." : ""),
    target: item.target || (submissionType === "tb_registration" ? "교직원" : ""),
    documentType: item.documentType || (submissionType === "tb_registration" ? "선택형 신청" : ""),
    deadlineLabel: item.deadline || item.deadlineLabel || "상시",
    guideText:
      submissionType === "tb_registration" &&
      INTERNAL_TB_REGISTRATION_GUIDE_MARKERS.some((marker) => String(guideText).includes(marker))
        ? ""
        : guideText,
    buttonLabel: item.buttonText || item.buttonLabel || "",
    status: item.status || "접수 중",
    submissionType,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
  };
}

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
  return STAFF_SUBMISSION_TYPES.has(item.submissionType);
}

function AccessMessage({ title, description, action, message }) {
  return (
    <section className="firebase-v2-surface min-h-full bg-[#F7FBF9] px-4 py-8 text-[#102047] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-xl rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 text-center shadow-[0_18px_48px_rgba(16,32,71,0.08)] sm:p-8">
        <h1 className="mt-5 text-2xl font-semibold text-[#102047]">{title}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-[#627083]">{description}</p>
        {message && <p className="mt-4 rounded-2xl bg-[#FFF7F7] px-4 py-3 text-sm font-semibold text-[#B42318]">{message}</p>}
        {action}
      </div>
    </section>
  );
}

function RoleBadges({ roles }) {
  const labels = getRoleLabels(roles);
  if (!labels.length) return <span className="text-xs font-semibold text-[#8A96A8]">권한 미등록</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <span key={label} className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-semibold text-[#08754B]">
          {label}
        </span>
      ))}
    </div>
  );
}

function SubmissionCard({ item }) {
  const href = SUBMISSION_ROUTES[item.submissionType];
  const buttonLabel = SUBMISSION_ACTION_LABELS[item.submissionType] || item.buttonLabel || "제출하기";

  return (
    <PortalSubmissionCard
      title={item.title}
      description={item.description}
      status={item.status}
      deadline={item.deadlineLabel}
      target={item.target}
      documentType={item.documentType}
      guideText={item.guideText}
      action={
        item.onOpen ? (
          <button type="button" onClick={item.onOpen} className={cardActionClass}>
            {buttonLabel} →
          </button>
        ) : (
          <Link to={href} className={cardActionClass}>
            {buttonLabel} →
          </Link>
        )
      }
    />
  );
}

export default function FirebaseSubmissionsPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [items, setItems] = useState([]);
  const [tbConfig, setTbConfig] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [authState, setAuthState] = useState({ status: "loading", message: "" });
  const [itemsState, setItemsState] = useState({ status: "idle", message: "" });
  const [isWorking, setIsWorking] = useState(false);

  const assignment = assignmentResult?.assignment || null;
  const visibleItems = useMemo(
    () =>
      getCanonicalSubmissionItems(items)
        .filter((item) => canShowSubmissionItem(item, assignment))
        .map((item) =>
          item.submissionType === "tb_registration"
            ? { ...item, onOpen: () => setModalType("tb_registration") }
            : item,
        ),
    [assignment, items],
  );
  const displayName = getInternalDisplayName({ profile, user }) || "교직원";

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
        const teamStaffResult = await ensureTeamStaffAssignment(currentUser, ensuredProfile);
        if (teamStaffResult.ok === false) {
          setAuthState({ status: "error", message: teamStaffResult.message });
          return;
        }

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
        const portal = await fetchPortalUploads();
        const nextItems = (portal?.uploads || [])
          .map(normalizePortalSubmissionItem)
          .filter(Boolean);
        if (shouldIgnore) return;
        setItems(nextItems);
        setTbConfig(portal?.tbConfig || null);
        setItemsState({ status: "success", message: "" });
      } catch (error) {
        if (shouldIgnore) return;
        console.error("[firebase-submissions] portal upload load failed", error);
        setItems([]);
        setTbConfig(null);
        setItemsState({
          status: "error",
          message: "제출 항목을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.",
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
        message: getFriendlyAuthErrorMessage(error, "Google 계정으로 로그인하지 못했습니다."),
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
        description="교사: Teams · 그 외 교직원: Google"
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
    <PortalPageLayout>
      <PortalBackToHome />
      <PortalPageHeader
        label="제출·보고 센터"
        title="제출·보고 센터"
        description="교직원 제출 및 학생 관련 보고 업무를 확인할 수 있습니다."
        identity={(
          <>
              <p className="text-sm font-semibold text-[#102047]">{displayName} 선생님</p>
              <p className="mt-1 text-xs font-normal text-[#627083]">{CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기</p>
              <div className="mt-3"><RoleBadges roles={assignment?.roles} /></div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isWorking}
                className="mt-3 inline-flex min-h-9 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047] transition hover:border-[#0D4EA6] disabled:cursor-not-allowed disabled:opacity-50"
              >
                로그아웃
              </button>
          </>
        )}
      />

        {assignmentResult?.status === "not-found" && (
          <div className="rounded-[16px] border border-[#DDEAE7] bg-white p-4 text-sm font-semibold text-[#627083]">
            <p>현재 학기 이용 권한이 없습니다.</p>
            <FirebaseAccessRequestAction user={user} />
          </div>
        )}
        {(authState.status === "error" || assignmentResult?.status === "permission-denied" || assignmentResult?.status === "error") && (
          <p className="rounded-[16px] border border-[#F6D8D8] bg-[#FFF7F7] p-4 text-sm font-semibold text-[#B42318]">
            {authState.message || assignmentResult?.message || "권한 정보를 확인하지 못했습니다."}
          </p>
        )}

        <section className="rounded-[14px] border border-[#DDEAE7] bg-white p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#102047]">제출 항목</h2>
              <p className="mt-0.5 text-xs text-[#627083]">현재 접수 중인 제출·보고 항목</p>
            </div>
            <span className="w-fit rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1 text-xs font-semibold text-[#627083]">
              {visibleItems.length}개 항목
            </span>
          </div>

          {itemsState.status === "loading" && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-[214px] animate-pulse rounded-[14px] border border-[#DDEAE7] bg-[#F7FBF9]" />
              ))}
            </div>
          )}

          {(itemsState.status === "permission-denied" || itemsState.status === "error") && (
            <p className="mt-4 rounded-[12px] border border-[#F6D8D8] bg-[#FFF7F7] p-4 text-sm font-semibold text-[#B42318]">
              {itemsState.message}
            </p>
          )}

          {itemsState.status === "success" && visibleItems.length === 0 && (
            <p className="mt-4 rounded-[12px] border border-[#DDEAE7] bg-[#F7FBF9] p-4 text-sm font-semibold text-[#627083]">
              현재 표시할 제출 항목이 없습니다.
            </p>
          )}

          {itemsState.status === "success" && visibleItems.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleItems.map((item) => <SubmissionCard key={item.id} item={item} />)}
            </div>
          )}
        </section>
        {modalType && (
          <SubmitModal type={modalType} onClose={() => setModalType(null)} tbConfig={tbConfig} />
        )}
    </PortalPageLayout>
  );
}
