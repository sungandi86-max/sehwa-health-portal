import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppCard, Badge, SectionTitle } from "../components/ui.jsx";

const emptyRoadmap = { enabled: false, adminOnly: true, items: [] };

function safeText(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function messageKey(item) {
  return `${safeText(item.taskName, "")}__${safeText(item.step, "")}__${safeText(item.audience, "")}`;
}

function CopyButton({ value, onCopy, children }) {
  const disabled = !String(value || "").trim();
  return (
    <button
      type="button"
      onClick={() => onCopy(value)}
      disabled={disabled}
      className={`min-h-11 rounded-2xl px-4 py-2 text-sm font-black transition ${
        disabled
          ? "cursor-not-allowed bg-slate-100 text-slate-400"
          : "bg-[#1A3B8B] text-white shadow-sm hover:-translate-y-[1px] hover:shadow-md"
      }`}
    >
      {children}
    </button>
  );
}

function MessageCard({ item, onCopy }) {
  const title = safeText(item.messageTitle, "문구 미등록");
  const body = safeText(item.messageBody, "문구 미등록");
  const titleText = String(item.messageTitle || "").trim();
  const bodyText = String(item.messageBody || "").trim();
  const combined = titleText && bodyText
    ? `[${titleText}]\n\n${bodyText}`
    : [titleText, bodyText].filter(Boolean).join("\n\n");

  return (
    <AppCard className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#D94F70]">{safeText(item.step, "단계 미등록")}</p>
          <h3 className="mt-1 text-lg font-black leading-7 text-[#263238]">{safeText(item.taskName, "업무명 미등록")}</h3>
        </div>
        <Badge type="blue">{safeText(item.audience, "안내대상 미등록")}</Badge>
      </div>

      <div className="mt-3 grid gap-2 md:mt-4 md:gap-3">
        <div className="rounded-2xl bg-[#F7F9FC] p-3 md:p-4">
          <p className="text-xs font-black text-[#1A3B8B]">메신저 제목</p>
          <p className="mt-2 font-black text-[#263238]">{title}</p>
        </div>
        <div className="rounded-2xl bg-[#F7F9FC] p-3 md:p-4">
          <p className="text-xs font-black text-[#1A3B8B]">메신저 문구</p>
          <p className="mt-2 whitespace-pre-line font-semibold leading-7 text-slate-700" style={{ wordBreak: "keep-all" }}>
            {body}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap md:mt-4 md:gap-2">
        <CopyButton value={item.messageTitle} onCopy={onCopy}>제목 복사</CopyButton>
        <CopyButton value={item.messageBody} onCopy={onCopy}>문구 복사</CopyButton>
        <CopyButton value={combined} onCopy={onCopy}>제목+문구 복사</CopyButton>
      </div>
    </AppCard>
  );
}

export default function AdminMessageHelperPage({ roadmap = emptyRoadmap }) {
  const navigate = useNavigate();
  const items = Array.isArray(roadmap?.items) ? roadmap.items : [];
  const [selectedTaskName, setSelectedTaskName] = useState("전체");
  const [selectedStep, setSelectedStep] = useState("전체");
  const [selectedAudience, setSelectedAudience] = useState("전체");
  const [searchText, setSearchText] = useState("");
  const [copiedMessage, setCopiedMessage] = useState("");

  const messageItems = useMemo(
    () => items
      .filter((item) => safeText(item.taskName, ""))
      .sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999)),
    [items]
  );

  const taskNames = useMemo(() => ["전체", ...unique(messageItems.map((item) => item.taskName))], [messageItems]);

  const taskFilteredItems = selectedTaskName === "전체"
    ? messageItems
    : messageItems.filter((item) => item.taskName === selectedTaskName);

  const steps = useMemo(() => ["전체", ...unique(taskFilteredItems.map((item) => item.step))], [taskFilteredItems]);
  const audiences = useMemo(() => ["전체", ...unique(taskFilteredItems.map((item) => item.audience))], [taskFilteredItems]);

  const filteredItems = useMemo(
    () => taskFilteredItems.filter((item) => {
      const stepMatches = selectedStep === "전체" || item.step === selectedStep;
      const audienceMatches = selectedAudience === "전체" || String(item.audience || "").includes(selectedAudience);
      const query = searchText.trim().toLowerCase();
      const searchMatches = !query || [
        item.taskName,
        item.step,
        item.audience,
        item.messageTitle,
        item.messageBody,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      return stepMatches && audienceMatches && searchMatches;
    }),
    [taskFilteredItems, selectedStep, selectedAudience, searchText]
  );
  const shouldHideMobileFullList = selectedTaskName === "전체" && !searchText.trim();
  const taskSummaries = useMemo(
    () => taskNames
      .filter((taskName) => taskName !== "전체")
      .map((taskName) => ({
        taskName,
        count: messageItems.filter((item) => item.taskName === taskName).length,
      })),
    [messageItems, taskNames]
  );

  const selectTask = (taskName) => {
    setSelectedTaskName(taskName);
    setSelectedStep("전체");
    setSelectedAudience("전체");
    setSearchText("");
    setCopiedMessage("");
  };

  const copyText = async (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage("복사되었습니다.");
    } catch (error) {
      console.error("[admin-message-helper] clipboard failed", error);
      setCopiedMessage("복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-3 py-5 sm:px-4 md:py-8">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="mb-4 flex min-h-11 items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
      >
        관리자 화면으로
      </button>

      <div className="overflow-hidden rounded-[28px] bg-[#EAF3FF] p-4 md:rounded-[32px] md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            eyebrow="ADMIN MESSAGE HELPER"
            title="메신저 문구 도우미"
            description="업무 로드맵에 등록된 업무별 안내 문구를 업무명, 단계, 안내대상 기준으로 빠르게 찾아 복사합니다."
          />
          {roadmap?.adminOnly && <Badge type="pink">관리자 전용</Badge>}
        </div>

        {!roadmap?.enabled || !messageItems.length ? (
          <AppCard className="p-6 text-center text-sm font-bold text-slate-600">
            등록된 메신저 문구가 없습니다.
          </AppCard>
        ) : (
          <div className="space-y-5">
            <AppCard className="p-5">
              <div className="grid gap-3 md:hidden">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-black text-[#1A3B8B]">업무 선택</span>
                  <select
                    value={selectedTaskName}
                    onChange={(event) => selectTask(event.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-2.5 text-sm font-bold text-[#263238] outline-none focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10"
                  >
                    {taskNames.map((taskName) => <option key={taskName} value={taskName}>{taskName}</option>)}
                  </select>
                </label>
                <p className="rounded-2xl bg-[#EAF3FF] px-3 py-2 text-xs font-black text-[#1A3B8B]">
                  선택된 업무: {selectedTaskName}
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-slate-500">검색</span>
                  <input
                    type="search"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-2.5 text-sm font-bold text-[#263238] outline-none focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10"
                    placeholder="업무명, 단계, 대상, 문구 검색"
                  />
                </label>
              </div>

              <p className="hidden text-sm font-black text-[#1A3B8B] md:block">업무 선택</p>
              <div className="mt-3 hidden flex-wrap gap-2 md:flex">
                {taskNames.map((taskName) => (
                  <button
                    key={taskName}
                    type="button"
                    onClick={() => selectTask(taskName)}
                    className={`min-h-10 rounded-full px-4 py-2 text-sm font-black transition ${
                      selectedTaskName === taskName
                        ? "bg-[#1A3B8B] text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
                    }`}
                  >
                    {taskName}
                  </button>
                ))}
              </div>
            </AppCard>

            <AppCard className="p-4 md:p-5">
              <p className="text-sm font-black text-[#1A3B8B]">단계/대상 필터</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-slate-500">단계</span>
                  <select
                    value={selectedStep}
                    onChange={(event) => setSelectedStep(event.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-3 py-2.5 text-sm font-bold text-[#263238] outline-none focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10 md:px-4 md:py-3"
                  >
                    {steps.map((step) => <option key={step} value={step}>{step}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-slate-500">안내대상</span>
                  <select
                    value={selectedAudience}
                    onChange={(event) => setSelectedAudience(event.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-3 py-2.5 text-sm font-bold text-[#263238] outline-none focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10 md:px-4 md:py-3"
                  >
                    {audiences.map((audience) => <option key={audience} value={audience}>{audience}</option>)}
                  </select>
                </label>
                <label className="hidden md:block">
                  <span className="mb-1.5 block text-xs font-black text-slate-500">검색</span>
                  <input
                    type="search"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm font-bold text-[#263238] outline-none focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10"
                    placeholder="업무명, 단계, 대상, 문구 검색"
                  />
                </label>
              </div>
            </AppCard>

            {copiedMessage && (
              <p className="rounded-2xl bg-[#E8F6EE] px-4 py-3 text-sm font-black text-[#2E7D32]">
                {copiedMessage}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
              <span>문구 목록</span>
              <span className="hidden md:inline">{filteredItems.length.toLocaleString("ko-KR")}건</span>
              <span className="md:hidden">
                {shouldHideMobileFullList ? "업무 선택 또는 검색 필요" : `${filteredItems.length.toLocaleString("ko-KR")}건`}
              </span>
            </div>

            {shouldHideMobileFullList && (
              <div className="grid gap-2 md:hidden">
                <AppCard className="p-5 text-center text-sm font-bold text-slate-600">
                  업무를 선택하거나 검색어를 입력하면 관련 문구가 표시됩니다.
                </AppCard>
                <div className="grid gap-2">
                  {taskSummaries.map((task) => (
                    <button
                      key={task.taskName}
                      type="button"
                      onClick={() => selectTask(task.taskName)}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-black text-[#263238] shadow-sm transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
                    >
                      <span className="min-w-0 flex-1 truncate">{task.taskName}</span>
                      <span className="shrink-0 rounded-full bg-[#EAF3FF] px-2.5 py-1 text-xs font-black text-[#1A3B8B]">
                        {task.count.toLocaleString("ko-KR")}건
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`${shouldHideMobileFullList ? "hidden md:grid" : "grid"} gap-3 lg:grid-cols-2`}>
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <MessageCard key={messageKey(item)} item={item} onCopy={copyText} />
                ))
              ) : (
                <AppCard className="p-6 text-center text-sm font-bold text-slate-600">
                  조건에 맞는 문구가 없습니다.
                </AppCard>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
