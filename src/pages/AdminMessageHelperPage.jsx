import { useNavigate } from "react-router-dom";
import { AppCard, Badge, SectionTitle } from "../components/ui.jsx";

export const MESSAGE_HELPER_LITE_URL =
  "https://script.google.com/macros/s/AKfycbxVONfUYNf63cvJhiehe8N9TAka14MuKAXxXDVQG79H_R1DeX4kwXfHtjo25hDGsYFU/exec";

function LiteOpenButton({ className = "" }) {
  return (
    <a
      href={MESSAGE_HELPER_LITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${className}`}
    >
      보건실 메신저 문구 생성기 열기
    </a>
  );
}

export default function AdminMessageHelperPage() {
  const navigate = useNavigate();

  return (
    <section className="mx-auto max-w-6xl px-3 py-5 sm:px-4 md:py-8">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="mb-4 flex min-h-11 items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
      >
        관리자 화면으로
      </button>

      <div className="overflow-hidden rounded-[28px] bg-[#EAF3FF] p-4 md:rounded-[32px] md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            eyebrow="ADMIN MESSAGE HELPER"
            title="메신저 문구 도우미"
            description="기존 보건실 메신저 문구 생성기 Lite를 새 창으로 열어 상황별 안내 문구를 생성합니다."
          />
          <Badge type="pink">관리자 전용</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <AppCard className="p-5 md:p-6">
            <p className="text-sm font-black text-[#D94F70]">수쌤T 공기용 Lite 도구</p>
            <h3 className="mt-2 text-2xl font-black leading-9 text-[#263238]">
              보건실 메신저 문구 생성기 Lite
            </h3>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600" style={{ wordBreak: "keep-all" }}>
              건강검진, 결핵검진, 소변검사, 감염병, 제출 독려 문구를 기존 Lite 도구에서 더 정교하게 생성합니다.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                "건강검진, 결핵검진, 소변검사, 감염병, 제출 독려 문구 생성 가능",
                "입력한 내용은 화면에서만 사용",
                "제목/본문/전체 문구 복사 가능",
                "기존 Lite 도구에서 더 정교한 문구 생성",
              ].map((text) => (
                <div key={text} className="rounded-2xl border border-[#C9DFFF] bg-[#F7FDFC] p-4 text-sm font-bold leading-6 text-slate-700">
                  {text}
                </div>
              ))}
            </div>

            <div className="mt-5">
              <LiteOpenButton className="w-full sm:w-auto" />
            </div>
          </AppCard>

          <div className="space-y-4">
            <AppCard className="border-[#A8E6D1] bg-[#F2FBF7] p-5">
              <p className="text-sm font-black text-[#2E7D32]">개인정보 저장 없음</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-700" style={{ wordBreak: "keep-all" }}>
                입력한 내용은 화면에서만 사용되며 별도로 저장되지 않습니다.
              </p>
            </AppCard>

            <AppCard className="border-[#F7C9D6] bg-[#FFF5F8] p-5">
              <p className="text-sm font-black text-[#D94F70]">민감정보 주의</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-700" style={{ wordBreak: "keep-all" }}>
                학생 이름, 진단명, 검진 결과, 상세 건강정보를 문구에 직접 포함하지 않도록 주의해 주세요.
              </p>
            </AppCard>

            <AppCard className="p-5">
              <p className="text-sm font-black text-[#1A3B8B]">화면 안 임베드 안내</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600" style={{ wordBreak: "keep-all" }}>
                Apps Script 웹앱은 보안 설정에 따라 iframe 표시가 제한될 수 있어, 안정적인 새 창 열기 방식을 기본으로 사용합니다.
              </p>
            </AppCard>
          </div>
        </div>
      </div>
    </section>
  );
}
