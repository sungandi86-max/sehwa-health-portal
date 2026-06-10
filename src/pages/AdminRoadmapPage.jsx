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

function taskKey(item) {
  return `${safeText(item.category, "")}__${safeText(item.taskName, "")}`;
}

function todayLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

function BoardPanel({ title, subtitle, children, className = "" }) {
  return (
    <section className={`rounded-[24px] border border-white/70 bg-white p-4 shadow-sm md:p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-black text-[#1A3B8B]">{title}</h3>
        {subtitle && <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function GuideBlock({ title, children, tone = "default" }) {
  const toneClass = {
    primary: "border-[#A8E6D1] bg-[#F2FBF7]",
    warn: "border-[#F7C9D6] bg-[#FFF5F8]",
    default: "border-slate-100 bg-white",
  }[tone] || "border-slate-100 bg-white";

  return (
    <div className={`rounded-[22px] border p-4 shadow-sm ${toneClass}`}>
      <h4 className={`text-sm font-black ${tone === "warn" ? "text-[#D94F70]" : "text-[#1A3B8B]"}`}>{title}</h4>
      <div className="mt-3 text-sm font-semibold leading-7 text-slate-700" style={{ wordBreak: "keep-all" }}>
        {children}
      </div>
    </div>
  );
}

function BulletList({ items, empty = "-" }) {
  if (!items.length) return <p>{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1A3B8B]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MenuBadges({ value, type = "blue" }) {
  const items = splitList(value);
  if (!items.length) return <span className="text-sm font-semibold text-slate-500">-</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} type={type}>{item}</Badge>
      ))}
    </div>
  );
}

function CopyButton({ children, value, onCopy, variant = "primary" }) {
  const disabled = !String(value || "").trim();
  const activeClass = variant === "light"
    ? "border border-[#C9DFFF] bg-white text-[#1A3B8B] hover:bg-[#EAF3FF]"
    : "bg-[#1A3B8B] text-white shadow-sm hover:-translate-y-[1px] hover:shadow-md";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCopy(value)}
      className={`min-h-11 rounded-2xl px-4 py-3 text-sm font-black transition ${
        disabled ? "cursor-not-allowed bg-slate-100 text-slate-400" : activeClass
      }`}
    >
      {children}
    </button>
  );
}

function WorkSelector({ tasks, selectedKey, onSelect }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tasks.map((task) => {
        const active = task.key === selectedKey;
        return (
          <button
            key={task.key}
            type="button"
            onClick={() => onSelect(task)}
            className={`min-h-[108px] rounded-[22px] border p-4 text-left transition ${
              active
                ? "border-[#1A3B8B] bg-[#1A3B8B] text-white shadow-md"
                : "border-[#C9DFFF] bg-[#F7FDFC] text-[#263238] hover:-translate-y-[1px] hover:bg-[#EAF3FF]"
            }`}
          >
            <p className={`text-xs font-black ${active ? "text-[#A8E6D1]" : "text-[#D94F70]"}`}>{task.category || "업무분류"}</p>
            <p className="mt-2 text-base font-black leading-6">{task.taskName || "업무명 없음"}</p>
            <p className={`mt-2 text-xs font-bold ${active ? "text-white/80" : "text-slate-500"}`}>
              {task.count}개 단계
            </p>
          </button>
        );
      })}
    </div>
  );
}

function StepSelector({ steps, selectedStep, onSelect }) {
  if (!steps.length) {
    return <div className="rounded-2xl bg-[#F7F9FC] p-4 text-sm font-bold text-slate-500">업무를 먼저 선택해주세요.</div>;
  }

  return (
    <div className="space-y-2">
      {steps.map((item, index) => {
        const active = item.step === selectedStep;
        return (
          <button
            key={`${item.step}-${item.sortOrder}-${index}`}
            type="button"
            onClick={() => onSelect(item)}
            className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
              active
                ? "border-[#1A3B8B] bg-[#EAF3FF] text-[#1A3B8B] shadow-sm"
                : "border-slate-100 bg-white text-slate-600 hover:border-[#C9DFFF] hover:bg-[#F7F9FC]"
            }`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
              active ? "bg-[#1A3B8B] text-white" : "bg-[#E8F6EE] text-[#2E7D32]"
            }`}>
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black">{safeText(item.step, "단계 미정")}</span>
              <span className="block truncate text-xs font-semibold text-slate-500">{safeText(item.todo, "지금 할 일이 등록되지 않았습니다.")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SummarySidebar({ selectedTask, selectedItem, recentTask, totalSteps, currentStepIndex }) {
  return (
    <div className="grid gap-3">
      <AppCard className="p-4">
        <p className="text-xs font-black text-[#D94F70]">최근 선택한 업무</p>
        <p className="mt-2 text-base font-black leading-6 text-[#263238]">
          {recentTask ? recentTask.taskName : selectedTask?.taskName || "아직 선택한 업무 없음"}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">{recentTask ? recentTask.category : selectedTask?.category || "1단계에서 업무를 선택하세요."}</p>
      </AppCard>
      <AppCard className="p-4">
        <p className="text-xs font-black text-[#D94F70]">기준일</p>
        <p className="mt-2 text-base font-black text-[#263238]">{todayLabel()}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">시트 로드맵 기준으로 확인합니다.</p>
      </AppCard>
      <AppCard className="p-4">
        <p className="text-xs font-black text-[#D94F70]">일정 요약</p>
        <p className="mt-2 text-base font-black text-[#263238]">
          {selectedItem ? `${currentStepIndex + 1}/${totalSteps} 단계` : "단계 선택 전"}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">{selectedItem ? safeText(selectedItem.step, "현재 단계") : "2단계에서 현재 단계를 선택하세요."}</p>
      </AppCard>
    </div>
  );
}

function ToolCard({ title, description, value, onCopy }) {
  return (
    <button
      type="button"
      onClick={() => value && onCopy(value)}
      className="min-h-24 rounded-2xl border border-[#C9DFFF] bg-[#F7FDFC] p-4 text-left transition hover:-translate-y-[1px] hover:bg-[#EAF3FF]"
    >
      <p className="text-sm font-black text-[#1A3B8B]">{title}</p>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{description}</p>
    </button>
  );
}

function RoadmapGuide({ item, nextItem, onCopy, copiedMessage, stepIndex, totalSteps }) {
  if (!item) {
    return (
      <AppCard className="p-6 text-center">
        <p className="text-lg font-black text-[#1A3B8B]">업무와 단계를 선택해주세요.</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">1단계에서 업무를 고르고, 2단계에서 현재 단계를 선택하면 실행 가이드가 표시됩니다.</p>
      </AppCard>
    );
  }

  const todoItems = splitList(item.todo);
  const nextItems = splitList(nextItem?.todo);
  const combinedMessage = [item.messageTitle, item.messageBody].map((value) => String(value || "").trim()).filter(Boolean).join("\n\n");

  return (
    <div className="space-y-4">
      <GuideBlock title="현재 단계 요약" tone="primary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge type="blue">{safeText(item.category, "업무분류")}</Badge>
            <h3 className="mt-3 text-2xl font-black leading-8 text-[#263238]">{safeText(item.taskName, "업무명 없음")}</h3>
            <p className="mt-3 text-lg font-black text-[#1A3B8B]">현재 단계: {safeText(item.step, "단계 미정")}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {todoItems[0] || "선택한 단계에서 확인해야 할 업무를 점검하는 단계입니다."}
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
            <p className="text-xs font-black text-[#D94F70]">진행 위치</p>
            <p className="mt-1 text-xl font-black text-[#1A3B8B]">{stepIndex + 1}/{totalSteps}</p>
          </div>
        </div>
      </GuideBlock>

      <div className="grid gap-4 lg:grid-cols-2">
        <GuideBlock title="지금 해야 할 일">
          <BulletList items={todoItems} empty="지금 할 일이 아직 등록되지 않았습니다." />
        </GuideBlock>
        <GuideBlock title="다음 할 일">
          <BulletList items={nextItems} empty={nextItem ? "다음 단계의 할 일이 비어 있습니다." : "다음 단계가 없습니다. 마감 또는 정리 상태를 확인하세요."} />
        </GuideBlock>
      </div>

      <GuideBlock title="추가 확인 사항 또는 주의사항" tone={item.privacyNote ? "warn" : "default"}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-black text-[#1A3B8B]">안내 대상</p>
            <p className="mt-1">{safeText(item.audience)}</p>
          </div>
          <div>
            <p className="text-xs font-black text-[#D94F70]">개인정보 주의</p>
            <p className="mt-1 whitespace-pre-line">{safeText(item.privacyNote, "개인정보나 건강정보를 포함하지 않도록 확인하세요.")}</p>
          </div>
          <div>
            <p className="text-xs font-black text-[#1A3B8B]">열어둘 메뉴</p>
            <div className="mt-2"><MenuBadges value={item.openMenus} type="blue" /></div>
          </div>
          <div>
            <p className="text-xs font-black text-[#1A3B8B]">숨길 메뉴</p>
            <div className="mt-2"><MenuBadges value={item.hideMenus} type="gray" /></div>
          </div>
        </div>
      </GuideBlock>

      <GuideBlock title="관련 도구">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ToolCard title="보건실 메신저 문구 생성기 Lite" description="아래 메신저 템플릿을 복사해 안내 문구 작성에 활용합니다." value={item.messageBody} onCopy={onCopy} />
          <ToolCard title="보건 공문·보고서 도우미 앱" description="관련 시트명과 메뉴 ID를 참고해 보고 흐름을 점검합니다." value={item.relatedSheet} onCopy={onCopy} />
          <ToolCard title="관련 시트 바로가기 정보" description={safeText(item.relatedSheet, "관련 시트가 등록되지 않았습니다.")} value={item.relatedSheet} onCopy={onCopy} />
          <ToolCard title="관련 메뉴 ID 안내" description={safeText(item.relatedMenuId, "관련 메뉴 ID가 등록되지 않았습니다.")} value={item.relatedMenuId} onCopy={onCopy} />
        </div>
      </GuideBlock>

      <GuideBlock title="관련 메신저 템플릿">
        <div className="grid gap-3">
          <div className="rounded-2xl bg-[#F7F9FC] p-4">
            <p className="text-xs font-black text-[#1A3B8B]">메신저 제목</p>
            <p className="mt-2 font-black text-[#263238]">{safeText(item.messageTitle)}</p>
          </div>
          <div className="rounded-2xl bg-[#F7F9FC] p-4">
            <p className="text-xs font-black text-[#1A3B8B]">메신저 문구</p>
            <p className="mt-2 whitespace-pre-line font-semibold leading-7 text-slate-700" style={{ wordBreak: "keep-all" }}>
              {safeText(item.messageBody)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <CopyButton value={item.messageTitle} onCopy={onCopy}>제목 복사</CopyButton>
            <CopyButton value={item.messageBody} onCopy={onCopy}>문구 복사</CopyButton>
            <CopyButton value={combinedMessage} onCopy={onCopy}>제목+문구 복사</CopyButton>
          </div>
          {copiedMessage && (
            <p className="rounded-2xl bg-[#E8F6EE] px-4 py-3 text-sm font-black text-[#2E7D32]">
              {copiedMessage}
            </p>
          )}
        </div>
      </GuideBlock>
    </div>
  );
}

export default function AdminRoadmapPage({ roadmap = emptyRoadmap }) {
  const navigate = useNavigate();
  const items = Array.isArray(roadmap?.items) ? roadmap.items : [];
  const [selectedTaskKey, setSelectedTaskKey] = useState("");
  const [step, setStep] = useState("");
  const [recentTask, setRecentTask] = useState(null);
  const [copiedMessage, setCopiedMessage] = useState("");

  const tasks = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const key = taskKey(item);
      if (!map.has(key)) {
        map.set(key, {
          key,
          category: safeText(item.category, ""),
          taskName: safeText(item.taskName, ""),
          count: 0,
          firstSortOrder: Number(item.sortOrder || 999),
        });
      }
      const task = map.get(key);
      task.count += 1;
      task.firstSortOrder = Math.min(task.firstSortOrder, Number(item.sortOrder || 999));
    });
    return Array.from(map.values()).sort((a, b) => a.firstSortOrder - b.firstSortOrder);
  }, [items]);

  const selectedTask = tasks.find((task) => task.key === selectedTaskKey);
  const selectedTaskItems = useMemo(
    () => items
      .filter((item) => taskKey(item) === selectedTaskKey)
      .sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999)),
    [items, selectedTaskKey]
  );
  const selectedItem = selectedTaskItems.find((item) => item.step === step);
  const stepIndex = selectedItem ? selectedTaskItems.findIndex((item) => item === selectedItem) : -1;
  const nextItem = stepIndex >= 0 ? selectedTaskItems[stepIndex + 1] : null;

  const selectTask = (task) => {
    setSelectedTaskKey(task.key);
    setStep("");
    setRecentTask(task);
    setCopiedMessage("");
  };

  const selectStep = (item) => {
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

  return (
    <section className="mx-auto max-w-7xl px-3 py-5 sm:px-4 md:py-8">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="mb-4 flex min-h-11 items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
      >
        ← 관리자 화면으로
      </button>

      <div className="overflow-hidden rounded-[28px] bg-[#EAF3FF] p-4 md:rounded-[32px] md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            eyebrow="ADMIN WORK BOARD"
            title="보건실 업무 로드맵 도우미"
            description="업무 선택 → 단계 선택 → 현재 해야 할 일 확인 흐름으로 보건업무 진행 상황을 점검하는 관리자용 실무 보드입니다."
          />
          {roadmap?.adminOnly && <Badge type="pink">관리자 전용</Badge>}
        </div>

        {!roadmap?.enabled || !items.length ? (
          <AppCard className="p-6 text-center text-sm font-bold text-slate-600">
            등록된 업무 로드맵이 없습니다.
          </AppCard>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <BoardPanel
                title="1단계. 어떤 업무를 확인할까요?"
                subtitle="업무분류와 업무명을 기준으로 현재 확인할 업무를 선택하세요."
              >
                <WorkSelector tasks={tasks} selectedKey={selectedTaskKey} onSelect={selectTask} />
              </BoardPanel>

              <SummarySidebar
                selectedTask={selectedTask}
                selectedItem={selectedItem}
                recentTask={recentTask}
                totalSteps={selectedTaskItems.length}
                currentStepIndex={Math.max(stepIndex, 0)}
              />
            </div>

            <BoardPanel
              title="2단계. 지금 어느 단계인가요?"
              subtitle={selectedTask ? `${selectedTask.category} · ${selectedTask.taskName}` : "업무를 선택하면 단계 목록이 표시됩니다."}
            >
              <StepSelector steps={selectedTaskItems} selectedStep={step} onSelect={selectStep} />
            </BoardPanel>

            <BoardPanel
              title="3단계. 실행 가이드 확인"
              subtitle="선택한 업무와 단계에 맞춰 지금 할 일, 다음 할 일, 관련 도구와 메신저 문구를 확인하세요."
              className="bg-[#F7FDFC]"
            >
              <RoadmapGuide
                item={selectedItem}
                nextItem={nextItem}
                onCopy={copyText}
                copiedMessage={copiedMessage}
                stepIndex={Math.max(stepIndex, 0)}
                totalSteps={selectedTaskItems.length || 1}
              />
            </BoardPanel>
          </div>
        )}
      </div>
    </section>
  );
}
