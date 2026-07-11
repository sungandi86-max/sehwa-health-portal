import { useNavigate } from "react-router-dom";
import { AppCard, Badge, SectionTitle } from "../components/ui.jsx";

const quickLinks = [
  {
    label: "업무 로드맵",
    path: "/admin/roadmap",
    tone: "pink",
    description: "업무 단계별 지금 할 일과 관련 도구를 확인합니다.",
  },
  {
    label: "접수 현황",
    path: "/admin/receipts",
    tone: "blue",
    description: "확인증 제출, 채용검진 요청, 인바디 신청 현황을 확인합니다.",
  },
  {
    label: "감염병 보고 관리",
    path: "/admin/infections",
    tone: "pink",
    description: "감염병 보고 상태와 복귀 확인 필요 건을 관리합니다.",
  },
  {
    label: "메신저 문구 도우미",
    path: "/admin/messages",
    tone: "green",
    description: "보건실 메신저 문구 생성기 Lite를 엽니다.",
  },
];

function SummaryCard({ label, value, description, tone = "blue" }) {
  const color = tone === "green" ? "text-[#2E7D32]" : tone === "pink" ? "text-[#D94F70]" : "text-[#1A3B8B]";
  const bg = tone === "green" ? "bg-[#F2FBF7]" : tone === "pink" ? "bg-[#FFF5F8]" : "bg-[#EAF3FF]";

  return (
    <div className={`rounded-2xl border border-white/80 ${bg} p-4`}>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
      <p className="mt-2 text-xs font-bold leading-5 text-slate-600">{description}</p>
    </div>
  );
}

function countText(value) {
  if (value === null || value === undefined || value === "") return "-";
  return `${Number(value || 0).toLocaleString("ko-KR")}건`;
}

export default function AdminPage({ roadmap = { enabled: false, adminOnly: true, items: [] }, adminDashboard = null }) {
  const navigate = useNavigate();
  const todayReceiptCount = adminDashboard?.todayReceiptCount;
  const activeInfectionCount = adminDashboard?.activeInfectionCount;
  const recentReceiptAt = adminDashboard?.recentReceiptAt || "";
  const roadmapTaskCount = adminDashboard?.roadmapTaskCount ?? (Array.isArray(roadmap?.items) ? roadmap.items.length : 0);
  const checkItems = Array.isArray(adminDashboard?.checkItems)
    ? adminDashboard.checkItems
    : [
        { label: "신규 접수", count: todayReceiptCount ?? 0 },
        { label: "미종결 감염병 보고", count: activeInfectionCount ?? 0 },
      ];

  return (
    <section className="min-w-0">
      <div className="rounded-[28px] bg-[#EAF3FF] p-4 md:rounded-[32px] md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            eyebrow="ADMIN DASHBOARD"
            title="관리자 홈"
            description="온라인 보건실 운영 현황과 관리자 기능을 한 화면에서 확인합니다."
          />
          <Badge type="pink">관리자 전용</Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="오늘 신규 접수"
            value={countText(todayReceiptCount)}
            description="확인증 제출, 채용검진 요청, 인바디 신청의 오늘 신규 합계입니다."
            tone="blue"
          />
          <SummaryCard
            label="미종결 감염병 보고"
            value={countText(activeInfectionCount)}
            description="신규, 확인 중, 관리 중, 복귀 확인 필요 건을 감염병 보고 관리에서 확인합니다."
            tone="pink"
          />
          <SummaryCard
            label="최근 제출 현황"
            value={recentReceiptAt || "최근 접수 없음"}
            description="결핵검진 확인증, 심폐소생술 이수증, 채용검진 요청, 인바디 신청 기준입니다."
            tone="green"
          />
          <SummaryCard
            label="업무 로드맵"
            value={roadmap?.enabled ? `사용 중 ${Number(roadmapTaskCount || 0).toLocaleString("ko-KR")}개 업무` : "미사용"}
            description="앱_업무로드맵 시트 기준으로 관리자 업무 흐름을 안내합니다."
            tone={roadmap?.enabled ? "blue" : "pink"}
          />
        </div>

        <AppCard className="mt-5 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#2E7D32]">TODAY CHECKLIST</p>
              <h3 className="mt-1 text-xl font-black text-[#263238]">오늘 확인할 일</h3>
            </div>
            <p className="text-xs font-bold text-slate-500">학생명, 진단명, 파일 링크는 표시하지 않습니다.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {checkItems.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-100 bg-[#F7F9FC] p-4">
                <p className="text-sm font-black text-[#263238]">{item.label}</p>
                <p className="mt-2 text-2xl font-black text-[#1A3B8B]">{countText(item.count)}</p>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard className="mt-5 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#D94F70]">SHORTCUTS</p>
              <h3 className="mt-1 text-xl font-black text-[#263238]">주요 기능 바로가기</h3>
            </div>
            <p className="text-xs font-bold text-slate-500">교직원 공개 화면에는 표시되지 않습니다.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className="min-h-40 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:bg-[#F7FDFC] hover:shadow-md"
              >
                <Badge type={item.tone}>{item.label}</Badge>
                <p className="mt-3 text-sm font-bold leading-6 text-slate-600" style={{ wordBreak: "keep-all" }}>
                  {item.description}
                </p>
                <p className="mt-4 text-sm font-black text-[#1A3B8B]">열기</p>
              </button>
            ))}
          </div>
        </AppCard>
      </div>
    </section>
  );
}
