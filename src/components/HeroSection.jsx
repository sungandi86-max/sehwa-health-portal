import { Badge, SchoolEmblem } from "./ui.jsx";

export default function HeroSection({ config }) {
  return (
    <section id="home" className="mx-auto max-w-6xl px-3 pb-3 pt-3 sm:px-4 md:pb-6 md:pt-7">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#EAF3FF] via-white to-[#DFF4EC] p-4 shadow-sm sm:p-5 md:rounded-[28px] md:p-7">
        <div className="pointer-events-none absolute -right-14 -top-16 h-28 w-28 rounded-full bg-white/60 md:-right-10 md:-top-12 md:h-36 md:w-36" />
        <div className="absolute bottom-5 right-7 hidden xl:block">
          <SchoolEmblem size="lg" />
        </div>
        <div className="relative max-w-none xl:max-w-4xl">
          <Badge type="blue">교직원 공유용</Badge>
          <h1
            className="mt-2 text-[1.55rem] font-black leading-[1.18] text-[#1A3B8B] sm:text-[1.85rem] md:mt-3 md:text-[clamp(1.9rem,3.4vw,2.8rem)] md:leading-tight"
            style={{
              wordBreak: "keep-all",
              overflowWrap: "normal",
              letterSpacing: "0"
            }}
          >
            {config.appName}
          </h1>
          <p
            className="mt-2 text-sm font-bold leading-5 text-[#263238] sm:text-[0.95rem] md:text-lg md:leading-7"
            style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
          >
            {config.subtitle}
          </p>
          <p
            className="mt-2 hidden max-w-4xl text-sm leading-6 text-slate-600 md:block"
            style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
          >
            {config.description}
          </p>
          <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold leading-5 text-[#1A3B8B] md:hidden" style={{ wordBreak: "keep-all" }}>
            교직원용 보건업무 안내 허브입니다. 학생 개인정보와 건강정보를 화면에 표시하거나 저장하지 않습니다.
          </div>
          <div className="mt-4 hidden gap-2 md:grid lg:grid-cols-2">
            <div className="rounded-2xl bg-white/80 px-3 py-2.5 text-xs font-semibold leading-5 text-[#1A3B8B] md:text-sm" style={{ wordBreak: "keep-all" }}>
              {config.privacyNotice}
            </div>
            <div className="rounded-2xl bg-white/80 px-3 py-2.5 text-xs font-semibold leading-5 text-slate-600 md:text-sm" style={{ wordBreak: "keep-all" }}>
              {config.managerNote}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
