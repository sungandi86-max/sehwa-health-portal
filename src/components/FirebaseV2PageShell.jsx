import { Link } from "react-router-dom";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";

export function FirebaseV2PageShell({ label, title, description, displayName, children }) {
  return (
    <section className="firebase-v2-surface min-h-full bg-[#F8FAFA] px-3 py-4 text-[#102047] sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-6xl space-y-3">
        <header className="rounded-[12px] border border-[#DDEAE7] bg-white p-4 shadow-[var(--shh-soft-shadow)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold text-[#20A982]">{label}</p>
              <h1 className="mt-1 text-[22px] font-bold leading-tight text-[#102047] sm:text-2xl">
                {title}
              </h1>
              <p className="mt-2 max-w-3xl text-[13px] font-medium leading-5 text-[#627083]">{description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#DDEAE7] bg-[#F3F8F6] px-3 py-2 text-[13px] font-semibold text-[#102047] sm:justify-end">
              <span>{displayName} 선생님</span>
              <span className="text-[#DDEAE7]" aria-hidden="true">|</span>
              <span>
                {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기
              </span>
              <Link
                to="/firebase-dashboard"
                className="inline-flex min-h-10 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047] transition hover:border-[#20A982] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15"
              >
                대시보드로
              </Link>
            </div>
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}

export function FirebaseContentState({ status, message, emptyMessage }) {
  if (status === "loading") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-20 animate-pulse rounded-[12px] border border-[#DDEAE7] bg-white" />
        ))}
      </div>
    );
  }

  if (status === "permission-denied" || status === "error") {
    return (
      <div className="rounded-[12px] border border-[#F6D8D8] bg-[#FFF7F7] p-4">
        <p className="text-sm font-semibold text-[#9F2525]">{message}</p>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-4 text-center">
        <p className="text-sm font-semibold text-[#627083]">{emptyMessage}</p>
      </div>
    );
  }

  return null;
}
