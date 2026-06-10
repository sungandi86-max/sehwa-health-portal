import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppCard, Badge, SectionTitle } from "../components/ui.jsx";

const emptyRoadmap = { enabled: false, adminOnly: true, items: [] };

function safeText(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function splitList(value) {
  return String(value || "")
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function Field({ label, value, children, highlight = false }) {
  return (
    <div className={`rounded-2xl p-4 ${highlight ? "border border-[#F7C9D6] bg-[#FFF5F8]" : "bg-[#F7F9FC]"}`}>
      <p className={`text-xs font-black ${highlight ? "text-[#D94F70]" : "text-[#1A3B8B]"}`}>{label}</p>
      {children || (
        <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700" style={{ wordBreak: "keep-all" }}>
          {safeText(value)}
        </p>
      )}
    </div>
  );
}

function MenuBadges({ value, type = "blue" }) {
  const items = splitList(value);
  if (!items.length) return <span className="text-sm font-semibold text-slate-500">-</span>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} type={type}>{item}</Badge>
      ))}
    </div>
  );
}

function CopyButton({ children, value, onCopy }) {
  const disabled = !String(value || "").trim();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCopy(value)}
      className={`min-h-11 rounded-2xl px-4 py-3 text-sm font-black transition ${
        disabled
          ? "cursor-not-allowed bg-slate-100 text-slate-400"
          : "bg-[#1A3B8B] text-white shadow-sm hover:-translate-y-[1px] hover:shadow-md"
      }`}
    >
      {children}
    </button>
  );
}

