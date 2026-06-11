import { useState } from "react";

const ADMIN_AUTH_KEY = "sehwa_admin_master_verified";
const ADMIN_AUTH_API = "/api/health-room-status";
const DEV_ADMIN_AUTH_FALLBACK = "https://sehwa-health-portal.vercel.app/api/health-room-status";

async function verifyAdminMaster(password) {
  const payload = { action: "verifyAdminMaster", password };
  const response = await fetch(ADMIN_AUTH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const contentType = response.headers.get("content-type") || "";

  if (response.ok && contentType.includes("application/json")) {
    return response.json();
  }

  if (import.meta.env.DEV) {
    const fallbackResponse = await fetch(DEV_ADMIN_AUTH_FALLBACK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return fallbackResponse.json();
  }

  throw new Error(`HTTP ${response.status}`);
}

export default function AdminAuthGate({ children }) {
  const [verified, setVerified] = useState(() => sessionStorage.getItem(ADMIN_AUTH_KEY) === "true");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!password.trim()) {
      setMessage("마스터 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const json = await verifyAdminMaster(password.trim());
      if (json?.success === true || json?.result === "success") {
        sessionStorage.setItem(ADMIN_AUTH_KEY, "true");
        setVerified(true);
        setPassword("");
      } else {
        setMessage(json?.message || "마스터 비밀번호가 일치하지 않습니다.");
      }
    } catch (error) {
      console.error("[admin-auth] verify failed", error);
      setMessage("인증 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  if (verified) return children;

  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-[28px] bg-[#EAF3FF] p-5 md:p-8">
        <div className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm md:p-7">
          <p className="text-sm font-black text-[#D94F70]">ADMIN ACCESS</p>
          <h2 className="mt-2 text-2xl font-black text-[#1A3B8B]">관리자 마스터 인증</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600" style={{ wordBreak: "keep-all" }}>
            보건실 업무 로드맵 도우미는 관리자 전용 화면입니다. 앱_설정 탭의 관리자마스터_비밀번호를 입력해 주세요.
          </p>

          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-black text-[#263238]">
              마스터 비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm font-bold text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10"
              placeholder="비밀번호 입력"
              autoFocus
            />
            {message && (
              <p className="mt-2 rounded-2xl bg-[#FFF5F8] px-4 py-3 text-sm font-black text-[#D94F70]">
                {message}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className={`mt-4 min-h-11 w-full rounded-2xl px-5 py-3 text-sm font-black text-white shadow-sm transition ${
              loading ? "cursor-not-allowed bg-slate-300" : "bg-[#1A3B8B] hover:-translate-y-[1px] hover:shadow-md"
            }`}
          >
            {loading ? "확인 중..." : "관리자 화면 열기"}
          </button>
        </div>
      </div>
    </section>
  );
}
