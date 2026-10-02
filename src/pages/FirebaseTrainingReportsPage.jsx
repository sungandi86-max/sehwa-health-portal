import { useState } from "react";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { downloadTrainingReport, previewTrainingReport } from "../lib/trainingReports.js";

const REPORTS = [
  { id: "violence", title: "4대폭력예방", filename: "2026_교직원_4대폭력예방_이수명부.xlsx" },
  { id: "disability", title: "장애인식개선(사회적)", filename: "2026_교직원_장애인식개선_사회적_이수명부.xlsx" },
  { id: "childAbuse", title: "아동학대 신고의무자교육", filename: "2026_아동학대_신고의무자교육_이수명부.xlsx" },
];

function Count({ label, value }) {
  return <div className="min-w-0"><dt className="text-xs text-[#627083]">{label}</dt><dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-[#102047]">{value}</dd></div>;
}

function Performance({ performance }) {
  const rows = [
    ["전체", performance.all],
    ["고위직", performance.senior],
    ["신규자", performance.newEmployee],
    ["비정규직", performance.nonRegular],
  ];
  return (
    <section className="border-t border-[#DDEAE7] pt-4">
      <h3 className="text-sm font-semibold text-[#102047]">실적 입력 보조 숫자</h3>
      <div className="mt-2 overflow-x-auto rounded-[10px] border border-[#DDEAE7]">
        <table className="w-full min-w-[320px] text-left text-sm">
          <thead className="bg-[#F3F8F6] text-[#627083]"><tr><th className="px-3 py-2">구분</th><th className="px-3 py-2 text-right">대상</th><th className="px-3 py-2 text-right">이수</th></tr></thead>
          <tbody>{rows.map(([label, item]) => <tr key={label} className="border-t border-[#DDEAE7]"><th className="px-3 py-2 font-medium text-[#102047]">{label}</th><td className="px-3 py-2 text-right tabular-nums">{item.target}</td><td className="px-3 py-2 text-right tabular-nums">{item.completed}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#627083]">기관장 이수: {performance.principalCompleted === null ? "확인 필요" : performance.principalCompleted ? "예" : "아니요"}</p>
    </section>
  );
}

function ResultReport({ data }) {
  const items = [
    ["기관명", data.institutionName], ["소재지", data.address], ["기관장", data.principal],
    ["총 인원수", `${data.totalCount}명`], ["교육 수료인원", `${data.completedCount}명`],
    ["교육시간", data.educationHours], ["교육방법", data.educationMethod],
  ];
  return (
    <section className="border-t border-[#DDEAE7] pt-4">
      <h3 className="text-sm font-semibold text-[#102047]">결과보고서 입력값 미리보기</h3>
      <p className="mt-1 break-keep text-xs text-[#627083]">소재지·교육시간·교육방법은 공식 양식을 확인해 입력해야 합니다. HWPX 생성은 이번 단계에 포함되지 않습니다.</p>
      <dl className="mt-2 grid gap-x-5 gap-y-2 sm:grid-cols-2">{items.map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-[#DDEAE7] py-1 text-sm"><dt className="text-[#627083]">{label}</dt><dd className="text-right font-medium text-[#102047]">{value || "입력 필요"}</dd></div>)}</dl>
    </section>
  );
}

function ReportsContent({ displayName }) {
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  async function showPreview(report) {
    setSelected(report);
    setPreview(null);
    setMessage("");
    setWorking("preview");
    try {
      setPreview(await previewTrainingReport(report.id));
    } catch (error) {
      setMessage(error.message || "미리보기를 불러오지 못했습니다.");
    } finally {
      setWorking("");
    }
  }

  async function download() {
    if (!selected || !preview?.canDownload) return;
    setMessage("");
    setWorking("download");
    try {
      await downloadTrainingReport(selected.id, selected.filename);
    } catch (error) {
      setMessage(error.message || "Excel 다운로드에 실패했습니다.");
    } finally {
      setWorking("");
    }
  }

  return (
    <FirebaseV2PageShell label="관리자" title="법정의무연수 보고서" description="재직 대상자와 연구부 원본을 대조합니다." displayName={displayName}>
      <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4">
        <h2 className="text-[16px] font-semibold text-[#102047]">보고서 선택</h2>
        <div className="mt-2 divide-y divide-[#DDEAE7] border-y border-[#DDEAE7]">
          {REPORTS.map((report) => <div key={report.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="text-sm font-semibold text-[#102047]">{report.title}</span>
            <button type="button" onClick={() => showPreview(report)} disabled={Boolean(working)} className="min-h-11 rounded-[9px] border border-[#C8D8FF] bg-white px-3 text-[13px] font-semibold text-[#0D4EA6] hover:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15 disabled:opacity-50">미리보기</button>
          </div>)}
        </div>
      </section>

      {message && <p role="alert" className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2 text-sm text-[#B42318]">{message}</p>}
      {working === "preview" && <p className="text-sm text-[#627083]">연구부 원본과 현재 대상을 확인하는 중입니다.</p>}
      {selected && preview && <section className="space-y-4 rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4" aria-label={`${selected.title} 미리보기`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-[16px] font-semibold text-[#102047]">{preview.title} 이수명부</h2><p className="mt-1 text-xs text-[#627083]">최신 연구부 Sheet를 다시 읽어 다운로드합니다.</p></div>
          <button type="button" onClick={download} disabled={Boolean(working) || !preview.canDownload} className="min-h-11 rounded-[9px] bg-[#0D4EA6] px-4 text-[13px] font-semibold text-white hover:bg-[#183B8F] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/20 disabled:cursor-not-allowed disabled:opacity-50">{working === "download" ? "생성 중…" : "Excel 다운로드"}</button>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-y border-[#DDEAE7] py-3 sm:grid-cols-4">
          <Count label="현재 대상" value={preview.targetCount} /><Count label="이수완료" value={preview.completedCount} /><Count label="확인필요" value={preview.unknownCount} /><Count label="명시적 미이수" value={preview.incompleteCount} />
        </dl>
        {preview.unknownCount > 0 && <p className="text-[13px] text-[#9A5B00]">확인필요 {preview.unknownCount}명은 이수명부에서 제외됩니다.</p>}
        {selected.id === "childAbuse" && preview.completionDateMissing > 0 && <p className="break-keep text-[13px] text-[#9A5B00]">완료자의 교육수료일 누락 {preview.completionDateMissing}건은 Excel에서 빈칸으로 표시됩니다.</p>}
        {preview.blockingReasons.length > 0 && <p role="alert" className="rounded-[9px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2 text-[13px] font-medium text-[#B42318]">{preview.blockingReasons.join(" · ")}. 다운로드할 수 없습니다.</p>}
        {preview.performance && <Performance performance={preview.performance} />}
        {preview.resultReport && <ResultReport data={preview.resultReport} />}
        <div className="border-t border-[#DDEAE7] pt-4">
          <h3 className="text-sm font-semibold text-[#102047]">이수명부 일부 미리보기</h3>
          <p className="mt-1 text-xs text-[#627083]">이수번호는 화면에 표시하지 않습니다.</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[300px] text-left text-sm"><thead className="bg-[#F3F8F6] text-[#627083]"><tr><th className="px-3 py-2">연번</th><th className="px-3 py-2">직위</th><th className="px-3 py-2">성명</th>{selected.id === "childAbuse" && <th className="px-3 py-2">교육수료일</th>}</tr></thead><tbody>{preview.sampleRows.map((row) => <tr key={row.no} className="border-b border-[#DDEAE7]"><td className="px-3 py-2">{row.no}</td><td className="px-3 py-2">{row.position}</td><td className="px-3 py-2">{row.name}</td>{selected.id === "childAbuse" && <td className="px-3 py-2">{row.completionDate || "미입력"}</td>}</tr>)}</tbody></table></div>
        </div>
      </section>}
    </FirebaseV2PageShell>
  );
}

export default function FirebaseTrainingReportsPage() {
  return <FirebaseAdminRoleAccessGate deniedTitle="법정의무연수 보고서 관리자 권한이 없습니다.">{({ displayName }) => <ReportsContent displayName={displayName} />}</FirebaseAdminRoleAccessGate>;
}
