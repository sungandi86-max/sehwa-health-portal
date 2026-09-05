import { SchoolEmblem } from "./ui.jsx";

export default function HeroSection({ config, action }) {
  return (
    <section id="home" className="mx-auto w-full max-w-6xl px-3 pb-2 pt-3 sm:px-4 lg:max-w-[1280px]">
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 text-[#102047] shadow-[var(--shh-soft-shadow)] sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <SchoolEmblem size="sm" />
              <span className="text-[12px] font-semibold text-[#0D4EA6]">교직원 공유용 보건업무 포털</span>
            </div>
            <h1
              className="mt-2 max-w-[640px] text-[1.45rem] font-bold leading-tight text-[#102047] sm:text-[1.6rem]"
              style={{
                wordBreak: "keep-all",
                overflowWrap: "normal",
                letterSpacing: "0"
              }}
            >
              {config.appName}
            </h1>
            <p
              className="mt-1 max-w-[620px] text-[13px] font-medium leading-5 text-[#627083] sm:text-sm"
              style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
            >
              {config.subtitle}
            </p>
            <div className="mt-2 flex flex-col gap-1.5 text-[11px] font-semibold leading-5 sm:flex-row sm:flex-wrap sm:gap-2 sm:text-xs">
              <span className="line-clamp-1 rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1 text-[#3154A3]" style={{ wordBreak: "keep-all" }}>
                {config.privacyNotice}
              </span>
              <span className="line-clamp-1 rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1 text-[#627083]" style={{ wordBreak: "keep-all" }}>
                {config.managerNote}
              </span>
            </div>
          </div>
          {action && <div className="min-w-0">{action}</div>}
        </div>
      </div>
    </section>
  );
}