function TaskSummaryCard({ item, onSelect }) {
  return (
    <AppCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black text-[#D94F70]">{safeText(item.category, "업무")}</p>
          <h3 className="mt-1 text-base font-extrabold leading-6 text-[#263238]">{safeText(item.taskName, "업무명 없음")}</h3>
        </div>
        <Badge type="green">{safeText(item.step, "단계 미정")}</Badge>
      </div>
      <p
        className="mt-3 overflow-hidden text-sm leading-6 text-slate-600"
        style={{ wordBreak: "keep-all", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
      >
        {safeText(item.todo, "지금 할 일이 등록되지 않았습니다.")}
      </p>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="mt-4 min-h-11 w-full rounded-2xl border border-[#C9DFFF] bg-white px-4 py-3 text-sm font-black text-[#1A3B8B] transition hover:bg-[#EAF3FF]"
      >
        이 업무 보기
      </button>
    </AppCard>
  );
}

function RoadmapDetail({ item, onCopy, copiedMessage }) {
  const combinedMessage = [item.messageTitle, item.messageBody].map((value) => String(value || "").trim()).filter(Boolean).join("\n\n");

  return (
    <AppCard className="p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#D94F70]">{safeText(item.category, "업무분류")}</p>
          <h3 className="mt-1 text-xl font-black leading-8 text-[#263238]">{safeText(item.taskName, "업무명 없음")}</h3>
        </div>
        <Badge type="green">{safeText(item.step, "단계 미정")}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="업무분류" value={item.category} />
        <Field label="업무명" value={item.taskName} />
        <Field label="단계" value={item.step} />
        <Field label="안내 대상" value={item.audience} />
        <Field label="지금 할 일" value={item.todo} />
        <Field label="열어둘 메뉴">
          <MenuBadges value={item.openMenus} type="blue" />
        </Field>
        <Field label="숨길 메뉴">
          <MenuBadges value={item.hideMenus} type="gray" />
        </Field>
        <Field label="관련 시트" value={item.relatedSheet} />
        <Field label="관련 메뉴 ID" value={item.relatedMenuId} />
        <Field label="개인정보 주의" value={item.privacyNote} highlight />
      </div>

      <div className="mt-4 grid gap-3">
        <Field label="메신저 제목" value={item.messageTitle} />
        <Field label="메신저 문구">
          <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-7 text-slate-700" style={{ wordBreak: "keep-all" }}>
            {safeText(item.messageBody)}
          </p>
        </Field>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <CopyButton value={item.messageTitle} onCopy={onCopy}>메신저 제목 복사</CopyButton>
        <CopyButton value={item.messageBody} onCopy={onCopy}>메신저 문구 복사</CopyButton>
        <CopyButton value={combinedMessage} onCopy={onCopy}>제목+문구 함께 복사</CopyButton>
      </div>
      {copiedMessage && (
        <p className="mt-3 rounded-2xl bg-[#E8F6EE] px-4 py-3 text-sm font-black text-[#2E7D32]">
          {copiedMessage}
        </p>
      )}
    </AppCard>
  );
}

export default function AdminRoadmapPage({ roadmap = emptyRoadmap }) {
  const navigate = useNavigate();
  const items = Array.isArray(roadmap?.items) ? roadmap.items : [];
  const [category, setCategory] = useState("");
  const [taskName, setTaskName] = useState("");
  const [step, setStep] = useState("");
  const [copiedMessage, setCopiedMessage] = useState("");

  const categories = useMemo(() => unique(items.map((item) => item.category)), [items]);
  const taskOptions = useMemo(
    () => unique(items.filter((item) => !category || item.category === category).map((item) => item.taskName)),
    [items, category]
  );
  const stepOptions = useMemo(
    () => unique(items
      .filter((item) => (!category || item.category === category) && (!taskName || item.taskName === taskName))
      .map((item) => item.step)),
    [items, category, taskName]
  );
  const selectedItem = items.find((item) =>
    (!category || item.category === category) &&
    (!taskName || item.taskName === taskName) &&
    (!step || item.step === step) &&
    category && taskName && step
  );

  const filteredItems = items.filter((item) =>
    (!category || item.category === category) &&
    (!taskName || item.taskName === taskName) &&
    (!step || item.step === step)
  );

  const selectItem = (item) => {
    setCategory(item.category || "");
    setTaskName(item.taskName || "");
    setStep(item.step || "");
    setCopiedMessage("");
  };

  const copyText = async (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage("복사되었습니다.");
    } catch (error) {
      console.error("[roadmap] clipboard failed", error);
      setCopiedMessage("복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  };

  const handleCategory = (nextCategory) => {
    setCategory(nextCategory);
    setTaskName("");
    setStep("");
    setCopiedMessage("");
  };

  const handleTaskName = (nextTaskName) => {
    setTaskName(nextTaskName);
    setStep("");
    setCopiedMessage("");
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="mb-4 flex min-h-11 items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
      >
        ← 메인으로
      </button>

      <div className="overflow-hidden rounded-3xl bg-[#EAF3FF] p-4 md:rounded-[32px] md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            eyebrow="ADMIN HELPER"
            title="보건실 업무 운영 도우미"
            description="업무 종류와 현재 진행 단계를 선택하면 지금 해야 할 일, 열어둘 메뉴, 숨길 메뉴, 안내 대상, 메신저 문구를 확인할 수 있습니다."
          />
          {roadmap?.adminOnly && <Badge type="pink">관리자 전용</Badge>}
        </div>

        {!roadmap?.enabled || !items.length ? (
          <AppCard className="p-6 text-center text-sm font-bold text-slate-600">
            등록된 업무 로드맵이 없습니다.
          </AppCard>
        ) : (
          <div className="space-y-4">
            <AppCard className="p-4 md:p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-black text-[#263238]">업무분류 선택</span>
                  <select className={inputSelectClass()} value={category} onChange={(event) => handleCategory(event.target.value)}>
                    <option value="">전체</option>
                    {categories.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-black text-[#263238]">업무명 선택</span>
                  <select className={inputSelectClass()} value={taskName} onChange={(event) => handleTaskName(event.target.value)}>
                    <option value="">전체</option>
                    {taskOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-black text-[#263238]">단계 선택</span>
                  <select className={inputSelectClass()} value={step} onChange={(event) => { setStep(event.target.value); setCopiedMessage(""); }}>
                    <option value="">전체</option>
                    {stepOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              </div>
            </AppCard>

            {selectedItem ? (
              <RoadmapDetail item={selectedItem} onCopy={copyText} copiedMessage={copiedMessage} />
            ) : (
              <>
                <AppCard className="p-4 text-sm font-bold text-slate-600">
                  업무를 선택해주세요. 아래 업무 카드에서 바로 선택할 수도 있습니다.
                </AppCard>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredItems.map((item, index) => (
                    <TaskSummaryCard
                      key={`${item.category}-${item.taskName}-${item.step}-${item.sortOrder}-${index}`}
                      item={item}
                      onSelect={selectItem}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function inputSelectClass() {
  return "min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm font-bold text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10";
}
