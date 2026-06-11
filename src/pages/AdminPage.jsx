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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roadmap?.enabled && (
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
          )}

          <AppCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#2E7D32]">MESSAGE HELPER</p>
                <h3 className="mt-1 text-lg font-extrabold leading-7 text-[#263238]">
                  메신저 문구 도우미
                </h3>
              </div>
              <Badge type="green">관리자 전용</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600" style={{ wordBreak: "keep-all" }}>
              업무 로드맵에 등록된 안내 문구를 업무명, 단계, 안내대상별로 찾아 바로 복사합니다.
            </p>
            <p className="mt-2 rounded-2xl bg-[#F2FBF7] px-4 py-3 text-xs font-bold leading-5 text-[#2E7D32]">
              일반 안내용 문구만 표시하며, 학생 개별 건강정보는 포함하지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => navigate("/admin/messages")}
              className="mt-4 min-h-11 w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
            >
              메신저 문구 찾기
            </button>
          </AppCard>

          <AppCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#2E7D32]">ADMIN RECEIPTS</p>
                <h3 className="mt-1 text-lg font-extrabold leading-7 text-[#263238]">
                  접수 현황
                </h3>
              </div>
              <Badge type="blue">관리자 전용</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600" style={{ wordBreak: "keep-all" }}>
              감염병 보고, 확인증 제출, 채용검진 확인 요청, 인바디 신청 현황을 건수 중심으로 확인합니다.
            </p>
            <p className="mt-2 rounded-2xl bg-[#F2FBF7] px-4 py-3 text-xs font-bold leading-5 text-[#2E7D32]">
              학생명, 진단명, 파일 링크 등 상세정보는 표시하지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => navigate("/admin/receipts")}
              className="mt-4 min-h-11 w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
            >
              접수 현황 확인하기
            </button>
          </AppCard>

          <AppCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#D94F70]">INFECTION REPORTS</p>
                <h3 className="mt-1 text-lg font-extrabold leading-7 text-[#263238]">
                  감염병 보고 관리
                </h3>
              </div>
              <Badge type="pink">관리자 전용</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600" style={{ wordBreak: "keep-all" }}>
              감염병 발생 보고의 처리 상태, 등교중지 기간, 복귀 확인 필요 여부를 확인합니다.
            </p>
            <p className="mt-2 rounded-2xl bg-[#FFF5F8] px-4 py-3 text-xs font-bold leading-5 text-[#D94F70]">
              학생 이름과 상세 건강정보는 표시하지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => navigate("/admin/infection-reports")}
              className="mt-4 min-h-11 w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
            >
              감염병 보고 관리 열기
            </button>
          </AppCard>
        </div>
      </div>
    </section>
  );
}
