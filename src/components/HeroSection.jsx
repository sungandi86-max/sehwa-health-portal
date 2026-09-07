import { SchoolEmblem } from "./ui.jsx";

export default function HeroSection({ config, action }) {
  const notices = [config.privacyNotice, config.managerNote].filter(Boolean);

  return (
    <section id="home" className="mx-auto w-full max-w-6xl px-3 pb-1 pt-3 sm:px-4 lg:max-w-[1280px]">
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white px-3 py-3 text-[#102047] shadow-[0_6px_16px_rgba(16,32,71,0.035)] sm:px-4 sm:py-4 lg:px-3.5 lg:py-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(400px,420px)] lg:items-center lg:gap-8">
          <div className="min-w-0 self-center lg:-translate-y-2.5 lg:px-0 lg:py-12">
            <div className="flex items-center gap-2">
              <SchoolEmblem size="sm" />
              <span className="text-[11px] font-medium leading-4 text-[#3154A3]">교직원 공유용 보건업무 포털</span>
            </div>
            <h1
              className="mt-2 max-w-[640px] text-[1.5rem] font-bold leading-tight text-[#102047] sm:text-[1.65rem]"
              style={{
                wordBreak: "keep-all",
                overflowWrap: "normal",
                letterSpacing: "0"
              }}
            >
              {config.appName}
            </h1>
            <p
              className="mt-1.5 max-w-[620px] text-sm font-normal leading-5 text-[#627083]"
              style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
            >
              {config.subtitle}
            </p>
            {notices.length > 0 && (
              <div className="mt-3 inline-flex w-fit max-w-full rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1.5 text-[11px] font-normal leading-5 text-[#3154A3] sm:text-xs lg:min-w-[720px]">
                {notices.join(" ")}
              </div>
            )}
          </div>
          {action && <div className="min-w-0 self-center">{action}</div>}
        </div>
      </div>
    </section>
  );
}
