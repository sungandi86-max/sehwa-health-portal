import { AppCard, Badge, PrimaryButton, SectionTitle } from "./ui.jsx";

export default function EducationSection({ items }) {
  return (
    <section id="education" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="EDUCATION"
        title="교육 자료실"
        description="응급처치교육, 성교육, 장애인식 개선교육, 약물 오남용 예방교육 링크를 모아둔 공간입니다."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <AppCard key={item.title}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-lg font-extrabold text-[#263238]">{item.title}</h3>
              <Badge
                type={
                  item.status === "실시 예정"
                    ? "pink"
                    : item.status === "현장 진행"
                    ? "green"
                    : "blue"
                }
              >
                {item.status}
              </Badge>
            </div>
            <div className="rounded-2xl bg-[#F7F9FC] p-4 text-sm text-slate-700">
              <p><b>대상</b> · {item.target}</p>
              <p><b>시간</b> · {item.duration}</p>
              <p><b>일정</b> · {item.schedule}</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{item.description}</p>

            {/* 1학년 응급처치교육: buttonText가 null → 버튼 없이 현장 진행 안내 카드 */}
            {!item.buttonText && item.teacherGuide && (
              <div className="mt-4 rounded-2xl bg-[#E8F6EE] p-4 text-sm leading-6 text-[#2E7D32]">
                <p className="font-bold mb-1">담임 선생님께</p>
                <p>{item.teacherGuide}</p>
                {item.confirmation && (
                  <p className="mt-2 text-xs text-slate-500">{item.confirmation}</p>
                )}
              </div>
            )}

            {/* buttonText 있을 때 → PrimaryButton이 url 유효성 판단 */}
            {item.buttonText && (
              <PrimaryButton url={item.url}>{item.buttonText}</PrimaryButton>
            )}
          </AppCard>
        ))}
      </div>
    </section>
  );
}
