"""Chromium + real training API/service/ledger against synthetic in-memory Admin DB."""
from playwright.sync_api import sync_playwright, expect
import json
BASE='http://127.0.0.1:4179'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def context(mobile=False):
  ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},extra_http_headers={'x-offline-cpr-test':'1'})
  external=[]
  def route(r):
   if r.request.url.startswith(BASE+'/'):r.continue_()
   else:external.append(r.request.url);r.abort()
  ctx.route('**/*',route);return ctx,external
 def control(ctx,action):return ctx.request.get(BASE+'/__offline-cpr-control?action='+action).json()
 def open_panel(page):
  page.goto(BASE+'/firebase-admin/trainings?role=admin')
  page.get_by_role('button',name='2026 CPR 단체교육 일괄 등록',exact=True).click()
  panel=page.get_by_role('region',name='2026 CPR 오프라인 일괄 등록')
  expect(panel.get_by_label('현재 검색·부서 결과 전체 선택')).to_be_enabled();return panel
 def setup(panel):
  panel.get_by_label('교육일',exact=True).fill('2026-05-20');panel.get_by_label('시작시간',exact=True).fill('13:00');panel.get_by_label('종료시간',exact=True).fill('15:00');panel.get_by_label('등록 근거',exact=True).fill('합성 오프라인 참석 명부 대조 확인')
  panel.get_by_label('부서',exact=True).select_option('교무부');panel.get_by_label('현재 검색·부서 결과 전체 선택').check()
  expect(panel.get_by_text('선택 50명',exact=False)).to_be_visible()
  panel.get_by_label('부서',exact=True).select_option('행정실');panel.get_by_label('현재 검색·부서 결과 전체 선택').check()
  expect(panel.get_by_text('선택 100명',exact=False)).to_be_visible()
  panel.get_by_label('부서',exact=True).select_option('')
  for query in ['S08','S09']:
   panel.get_by_label('이름 검색').fill(query);panel.get_by_label('현재 검색·부서 결과 전체 선택').uncheck()
  panel.get_by_label('이름 검색').fill('');expect(panel.get_by_text('선택 80명',exact=False)).to_be_visible()
 def review(panel):panel.get_by_role('button',name='미리보기·복구 확인',exact=True).click();expect(panel.get_by_text('처리 전 미리보기',exact=False)).to_be_visible()
 ctx,external=context();control(ctx,'reset');control(ctx,'fail');page=ctx.new_page();panel=open_panel(page);setup(panel)
 review(panel);expect(panel.locator('tbody tr')).to_have_count(80)
 submit=panel.get_by_role('button',name='참석자 일괄 이수 등록',exact=True);expect(submit).to_be_disabled()
 panel.get_by_label('실제 참석 명부 최종 확인').check();submit.dblclick()
 expect(panel.get_by_text('성공 79명 · 건너뜀 0명 · 실패 1명',exact=False)).to_be_visible(timeout=20000)
 assert control(ctx,'state')['count']==79
 panel.get_by_role('button',name='실패 항목 같은 요청으로 재시도',exact=True).click()
 expect(panel.get_by_text('성공 1명 · 건너뜀 79명 · 실패 0명',exact=False)).to_be_visible(timeout=20000)
 state=control(ctx,'state');assert state['count']==state['entries']==80 and state['fakeSignatures']==0
 results.append('PC 100 roster / department-scoped select-all / 20 exclusions / 80 preview / attestation / 79+1 partial failure and retry')
 panel.get_by_role('button',name='동일 요청 결과 다시 확인').click();expect(panel.get_by_text('성공 0명 · 건너뜀 80명 · 실패 0명',exact=False)).to_be_visible(timeout=20000)
 assert control(ctx,'state')['entries']==80
 page.reload();page.get_by_role('button',name='2026 CPR 단체교육 일괄 등록',exact=True).click();panel=page.get_by_role('region',name='2026 CPR 오프라인 일괄 등록')
 expect(panel.get_by_text('이전 처리 요청을 복구했습니다.',exact=False)).to_be_visible();review(panel)
 panel.get_by_label('실제 참석 명부 최종 확인').check();panel.get_by_role('button',name='동일 요청 결과 다시 확인').click()
 expect(panel.get_by_text('성공 0명 · 건너뜀 80명 · 실패 0명',exact=False)).to_be_visible(timeout=20000)
 panel.get_by_role('link',name='CPR 통합 이수현황').is_visible()
 assert control(ctx,'state')['entries']==80
 listing=ctx.request.get(BASE+'/api/firebase/staff-directory?resource=training-admin-list',headers={'Authorization':'Bearer synthetic-admin'}).json()
 counts=next(iter(listing['summaries'].values()))['counts'];assert counts['manual']==80 and counts['signed']==0 and counts['target']==80
 expect(page.get_by_role('region',name='교육 목록').get_by_text('대상 80 · 출석 80 · 미출석 0',exact=True)).to_be_visible()
 panel.get_by_role('button',name='다른 교육·명단 새로 등록',exact=True).click()
 expect(panel.get_by_text('선택 0명',exact=False)).to_be_visible();expect(panel.get_by_label('교육일',exact=True)).to_be_enabled()
 expect(panel.get_by_text('이전 처리 요청을 복구했습니다.',exact=False)).to_have_count(0)
 assert control(ctx,'state')['entries']==80
 results.append('duplicate click / same-request replay / reload recovery / stats / new batch keep exactly 80 originals; no QR/ink signature')
 assert not external;ctx.close()
 ctx,external=context(True);control(ctx,'reset');control(ctx,'completed');page=ctx.new_page();panel=open_panel(page);setup(panel);review(panel)
 expect(panel.get_by_text('기존 개별 이수 완료 보존',exact=True)).to_be_visible();expect(panel.get_by_text('기존 단체교육 완료 보존',exact=True)).to_be_visible()
 panel.get_by_label('실제 참석 명부 최종 확인').check();panel.get_by_role('button',name='참석자 일괄 이수 등록',exact=True).click()
 expect(panel.get_by_text('성공 78명 · 건너뜀 2명 · 실패 0명',exact=False)).to_be_visible(timeout=20000)
 assert control(ctx,'state')['count']==80 and control(ctx,'state')['entries']==78
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile page overflow'
 results.append('Mobile 100-person workflow: existing individual/group completions skipped; final completion count 80')
 page.goto(BASE+'/firebase-admin/trainings?role=staff');expect(page.get_by_role('button',name='2026 CPR 단체교육 일괄 등록',exact=True)).to_have_count(0)
 denied=ctx.request.post(BASE+'/api/firebase/staff-directory?resource=training-manual-cpr-preview',headers={'Authorization':'Bearer synthetic-staff'},data={})
 assert denied.status==403
 results.append('ordinary staff cannot reach manual registration UI or real handler')
 assert not external;ctx.close();browser.close()
print(json.dumps({'passed':len(results),'scenarios':results,'live_resources':0},ensure_ascii=False))
