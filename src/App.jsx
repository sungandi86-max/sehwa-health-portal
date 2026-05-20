import { useEffect, useState } from "react";
import CheckupSection from "./components/CheckupSection.jsx";
import EducationSection from "./components/EducationSection.jsx";
import FAQSection from "./components/FAQSection.jsx";
import Footer from "./components/Footer.jsx";
import Header from "./components/Header.jsx";
import HeroSection from "./components/HeroSection.jsx";
import HomeroomRequestSection from "./components/HomeroomRequestSection.jsx";
import QuickMenu from "./components/QuickMenu.jsx";
import ResourceSection from "./components/ResourceSection.jsx";
import StudentCareSection from "./components/StudentCareSection.jsx";
import TodaySection from "./components/TodaySection.jsx";
import UploadCenter from "./components/UploadCenter.jsx";
import {
  appConfig as fallbackAppConfig,
  checkupItems,
  educationItems,
  faqItems,
  noticeItems,
  resourceItems,
  studentCareItems,
  uploadItems,
} from "./data/fallbackData.js";

const API_URL =
  "https://script.google.com/macros/s/AKfycbxuO7QSiuGGBH5IngMlpMqpZvDhs-mpQhcrYa1SD40gB5gewx-Gs5EUHfuZX0eRDr68/exec?mode=portal";

export default function App() {
  const [portalData, setPortalData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isMounted = true;

    fetch(API_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setPortalData(data);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!isMounted) return;
        setLoadError(String(error));
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // API 데이터가 있으면 사용, 없으면 fallback 데이터 사용
  const liveAppConfig = portalData?.appConfig
    ? { ...fallbackAppConfig, ...portalData.appConfig }
    : fallbackAppConfig;

  const liveNotices = portalData?.notices?.length ? portalData.notices : noticeItems;
  const liveUploads = portalData?.uploads?.length ? portalData.uploads : uploadItems;
  const liveCheckups = portalData?.checkups?.length ? portalData.checkups : checkupItems;
  const liveEducations = portalData?.educations?.length ? portalData.educations : educationItems;
  const liveStudentCare = portalData?.studentCare?.length ? portalData.studentCare : studentCareItems;
  const liveResources = portalData?.resources?.length ? portalData.resources : resourceItems;
  const liveFaqs = portalData?.faqs?.length ? portalData.faqs : faqItems;

  return (
    <main className="min-h-screen bg-[#F7F9FC] font-sans text-[#263238]">
      {/* 로딩 중 토스트 */}
      {isLoading && (
        <div className="fixed left-1/2 top-5 z-[100] -translate-x-1/2 rounded-full bg-[#1A3B8B] px-5 py-3 text-sm font-bold text-white shadow-lg">
          온라인 보건실 자료를 불러오는 중입니다.
        </div>
      )}

      {/* fetch 실패 시 토스트 (샘플 데이터 안내) */}
      {loadError && (
        <div className="fixed left-1/2 top-5 z-[100] -translate-x-1/2 rounded-2xl bg-[#D94F70] px-5 py-3 text-sm font-bold text-white shadow-lg">
          시트 데이터를 불러오지 못해 미리보기 데이터를 표시합니다.
        </div>
      )}

      <Header />
      <HeroSection config={liveAppConfig} />
      <QuickMenu />
      <TodaySection items={liveNotices} />
      <UploadCenter items={liveUploads} />
      <CheckupSection items={liveCheckups} />
      <EducationSection items={liveEducations} />
      <HomeroomRequestSection />
      <StudentCareSection items={liveStudentCare} />
      <ResourceSection items={liveResources} />
      <FAQSection items={liveFaqs} />
      <Footer />
    </main>
  );
}
