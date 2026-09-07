import { SchoolEmblem } from "./ui.jsx";

export default function HeroSection({ config, action }) {
  const notices = [config.privacyNotice, config.managerNote].filter(Boolean);

  return (
    <section id="home" className="mx-auto w-full max-w-6xl px-3 pb-1 pt-2 sm:px-4 lg:max-w-[1280px]">
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 text-[#102047] shadow-[0_8px_20px_rgba(16,32,71,0.04)] sm:p-4 lg:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,410px)] lg:items-start lg:gap-4">
          <div className="min-w-0 self-start pt-0.5 lg:pt-1">
            <div className="flex items-center gap-2">
              <SchoolEmblem size="sm" />
              <span className="text-[11px] font-medium leading-4 text-[#3154A3]">교직원 공유용 보건업무 포털</span>
            </div>
            <h1
              className="mt-1.5 max-w-[640px] text-[1.38rem] font-bold leading-tight text-[#102047] sm:text-[1.5rem]"
              style={{
                wordBreak: "keep-all",
                overflowWrap: "normal",
                letterSpacing: "0"
              }}
            >
              {config.appName}
            </h1>
            <p
              className="mt-1.5 max-w-[620px] text-[13px] font-normal leading-5 text-[#627083] sm:text-sm"
              style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
            >
              {config.subtitle}
            </p>
            {notices.length > 0 && (
              <div className="mt-2.5 rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1.5 text-[11px] font-normal leading-5 text-[#3154A3] sm:text-xs">
                {notices.join(" ")}
              </div>
            )}
          </div>
          {action && <div className="min-w-0 self-start">{action}</div>}
        </div>
      </div>
    </section>
  );
}
