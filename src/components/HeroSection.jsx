import { Badge, SchoolEmblem } from "./ui.jsx";

export default function HeroSection({ config }) {
  return (
    <section id="home" className="mx-auto max-w-6xl px-4 pb-8 pt-8 md:pb-12 md:pt-12">
      <div className="relative rounded-[32px] bg-gradient-to-br from-[#EAF3FF] via-white to-[#DFF4EC] p-6 shadow-sm md:p-10">
        <div className="absolute -right-8 -top-10 h-44 w-44 rounded-full bg-white/60" />
        <div className="absolute bottom-6 right-8 hidden xl:block">
          <SchoolEmblem size="lg" />
        </div>
        <div className="relative max-w-none xl:max-w-4xl">
          <Badge type="blue">교직원 공유용</Badge>
          <h1
            className="mt-4 font-black leading-tight text-[#1A3B8B]"
            style={{
              fontSize: "clamp(2rem, 4.8vw, 3.75rem)",
              wordBreak: "keep-all",
              overflowWrap: "normal",
              letterSpacing: "-0.04em"
            }}
          >
            {config.appName}
          </h1>
          <p
            className="mt-4 font-bold leading-relaxed text-[#263238]"
            style={{ fontSize: "clamp(1.05rem, 2.1vw, 1.5rem)", wordBreak: "keep-all", overflowWrap: "normal" }}
          >
            {config.subtitle}
          </p>
          <p
            className="mt-4 max-w-4xl text-sm leading-8 text-slate-600 md:text-base"
            style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
          >
            {config.description}
          </p>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
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
