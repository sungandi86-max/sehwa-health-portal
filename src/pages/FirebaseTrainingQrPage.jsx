import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { createTrainingQr, listManagedTrainings } from "../lib/trainingCenterPhase2.js";

export function TrainingQrContent({ displayName, eventId, loadTrainings = listManagedTrainings, createQr = createTrainingQr }) {
  const [event, setEvent] = useState(null);
  const [qr, setQr] = useState(null);
  const [mode, setMode] = useState("single");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); loadTrainings().then((result) => setEvent(result.items.find((item) => item.eventId === eventId) || null)).catch((error) => setMessage(error.message)).finally(() => setLoaded(true)); }, [eventId, loadTrainings]);
  async function generate(selectedMode) {
    setWorking(true); setMessage(""); setQr(null);
    try {
      const params = selectedMode === "group" ? { eventGroupId: event?.eventGroupId } : { eventId };
      const result = await createQr(params);
      setMode(selectedMode); setQr({ ...result, url: `${window.location.origin}${result.path}` });
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }
  return <FirebaseV2PageShell className="training-phase2-surface" label="교직원 교육" title="교육 QR" description="서명 시간에 맞춰 단일 또는 묶음 QR을 생성합니다." displayName={displayName}>
    <Link to="/firebase-admin/trainings" className="inline-flex min-h-11 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6] print:hidden">교육 관리로</Link>
    {!loaded && !message && <p className="text-sm text-[#627083]">교육 정보를 불러오는 중입니다.</p>}
    {loaded && !event && !message && <p role="status" className="text-sm text-[#627083]">교육을 찾을 수 없습니다.</p>}
    {event && <section className="space-y-3 rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4" id="training-qr-print">
      <div><h2 className="break-keep text-base font-bold text-[#102047]">{event["교육명"]}</h2><p className="mt-1 text-sm text-[#627083]">{event["일자"]} {event["시작시간"]} · {event["장소"]}</p></div>
      <div className="flex flex-wrap gap-2 print:hidden"><button type="button" disabled={working} onClick={() => generate("single")} className="min-h-11 rounded-[9px] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50">단일 QR 생성</button>{event.eventGroupId && <button type="button" disabled={working} onClick={() => generate("group")} className="min-h-11 rounded-[9px] border border-[#0D4EA6] bg-white px-4 text-sm font-semibold text-[#0D4EA6] disabled:opacity-50">묶음 QR 생성</button>}</div>
      {qr && <div className="space-y-3 border-t border-[#DDEAE7] pt-3"><p className="text-sm font-semibold text-[#102047]">{mode === "group" ? `묶음 교육 ${qr.eventCount}건` : "단일 교육"} 출석 QR</p><div className="mx-auto aspect-square w-full max-w-[320px] rounded-[10px] border border-[#DDEAE7] bg-white p-4"><QRCodeSVG value={qr.url} title="교육 출석 QR" size={288} className="h-full w-full" /></div><p className="text-center text-xs text-[#627083]">유효기간: {new Date(qr.expiresAt).toLocaleString("ko-KR")}</p><p className="break-keep text-xs text-[#627083]">현장에 있는 교직원이 본인 계정으로 로그인해 서명해야 합니다. QR 주소를 외부에 공유하지 마세요.</p><button type="button" onClick={() => window.print()} className="min-h-11 rounded-[9px] border border-[#DDEAE7] bg-white px-4 text-sm font-semibold text-[#0D4EA6] print:hidden">QR 인쇄</button></div>}
    </section>}
    {message && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    <style>{`@media print { body * { visibility: hidden !important; } #training-qr-print, #training-qr-print * { visibility: visible !important; } #training-qr-print { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; } }`}</style>
  </FirebaseV2PageShell>;
}

export default function FirebaseTrainingQrPage() {
  const { eventId } = useParams();
  return <FirebaseAdminRoleAccessGate deniedTitle="교육 QR 관리 권한이 없습니다.">{({ displayName }) => <TrainingQrContent displayName={displayName} eventId={eventId} />}</FirebaseAdminRoleAccessGate>;
}
