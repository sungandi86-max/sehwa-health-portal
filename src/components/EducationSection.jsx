import { Badge, PrimaryButton, SectionTitle } from "./ui.jsx";

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
        {isLoading && (
          <p className="px-4 py-5 text-sm font-semibold text-[#627083]">교육 자료를 불러오는 중입니다.</p>
        )}

        {!isLoading && loadFailed && (
          <p className="px-4 py-5 text-sm font-semibold text-[#627083]">교육 자료를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.</p>
        )}

        {!isLoading && !loadFailed && items.map((item) => (
          <article key={item.title} className="border-b border-[#E8F0EE] px-4 py-4 last:border-b-0">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-[#102047]">{item.title}</h3>
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
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#627083]">
                  <div><dt className="inline font-semibold text-[#102047]">대상</dt><dd className="inline"> · {item.target}</dd></div>
                  <div><dt className="inline font-semibold text-[#102047]">시간</dt><dd className="inline"> · {item.duration}</dd></div>
                  <div><dt className="inline font-semibold text-[#102047]">일정</dt><dd className="inline"> · {item.schedule}</dd></div>
                </dl>
                <p className="mt-2 text-sm leading-6 text-[#627083]">{item.description}</p>
              </div>

              <div className="shrink-0">
                {item.buttonText && (
                  <PrimaryButton url={item.url}>{item.buttonText}</PrimaryButton>
                )}
              </div>
            </div>

            {!item.buttonText && item.teacherGuide && (
              <div className="mt-3 rounded-[10px] border border-[#C8D8FF] bg-[#EEF4FF] p-3 text-sm leading-6 text-[#3154A3]">
                <p className="mb-1 font-semibold">담임 선생님께</p>
                <p>{item.teacherGuide}</p>
                {item.confirmation && (
                  <p className="mt-2 text-xs text-[#627083]">{item.confirmation}</p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
