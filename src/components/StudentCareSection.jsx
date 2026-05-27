import { useEffect, useRef, useState } from "react";
import { studentCareIntro } from "../data/fallbackData.js";
import { AppCard, Badge, SectionTitle } from "./ui.jsx";

const inputCls =
  "w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10 placeholder:text-slate-400";

const btnCls =
  "mt-4 inline-block w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:w-auto";

const HEALTH_ROOM_BUTTON = "보건실 소재 확인하기";
const HEALTH_ROOM_BUTTON_LEGACY = "蹂닿굔???낆떎?꾪솴 ?닿린";
const HEALTH_ROOM_STATUS_API = "/api/health-room-status";

const MONTHLY_VISIT_CARD = {
  title: "담임용 월별 보건실 입실 확인",
  description: "월말 출결 처리를 위해 우리 반 학생의 보건실 입실 기록을 월별로 확인합니다.",
  privacyNotice: "증상 및 처치 내용은 표시하지 않고, 입실·복귀 시각과 결과 처리 여부만 확인할 수 있습니다.",
  buttonText: "월별 입실 기록 조회하기",
  status: "권한 필요",
};

const DEFAULT_HEALTH_ROOM_CARD = {
  title: "보건실 소재 확인",
  description:
    "수업 중 보건실을 이용 중인 학생의 소재와 복귀 여부를 확인할 수 있습니다. 학생 건강정보, 증상, 처치내용은 표시하지 않습니다.",
  privacyNotice: "권한 있는 교직원에게만 최소정보를 제한적으로 표시합니다.",
  buttonText: HEALTH_ROOM_BUTTON,
  status: "권한 필요",
  url: "",
};

const ACCESS_TABS = [
  { value: "subject", label: "교과교사용" },
  { value: "homeroom", label: "담임교사용" },
  { value: "admin", label: "보건교사용" },
];

function getGasErrorMessage(error, fallback) {
  if (error?.userMessage) return error.userMessage;
  if (error?.name === "SyntaxError") {
    return "Apps Script 응답을 JSON으로 읽을 수 없습니다. 배포 URL이나 접근 권한을 확인해 주세요.";
  }
  return fallback;
}

function sanitizeParams(params) {
  const sanitized = {};
  params.forEach((value, key) => {
    sanitized[key] = key.toLowerCase().includes("password") ? "[hidden]" : value;
  });
  return sanitized;
}

async function requestGasJson(params, debugLabel) {
  console.log(`[${debugLabel}] proxy request`, {
    url: HEALTH_ROOM_STATUS_API,
    params: sanitizeParams(params),
  });

  let response;
  try {
    response = await fetch(HEALTH_ROOM_STATUS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(params.entries())),
    });
  } catch (error) {
    console.error(`[${debugLabel}] fetch failed`, error);
    const wrapped = new Error("fetch failed");
    wrapped.userMessage = "보건실 소재 확인 프록시 요청에 실패했습니다. 네트워크 또는 Vercel API 상태를 확인해 주세요.";
    wrapped.cause = error;
    throw wrapped;
  }

  const body = await response.text();
  console.log(`[${debugLabel}] response`, {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    body,
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.userMessage = `보건실 소재 확인 프록시 응답 상태가 ${response.status}입니다. Vercel 함수 로그와 GAS_URL 설정을 확인해 주세요.`;
    error.responseBody = body;
    console.error(`[${debugLabel}] bad status`, error);
    throw error;
  }

  const trimmed = body.trim();
  if (trimmed.startsWith("<") || /<html|<!doctype/i.test(trimmed)) {
    const error = new Error("HTML response from proxy");
    error.userMessage = "보건실 소재 확인 프록시가 JSON이 아닌 HTML을 반환했습니다. Vercel 배포 또는 API 경로를 확인해 주세요.";
    error.responseBody = body;
    console.error(`[${debugLabel}] non-json html response`, error);
    throw error;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    error.userMessage = "보건실 소재 확인 응답을 JSON으로 해석할 수 없습니다. 응답 body를 콘솔에서 확인해 주세요.";
    error.responseBody = body;
    console.error(`[${debugLabel}] json parse failed`, error);
    throw error;
  }
}

function isGasSuccess(json) {
  return json?.success === true || json?.result === "success";
}

