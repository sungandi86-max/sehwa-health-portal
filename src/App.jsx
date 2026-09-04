import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Footer from "./components/Footer.jsx";
import FirebaseAuthRedirectHandler from "./components/FirebaseAuthRedirectHandler.jsx";
import {
  appConfig as fallbackAppConfig,
  checkupItems,
  educationItems,
  faqItems,
  noticeItems,
  studentCareItems,
  uploadItems,
} from "./data/fallbackData.js";

const PORTAL_API_URL = "/api/portal";
const DEV_PORTAL_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/portal";

const AdminAuthGate = lazy(() => import("./components/AdminAuthGate.jsx"));
const Header = lazy(() => import("./components/Header.jsx"));
const AdminMessageHelperPage = lazy(() => import("./pages/AdminMessageHelperPage.jsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.jsx"));
const AdminInfectionReportPage = lazy(() => import("./pages/AdminInfectionReportPage.jsx"));
const AdminReceiptStatusPage = lazy(() => import("./pages/AdminReceiptStatusPage.jsx"));
const AdminRoadmapPage = lazy(() => import("./pages/AdminRoadmapPage.jsx"));
const CheckupPage = lazy(() => import("./pages/CheckupPage.jsx"));
const EducationPage = lazy(() => import("./pages/EducationPage.jsx"));
const FAQPage = lazy(() => import("./pages/FAQPage.jsx"));
const FirebaseAccessRequestsPage = lazy(() => import("./pages/FirebaseAccessRequestsPage.jsx"));
const FirebaseAdminSubmissionsPage = lazy(() => import("./pages/FirebaseAdminSubmissionsPage.jsx"));
const FirebaseCheckupsPage = lazy(() => import("./pages/FirebaseCheckupsPage.jsx"));
const FirebaseCprSubmitPage = lazy(() => import("./pages/FirebaseCprSubmitPage.jsx"));
const FirebaseDashboardPage = lazy(() => import("./pages/FirebaseDashboardPage.jsx"));
const FirebaseEducationPage = lazy(() => import("./pages/FirebaseEducationPage.jsx"));
const FirebaseFaqPage = lazy(() => import("./pages/FirebaseFaqPage.jsx"));
const FirebaseInfectionSubmitPage = lazy(() => import("./pages/FirebaseInfectionSubmitPage.jsx"));
const FirebaseRecruitSubmitPage = lazy(() => import("./pages/FirebaseRecruitSubmitPage.jsx"));
const FirebaseStaffSubmissionStatusAdminPage = lazy(() =>
  import("./pages/FirebaseStaffSubmissionStatusAdminPage.jsx")
);
const FirebaseSubmissionStatusPage = lazy(() => import("./pages/FirebaseSubmissionStatusPage.jsx"));
const FirebaseSubmissionsPage = lazy(() => import("./pages/FirebaseSubmissionsPage.jsx"));
const FirebaseTbSubmitPage = lazy(() => import("./pages/FirebaseTbSubmitPage.jsx"));
const FirebaseTestPage = lazy(() => import("./pages/FirebaseTestPage.jsx"));
const FirebaseUserAdminPage = lazy(() => import("./pages/FirebaseUserAdminPage.jsx"));
const HomePage = lazy(() => import("./pages/HomePage.jsx"));
const HomeroomPage = lazy(() => import("./pages/HomeroomPage.jsx"));
const MySubmissionStatusPage = lazy(() => import("./pages/MySubmissionStatusPage.jsx"));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage.jsx"));
const StudentCarePage = lazy(() => import("./pages/StudentCarePage.jsx"));
const TodayPage = lazy(() => import("./pages/TodayPage.jsx"));
const UploadPage = lazy(() => import("./pages/UploadPage.jsx"));

function portalScopeForPath(pathname) {
  if (pathname === "/upload") return "upload";
  if (pathname === "/admin" || pathname === "/admin/roadmap") return "admin";
  return "";
}

function portalUrlForScope(scope) {
  if (!scope) return PORTAL_API_URL;
  return `${PORTAL_API_URL}?scope=${encodeURIComponent(scope)}`;
}

