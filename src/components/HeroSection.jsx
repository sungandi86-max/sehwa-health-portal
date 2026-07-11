import { Badge, SchoolEmblem } from "./ui.jsx";

export default function HeroSection({ config }) {
  return (
    <section id="home" className="mx-auto w-full max-w-6xl px-3 pb-1.5 pt-2 sm:px-4 md:pb-3 md:pt-4 lg:max-w-[1240px]">
      <div className="relative overflow-hidden rounded-[28px] border border-[rgba(120,140,180,0.14)] bg-[linear-gradient(145deg,rgba(255,255,255,0.82),rgba(238,241,255,0.68)_45%,rgba(241,251,246,0.58))] p-4 shadow-[var(--shh-shadow)] backdrop-blur sm:p-5 md:p-6">
        <div className="pointer-events-none absolute -right-14 -top-16 h-28 w-28 rounded-full bg-[#5B5FEF]/10 blur-2xl md:-right-10 md:-top-12 md:h-36 md:w-36" />
        <div className="absolute bottom-5 right-7 hidden opacity-35 xl:block">
          <SchoolEmblem size="lg" />
        </div>
        <div className="relative max-w-[720px] xl:max-w-[840px]">
          <Badge type="blue">교직원 공유용</Badge>
          <h1
            className="mt-2 max-w-[680px] text-[1.5rem] font-black leading-[1.18] text-[#0F1F4B] sm:text-[1.8rem] md:text-[clamp(1.8rem,2.9vw,2.45rem)] md:leading-tight"
            style={{
              wordBreak: "keep-all",
              overflowWrap: "normal",
              letterSpacing: "0"
            }}
          >
            {config.appName}
          </h1>
          <p
            className="mt-2 text-sm font-semibold leading-5 text-slate-700 sm:text-[0.95rem] md:text-base md:leading-6"
            style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
          >
            {config.subtitle}
          </p>
          <p
            className="mt-1.5 hidden max-w-3xl text-sm font-medium leading-6 text-slate-600 md:block"
            style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
          >
            {config.description}
          </p>
          <div className="mt-3 rounded-2xl border border-[rgba(120,140,180,0.14)] bg-white/75 px-3.5 py-1.5 text-xs font-semibold leading-5 text-[#183B8F] shadow-sm md:hidden" style={{ wordBreak: "keep-all" }}>
            교직원용 보건업무 안내 허브입니다. 학생 개인정보는 표시하지 않습니다.
          </div>
          <div className="mt-3 hidden gap-2 md:grid lg:grid-cols-2">
            <div className="rounded-2xl border border-[rgba(120,140,180,0.14)] bg-white/72 px-3.5 py-2.5 text-xs font-semibold leading-5 text-[#183B8F] shadow-sm md:text-[0.82rem]" style={{ wordBreak: "keep-all" }}>
              {config.privacyNotice}
            </div>
            <div className="rounded-2xl border border-[rgba(120,140,180,0.14)] bg-white/72 px-3.5 py-2.5 text-xs font-semibold leading-5 text-slate-600 shadow-sm md:text-[0.82rem]" style={{ wordBreak: "keep-all" }}>
              {config.managerNote}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
