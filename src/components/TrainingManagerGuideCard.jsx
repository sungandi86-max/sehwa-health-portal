import { ContextHelp } from "./ContextHelp.jsx";

export function TrainingManagerGuideCard() {
  return (
    <aside
      className="flex flex-col gap-3 rounded-[12px] border border-[#C8D8FF] bg-[#F8FAFF] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
      aria-labelledby="training-manager-guide-title"
    >
      <div className="min-w-0">
        <h2 id="training-manager-guide-title" className="text-sm font-bold text-[#102047]">교육 담당자이신가요?</h2>
        <p className="mt-1 break-keep text-[13px] leading-5 text-[#627083]">
          교육 개설부터 QR 출석, 연수등록부 다운로드까지 사용 방법을 확인하세요.
        </p>
      </div>
      <ContextHelp
        guide="trainingManagerComplete"
        label="교육 담당자 가이드 보기"
        icon="graduation-cap"
        showArrow
        className="self-start sm:self-auto"
      />
    </aside>
  );
}
