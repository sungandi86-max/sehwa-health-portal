import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import FirebaseStaffSubmissionAccessGate from "../components/FirebaseStaffSubmissionAccessGate.jsx";
import { FirebaseContentState, FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { getTrainingDetail, getTrainingList } from "../lib/trainingCenter.js";

const STATUS_TONE = {
  예정: "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]",
  진행중: "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]",
  완료: "border-[#DDEAE7] bg-[#F8FAFA] text-[#627083]",
  비활성: "border-[#F3D8A8] bg-[#FFF8E8] text-[#9A5B00]",
};

function TrainingBadges({ item }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
      <span className={`rounded-[8px] border px-2.5 py-1 ${STATUS_TONE[item.status] || STATUS_TONE.비활성}`}>{item.status}</span>
      <span className="rounded-[8px] border border-[#DDEAE7] bg-white px-2.5 py-1 text-[#102047]">{item.targetStatus}</span>
      {item.required && <span className="rounded-[8px] border border-[#D7E8FF] bg-[#F1F7FF] px-2.5 py-1 text-[#0D4EA6]">필수</span>}
    </div>
  );
}

function DatePlace({ item }) {
  return (
    <dl className="grid gap-x-3 gap-y-1 text-[13px] leading-5 text-[#627083] sm:grid-cols-2">
      <div><dt className="inline font-semibold text-[#102047]">일시 </dt><dd className="inline">{item.date || "미정"} {item.startTime && `${item.startTime}${item.endTime ? `–${item.endTime}` : ""}`}</dd></div>
      <div><dt className="inline font-semibold text-[#102047]">장소 </dt><dd className="inline">{item.location || "미정"}</dd></div>
      <div><dt className="inline font-semibold text-[#102047]">담당부서 </dt><dd className="inline">{item.department || "미정"}</dd></div>
    </dl>
  );
}

function SourceState({ status, message }) {
  if (status === "ready") return null;
  if (status === "not-ready") {
    return <FirebaseContentState status="empty" emptyMessage="교직원 교육 자료를 준비 중입니다. 관리자에게 문의해 주세요." />;
  }
  return <FirebaseContentState status={status} message={message} emptyMessage="등록된 교육이 없습니다." />;
}

function TrainingListContent({ displayName }) {
  const [state, setState] = useState({ status: "loading", items: [] });

  useEffect(() => {
    let active = true;
    getTrainingList().then((items) => {
      if (active) setState({ status: items.length ? "ready" : "empty", items });
    }).catch((error) => {
      if (active) setState({ status: error.code === "training-source-not-ready" ? "not-ready" : "error", message: error.message, items: [] });
    });
    return () => { active = false; };
  }, []);

  const currentTrainings = state.items.filter((item) => item.status === "진행중" || item.status === "예정");

  return (
    <FirebaseV2PageShell label="교직원 교육" title="교직원 교육센터" description="교육 일정과 본인의 교육 대상 여부를 확인합니다." displayName={displayName}>
      <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4">
        <h2 className="text-base font-bold text-[#102047]">이번 교육</h2>
        <p className="mt-1 text-[13px] text-[#627083]">현재 운영 중이거나 예정된 교육을 확인하세요.</p>
        {state.status === "ready" && (currentTrainings.length ? <div className="mt-3 space-y-2 border-t border-[#DDEAE7] pt-3">
            {currentTrainings.slice(0, 2).map((item) => <Link key={item.eventId} to={`/training/${encodeURIComponent(item.eventId)}`} className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-[9px] px-2 text-[13px] font-semibold text-[#0D4EA6] hover:bg-[#F1F7FF]">
              <span className="min-w-0 break-keep">{item.title}</span><span className="shrink-0 text-[#627083]">{item.date || "일정 미정"}</span>
            </Link>)}
          </div> : <p className="mt-3 text-[13px] text-[#627083]">예정되거나 진행 중인 교육이 없습니다.</p>)}
      </section>
      <section aria-label="교육 목록" className="space-y-2">
        <h2 className="text-base font-bold text-[#102047]">교육 목록</h2>
        <SourceState status={state.status} message={state.message} />
        {state.status === "ready" && state.items.map((item) => (
          <article key={item.eventId} className="min-w-0 rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4">
            <TrainingBadges item={item} />
            <h3 className="mt-2 break-keep text-[16px] font-bold leading-6 text-[#102047]">{item.title}</h3>
            <div className="mt-2"><DatePlace item={item} /></div>
            <Link to={`/training/${encodeURIComponent(item.eventId)}`} className="mt-3 inline-flex min-h-11 items-center rounded-[9px] border border-[#D7E8FF] bg-[#F1F7FF] px-4 text-[13px] font-semibold text-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10">교육 상세 보기</Link>
          </article>
        ))}
      </section>
    </FirebaseV2PageShell>
  );
}

function TrainingDetailContent({ displayName }) {
  const { eventId } = useParams();
  const [state, setState] = useState({ status: "loading", item: null });

  useEffect(() => {
    let active = true;
    getTrainingDetail(eventId).then((item) => {
      if (active) setState({ status: "ready", item });
    }).catch((error) => {
      if (active) setState({ status: error.code === "training-source-not-ready" ? "not-ready" : "error", message: error.message, item: null });
    });
    return () => { active = false; };
  }, [eventId]);

  const item = state.item;
  return (
    <FirebaseV2PageShell label="교직원 교육" title="교육 상세" description="교육 정보와 본인의 대상 여부를 확인합니다." displayName={displayName}>
      <Link to="/training" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[#0D4EA6]">← 교육 목록으로</Link>
      <SourceState status={state.status} message={state.message} />
      {item && <>
        <article className="min-w-0 space-y-3 rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4">
          <TrainingBadges item={item} />
          <h2 className="break-keep text-xl font-bold leading-7 text-[#102047]">{item.title}</h2>
          <DatePlace item={item} />
          <div className="border-t border-[#DDEAE7] pt-3">
            <h3 className="text-sm font-bold text-[#102047]">교육내용</h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#627083]">{item.description || "등록된 교육내용이 없습니다."}</p>
          </div>
        </article>
        <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4">
          <h3 className="text-sm font-bold text-[#102047]">교육자료</h3>
          {item.materials.length ? <ul className="mt-2 space-y-2">{item.materials.map((material, index) => <li key={`${material.title}-${index}`} className="min-w-0 break-words text-[13px]">{material.url ? <a href={material.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0D4EA6] underline underline-offset-2">{material.title}</a> : <span className="text-[#627083]">{material.title} · 자료 준비 중</span>}</li>)}</ul> : <p className="mt-1 text-[13px] text-[#627083]">등록된 자료가 없습니다.</p>}
        </section>
        <p className="rounded-[12px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 break-keep text-[13px] text-[#627083]">QR 출석과 이수증 제출은 추후 이 화면에서 제공할 예정입니다.</p>
      </>}
    </FirebaseV2PageShell>
  );
}

export default function TrainingCenterPage() {
  return <FirebaseStaffSubmissionAccessGate accessTitle="교직원 교육센터" readOnly>{({ displayName }) => <TrainingListContent displayName={displayName} />}</FirebaseStaffSubmissionAccessGate>;
}

export function TrainingDetailPage() {
  return <FirebaseStaffSubmissionAccessGate accessTitle="교직원 교육센터" readOnly>{({ displayName }) => <TrainingDetailContent displayName={displayName} />}</FirebaseStaffSubmissionAccessGate>;
}
