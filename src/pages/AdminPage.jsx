import { useNavigate } from "react-router-dom";
import { AppCard, Badge, SectionTitle } from "../components/ui.jsx";

export default function AdminPage({ roadmap = { enabled: false, adminOnly: true, items: [] } }) {
  const navigate = useNavigate();

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="mb-4 flex min-h-11 items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
      >
        메인으로
      </button>

      <div className="overflow-hidden rounded-3xl bg-[#EAF3FF] p-4 md:rounded-[32px] md:p-8">
        <SectionTitle
          eyebrow="ADMIN"
          title="관리자 화면"
          description="보건업무 운영을 돕기 위한 관리자용 메뉴입니다. 일반 교직원 공개 메뉴에는 표시되지 않습니다."
        />

        {roadmap?.enabled ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AppCard className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-[#D94F70]">ADMIN HELPER</p>
                  <h3 className="mt-1 text-lg font-extrabold leading-7 text-[#263238]">
                    보건실 업무 로드맵 도우미
                  </h3>
                </div>
                {roadmap?.adminOnly && <Badge type="pink">관리자 전용</Badge>}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600" style={{ wordBreak: "keep-all" }}>
                업무 종류와 진행 단계별로 지금 할 일, 열어둘 메뉴, 숨길 메뉴, 메신저 문구를 확인합니다.
              </p>
              <p className="mt-2 rounded-2xl bg-[#FFF5F8] px-4 py-3 text-xs font-bold leading-5 text-[#D94F70]">
                마스터 비밀번호 확인 후 들어갈 수 있습니다.
              </p>
              <button
                type="button"
                onClick={() => navigate("/admin/roadmap")}
                className="mt-4 min-h-11 w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
              >
                비밀번호 입력하고 열기
              </button>
            </AppCard>
          </div>
        ) : (
          <AppCard className="p-6 text-center text-sm font-bold text-slate-600">
            사용 가능한 관리자 메뉴가 없습니다.
          </AppCard>
        )}
      </div>
    </section>
  );
}
