import { PrimaryButton, SafeText, SectionTitle } from "./ui.jsx";

function getEducationStatusClass(status) {
  const text = String(status || "").trim();
  if (text.includes("예정") || text.includes("확인")) {
    return "border-[#F3DCB4] bg-[#FFF9ED] text-[#9A6700]";
  }
  if (text.includes("완료")) {
    return "border-[#CFEBDD] bg-[#F3FBF7] text-[#08754B]";
  }
  if (text.includes("진행") || text.includes("자료")) {
    return "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]";
  }
  return "border-[#DDEAE7] bg-[#F8FAFA] text-[#627083]";
}

function StatusChip({ children }) {
  if (!children) return null;

  return (
    <span className={`inline-flex shrink-0 items-center rounded-[8px] border px-2 py-0.5 text-[11px] font-semibold ${getEducationStatusClass(children)}`}>
      {children}
    </span>
  );
}

function EducationGuideDisclosure({ item }) {
  if (!item.teacherGuide && !item.confirmation) return null;

  return (
    <details className="mt-2 text-xs leading-5 text-[#627083]">
      <summary className="cursor-pointer font-semibold text-[#0D4EA6]">
        교육 안내 보기
      </summary>
      <div className="mt-1.5 space-y-1 border-l border-[#DDEAE7] pl-3">
        {item.teacherGuide && (
          <p>
            <span className="font-semibold text-[#102047]">담임 안내 </span>
            <SafeText>{item.teacherGuide}</SafeText>
          </p>
        )}
        {item.confirmation && (
          <p>
            <SafeText>{item.confirmation}</SafeText>
          </p>
        )}
      </div>
    </details>
  );
}

export default function EducationSection({ items, isLoading = false, loadFailed = false, fallbackUsed = false }) {
  return (
    <section id="education" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-8">
      <SectionTitle
        title="교육 자료실"
        description="응급처치교육, 성교육, 장애인식 개선교육, 약물 오남용 예방교육 링크를 모아둔 공간입니다."
      />
      {fallbackUsed && (
        <div className="mb-4 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          교육 자료를 불러오는 중 문제가 있어 기존 방식으로 표시했습니다.
        </div>
      )}

      <div className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#DDEAE7] px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-[#102047]">교육 자료 항목</h2>
            <p className="mt-0.5 text-xs text-[#627083]">현재 안내 중인 교육 자료와 진행 일정</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-[#627083]">{items.length}개</span>
        </div>

        {isLoading && (
          <p className="px-4 py-5 text-sm font-semibold text-[#627083]">교육 자료를 불러오는 중입니다.</p>
        )}

        {!isLoading && loadFailed && (
          <p className="px-4 py-5 text-sm font-semibold text-[#627083]">교육 자료를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.</p>
        )}

        {!isLoading && !loadFailed && items.map((item) => (
          <article key={item.title} className="border-b border-[#DDEAE7] px-4 py-3.5 last:border-b-0 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4 md:py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip>{item.status}</StatusChip>
                <span className="text-xs font-medium text-[#627083]">대상 · <SafeText>{item.target}</SafeText></span>
                <span className="text-xs font-medium text-[#627083]">시간 · <SafeText>{item.duration}</SafeText></span>
                <span className="text-xs font-medium text-[#627083]">일정 · <SafeText>{item.schedule}</SafeText></span>
              </div>
              <h3 className="mt-1.5 text-[15px] font-semibold leading-6 text-[#102047] md:text-base">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#627083] md:line-clamp-1">
                <SafeText>{item.description}</SafeText>
              </p>
              <EducationGuideDisclosure item={item} />
            </div>

            {item.buttonText && (
              <div className="mt-3 shrink-0 md:mt-0 md:justify-self-end">
                <PrimaryButton url={item.url}>{item.buttonText}</PrimaryButton>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