async function fetchPortalData(signal, scope = "") {
  const response = await fetch(portalUrlForScope(scope), { signal });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  if (contentType.includes("application/json")) {
    return response.json();
  }

  if (import.meta.env.DEV) {
    const separator = scope ? "&" : "?";
    const fallbackUrl = `${DEV_PORTAL_API_FALLBACK}${scope ? `?scope=${encodeURIComponent(scope)}` : ""}${separator}preview=local`;
    const fallbackResponse = await fetch(fallbackUrl, { signal });
    if (!fallbackResponse.ok) throw new Error(`fallback HTTP ${fallbackResponse.status}`);
    return fallbackResponse.json();
  }

  throw new Error("Portal API did not return JSON");
}

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
    <div className="mx-auto w-full max-w-6xl px-4 py-10 lg:max-w-[1280px]">
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
  const portalScope = portalScopeForPath(window.location.pathname);
  const shouldSkipPortalPreload = [
    "/",
    "/firebase-test",
    "/firebase-dashboard",
    "/firebase-checkups",
    "/firebase-education",
    "/firebase-faq",
    "/firebase-submissions",
    "/firebase-admin/access-requests",
    "/firebase-admin/users",
    "/firebase-admin/submissions",
    "/firebase-admin/submission-status",
    "/firebase-admin/staff-submission-status",
    "/firebase-submit/cpr",
    "/firebase-submit/infection",
    "/firebase-submit/recruit",
    "/firebase-submit/tb",
    "/homeroom",
    "/my-submission-status",
    "/student-care",
    "/today",
    "/resources",
    "/faq",
    "/checkup",
    "/education",
    "/admin/messages",
    "/admin/receipts",
    "/admin/infections",
    "/admin/infection-reports",
  ].includes(window.location.pathname) || !portalScope;
  const [portalData, setPortalData] = useState(null);
  const [tbConfig, setTbConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(!shouldSkipPortalPreload);

  useEffect(() => {
    if (shouldSkipPortalPreload) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    fetchPortalData(controller.signal, portalScope)
      .then((portal) => {
        clearTimeout(timeoutId);
        if (portal?.success === false || portal?.result === "error") {
          throw new Error(portal.message || "Portal API error");
        }
        setPortalData(portal);
        setTbConfig(portal?.tbConfig || { enabled: "FALSE" });
        setIsLoading(false);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        if (error?.name === "AbortError") return;
        console.error("[portal] load failed", error);
        setIsLoading(false);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [shouldSkipPortalPreload, portalScope]);

  const liveAppConfig = portalData?.appConfig
    ? { ...fallbackAppConfig, ...portalData.appConfig }
    : fallbackAppConfig;

  const liveNotices     = portalData?.notices?.length     ? portalData.notices     : noticeItems;
  const liveUploads     = portalData ? (portalData.uploads    || []) : uploadItems;
  const liveCheckups    = portalData ? (portalData.checkups   || []) : checkupItems;
  const liveEducations  = portalData ? (portalData.educations || []) : educationItems;
  const liveStudentCare = portalData ? (portalData.studentCare|| []) : studentCareItems;
  const liveResources   = portalData ? (portalData.resources  || []) : [];
  const liveFaqs        = portalData ? (portalData.faqs       || []) : faqItems;
  const liveRoadmap     = portalData?.roadmap || { enabled: false, adminOnly: true, items: [] };
  const resourcesLoadFailed = !portalData;

  return (
    <BrowserRouter>
      <main className="flex min-h-screen w-full flex-col overflow-x-hidden bg-[#F7F9FC] font-sans text-[#263238]">
        <Suspense fallback={null}>
          <FirebaseAuthRedirectHandler />
          <Header />
        </Suspense>

        <div className="flex-1">
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <Suspense fallback={<LoadingSkeleton />}>
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
                <Route path="/firebase-test" element={<FirebaseTestPage />} />
                <Route path="/firebase-dashboard" element={<FirebaseDashboardPage />} />
                <Route path="/firebase-checkups" element={<FirebaseCheckupsPage />} />
                <Route path="/firebase-education" element={<FirebaseEducationPage />} />
                <Route path="/firebase-faq" element={<FirebaseFaqPage />} />
                <Route path="/firebase-submissions" element={<FirebaseSubmissionsPage />} />
                <Route path="/firebase-admin/access-requests" element={<FirebaseAccessRequestsPage />} />
                <Route path="/firebase-admin/users" element={<FirebaseUserAdminPage />} />
                <Route path="/firebase-admin/submissions" element={<FirebaseAdminSubmissionsPage />} />
                <Route path="/firebase-admin/submission-status" element={<FirebaseSubmissionStatusPage />} />
                <Route path="/firebase-admin/staff-submission-status" element={<FirebaseStaffSubmissionStatusAdminPage />} />
                <Route path="/firebase-submit/cpr" element={<FirebaseCprSubmitPage />} />
                <Route path="/firebase-submit/infection" element={<FirebaseInfectionSubmitPage />} />
                <Route path="/firebase-submit/recruit" element={<FirebaseRecruitSubmitPage />} />
                <Route path="/firebase-submit/tb" element={<FirebaseTbSubmitPage />} />
                <Route path="/my-submission-status" element={<MySubmissionStatusPage />} />
                <Route path="/admin"       element={<AdminAuthGate><AdminPage roadmap={liveRoadmap} /></AdminAuthGate>} />
                <Route path="/admin/roadmap" element={<AdminAuthGate><AdminRoadmapPage roadmap={liveRoadmap} /></AdminAuthGate>} />
                <Route path="/admin/messages" element={<AdminAuthGate><AdminMessageHelperPage roadmap={liveRoadmap} /></AdminAuthGate>} />
                <Route path="/admin/receipts" element={<AdminAuthGate><AdminReceiptStatusPage /></AdminAuthGate>} />
                <Route path="/admin/infections" element={<AdminAuthGate><AdminInfectionReportPage /></AdminAuthGate>} />
                <Route path="/admin/infection-reports" element={<AdminAuthGate><AdminInfectionReportPage /></AdminAuthGate>} />
              </Routes>
            </Suspense>
          )}
        </div>

        <Footer />
      </main>
    </BrowserRouter>
  );
}
