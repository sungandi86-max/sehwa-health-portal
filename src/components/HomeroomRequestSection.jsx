import { homeroomRequestItems } from "../data/fallbackData.js";
import { SafeText, SectionTitle } from "./ui.jsx";

function getRequestStatusClass(status) {
  const text = String(status || "").trim();
  if (text.includes("확인") || text.includes("예정")) {
    return "border-[#F3DCB4] bg-[#FFF9ED] text-[#9A6700]";
  }
  if (text.includes("완료")) {
    return "border-[#CFEBDD] bg-[#F3FBF7] text-[#08754B]";
  }
  if (text.includes("안내") || text.includes("진행")) {
    return "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]";
  }
  return "border-[#DDEAE7] bg-[#F8FAFA] text-[#627083]";
}

function StatusChip({ children }) {
  if (!children) return null;

  return (
    <span className={`inline-flex shrink-0 items-center rounded-[8px] border px-2 py-0.5 text-[11px] font-semibold ${getRequestStatusClass(children)}`}>
      {children}
    </span>
  );
}

function ChecklistDisclosure({ checklist }) {
  const items = Array.isArray(checklist) ? checklist.filter(Boolean) : [];
  if (!items.length) return null;

  return (
    <details className="mt-2 text-xs leading-5 text-[#627083]">
      <summary className="cursor-pointer font-semibold text-[#0D4EA6]">
        협조 내용 보기
      </summary>
      <ul className="mt-1.5 space-y-1 border-l border-[#DDEAE7] pl-3">
        {items.map((check, i) => (
          <li key={i}>
            <SafeText>{check}</SafeText>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function HomeroomRequestSection() {
  return (
    <section id="homeroom" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-8">
      <SectionTitle
        title="담임 협조 요청"
        description="담임 선생님들이 확인해야 할 회수·전달·지도 항목을 정리했습니다."
      />
      <div className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#DDEAE7] px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-[#102047]">협조 요청 항목</h2>
            <p className="mt-0.5 text-xs text-[#627083]">담임 확인이 필요한 보건실 협조 업무</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-[#627083]">{homeroomRequestItems.length}개</span>
        </div>

        {homeroomRequestItems.map((item) => (
          <article key={item.title} className="border-b border-[#DDEAE7] px-4 py-3.5 last:border-b-0 md:py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip>{item.status}</StatusChip>
                <span className="text-xs font-medium text-[#627083]">대상 · <SafeText>{item.target}</SafeText></span>
                <span className="text-xs font-medium text-[#627083]">기한 · <SafeText>{item.deadline}</SafeText></span>
              </div>
              <h3 className="mt-1.5 text-[15px] font-semibold leading-6 text-[#102047] md:text-base">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#627083] md:line-clamp-1">
                <SafeText>{item.description}</SafeText>
              </p>
              <ChecklistDisclosure checklist={item.checklist} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
