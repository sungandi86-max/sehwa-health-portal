import { SchoolEmblem } from "./ui.jsx";

const MASCOT_SRC = "/assets/otter-health-teacher.png";

export default function HeroSection({ config, action }) {
  const notices = [config.privacyNotice, config.managerNote].filter(Boolean);
  const appName = String(config.appName || "");
  const titleParts = appName.match(/^(.*?)(온라인 보건실)$/);

  return (
    <section id="home" className="mx-auto w-full max-w-6xl px-3 pb-2 pt-2.5 sm:px-4 lg:max-w-[1280px]">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.52fr)_minmax(380px,0.68fr)] lg:items-stretch">
        <div className="relative overflow-hidden rounded-[14px] border border-[#D5E8F8] bg-[linear-gradient(135deg,#F4FAFF_0%,#EEF7FF_56%,#FFF8FB_100%)] px-4 py-5 text-[#102047] shadow-[0_8px_24px_rgba(16,32,71,0.06)] sm:px-6 sm:py-5 lg:min-h-[224px] lg:px-7 lg:py-5">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] bg-[radial-gradient(circle_at_55%_25%,rgba(13,78,166,0.12),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(32,169,130,0.12),transparent_30%)] md:block" />
          <div className="relative z-10 max-w-[700px]">
            <div className="flex items-center gap-2.5">
              <SchoolEmblem size="sm" />
              <span className="text-xs font-semibold leading-4 text-[#3154A3]">교직원 공유용 보건업무 포털</span>
            </div>
            <h1
              className="mt-3 max-w-[620px] text-[1.75rem] font-bold leading-[1.18] text-[#102047] sm:text-[2rem] lg:text-[2.15rem]"
              style={{
                wordBreak: "keep-all",
                overflowWrap: "normal",
                letterSpacing: "0"
              }}
            >
              {titleParts ? (
                <>
                  <span className="block">{titleParts[1].trim()}</span>
                  <span className="block text-[#0D4EA6]">{titleParts[2]}</span>
                </>
              ) : (
                appName
              )}
            </h1>
            <p
              className="mt-2.5 max-w-[520px] text-sm font-normal leading-6 text-[#4D5F76]"
              style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
            >
              {config.subtitle}
            </p>
            {notices.length > 0 && (
              <div className="mt-3 grid w-full max-w-full grid-cols-[20px_minmax(0,1fr)] items-start gap-2 rounded-[12px] border border-[#C8D8FF] bg-white/85 px-3 py-1.5 text-[11px] font-normal leading-5 text-[#3154A3] shadow-[0_1px_2px_rgba(16,32,71,0.04)] sm:w-fit sm:max-w-[640px] sm:items-center sm:rounded-full sm:text-xs lg:max-w-[660px]">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#EEF4FF] text-[#0D4EA6]">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <span className="min-w-0 whitespace-normal" style={{ wordBreak: "break-all", overflowWrap: "anywhere" }}>
                  {notices.join(" ")}
                </span>
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-0 right-5 hidden h-32 w-32 overflow-hidden rounded-full border border-white/75 bg-white/70 shadow-[0_10px_24px_rgba(16,32,71,0.12)] md:block lg:h-36 lg:w-36">
            <img
              src={MASCOT_SRC}
              alt=""
              aria-hidden="true"
              className="h-full w-full scale-110 object-cover object-[50%_34%]"
              loading="lazy"
              width="320"
              height="320"
            />
          </div>
        </div>
        {action && (
          <div className="min-w-0 self-stretch lg:min-h-[224px]">
            {action}
          </div>
        )}
      </div>
    </section>
  );
}
