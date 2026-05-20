import { studentCareIntro } from "../data/fallbackData.js";
import { AppCard, Badge, PrimaryButton, SectionTitle } from "./ui.jsx";

export default function StudentCareSection({ items }) {
  return (
    <section id="studentCare" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <div className="rounded-[32px] bg-[#EAF3FF] p-6 md:p-8">
        <SectionTitle
          eyebrow="PRIVATE LINK"
          title={studentCareIntro.title}
          description={studentCareIntro.description}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 text-sm leading-7 text-[#1A3B8B] shadow-sm">
            🔐 {studentCareIntro.privacyNotice}
          </div>
          <div className="rounded-2xl bg-white p-5 text-sm leading-7 text-slate-600 shadow-sm">
            {studentCareIntro.guide}
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <AppCard key={item.title}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-extrabold text-[#263238]">{item.title}</h3>
                <Badge type="blue">{item.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
              <p className="mt-3 rounded-2xl bg-[#F7F9FC] p-3 text-sm text-slate-600">
                {item.privacyNotice}
              </p>
              {/* 버튼명과 url 모두 있을 때만 표시 */}
              {item.buttonText && item.url && (
                <PrimaryButton url={item.url}>{item.buttonText}</PrimaryButton>
              )}
            </AppCard>
          ))}
        </div>
      </div>
    </section>
  );
}
