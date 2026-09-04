import { getInfectionStatusLabels } from "../lib/infectionStatus.js";

function formatSubmittedAt(value) {
  const date = value?.toDate?.();
  if (!date) return "-";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function FirebaseInfectionReportList({ reports, state }) {
  if (state.status === "loading") {
    return (
      <p className="rounded-[24px] bg-white/80 p-5 text-sm font-black text-[#627083]">
        보고 목록을 불러오는 중입니다.
      </p>
    );
  }

  if (state.status === "permission-denied" || state.status === "error") {
    return <p className="rounded-[24px] bg-[#FFF7F7] p-5 text-sm font-black text-[#B42318]">{state.message}</p>;
  }

  if (!reports.length) {
    return (
      <p className="rounded-[24px] bg-white/80 p-5 text-sm font-black text-[#627083]">
        현재 학기에 조회 가능한 감염병 보고가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <InfectionReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}

function InfectionReportCard({ report }) {
  const labels = getInfectionStatusLabels(report);

  return (
    <article className="rounded-[24px] border border-[#DDEAE7] bg-white/95 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-black text-[#102047]">
          {report.student?.number || "-"}번 {report.student?.name || "-"}
        </p>
        <span className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
          {labels.caseStatusLabel}
        </span>
      </div>
      <p className="mt-2 text-sm font-bold text-[#627083]">{report.infection?.diseaseName || "-"}</p>
      <p className="mt-1 text-xs font-bold text-[#8A96A8]">
        제출일 {formatSubmittedAt(report.submittedAt)} · {labels.submissionStatusLabel}
      </p>
    </article>
  );
}
