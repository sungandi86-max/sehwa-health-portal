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
    <BrowserRouter>
      <main className="min-h-screen bg-[#F7F9FC] font-sans text-[#263238]">
        <Header />

        {isLoading ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="h-8 w-8 animate-spin text-[#1A3B8B]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <p className="text-sm font-bold text-[#1A3B8B]">자료를 불러오는 중입니다...</p>
            </div>
          </div>
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
              <Route path="/" element={<HomePage config={liveAppConfig} />} />
              <Route path="/today" element={<TodayPage items={liveNotices} />} />
              <Route path="/upload" element={<UploadPage items={liveUploads} />} />
              <Route path="/checkup" element={<CheckupPage items={liveCheckups} />} />
              <Route path="/education" element={<EducationPage items={liveEducations} />} />
              <Route path="/homeroom" element={<HomeroomPage />} />
              <Route path="/student-care" element={<StudentCarePage items={liveStudentCare} />} />
              <Route path="/resources" element={<ResourcesPage items={liveResources} />} />
              <Route path="/faq" element={<FAQPage items={liveFaqs} />} />
            </Routes>
          </>
        )}

        <Footer />
      </main>
    </BrowserRouter>
  );
}
