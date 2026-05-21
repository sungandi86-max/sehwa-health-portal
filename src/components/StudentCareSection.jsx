import { useEffect, useRef, useState } from "react";
import { GAS_BASE_URL } from "../config.js";
import { studentCareIntro } from "../data/fallbackData.js";
import { AppCard, Badge, PrimaryButton, SectionTitle } from "./ui.jsx";

// ── 비밀번호 확인 모달 ───────────────────────────────────────────
const inputCls =
  "w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10 placeholder:text-slate-400";

function PrivateLinkModal({ onClose }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError("비밀번호를 입력해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${GAS_BASE_URL}?action=verifyPrivate&password=${encodeURIComponent(password)}`
      );
      const json = await res.json();
      if (json.result === "success" && json.url) {
        window.open(json.url, "_blank", "noopener,noreferrer");
        onClose();
      } else {
        setError(json.message || "비밀번호가 올바르지 않습니다.");
      }
    } catch {
      setError("확인 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl sm:rounded-[32px]">
        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-xl font-black text-[#1A3B8B]">🔐 요보호학생 확인 링크</p>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
              교직원 전용 자료입니다. 비밀번호를 입력해주세요.
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-[#263238]">
                비밀번호 <span className="ml-1 text-[#D94F70]">*</span>
              </label>
              <input
                type="password"
                className={inputCls}
                placeholder="비밀번호 입력"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                autoFocus
              />
              {error && (
                <p className="mt-1.5 text-xs font-bold text-[#D94F70]">{error}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className={`w-full rounded-2xl px-5 py-4 text-sm font-black text-white shadow-sm transition
                ${loading
                  ? "cursor-not-allowed bg-slate-300"
                  : "bg-[#1A3B8B] hover:-translate-y-[1px] hover:shadow-md active:translate-y-0"
                }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  확인 중...
                </span>
              ) : "확인"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 메인 섹션 ────────────────────────────────────────────────────
const PRIVATE_BUTTON = "요보호학생 확인 링크 열기";

export default function StudentCareSection({ items }) {
  const [pwModalOpen, setPwModalOpen] = useState(false);

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
          <div className="rounded-2xl bg-white p-5 text-sm leading-7 text-slate-600 shadow-sm">
            {studentCareIntro.guide}
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <AppCard key={item.title}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-extrabold text-[#263238]">{item.title}</h3>
                <Badge type="blue">{item.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
              <p className="mt-3 rounded-2xl bg-[#F7F9FC] p-3 text-sm text-slate-600">
                {item.privacyNotice}
              </p>
              {item.buttonText === PRIVATE_BUTTON ? (
                <button
                  onClick={() => setPwModalOpen(true)}
                  className="mt-4 inline-block w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:w-auto"
                >
                  {item.buttonText}
                </button>
              ) : (
                item.buttonText && <PrimaryButton url={item.url}>{item.buttonText}</PrimaryButton>
              )}
            </AppCard>
          ))}
        </div>
      </div>

      {pwModalOpen && <PrivateLinkModal onClose={() => setPwModalOpen(false)} />}
    </section>
  );
}
