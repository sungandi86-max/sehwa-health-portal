import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { portalMenuItems, isPortalMenuActive } from "../data/portalNavigation.js";
import { auth } from "../lib/firebase.js";
import { getUserAssignmentResult, isAdmin, isHealthTeacher } from "../lib/userProfile.js";
import { SchoolEmblem } from "./ui.jsx";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const params = new URLSearchParams(location.search);
  const isFirebaseV2 = location.pathname.startsWith("/firebase");
  const isOperationalEntry =
    isFirebaseV2 || location.pathname === "/" || location.pathname === "/my-submission-status";
  const isPublicUpload =
    location.pathname === "/upload" &&
    params.get("mode") === "public" &&
    params.get("type") === "tbreply";

  useEffect(() => {
    if (isPublicUpload) {
      setCurrentUser(null);
      setAssignment(null);
      return undefined;
    }

    let isMounted = true;
    let authRequestId = 0;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;

      authRequestId += 1;
      const currentRequestId = authRequestId;
      setCurrentUser(firebaseUser);
      setAssignment(null);

      if (!firebaseUser) return;

      const result = await getUserAssignmentResult(firebaseUser.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
      if (!isMounted || currentRequestId !== authRequestId) return;

      setAssignment(result.assignment);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isPublicUpload]);

  if (isPublicUpload) return null;

  const navItems = portalMenuItems;
  const currentMenu = navItems.find(item=>isPortalMenuActive(location.pathname,item.href));
  const canOpenAdmin = currentUser && assignment?.active === true && (isHealthTeacher(assignment) || isAdmin(assignment));
  const staffEntryLabel = currentUser ? "제출·보고" : "교직원 로그인";

  return (
    <header className="sticky top-0 z-50 border-b border-[#DDEAE7] bg-white/92 shadow-[var(--shh-soft-shadow)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
        <button
          aria-label="홈으로"
          onClick={() => navigate("/")}
          className={`flex min-w-0 items-center gap-2 text-left sm:gap-2.5 ${
            isOperationalEntry ? "min-h-10" : ""
          }`}
        >
          <SchoolEmblem /><span className="text-xs font-semibold md:hidden">홈</span>
          <div className="min-w-0 pt-0.5">
            <p className="truncate text-xs font-bold leading-[1.15] text-[#102047] sm:text-sm md:text-[0.95rem]">
              세화여자고등학교 온라인 보건실
            </p>
            {currentMenu && <p className="truncate text-[10px] text-[#627083] md:hidden">현재 · {currentMenu.title}</p>}
            <p className="mt-0.5 hidden text-[0.7rem] font-semibold leading-4 text-slate-500 md:block">
              교직원 공유용 보건업무 포털
            </p>
          </div>
        </button>
        <nav aria-label="주요 메뉴" className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
          {navItems.map((item) => {
            const target = item.href;
            return (
            <button
              key={item.id}
              aria-current={isPortalMenuActive(location.pathname, target) ? "page" : undefined}
              onClick={() => navigate(target)}
              className={`shrink-0 rounded-[9px] px-2.5 py-1.5 text-xs font-semibold transition ${
                isOperationalEntry ? "min-h-10" : ""
              } ${
                isPortalMenuActive(location.pathname, target)
                  ? "bg-[#EEF1FF] text-[var(--shh-primary)]"
                  : "text-slate-600 hover:bg-[#EEF1FF] hover:text-[var(--shh-primary)]"
              }`}
            >
              {item.title}
            </button>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => navigate("/firebase-submissions")}
            className="min-h-10 rounded-[10px] bg-[#0D4EA6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#183B8F] sm:px-3.5"
          >
            {staffEntryLabel}
          </button>
          {canOpenAdmin && (
            <button
              onClick={() => navigate("/firebase-dashboard")}
              className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047] transition hover:bg-[#F8FAFA] sm:px-3.5"
            >
              관리자 화면
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
