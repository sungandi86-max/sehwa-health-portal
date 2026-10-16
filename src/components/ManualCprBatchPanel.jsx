import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listTrainingDirectory, previewManualCprBatch, commitManualCprBatch } from "../lib/trainingCenterPhase2.js";

const control = "min-h-11 rounded-lg border border-[#DDEAE7] bg-white px-3 text-sm";
const button = `${control} text-[#0D4EA6] disabled:opacity-50`;
const reasonLabels = {ready:"등록 가능",existing_group:"기존 단체교육 완료 보존",existing_individual:"기존 개별 이수 완료 보존",existing_group_source:"기존 단체교육 출석 보존",
  inactive_or_ambiguous:"비활성·중복 명단 확인 필요",unlinked_or_inactive:"현재 학기 계정 연결·활성 확인 필요",needs_review:"기존 자료 검토 필요",
  assignment_changed:"권한 연결 변경",status_changed:"현황 변경 확인 필요",attendance_changed:"취소·출석 변경 확인 필요",attendance_locked:"기존 처리 중·잠금 확인 필요",
  registered:"관리자 등록 완료",already_registered:"동일 요청 등록 완료·중복 생성 없음",retryable_failure:"저장 실패·같은 요청으로 재시도 가능"};
const defaults = {schoolYear:2026,title:"2026학년도 학교 단체 심폐소생술 교육",date:"",startTime:"",endTime:"",basis:""};
function restore(key) { try { const value = JSON.parse(sessionStorage.getItem(key)); return value?.requestId && Array.isArray(value.staffIds) ? value : null; } catch { return null; } }
export default function ManualCprBatchPanel({ uid, onSaved = () => {}, loadDirectory = listTrainingDirectory, previewBatch = previewManualCprBatch, commitBatch = commitManualCprBatch }) {
  const storageKey = `manual-cpr-2026:${uid}`;
  const [saved] = useState(()=>restore(storageKey));
  const [form,setForm] = useState(saved?.form || defaults);
  const [requestId,setRequestId] = useState(saved?.requestId || (()=>crypto.randomUUID()));
  const [selected,setSelected] = useState(saved?.staffIds || []);
  const [locked,setLocked] = useState(saved?.locked === true);
  const [directory,setDirectory] = useState([]), [department,setDepartment] = useState(""), [search,setSearch] = useState("");
  const [preview,setPreview] = useState(null), [result,setResult] = useState(null), [confirmed,setConfirmed] = useState(false);
  const [working,setWorking] = useState(false), [loading,setLoading] = useState(true), [message,setMessage] = useState("");
  useEffect(()=>{let active=true;loadDirectory().then(data=>{if(active)setDirectory(data.items || []);}).catch(()=>{if(active)setMessage("기존 교직원명단을 조회하지 못했습니다.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[loadDirectory]);
  useEffect(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({form,requestId,staffIds:selected,locked}));}catch{}},[form,requestId,selected,locked,storageKey]);
  const departments = useMemo(()=>[...new Set(directory.map(row=>row.department || "미분류"))].sort(),[directory]);
  const shown = useMemo(()=>directory.filter(row=>(!department || (row.department || "미분류") === department) && `${row.name} ${row.staffId}`.toLowerCase().includes(search.toLowerCase())),[directory,department,search]);
  const invalidate = ()=>{setPreview(null);setConfirmed(false);setResult(null);setRequestId(crypto.randomUUID());};
  const change = (key,value)=>{if(locked)return;invalidate();setForm(old=>({...old,[key]:value}));};
  const toggle = (staffId)=>{if(locked)return;invalidate();setSelected(old=>old.includes(staffId)?old.filter(id=>id!==staffId):[...old,staffId]);};
  const selectShown = (checked)=>{if(locked)return;invalidate();setSelected(old=>checked?[...new Set([...old,...shown.map(row=>row.staffId)])]:old.filter(id=>!shown.some(row=>row.staffId === id)));};
  const input = ()=>({...form,requestId,staffIds:selected});
  async function review() {setWorking(true);setMessage("");try{setPreview(await previewBatch(input()));setConfirmed(false);}catch(error){setMessage(error.message);}finally{setWorking(false);}}
  function startAnother() {
    if (working || !result || result.counts.failed) return;
    setForm(defaults);setSelected([]);setLocked(false);setDepartment("");setSearch("");setMessage("");invalidate();
  }
  async function commit() {
    if (!confirmed || !preview || working) return;
    // Persist request identity before the network call, including ambiguous responses.
    setLocked(true);try{sessionStorage.setItem(storageKey,JSON.stringify({form,requestId,staffIds:selected,locked:true}));}catch{}
    setWorking(true);setMessage("");
    try {const next=await commitBatch({...input(),reviewFingerprint:preview.reviewFingerprint,confirmedOfflineRoster:true});setResult(next);onSaved();}
    catch(error){setMessage(`${error.message} 같은 요청의 미리보기·복구 확인 후 재시도해 주세요.`);}
    finally{setWorking(false);}
  }
  const rows = result?.results || preview?.rows || [];
  return <section className="training-admin-panel space-y-4 p-4 sm:p-5" aria-label="2026 CPR 오프라인 일괄 등록">
    <h2 className="text-lg font-bold text-[#102047]">2026 CPR 학교 단체교육 일괄 등록</h2>
    <p className="text-sm text-[#627083]">실제 오프라인 참석 명부를 확인한 보건교사·관리자만 등록합니다. QR 출석·본인 전자서명이나 서명 이미지를 생성하지 않습니다. 최대 100명씩 처리합니다.</p>
    {saved?.locked && locked && <p className="text-sm text-[#3154A3]">이전 처리 요청을 복구했습니다. 같은 명단·요청으로 확인하며 성공한 기록은 다시 만들지 않습니다.</p>}
    <fieldset disabled={locked || working} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1 text-sm">학년도<input aria-label="학년도" className={control} value={form.schoolYear} readOnly /></label>
      <label className="grid gap-1 text-sm">교육명<input aria-label="교육명" className={control} maxLength={150} value={form.title} onChange={e=>change("title",e.target.value)} /></label>
      <label className="grid gap-1 text-sm">교육일<input aria-label="교육일" className={control} type="date" value={form.date} onChange={e=>change("date",e.target.value)} /></label>
      <label className="grid gap-1 text-sm">시작시간<input aria-label="시작시간" className={control} type="time" value={form.startTime} onChange={e=>change("startTime",e.target.value)} /></label>
      <label className="grid gap-1 text-sm">종료시간<input aria-label="종료시간" className={control} type="time" value={form.endTime} onChange={e=>change("endTime",e.target.value)} /></label>
      <label className="grid gap-1 text-sm">등록 근거<input aria-label="등록 근거" className={control} maxLength={200} placeholder="예: 2026년 학교 CPR 참석 명부 대조 확인" value={form.basis} onChange={e=>change("basis",e.target.value)} /></label>
    </fieldset>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">부서<select aria-label="부서" className={control} value={department} onChange={e=>setDepartment(e.target.value)}><option value="">전체 부서</option>{departments.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="grid gap-1 text-sm">이름·교직원ID 검색<input aria-label="이름 검색" className={control} value={search} onChange={e=>setSearch(e.target.value)} /></label>
      <strong className="text-sm" role="status">선택 {selected.length}명 · 현재 검색·부서 결과 {shown.length}명</strong>
    </div>
    {loading ? <p>교직원명단 조회 중</p> : <div className="max-h-96 overflow-auto rounded-lg border border-[#DDEAE7]">
      <label className="sticky top-0 flex min-h-11 gap-2 bg-[#F3F8F6] p-3 text-sm"><input type="checkbox" aria-label="현재 검색·부서 결과 전체 선택" disabled={locked || working || !shown.length} checked={Boolean(shown.length) && shown.every(row=>selected.includes(row.staffId))} onChange={e=>selectShown(e.target.checked)} />현재 검색·부서 결과 {shown.length}명 전체 선택/해제 (다른 부서 선택 유지)</label>
      {shown.map(row=><label key={row.staffId} className="grid min-h-11 grid-cols-[24px_1fr_1fr] items-center gap-2 border-t border-[#DDEAE7] p-3 text-sm"><input type="checkbox" aria-label={`참석자 ${row.staffId}`} disabled={locked || working} checked={selected.includes(row.staffId)} onChange={()=>toggle(row.staffId)} /><span>{row.name} · {row.staffId}</span><span>{row.department || "미분류"} · {row.employmentStatus || "상태 미상"}</span></label>)}
    </div>}
    <button className={button} disabled={working || loading || !selected.length || selected.length>100} onClick={review}>미리보기·복구 확인</button>
    {preview && <div className="space-y-3">
      <h3 className="font-semibold">처리 전 미리보기 · 선택 {preview.rows.length}명</h3>
      <p className="text-sm">{form.schoolYear}학년도 · {form.title} · {form.date} {form.startTime}~{form.endTime} · 근거: {form.basis}</p>
      <p className="text-sm">기존 완료·비활성·미연결·충돌 대상은 덮어쓰지 않고 건너뜁니다.</p>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label="실제 참석 명부 최종 확인" checked={confirmed} disabled={working} onChange={e=>setConfirmed(e.target.checked)} />기존 오프라인 명부와 실제 참석자를 대조했고 등록 근거를 확인했습니다.</label>
      <button className={`${button} bg-[#0D4EA6] text-white`} disabled={working || !confirmed} onClick={commit}>{working ? "처리 중" : result?.counts.failed ? "실패 항목 같은 요청으로 재시도" : locked ? "동일 요청 결과 다시 확인" : "참석자 일괄 이수 등록"}</button>
    </div>}
    {result && <div role="status" className="rounded-lg bg-[#F0FBF7] p-3 text-sm">성공 {result.counts.success}명 · 건너뜀 {result.counts.skipped}명 · 실패 {result.counts.failed}명 · 이 요청 등록 확인 {result.counts.registered}명
      <div className="mt-2 flex flex-wrap gap-4"><Link to="/firebase-admin/staff-submission-status">CPR 통합 이수현황</Link><Link to={`/firebase-admin/trainings/${encodeURIComponent(result.eventId)}/attendance`}>이 교육 관리자 등록 원본</Link></div>
      {!result.counts.failed && <button className={`${button} mt-3`} disabled={working} onClick={startAnother}>다른 교육·명단 새로 등록</button>}
    </div>}
    {rows.length>0 && <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>교직원</th><th>처리 결과</th><th>확인 내용</th></tr></thead><tbody>{rows.map(row=><tr key={row.staffId} className="border-t"><td className="p-2">{row.name} · {row.staffId}</td><td>{row.outcome === "success" ? "성공" : row.outcome === "failed" ? "실패" : row.outcome === "skipped" ? "건너뜀" : "미리보기"}</td><td>{reasonLabels[row.reason] || "확인 필요"}</td></tr>)}</tbody></table></div>}
    {message && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
  </section>;
}
