import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Footer from "./components/Footer.jsx";
import Header from "./components/Header.jsx";
import CheckupPage from "./pages/CheckupPage.jsx";
import EducationPage from "./pages/EducationPage.jsx";
import FAQPage from "./pages/FAQPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import HomeroomPage from "./pages/HomeroomPage.jsx";
import ResourcesPage from "./pages/ResourcesPage.jsx";
import StudentCarePage from "./pages/StudentCarePage.jsx";
import TodayPage from "./pages/TodayPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
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
import { GAS_BASE_URL } from "./config.js";

const GAS_BASE = GAS_BASE_URL;

// ── 스켈레톤 UI ──────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-3 h-4 w-16 rounded-full bg-slate-200" />
      <div className="h-5 w-3/4 rounded-lg bg-slate-200" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-5/6 rounded bg-slate-100" />
        <div className="h-3 w-4/6 rounded bg-slate-100" />
      </div>
      <div className="mt-4 h-10 w-32 rounded-2xl bg-slate-200" />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-5 animate-pulse">
        <div className="mb-2 h-3 w-20 rounded bg-slate-200" />
        <div className="h-7 w-48 rounded-lg bg-slate-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

export default function App() {
  const [portalData, setPortalData] = useState(null);
  const [tbConfig, setTbConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    Promise.all([
      fetch(`${GAS_BASE}?mode=portal`, { signal: controller.signal })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      fetch(`${GAS_BASE}?action=getTbConfig`, { signal: controller.signal })
        .then((r) => r.json()),
    ])
      .then(([portal, tbCfg]) => {
        clearTimeout(timeoutId);
        setPortalData(portal);
        setTbConfig(tbCfg?.result === "success" ? tbCfg.config : { enabled: "FALSE" });
        setIsLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        setLoadError(String(err));
        setIsLoading(false);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const liveAppConfig = portalData?.appConfig
    ? { ...fallbackAppConfig, ...portalData.appConfig }
    : fallbackAppConfig;

  const liveNotices    = portalData?.notices?.length     ? portalData.notices     : noticeItems;
  const liveUploads    = portalData?.uploads?.length     ? portalData.uploads     : uploadItems;
  const liveCheckups   = portalData?.checkups?.length    ? portalData.checkups    : checkupItems;
  const liveEducations = portalData?.educations?.length  ? portalData.educations  : educationItems;
  const liveStudentCare = portalData?.studentCare?.length ? portalData.studentCare : studentCareItems;
  const liveResources  = portalData?.resources?.length   ? portalData.resources   : resourceItems;
  const liveFaqs       = portalData?.faqs?.length        ? portalData.faqs        : faqItems;

  return (
    <BrowserRouter>
      <main className="min-h-screen bg-[#F7F9FC] font-sans text-[#263238]">
        <Header />

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {loadError && (
              <div className="mx-auto mb-2 max-w-6xl px-4">
                <div className="rounded-2xl bg-[#FFF5F8] px-5 py-3 text-sm font-bold text-[#D94F70]">
                  시트 데이터를 불러오지 못해 미리보기 데이터를 표시합니다.
                </div>
              </div>
            )}
            <Routes>
              <Route path="/"            element={<HomePage        config={liveAppConfig} />} />
              <Route path="/today"       element={<TodayPage       items={liveNotices} />} />
              <Route path="/upload"      element={<UploadPage      items={liveUploads} />} />
              <Route path="/checkup"     element={<CheckupPage     items={liveCheckups} tbConfig={tbConfig} />} />
              <Route path="/education"   element={<EducationPage   items={liveEducations} />} />
              <Route path="/homeroom"    element={<HomeroomPage />} />
              <Route path="/student-care" element={<StudentCarePage items={liveStudentCare} />} />
              <Route path="/resources"   element={<ResourcesPage   items={liveResources} />} />
              <Route path="/faq"         element={<FAQPage         items={liveFaqs} />} />
            </Routes>
          </>
        )}

        <Footer />
      </main>
    </BrowserRouter>
  );
}
