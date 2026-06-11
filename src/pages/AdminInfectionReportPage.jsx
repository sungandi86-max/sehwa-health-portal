import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppCard, Badge, SectionTitle } from "../components/ui.jsx";

const ADMIN_API = "/api/health-room-status";
const DEV_ADMIN_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/health-room-status";
const STATUS_OPTIONS = ["신규", "확인 중", "관리 중", "복귀 확인 필요", "종결"];
const FILTERS = ["전체", ...STATUS_OPTIONS];

async function requestAdminInfection(payload) {
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

function statusBadgeType(status) {
  if (status === "종결") return "gray";
  if (status === "복귀 확인 필요") return "pink";
  if (status === "관리 중") return "green";
  return "blue";
}

function SummaryCard({ label, value, type = "blue" }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${type === "pink" ? "text-[#D94F70]" : type === "green" ? "text-[#2E7D32]" : "text-[#1A3B8B]"}`}>
        {numberText(value)}
      </p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[0.7rem] font-black text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-[#263238]">{value || "-"}</p>
    </div>
  );
}

function ReportCard({ item, statusDraft, onStatusDraftChange, onStatusUpdate, updating, canUpdate }) {
  return (
    <AppCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-500">접수일시 또는 발생일</p>
          <h3 className="mt-1 text-base font-black text-[#1A3B8B]">
            {item.receivedAt || item.occurredAt || "-"}
          </h3>
        </div>
        <Badge type={statusBadgeType(item.status)}>{item.status || "확인 중"}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <Info label="학년" value={item.grade} />
        <Info label="반" value={item.classNumber} />
        <Info label="번호" value={item.studentNumber} />
      </div>

      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <Info label="감염병 종류" value={item.diseaseType} />
        <Info label="진단일" value={item.diagnosisDate} />
        <Info label="등교중지 시작일" value={item.exclusionStartDate} />
        <Info label="등교중지 종료 예정일" value={item.exclusionEndDate} />
        <Info label="담임 안내 여부" value={item.homeroomNoticeStatus} />
        <Info label="관리 메모" value={item.memoStatus} />
      </div>

      <div className="mt-4 rounded-2xl border border-[#C9DFFF] bg-white p-3">
        <label className="mb-1.5 block text-xs font-black text-[#1A3B8B]">상태 변경</label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            value={statusDraft || item.status || "확인 중"}
            onChange={(event) => onStatusDraftChange(item.id, event.target.value)}
            disabled={!canUpdate || updating}
            className="min-h-11 rounded-2xl border border-slate-200 bg-[#F7F9FC] px-3 py-2 text-sm font-bold text-[#263238] outline-none focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onStatusUpdate(item)}
            disabled={!canUpdate || updating}
            className={`min-h-11 rounded-2xl px-4 py-2 text-sm font-black text-white transition ${
              !canUpdate || updating ? "cursor-not-allowed bg-slate-300" : "bg-[#1A3B8B] hover:-translate-y-[1px] hover:shadow-md"
            }`}
          >
            {updating ? "변경 중..." : "상태 저장"}
          </button>
        </div>
      </div>
    </AppCard>
  );
}

export default function AdminInfectionReportPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("전체");
  const [statusDrafts, setStatusDrafts] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  const applyData = (json) => {
    setData(json);
    const drafts = {};
    (json?.items || []).forEach((item) => {
      drafts[item.id] = item.status || "확인 중";
    });
    setStatusDrafts(drafts);
  };

  const fetchReports = async () => {
    const nextPassword = password.trim();
    if (!nextPassword) {
      setMessage("마스터 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const json = await requestAdminInfection({ action: "getAdminInfectionReports", password: nextPassword });
      setPassword("");
      if (json?.success === true || json?.result === "success") {
        setAuthPassword(nextPassword);
        applyData(json);
        setFilter("전체");
      } else {
        setAuthPassword("");
        setData(null);
        setMessage(json?.message || "감염병 보고 목록을 불러올 수 없습니다.");
      }
    } catch (error) {
      console.error("[admin-infection-reports] fetch failed", error);
      setAuthPassword("");
      setData(null);
      setMessage("감염병 보고 목록 조회 중 오류가 발생했습니다.");
    } finally {
      setPassword("");
      setLoading(false);
    }
  };

  const updateStatus = async (item) => {
    const nextStatus = statusDrafts[item.id] || item.status || "확인 중";
    if (!authPassword) {
      setMessage("먼저 마스터 비밀번호로 감염병 보고를 조회해 주세요.");
      return;
    }

    setUpdatingId(item.id);
    setMessage("");
    try {
      const json = await requestAdminInfection({
        action: "updateAdminInfectionReportStatus",
        password: authPassword,
        rowId: item.id,
        status: nextStatus,
      });
      if (json?.success === true || json?.result === "success") {
        applyData(json);
        setMessage("상태가 변경되었습니다.");
      } else {
        setMessage(json?.message || "상태를 변경할 수 없습니다.");
      }
    } catch (error) {
      console.error("[admin-infection-reports] update failed", error);
      setMessage("상태 변경 중 오류가 발생했습니다.");
    } finally {
      setUpdatingId("");
    }
  };

  const items = Array.isArray(data?.items) ? data.items : [];
  const filteredItems = useMemo(() => {
    if (filter === "전체") return items;
    return items.filter((item) => item.status === filter);
  }, [filter, items]);

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
          eyebrow="INFECTION REPORTS"
          title="감염병 보고 관리"
          description="감염병 발생 보고를 상태 중심으로 확인합니다. 학생 이름, 상세 증상, 진료 내용, 파일 링크는 표시하지 않습니다."
        />

        <AppCard className="mt-5 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-1.5 block text-sm font-black text-[#263238]">마스터 비밀번호 재확인</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") fetchReports(); }}
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm font-bold text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10"
                placeholder="조회 후 현재 화면에서만 임시 사용합니다."
              />
            </div>
            <button
              type="button"
              onClick={fetchReports}
              disabled={loading}
              className={`min-h-11 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-sm transition ${
                loading ? "cursor-not-allowed bg-slate-300" : "bg-[#1A3B8B] hover:-translate-y-[1px] hover:shadow-md"
              }`}
            >
              {loading ? "조회 중..." : "감염병 보고 조회"}
            </button>
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-slate-500" style={{ wordBreak: "keep-all" }}>
            입력한 비밀번호는 브라우저 저장소에 보관하지 않습니다. 조회 성공 후 현재 화면에서만 상태 변경 요청에 임시 사용되며, 새로고침하거나 페이지를 벗어나면 사라집니다.
          </p>
        </AppCard>

        {message && (
          <p className="mt-4 rounded-2xl bg-[#FFF5F8] px-4 py-3 text-sm font-black text-[#D94F70]">
            {message}
          </p>
        )}

        {data && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="오늘 신규 보고" value={data.summary?.todayNewCount} />
              <SummaryCard label="현재 관리 중" value={data.summary?.activeCount} type="green" />
              <SummaryCard label="복귀 확인 필요" value={data.summary?.returnCheckCount} type="pink" />
              <SummaryCard label="종결" value={data.summary?.closedCount} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`min-h-10 rounded-full px-4 py-2 text-sm font-black transition ${
                    filter === item
                      ? "bg-[#1A3B8B] text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
              <span>최근 접수/발생일 순</span>
              <span>최종 조회: {data.updatedAt || "-"}</span>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <ReportCard
                    key={item.id}
                    item={item}
                    statusDraft={statusDrafts[item.id]}
                    onStatusDraftChange={(id, status) => setStatusDrafts((prev) => ({ ...prev, [id]: status }))}
                    onStatusUpdate={updateStatus}
                    updating={updatingId === item.id}
                    canUpdate={Boolean(authPassword)}
                  />
                ))
              ) : (
                <AppCard className="p-6 text-center text-sm font-bold text-slate-600">
                  표시할 감염병 보고가 없습니다.
                </AppCard>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
