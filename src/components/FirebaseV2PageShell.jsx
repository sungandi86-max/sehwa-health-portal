import { Link } from "react-router-dom";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";

export function FirebaseV2PageShell({ label, title, description, displayName, children }) {
  return (
    <section className="min-h-full bg-[#F7FBF9] px-4 py-6 text-[#102047] sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="rounded-[32px] border border-[#DDEAE7] bg-white/95 p-6 shadow-[0_18px_48px_rgba(16,32,71,0.08)] sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#20A982]">{label}</p>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-[#102047] sm:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[#627083]">{description}</p>
            </div>
            <div className="rounded-[24px] border border-[#DDEAE7] bg-[#F7FBF9] p-4 sm:min-w-64">
              <p className="text-sm font-black text-[#102047]">{displayName} 선생님</p>
              <p className="mt-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#102047]">
                {CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기
              </p>
              <Link
                to="/firebase-dashboard"
                className="mt-3 inline-flex min-h-11 items-center rounded-2xl border border-[#DDEAE7] bg-white px-4 py-2 text-xs font-black text-[#102047] transition hover:-translate-y-[1px]"
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
          <div key={item} className="h-40 animate-pulse rounded-[26px] border border-[#DDEAE7] bg-white/80" />
        ))}
      </div>
    );
  }

  if (status === "permission-denied" || status === "error") {
    return (
      <div className="rounded-[26px] border border-[#F6D8D8] bg-[#FFF7F7] p-5">
        <p className="text-sm font-black text-[#9F2525]">{message}</p>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="rounded-[26px] border border-[#DDEAE7] bg-white/95 p-6 text-center shadow-[0_14px_36px_rgba(16,32,71,0.05)]">
        <p className="text-sm font-black text-[#627083]">{emptyMessage}</p>
      </div>
    );
  }

  return null;
}
