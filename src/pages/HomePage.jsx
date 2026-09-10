import { useEffect, useMemo, useState } from "react";
import FirebaseHomeAuthPanel from "../components/FirebaseHomeAuthPanel.jsx";
import HeroSection from "../components/HeroSection.jsx";
import HomeDashboardSummary from "../components/HomeDashboardSummary.jsx";
import PwaInstallCard from "../components/PwaInstallCard.jsx";
import QuickMenu from "../components/QuickMenu.jsx";
import { firebaseV2MenuItems } from "../data/firebaseV2Navigation.js";
import { quickMenuItems } from "../data/fallbackData.js";
import { fetchPortalContent } from "../lib/portalContent.js";

const legacyMenuRoutes = {
  homeroom: "/homeroom",
  studentCare: "/student-care",
  resources: "/resources",
};

const portalHomePrivacyNotice =
  "학생 개인정보·민감정보는 화면에 직접 표시하지 않으며, 제출 자료는 보건교사가 관리자 화면에서 확인합니다.";

function mergeDatedItems(...groups) {
  return groups
    .flat()
    .filter((item) => item?.title && (item.schedule || item.period || item.date || item.deadline))
    .slice(0, 6);
}

function formatHomeDate(date) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})`;
}

export default function HomePage({ config }) {
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
    const controller = new AbortController();

    async function loadHomeContent() {
      const [today, checkups, education] = await Promise.allSettled([
        fetchPortalContent("today", controller.signal),
        fetchPortalContent("checkups", controller.signal),
        fetchPortalContent("education", controller.signal),
      ]);

      if (shouldIgnore) return;

      const notices = today.status === "fulfilled" && Array.isArray(today.value?.notices)
        ? today.value.notices
        : [];
      const checkupItems = checkups.status === "fulfilled" && Array.isArray(checkups.value?.checkups)
        ? checkups.value.checkups
        : [];
      const educationItems = education.status === "fulfilled" && Array.isArray(education.value?.educations)
        ? education.value.educations
        : [];

      setHomeContent({
        notices,
        schedules: mergeDatedItems(educationItems, checkupItems, notices),
        isLoading: false,
      });
    }

    loadHomeContent();

    return () => {
      shouldIgnore = true;
      controller.abort();
    };
  }, []);

  return (
    <>
      <HeroSection config={portalHomeConfig} action={<FirebaseHomeAuthPanel className="h-full" />} />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 pb-3 pt-3 sm:px-4 lg:max-w-[1280px] md:flex-row md:items-end md:justify-between">
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
