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

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    fetch(`${GAS_BASE}?mode=portal`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((portal) => {
        clearTimeout(timeoutId);
        setPortalData(portal);
        setTbConfig(portal?.tbConfig || { enabled: "FALSE" });
        setIsLoading(false);
      })
      .catch(() => {
        clearTimeout(timeoutId);
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
  const liveResources  = Array.isArray(portalData?.resources) ? portalData.resources : [];
  const liveFaqs       = portalData?.faqs?.length        ? portalData.faqs        : faqItems;
  const resourcesLoadFailed = !portalData;

  return (
    <BrowserRouter>
      <main className="min-h-screen bg-[#F7F9FC] font-sans text-[#263238]">
        <Header />

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            <Routes>
              <Route path="/"            element={<HomePage        config={liveAppConfig} />} />
              <Route path="/today"       element={<TodayPage       items={liveNotices} />} />
              <Route path="/upload"      element={<UploadPage      items={liveUploads} />} />
              <Route path="/checkup"     element={<CheckupPage     items={liveCheckups} tbConfig={tbConfig} />} />
              <Route path="/education"   element={<EducationPage   items={liveEducations} />} />
              <Route path="/homeroom"    element={<HomeroomPage />} />
              <Route path="/student-care" element={<StudentCarePage items={liveStudentCare} />} />
              <Route path="/resources"   element={<ResourcesPage   items={liveResources} loadFailed={resourcesLoadFailed} />} />
              <Route path="/faq"         element={<FAQPage         items={liveFaqs} />} />
            </Routes>
          </>
        )}

        <Footer />
      </main>
    </BrowserRouter>
  );
}
