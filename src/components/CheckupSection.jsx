import { useState } from "react";
import { AppCard, Badge, PrimaryButton, SectionTitle } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

// "자료실 열기" 버튼은 내부 resources 섹션으로 이동
const INTERNAL_BUTTONS = {
  "자료실 열기": "resources",
  "자료실로 이동": "resources",
};

const btnCls = "mt-4 inline-block w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:w-auto";

export default function CheckupSection({ items, tbConfig }) {
  const [tbRegistrationOpen, setTbRegistrationOpen] = useState(false);

  const tbBadge = tbConfig
    ? (tbConfig.endDate && new Date() > new Date(tbConfig.endDate)
        ? { type: "gray", label: "접수 마감" }
        : { type: "pink", label: "신청 접수 중" })
    : null;

  return (
    <section id="checkup" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="CHECKUP"
        title="검진·검사 안내"
        description="1학년 건강검진, 2·3학년 결핵검진·소변검사, 교직원 결핵검진 안내를 모아둔 영역입니다."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => {
          const internalTarget = INTERNAL_BUTTONS[item.buttonText];
          return (
            <AppCard key={item.title}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-extrabold text-[#263238]">{item.title}</h3>
                <Badge type="blue">{item.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
              <p className="mt-3 text-sm font-bold text-[#1A3B8B]">대상 · {item.target}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {(item.details || []).map((detail, i) => (
                  <li key={i}>• {detail}</li>
                ))}
              </ul>
              {item.buttonText && (
                <PrimaryButton url={item.url} scrollTarget={internalTarget}>
                  {item.buttonText}
                </PrimaryButton>
              )}
            </AppCard>
          );
        })}

        {/* 교직원 결핵검진 유형 선택 카드 — config.enabled === "TRUE" 일 때만 표시 */}
        {tbConfig?.enabled === "TRUE" && (
          <AppCard>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-extrabold text-[#263238]">교직원 결핵검진 유형 선택</h3>
              <Badge type={tbBadge.type}>{tbBadge.label}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              학교 단체검진, 개별검진, 공단검진, 채용검진 대체 확인 중 해당 유형을 선택해 제출해주세요.
            </p>
            <button onClick={() => setTbRegistrationOpen(true)} className={btnCls}>
              유형 선택하기
            </button>
          </AppCard>
        )}
      </div>

      {tbRegistrationOpen && (
        <SubmitModal type="tb_registration" onClose={() => setTbRegistrationOpen(false)} tbConfig={tbConfig} />
      )}
    </section>
  );
}
