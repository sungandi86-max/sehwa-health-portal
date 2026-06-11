import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppCard, Badge, SectionTitle } from "../components/ui.jsx";

const ADMIN_API = "/api/health-room-status";
const DEV_ADMIN_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/health-room-status";

async function requestReceiptSummary(password) {
  const payload = { action: "getAdminReceiptSummary", password };
  const response = await fetch(ADMIN_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const contentType = response.headers.get("content-type") || "";

  if (response.ok && contentType.includes("application/json")) {
    return response.json();
  }

  if (import.meta.env.DEV) {
    const fallbackResponse = await fetch(DEV_ADMIN_API_FALLBACK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return fallbackResponse.json();
  }

  throw new Error(`HTTP ${response.status}`);
}

function numberText(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}건`;
}

function ReceiptItemCard({ item }) {
  const [notice, setNotice] = useState("");

  return (
    <AppCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#1A3B8B]">{item.label}</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">{item.sheetName}</p>
        </div>
        <Badge type={item.available ? "blue" : "pink"}>{item.available ? "연결됨" : "시트 없음"}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-[#EAF3FF] p-3">
          <p className="text-xs font-bold text-slate-500">전체 건수</p>
          <p className="mt-1 text-xl font-black text-[#1A3B8B]">{numberText(item.totalCount)}</p>
        </div>
        <div className="rounded-2xl bg-[#F2FBF7] p-3">
          <p className="text-xs font-bold text-slate-500">오늘 신규</p>
          <p className="mt-1 text-xl font-black text-[#2E7D32]">{numberText(item.todayCount)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600">
        <p>
          <span className="font-black text-[#263238]">최근 접수 일시: </span>
          {item.recentReceivedAt || "-"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          상세 개인정보와 파일은 원본 내부 시트에서 확인해 주세요.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setNotice("원본 허브 구글시트에서 해당 관련 시트를 확인해 주세요. 이 화면에는 개인정보를 표시하지 않습니다.")}
        className="mt-4 min-h-11 w-full rounded-2xl border border-[#C9DFFF] bg-white px-4 py-3 text-sm font-black text-[#1A3B8B] transition hover:bg-[#EAF3FF]"
      >
        상세 보기 안내
      </button>
      {notice && (
        <p className="mt-2 rounded-2xl bg-[#FFF5F8] px-4 py-3 text-xs font-bold leading-5 text-[#D94F70]">
          {notice}
        </p>
      )}
    </AppCard>
  );
}

function SectionBlock({ section }) {
  const items = Array.isArray(section?.items) ? section.items : [];
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[#263238]">{section.title}</h2>
        <Badge type={section.id === "eventApplications" ? "green" : "blue"}>
          {section.id === "eventApplications" ? "이벤트 신청" : "제출·보고"}
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <ReceiptItemCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function AdminReceiptStatusPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchSummary = async () => {
    if (!password.trim()) {
      setMessage("마스터 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const json = await requestReceiptSummary(password.trim());
      setPassword("");
      if (json?.success === true || json?.result === "success") {
        setSummary(json);
      } else {
        setSummary(null);
        setMessage(json?.message || "접수 현황을 불러올 수 없습니다.");
      }
    } catch (error) {
      console.error("[admin-receipts] summary failed", error);
      setSummary(null);
      setMessage("접수 현황 조회 중 오류가 발생했습니다.");
    } finally {
      setPassword("");
      setLoading(false);
    }
  };

  const sections = Array.isArray(summary?.sections) ? summary.sections : [];

  return (
    <section className="mx-auto max-w-7xl px-3 py-5 sm:px-4 md:py-8">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="mb-4 flex min-h-11 items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
      >
        관리자 화면으로
      </button>

      <div className="rounded-[28px] bg-[#EAF3FF] p-4 md:p-6">
        <SectionTitle
          eyebrow="ADMIN RECEIPTS"
          title="관리자 접수 현황"
          description="온라인 보건실을 통해 들어온 제출·보고와 이벤트 신청을 건수 중심으로 확인합니다."
        />

        <AppCard className="mt-5 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-1.5 block text-sm font-black text-[#263238]">
                마스터 비밀번호 재확인
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") fetchSummary(); }}
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm font-bold text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10"
                placeholder="조회할 때만 사용되며 저장하지 않습니다."
              />
            </div>
            <button
              type="button"
              onClick={fetchSummary}
              disabled={loading}
              className={`min-h-11 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-sm transition ${
                loading ? "cursor-not-allowed bg-slate-300" : "bg-[#1A3B8B] hover:-translate-y-[1px] hover:shadow-md"
              }`}
            >
              {loading ? "조회 중..." : "접수 현황 조회"}
            </button>
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-slate-500" style={{ wordBreak: "keep-all" }}>
            비밀번호는 브라우저 저장소에 보관하지 않으며, 조회 요청에만 사용합니다. 학생명, 진단명, 파일 링크 등 민감정보는 표시하지 않습니다.
          </p>
          {message && (
            <p className="mt-3 rounded-2xl bg-[#FFF5F8] px-4 py-3 text-sm font-black text-[#D94F70]">
              {message}
            </p>
          )}
        </AppCard>

        {summary && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {sections.flatMap((section) => section.items || []).map((item) => (
                <div key={`summary-${item.id}`} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-black text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-black text-[#1A3B8B]">{numberText(item.todayCount)}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">오늘 신규</p>
                </div>
              ))}
            </div>

            <p className="mt-4 text-right text-xs font-bold text-slate-500">
              최종 조회: {summary.updatedAt || "-"}
            </p>
            {sections.map((section) => (
              <SectionBlock key={section.id} section={section} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
