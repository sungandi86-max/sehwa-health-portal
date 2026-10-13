import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { TrainingAdminLayout } from "../components/TrainingAdminLayout.jsx";
import { createTrainingQr, getTrainingAttendanceSummary, listManagedTrainings } from "../lib/trainingCenterPhase2.js";
import { formatTrainingDateTime, recentTrainingAttendance, trainingAttendanceCounts } from "../lib/trainingAttendancePresentation.js";

const secondary = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6] transition hover:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10";

export function TrainingQrContent({ displayName, eventId, loadTrainings = listManagedTrainings, loadSummary = getTrainingAttendanceSummary, createQr = createTrainingQr }) {
  const [event, setEvent] = useState(null);
  const [summary, setSummary] = useState(null);
  const [qr, setQr] = useState(null);
  const [mode, setMode] = useState("single");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(null);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    Promise.all([loadTrainings(), loadSummary(eventId)])
      .then(([trainingResult, summaryResult]) => {
        if (!active) return;
        setEvent(trainingResult.items.find((item) => item.eventId === eventId) || null);
        setSummary(summaryResult);
        setRefreshedAt(new Date());
      })
      .catch((error) => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [eventId, loadSummary, loadTrainings, refreshKey]);
  async function generate(selectedMode) {
    setWorking(true); setMessage(""); setQr(null);
    try {
      const params = selectedMode === "group" ? { eventGroupId: event?.eventGroupId } : { eventId };
      const result = await createQr(params);
      setMode(selectedMode); setQr({ ...result, url: `${window.location.origin}${result.path}` });
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }
  const counts = trainingAttendanceCounts(summary?.counts);
  const recent = recentTrainingAttendance(summary?.rows);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <TrainingAdminLayout displayName={displayName} eventId={eventId} active="qr" title="교직원 교육 QR 출석체크" description="교직원 연수의 출석을 QR코드와 전자서명으로 관리할 수 있습니다.">
    {!loaded && !message && <p className="text-sm text-[#627083]">교육 정보를 불러오는 중입니다.</p>}
    {loaded && !event && !message && <p role="status" className="text-sm text-[#627083]">교육을 찾을 수 없습니다.</p>}
    {event && summary && <div className="training-qr-dashboard">
      <div className="training-qr-overview">
        <section className="training-admin-panel training-qr-event p-4 sm:p-5">
          <p className="text-sm font-bold text-[#08754B]">{event["일자"] === today ? "오늘의 교육" : "선택한 교육"}</p>
          <h2 className="mt-3 break-keep text-2xl font-bold leading-snug text-[#102047] sm:text-[30px]">{event["교육명"]}</h2>
          <dl className="mt-4 grid gap-3 border-y border-[#DDEAE7] py-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs font-semibold text-[#627083]">교육 일시</dt><dd className="mt-1 font-semibold text-[#102047]">{event["일자"]}<br />{event["시작시간"]} ~ {event["종료시간"]}</dd></div>
            <div><dt className="text-xs font-semibold text-[#627083]">장소</dt><dd className="mt-1 font-semibold text-[#102047]">{event["장소"] || "장소 미정"}</dd></div>
            <div><dt className="text-xs font-semibold text-[#627083]">출석 방식</dt><dd className="mt-1 font-semibold text-[#102047]">QR 전자서명</dd></div>
          </dl>
        </section>
        <dl className="training-qr-counts grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="training-admin-metric"><dt className="text-xs text-[#627083]">대상자</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-[#102047]">{counts.target}<span className="ml-0.5 text-sm">명</span></dd></div>
            <div className="training-admin-metric"><dt className="text-xs text-[#627083]">출석 완료</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-[#08754B]">{counts.signed}<span className="ml-0.5 text-sm">명</span></dd></div>
            <div className="training-admin-metric"><dt className="text-xs text-[#627083]">미출석</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-[#102047]">{counts.missing}<span className="ml-0.5 text-sm">명</span></dd></div>
            <div className="training-admin-metric"><dt className="text-xs text-[#627083]">현황 갱신</dt><dd className="mt-1 text-xs font-semibold tabular-nums text-[#102047]">{refreshedAt ? refreshedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }) : "조회 전"}</dd><button type="button" disabled={!loaded} onClick={() => setRefreshKey((key) => key + 1)} className="mt-1 text-xs font-semibold text-[#087F72] underline disabled:opacity-50">새로고침</button></div>
        </dl>
        <div className="flex flex-wrap gap-2 print:hidden"><Link className={secondary} to={`/firebase-admin/trainings/${encodeURIComponent(eventId)}/attendance`}>출석 현황 보기</Link><Link className={secondary} to={`/firebase-admin/trainings/${encodeURIComponent(eventId)}/final-sheet`}>연수등록부 미리보기</Link></div>
      </div>
      <section className="training-admin-panel training-qr-panel p-4" id="training-qr-print">
        <div className="training-qr-intro text-center"><h2 className="text-base font-bold text-[#102047]">출석 QR</h2><p className="mt-1 break-keep text-xs leading-5 text-[#627083]">교직원이 QR을 스캔하면 본인 계정으로 전자서명 출석합니다.</p></div>
        {!qr && <div className="training-qr-placeholder mt-4 rounded-[10px] border border-dashed border-[#B9CCCA] p-6 text-center"><p className="text-sm font-semibold text-[#102047]">QR을 생성해 출석을 시작하세요.</p><p className="mt-1 text-xs text-[#627083]">서명 가능 시간과 대상자 설정이 적용됩니다.</p></div>}
        {qr && <div className="mt-4 space-y-3"><div className="training-qr-code-frame mx-auto aspect-square w-full max-w-[300px] rounded-[10px] border border-[#DDEAE7] p-3"><QRCodeSVG value={qr.url} title="교육 출석 QR" size={276} className="h-full w-full" /></div><p className="text-center text-xs tabular-nums text-[#627083]">유효기간: {new Date(qr.expiresAt).toLocaleString("ko-KR")}</p></div>}
        <div className="mt-4 flex flex-wrap justify-center gap-2 print:hidden"><button type="button" disabled={working} onClick={() => generate("single")} className="min-h-11 rounded-[9px] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50">{working ? "생성 중" : qr ? "단일 QR 다시 생성" : "단일 QR 생성"}</button>{event.eventGroupId && <button type="button" disabled={working} onClick={() => generate("group")} className={secondary}>묶음 QR 생성</button>}{qr && <button type="button" onClick={() => window.print()} className={secondary}>QR 인쇄</button>}</div>
        <p className="mt-4 break-keep border-t border-[#DDEAE7] pt-3 text-xs leading-5 text-[#627083]">현장에 있는 교직원이 본인 계정으로 로그인해 서명해야 합니다. QR 주소를 외부에 공유하지 마세요.</p>
      </section>
      <section className="training-admin-panel training-qr-recent overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DDEAE7] px-4 py-3"><div><h2 className="text-base font-bold text-[#102047]">최근 출석 현황</h2><p className="mt-1 text-xs text-[#627083]">전자서명 완료 순으로 표시합니다.</p></div><span className="text-xs text-[#627083]">조회 시점 기준</span></div>
        {recent.length ? <><div className="hidden overflow-x-auto md:block"><table className="training-admin-table min-w-[620px]"><thead><tr><th>No.</th><th>교직원ID</th><th>이름</th><th>부서</th><th>출석시간</th><th>상태</th></tr></thead><tbody>{recent.map((row, index) => <tr key={row.staffId}><td className="tabular-nums">{index + 1}</td><td className="tabular-nums">{row.staffId}</td><td className="font-semibold text-[#102047]">{row.name}</td><td>{row.department}</td><td className="tabular-nums">{formatTrainingDateTime(row.signedAt, { timeOnly: true })}</td><td className="font-semibold text-[#08754B]">출석</td></tr>)}</tbody></table></div><ol className="divide-y divide-[#DDEAE7] md:hidden">{recent.map((row, index) => <li className="px-4 py-3 text-sm" key={row.staffId}><div className="flex justify-between gap-2"><span className="font-semibold text-[#102047]">{index + 1}. {row.name}</span><span className="font-semibold text-[#08754B]">출석</span></div><p className="mt-1 break-all text-xs text-[#627083]">{row.staffId} · {row.department} · {formatTrainingDateTime(row.signedAt, { timeOnly: true })}</p></li>)}</ol></> : <p className="px-4 py-6 text-center text-sm text-[#627083]">아직 완료된 출석이 없습니다.</p>}
        <div className="border-t border-[#DDEAE7] px-4 py-3 print:hidden"><Link className={secondary} to={`/firebase-admin/trainings/${encodeURIComponent(eventId)}/attendance`}>전체 출석 현황 보기</Link></div>
      </section>
    </div>}
    {message && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    <style>{`@media print { body * { visibility: hidden !important; } #training-qr-print, #training-qr-print * { visibility: visible !important; } #training-qr-print { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; } }`}</style>
  </TrainingAdminLayout>;
}

export default function FirebaseTrainingQrPage() {
  const { eventId } = useParams();
  return <FirebaseAdminRoleAccessGate allowTrainingAdmin deniedTitle="교육 QR 관리 권한이 없습니다.">{({ displayName }) => <TrainingQrContent displayName={displayName} eventId={eventId} />}</FirebaseAdminRoleAccessGate>;
}
