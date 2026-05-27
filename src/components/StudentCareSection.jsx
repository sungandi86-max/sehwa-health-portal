import { useEffect, useRef, useState } from "react";
import { GAS_BASE_URL } from "../config.js";
import { studentCareIntro } from "../data/fallbackData.js";
import { AppCard, Badge, PrimaryButton, SectionTitle } from "./ui.jsx";

const inputCls =
  "w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10 placeholder:text-slate-400";

const btnCls =
  "mt-4 inline-block w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:w-auto";

const PRIVATE_BUTTON = "요보호학생 확인 링크 열기";
const PRIVATE_BUTTON_LEGACY = "?붾낫?명븰???뺤씤 留곹겕 ?닿린";
const HEALTH_ROOM_BUTTON = "보건실 소재 확인하기";
const HEALTH_ROOM_BUTTON_LEGACY = "蹂닿굔???낆떎?꾪솴 ?닿린";

const ACCESS_TABS = [
  { value: "subject", label: "교과교사용" },
  { value: "homeroom", label: "담임교사용" },
  { value: "admin", label: "보건교사용" },
];

function buildGasUrl(params) {
  return `${GAS_BASE_URL}?${params.toString()}`;
}

function getGasErrorMessage(error, fallback) {
  if (error?.userMessage) return error.userMessage;
  if (error?.name === "SyntaxError") {
    return "Apps Script 응답을 JSON으로 읽을 수 없습니다. 배포 URL이나 접근 권한을 확인해 주세요.";
  }
  return fallback;
}

async function requestGasJson(url, debugLabel) {
  console.log(`[${debugLabel}] request`, {
    url,
    baseUrl: GAS_BASE_URL,
    endsWithExec: GAS_BASE_URL.endsWith("/exec"),
  });

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error(`[${debugLabel}] fetch failed`, error);
    const wrapped = new Error("fetch failed");
    wrapped.userMessage = "Apps Script 요청에 실패했습니다. 네트워크, CORS, 배포 URL을 확인해 주세요.";
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
    error.userMessage = `Apps Script 응답 상태가 ${response.status}입니다. 웹앱 배포 권한을 확인해 주세요.`;
    error.responseBody = body;
    console.error(`[${debugLabel}] bad status`, error);
    throw error;
  }

  const trimmed = body.trim();
  if (trimmed.startsWith("<") || /<html|<!doctype/i.test(trimmed)) {
    const error = new Error("HTML response from Apps Script");
    error.userMessage = "Apps Script가 JSON이 아니라 HTML 페이지를 반환했습니다. 로그인 페이지, 권한 오류, 또는 잘못된 배포 URL일 수 있습니다.";
    error.responseBody = body;
    console.error(`[${debugLabel}] non-json html response`, error);
    throw error;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    error.userMessage = "Apps Script 응답을 JSON으로 파싱할 수 없습니다. 응답 body를 콘솔에서 확인해 주세요.";
    error.responseBody = body;
    console.error(`[${debugLabel}] json parse failed`, error);
    throw error;
  }
}

function isGasSuccess(json) {
  return json?.success === true || json?.result === "success";
}

function PrivateLinkModal({ onClose, action = "verifyPrivate", title = "요보호학생 확인 링크" }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef(null);

  useModalLifecycle(onClose);

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        action,
        password: password.trim(),
      });
      const json = await requestGasJson(buildGasUrl(params), `StudentCare:${action}`);
      if (isGasSuccess(json) && json.url) {
        window.open(json.url, "_blank", "noopener,noreferrer");
        onClose();
      } else {
        setError(json.message || "비밀번호가 올바르지 않습니다.");
      }
    } catch (error) {
      console.error(`[StudentCare:${action}] error`, error);
      setError(getGasErrorMessage(error, "확인 중 오류가 발생했습니다. 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell overlayRef={overlayRef} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
          교직원 전용 자료입니다. 비밀번호를 입력해 주세요.
        </div>
        <PasswordField
          value={password}
          onChange={setPassword}
          onEnter={handleSubmit}
          error={error}
        />
        <SubmitButton loading={loading} onClick={handleSubmit}>
          확인
        </SubmitButton>
      </div>
    </ModalShell>
  );
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
      const url = buildGasUrl(params);
      const json = await requestGasJson(url, "HealthRoom:getHealthRoomLocation");
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
      const url = buildGasUrl(params);
      const json = await requestGasJson(url, "HealthRoom:confirmHealthRoomHomeroom");
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

function isPrivateCard(item) {
  return item.buttonText === PRIVATE_BUTTON || item.buttonText === PRIVATE_BUTTON_LEGACY;
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
          {items.map((item) => {
            const isHealthRoom = isHealthRoomCard(item);
            const card = isHealthRoom
              ? {
                  ...item,
                  title: "보건실 소재 확인",
                  description:
                    "수업 중 보건실을 이용 중인 학생의 소재와 복귀 여부를 확인할 수 있습니다. 학생 건강정보, 증상, 처치내용은 표시하지 않습니다.",
                  privacyNotice:
                    "권한 있는 교직원에게만 최소정보를 제한적으로 표시합니다.",
                  buttonText: HEALTH_ROOM_BUTTON,
                  url: "",
                }
              : item;

            return (
              <AppCard key={card.title}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-extrabold text-[#263238]">{card.title}</h3>
                  <Badge type="blue">{card.status}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{card.description}</p>
                <p className="mt-3 rounded-2xl bg-[#F7F9FC] p-3 text-sm text-slate-600">
                  {card.privacyNotice}
                </p>
                {isPrivateCard(card) ? (
                  <button
                    onClick={() => setActiveModal({ type: "private" })}
                    className={btnCls}
                  >
                    {card.buttonText}
                  </button>
                ) : isHealthRoom ? (
                  <button
                    onClick={() => setActiveModal({ type: "healthRoom" })}
                    className={btnCls}
                  >
                    {card.buttonText}
                  </button>
                ) : (
                  card.buttonText && <PrimaryButton url={card.url}>{card.buttonText}</PrimaryButton>
                )}
              </AppCard>
            );
          })}
        </div>
      </div>

      {activeModal?.type === "private" && (
        <PrivateLinkModal
          onClose={() => setActiveModal(null)}
          action="verifyPrivate"
          title="요보호학생 확인 링크"
        />
      )}
      {activeModal?.type === "healthRoom" && (
        <HealthRoomLocationModal onClose={() => setActiveModal(null)} />
      )}
    </section>
  );
}
