import { Badge, SchoolEmblem } from "./ui.jsx";

export default function HeroSection({ config }) {
  return (
    <section id="home" className="mx-auto max-w-6xl px-3 pb-4 pt-4 sm:px-4 md:pb-12 md:pt-12">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#EAF3FF] via-white to-[#DFF4EC] p-4 shadow-sm sm:p-6 md:rounded-[32px] md:p-10">
        <div className="pointer-events-none absolute -right-12 -top-14 h-32 w-32 rounded-full bg-white/60 md:-right-8 md:-top-10 md:h-44 md:w-44" />
        <div className="absolute bottom-6 right-8 hidden xl:block">
          <SchoolEmblem size="lg" />
        </div>
        <div className="relative max-w-none xl:max-w-4xl">
          <Badge type="blue">교직원 공유용</Badge>
          <h1
            className="mt-3 text-[1.75rem] font-black leading-[1.2] text-[#1A3B8B] sm:text-3xl md:mt-4 md:text-[clamp(2rem,4.8vw,3.75rem)] md:leading-tight"
            style={{
              wordBreak: "keep-all",
              overflowWrap: "normal",
              letterSpacing: "0"
            }}
          >
            {config.appName}
          </h1>
          <p
            className="mt-2 text-sm font-bold leading-6 text-[#263238] sm:text-base md:mt-4 md:text-xl md:leading-relaxed"
            style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
          >
            {config.subtitle}
          </p>
          <p
            className="mt-4 hidden max-w-4xl text-sm leading-8 text-slate-600 md:block md:text-base"
            style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
          >
            {config.description}
          </p>
          <div className="mt-3 rounded-xl bg-white/80 px-3 py-2.5 text-xs font-semibold leading-5 text-[#1A3B8B] md:hidden" style={{ wordBreak: "keep-all" }}>
            교직원용 보건업무 안내 허브입니다. 학생 개인정보와 건강정보는 이 화면에 표시하거나 저장하지 않습니다.
          </div>
          <div className="mt-6 hidden gap-3 md:grid lg:grid-cols-2">
            <div className="rounded-2xl bg-white/80 p-4 text-sm font-semibold leading-6 text-[#1A3B8B]" style={{ wordBreak: "keep-all" }}>
              🔐 {config.privacyNotice}
            </div>
            <div className="rounded-2xl bg-white/80 p-4 text-sm font-semibold leading-6 text-slate-600" style={{ wordBreak: "keep-all" }}>
              📊 {config.managerNote}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