function HealthRoomLocationModal({ onClose }) {
  const [accessType, setAccessType] = useState("subject");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState("");
  const [classNo, setClassNo] = useState("");
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState("");
  const overlayRef = useRef(null);

  useModalLifecycle(onClose);

  const resetResult = () => {
    setRows([]);
    setMessage("");
    setError("");
  };

  const handleTab = (nextType) => {
    setAccessType(nextType);
    setPassword("");
    setGrade("");
    setClassNo("");
    resetResult();
  };

  const fetchRows = async () => {
    if (!password.trim()) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    if (accessType === "homeroom" && (!grade.trim() || !classNo.trim())) {
      setError("학년과 반을 입력해 주세요.");
      return;
    }

    setLoading(true);
    resetResult();
    try {
      const params = new URLSearchParams({
        action: "getHealthRoomLocation",
        accessType,
        password: password.trim(),
      });
      if (accessType === "homeroom") {
        params.set("grade", grade.trim());
        params.set("classNo", classNo.trim());
      }
      const json = await requestGasJson(params, "HealthRoom:getHealthRoomLocation");
      if (isGasSuccess(json)) {
        setRows(Array.isArray(json.items) ? json.items : []);
        setMessage(json.message || (Array.isArray(json.items) && json.items.length ? "" : "조회된 보건실 소재 기록이 없습니다."));
      } else {
        setError(json.message || json.debug || "조회할 수 없습니다.");
      }
    } catch (error) {
      console.error("[HealthRoom:getHealthRoomLocation] error", error);
      setError(getGasErrorMessage(error, "조회 중 오류가 발생했습니다. 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  };

  const confirmHomeroom = async (row) => {
    setCheckingId(row.rowId);
    setError("");
    try {
      const params = new URLSearchParams({
        action: "confirmHealthRoomHomeroom",
        rowId: row.rowId,
        grade: grade.trim(),
        classNo: classNo.trim(),
        password: password.trim(),
      });
      const json = await requestGasJson(params, "HealthRoom:confirmHealthRoomHomeroom");
      if (isGasSuccess(json)) {
        setRows((prev) =>
          prev.map((item) =>
            item.rowId === row.rowId ? { ...item, homeroomConfirmed: true } : item
          )
        );
      } else {
        setError(json.message || json.debug || "담임 확인을 기록할 수 없습니다.");
      }
    } catch (error) {
      console.error("[HealthRoom:confirmHealthRoomHomeroom] error", error);
      setError(getGasErrorMessage(error, "담임 확인 기록 중 오류가 발생했습니다."));
    } finally {
      setCheckingId("");
    }
  };

  return (
    <ModalShell overlayRef={overlayRef} onClose={onClose} title="보건실 소재 확인">
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
          이 화면은 수업 중 학생 소재 확인 및 담임 출결 참고를 위한 제한 열람 화면입니다.
          학생 개인정보가 포함될 수 있으므로 화면 캡처, 저장, 출력, 재공유를 금합니다.
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#F7F9FC] p-1">
          {ACCESS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTab(tab.value)}
              className={`rounded-xl px-2 py-2 text-xs font-black transition sm:text-sm ${
                accessType === tab.value
                  ? "bg-white text-[#1A3B8B] shadow-sm"
                  : "text-slate-500 hover:text-[#1A3B8B]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {accessType === "homeroom" && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-[#263238]">학년</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="예: 1"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-[#263238]">반</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={classNo}
                  onChange={(e) => setClassNo(e.target.value)}
                  placeholder="예: 3"
                />
              </div>
            </>
          )}
          <div className={accessType === "homeroom" ? "sm:col-span-2" : "sm:col-span-2"}>
            <PasswordField
              label={accessType === "admin" ? "관리자 비밀번호" : "비밀번호"}
              value={password}
              onChange={setPassword}
              onEnter={fetchRows}
              error={error}
            />
          </div>
        </div>

        <SubmitButton loading={loading} onClick={fetchRows}>
          보건실 소재 확인하기
        </SubmitButton>

        {message && (
          <p className="rounded-2xl bg-[#F7F9FC] p-3 text-sm font-bold text-slate-600">{message}</p>
        )}

        <HealthRoomList
          accessType={accessType}
          rows={rows}
          checkingId={checkingId}
          onConfirm={confirmHomeroom}
        />
      </div>
    </ModalShell>
  );
}

function MonthlyVisitModal({ onClose }) {
  const [grade, setGrade] = useState("");
  const [classNo, setClassNo] = useState("");
  const [password, setPassword] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef(null);

  useModalLifecycle(onClose);

  const fetchRecords = async () => {
    if (!grade.trim() || !classNo.trim() || !password.trim() || !month.trim()) {
      setError("학년, 반, 비밀번호, 조회 월을 모두 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setRecords([]);
    setSummary(null);

    try {
      const params = new URLSearchParams({
        mode: "monthlyVisit",
        grade: grade.trim(),
        classNo: classNo.trim(),
        month: month.trim(),
        password: password.trim(),
      });
      const json = await requestGasJson(params, "HealthRoom:monthlyVisit");
      if (isGasSuccess(json)) {
        const nextRecords = Array.isArray(json.records) ? json.records : [];
        setRecords(nextRecords);
        setSummary({
          grade: json.grade || grade.trim(),
          classNo: json.classNo || classNo.trim(),
          month: json.month || month.trim(),
          total: json.summary?.total || 0,
          resultCount: json.summary?.resultCount || 0,
          unchecked: json.summary?.unchecked || 0,
        });
        setMessage(nextRecords.length ? "" : "조회된 월별 보건실 입실 기록이 없습니다.");
      } else {
        setError(json.message || json.debug || "월별 입실 기록을 조회할 수 없습니다.");
      }
    } catch (error) {
      console.error("[HealthRoom:monthlyVisit] error", error);
      setError(getGasErrorMessage(error, "월별 입실 기록 조회 중 오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell overlayRef={overlayRef} onClose={onClose} title="담임용 월별 보건실 입실 확인">
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
          이 화면은 담임교사의 월별 출결 확인을 위한 조회 화면입니다.
          증상 및 처치 내용은 표시하지 않으며, 입실·복귀 시각과 결과 처리 여부만 확인할 수 있습니다.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#263238]">학년</label>
            <input className={inputCls} inputMode="numeric" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="예: 1" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#263238]">반</label>
            <input className={inputCls} inputMode="numeric" value={classNo} onChange={(e) => setClassNo(e.target.value)} placeholder="예: 3" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#263238]">조회 월</label>
            <input className={inputCls} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <PasswordField value={password} onChange={setPassword} onEnter={fetchRecords} error={error} />
        </div>

        <SubmitButton loading={loading} onClick={fetchRecords}>
          월별 입실 기록 조회하기
        </SubmitButton>

        {summary && (
          <div className="rounded-2xl bg-[#F7F9FC] p-4 text-sm font-bold text-slate-700">
            {formatMonthlySummaryTitle(summary.month, summary.grade, summary.classNo)}
            <div className="mt-1 text-[#1A3B8B]">
              총 {summary.total}건 / 결과 처리 {summary.resultCount}건 / 미확인 {summary.unchecked}건
            </div>
          </div>
        )}
        {message && <p className="rounded-2xl bg-[#F7F9FC] p-3 text-sm font-bold text-slate-600">{message}</p>}

        <MonthlyVisitList records={records} />
      </div>
    </ModalShell>
  );
}

function formatMonthlySummaryTitle(month, grade, classNo) {
  const [year, monthNo] = String(month || "").split("-");
  if (year && monthNo) return `${year}년 ${Number(monthNo)}월 ${grade}학년 ${classNo}반 보건실 입실 기록`;
  return `${grade}학년 ${classNo}반 보건실 입실 기록`;
}

function MonthlyVisitList({ records }) {
  if (!records.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
        조회 결과가 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record, index) => (
        <div key={`${record.date}-${record.number}-${record.inTime}-${index}`} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-black text-[#263238]">
                {record.number}번 · {record.name}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-400">{record.date}</p>
            </div>
            <Badge type={record.teacherChecked === "확인" ? "green" : "blue"}>{record.teacherChecked}</Badge>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <Info label="입실 시각" value={record.inTime || "-"} />
            <Info label="복귀 시각" value={record.outTime || "-"} />
            <Info label="체류시간" value={record.stay || "-"} />
            <Info label="결과 처리" value={record.result || "-"} />
          </div>
        </div>
      ))}
    </div>
  );
}

function HealthRoomList({ accessType, rows, checkingId, onConfirm }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
        조회 결과가 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.rowId || `${row.studentNo}-${row.enteredAt}`} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-black text-[#263238]">
                {row.studentNo} · {row.maskedName}
              </p>
              {row.date && <p className="mt-1 text-xs font-bold text-slate-400">{row.date}</p>}
            </div>
            <Badge type={row.status === "현재 이용중" ? "pink" : "green"}>{row.status}</Badge>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <Info label="입실 시각" value={row.enteredAt} />
            <Info label="복귀 시각" value={row.returnedAt || "-"} />
            {accessType === "homeroom" && <Info label="체류시간" value={row.duration || "-"} />}
            {accessType === "homeroom" && <Info label="출결 참고" value={row.attendanceNote || "-"} />}
            {accessType === "admin" && <Info label="주요 증상" value={row.symptom || "-"} />}
            {accessType === "admin" && <Info label="처치 내용" value={row.treatment || "-"} />}
            {accessType === "admin" && <Info label="결과 처리" value={row.resultDetail || "-"} />}
          </div>

          {accessType === "homeroom" && (
            <button
              type="button"
              disabled={row.homeroomConfirmed || checkingId === row.rowId}
              onClick={() => onConfirm(row)}
              className={`mt-3 rounded-2xl px-4 py-2 text-xs font-black transition ${
                row.homeroomConfirmed
                  ? "cursor-not-allowed bg-[#E8F6EE] text-[#2E7D32]"
                  : "bg-[#EAF3FF] text-[#1A3B8B] hover:bg-[#DDEBFF]"
              }`}
            >
              {row.homeroomConfirmed
                ? "담임 확인 완료"
                : checkingId === row.rowId
                  ? "기록 중..."
                  : "담임 확인 체크"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl bg-[#F7F9FC] px-3 py-2">
      <span className="mr-2 text-xs font-black text-[#1A3B8B]">{label}</span>
      <span className="font-bold text-slate-700">{value}</span>
    </div>
  );
}

function PasswordField({ label = "비밀번호", value, onChange, onEnter, error }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-[#263238]">
        {label} <span className="ml-1 text-[#D94F70]">*</span>
      </label>
      <input
        type="password"
        className={inputCls}
        placeholder="비밀번호 입력"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
        autoFocus
      />
      {error && <p className="mt-1.5 text-xs font-bold text-[#D94F70]">{error}</p>}
    </div>
  );
}

function SubmitButton({ loading, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full rounded-2xl px-5 py-4 text-sm font-black text-white shadow-sm transition ${
        loading
          ? "cursor-not-allowed bg-slate-300"
          : "bg-[#1A3B8B] hover:-translate-y-[1px] hover:shadow-md active:translate-y-0"
      }`}
    >
      {loading ? "확인 중..." : children}
    </button>
  );
}

function ModalShell({ overlayRef, onClose, title, children }) {
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl sm:rounded-[32px]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-xl font-black text-[#1A3B8B]">{title}</p>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function useModalLifecycle(onClose) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
}

function isHealthRoomCard(item) {
  return (
    item.buttonText === HEALTH_ROOM_BUTTON ||
    item.buttonText === HEALTH_ROOM_BUTTON_LEGACY ||
    item.title === "보건실 소재 확인" ||
    item.title === "보건실 입실 현황 확인"
  );
}

export default function StudentCareSection({ items }) {
  const [activeModal, setActiveModal] = useState(null);
  const healthRoomSource = items.find(isHealthRoomCard);
  const healthRoomCard = {
    ...DEFAULT_HEALTH_ROOM_CARD,
    ...(healthRoomSource || {}),
    title: DEFAULT_HEALTH_ROOM_CARD.title,
    description: DEFAULT_HEALTH_ROOM_CARD.description,
    privacyNotice: DEFAULT_HEALTH_ROOM_CARD.privacyNotice,
    buttonText: DEFAULT_HEALTH_ROOM_CARD.buttonText,
    url: "",
  };
  const visibleCards = [
    { ...MONTHLY_VISIT_CARD, modalType: "monthlyVisit" },
    { ...healthRoomCard, modalType: "healthRoom" },
  ];

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
          <div className="rounded-2xl bg-white p-5 text-sm leading-7 text-slate-600">
            {studentCareIntro.guide}
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {visibleCards.map((card) => (
            <AppCard key={card.title}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-extrabold text-[#263238]">{card.title}</h3>
                <Badge type="blue">{card.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{card.description}</p>
              <p className="mt-3 rounded-2xl bg-[#F7F9FC] p-3 text-sm text-slate-600">
                {card.privacyNotice}
              </p>
              <button
                onClick={() => setActiveModal({ type: card.modalType })}
                className={btnCls}
              >
                {card.buttonText}
              </button>
            </AppCard>
          ))}
        </div>
      </div>

      {activeModal?.type === "monthlyVisit" && (
        <MonthlyVisitModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal?.type === "healthRoom" && (
        <HealthRoomLocationModal onClose={() => setActiveModal(null)} />
      )}
    </section>
  );
}
