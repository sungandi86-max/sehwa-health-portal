import { useEffect, useMemo, useRef, useState } from "react";
import FirebaseHomeAuthPanel from "../components/FirebaseHomeAuthPanel.jsx";
import HeroSection from "../components/HeroSection.jsx";
import HomeDashboardSummary from "../components/HomeDashboardSummary.jsx";
import PwaInstallCard from "../components/PwaInstallCard.jsx";
import QuickMenu from "../components/QuickMenu.jsx";
import { firebaseV2MenuItems } from "../data/firebaseV2Navigation.js";
import { quickMenuItems } from "../data/fallbackData.js";
import { fetchPortalContent } from "../lib/portalContent.js";
import { buildHomeSchedules, filterCurrentPortalItems } from "../lib/portalSchedule.js";

const legacyMenuRoutes = {
  homeroom: "/homeroom",
  studentCare: "/student-care",
  resources: "/resources",
};

const portalHomePrivacyNotice =
  "학생 개인정보·민감정보는 화면에 직접 표시하지 않으며, 제출 자료는 보건교사가 관리자 화면에서 확인합니다.";

function formatHomeDate(date) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})`;
}

export default function HomePage({ config }) {
  const sourceContentRef = useRef({ notices: [], checkups: [], educations: [] });
  const [homeContent, setHomeContent] = useState({
    notices: [],
    schedules: [],
    isLoading: true,
  });

  const portalHomeConfig = {
    ...config,
    privacyNotice: portalHomePrivacyNotice,
    managerNote: "",
  };
  const restoredMenuItems = useMemo(() => {
    const firebaseMenuById = new Map(firebaseV2MenuItems.map((item) => [item.id, item]));
    const legacyMenuById = new Map(quickMenuItems.map((item) => [item.id, item]));

    return [
      firebaseMenuById.get("today"),
      firebaseMenuById.get("upload"),
      firebaseMenuById.get("checkup"),
      firebaseMenuById.get("education"),
      { ...legacyMenuById.get("homeroom"), href: legacyMenuRoutes.homeroom },
      {
        ...legacyMenuById.get("studentCare"),
        href: legacyMenuRoutes.studentCare,
        description: "권한에 따라 학생 건강관리 자료와 보건실 현황을 확인합니다.",
      },
      { ...legacyMenuById.get("resources"), href: legacyMenuRoutes.resources },
      firebaseMenuById.get("faq"),
    ].filter(Boolean);
  }, []);

  useEffect(() => {
    let shouldIgnore = false;
    let activeController = null;
    let requestId = 0;

    async function loadHomeContent() {
      const currentRequestId = ++requestId;
      activeController?.abort();
      activeController = new AbortController();
      const now = new Date();
      const [today, checkups, education] = await Promise.allSettled([
        fetchPortalContent("today", activeController.signal),
        fetchPortalContent("checkups", activeController.signal),
        fetchPortalContent("education", activeController.signal),
      ]);

      if (shouldIgnore || currentRequestId !== requestId) return;

      if (today.status === "fulfilled" && Array.isArray(today.value?.notices)) {
        sourceContentRef.current.notices = today.value.notices;
      }
      if (checkups.status === "fulfilled" && Array.isArray(checkups.value?.checkups)) {
        sourceContentRef.current.checkups = checkups.value.checkups;
      }
      if (education.status === "fulfilled" && Array.isArray(education.value?.educations)) {
        sourceContentRef.current.educations = education.value.educations;
      }

      const notices = filterCurrentPortalItems(sourceContentRef.current.notices, now);
      const educationSchedules = sourceContentRef.current.educations.map((item) => ({
        ...item,
        sourceType: "education",
        href: "/education",
      }));
      const checkupSchedules = sourceContentRef.current.checkups.map((item) => ({
        ...item,
        sourceType: "checkup",
        href: "/checkup",
      }));
      const noticeSchedules = notices.map((item) => ({
        ...item,
        sourceType: "today",
        href: "/today",
      }));

      setHomeContent({
        notices,
        schedules: buildHomeSchedules([
          educationSchedules,
          checkupSchedules,
          noticeSchedules,
        ], now),
        isLoading: false,
      });
    }

    loadHomeContent();
    const handleFocus = () => loadHomeContent();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") loadHomeContent();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      shouldIgnore = true;
      activeController?.abort();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <>
      <HeroSection config={portalHomeConfig} action={<FirebaseHomeAuthPanel className="h-full" />} />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-1.5 px-3 pb-2.5 pt-2.5 sm:px-4 lg:max-w-[1280px] md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold leading-tight text-[#102047]">주요 메뉴</h2>
          <p className="mt-1 text-sm font-normal leading-5 text-[#627083]">
            세화여자고등학교 보건실의 주요 서비스를 한눈에 확인하세요.
          </p>
        </div>
        <p className="text-xs font-medium tabular-nums text-[#627083]">
          {formatHomeDate(new Date())}
        </p>
      </section>
      <QuickMenu items={restoredMenuItems} variant="portalCompact" />
      <HomeDashboardSummary notices={homeContent.notices} schedules={homeContent.schedules} isLoading={homeContent.isLoading} />
      <PwaInstallCard />
    </>
  );
}
