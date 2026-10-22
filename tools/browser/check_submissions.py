"""Real Chromium/React admin workflow validation against synthetic SDK + intercepted HTTP."""
import json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:4179'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000})
 state={'external':[],'requests':[],'attendance':False,'projection':False,'reconcile':0}
 def route(r):
  url=r.request.url
  if not url.startswith(BASE+'/'):state['external'].append(urlparse(url).hostname);r.abort();return
  if '/api/' not in url:r.continue_();return
  qs=parse_qs(urlparse(url).query);resource=qs.get('resource',[''])[0]
  state['requests'].append({'resource':resource,'method':r.request.method,'query':qs})
  if resource=='health-screening-types':
   year=int(qs.get('schoolYear',['2026'])[0]);staff='S0'
   body={'ok':True,'items':[{'staffId':staff,'name':'합성 TB 대상','schoolYear':year,'screeningType':'nhis','revision':1,'workflow':{'completed':False,'evidence':[{'staffId':staff,'schoolYear':year,'submissionId':'tb-exact','documentType':'공단 확인서','reviewState':'pending','evidenceFiles':[]}],'status':{'revision':0}}}]}
  elif resource=='training-attendance-check':body={'ok':True,'items':[{'eventId':'GROUP-CPR','title':'합성 CPR 교육','eligible':not state['attendance'],'reason':'이미 출석했습니다.' if state['attendance'] else ''}],'canSubmit':not state['attendance']}
  elif resource=='training-attendance-submit':state['attendance']=True;body={'ok':True,'eventIds':['GROUP-CPR'],'signedAt':'2026-10-16T00:00:00Z','cprProjectionSynced':False}
  elif resource=='training-attendance-summary':body={'ok':True,'event':{'eventId':'GROUP-CPR','title':'합성 CPR 교육','completionTaskId':'cpr-training-2026'},'rows':[{'staffId':'S0','name':'합성 교직원','status':'서명 완료','signedAt':'2026-10-16T00:00:00Z'}],'counts':{'target':1,'signed':1,'excluded':0}}
  elif resource=='training-attendance-correct':
   data=r.request.post_data_json;assert data['action']=='reconcile-cpr' and data['staffId']=='S0'
   state['reconcile']+=1;state['projection']=True;body={'ok':True,'cprProjectionSynced':True}
  elif not resource:body={'ok':True,'directory':[{'staffId':f'S{i}','name':f'합성 {i}','employmentStatus':'재직'} for i in range(32)]}
  else:r.fulfill(status=503,json={'ok':False,'message':'이 합성 검사에서 실행하지 않는 자원'});return
  r.fulfill(json=body)
 ctx.route('**/*',route);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def run(name,fn):fn();results.append(name);print('PASS',name,flush=True)
 def go(path):page.goto(BASE+path);page.wait_for_timeout(350)
 def pagination():
  go('/firebase-admin/submissions?role=admin&audit=1&status=submitted')
  expect(page.get_by_text('선택 조건 접수 총 122건',exact=False)).to_be_visible()
  ids=[]
  for count in [50,50,22]:
   expect(page.get_by_text('선택 조건 접수 총 122건',exact=False)).to_contain_text(f'현재 페이지 {count}건')
   expect(page.locator('article h2')).to_have_count(count);ids+=page.locator('article h2').all_text_contents()
   if count!=22:page.get_by_role('button',name='다음 50건').click();page.wait_for_timeout(250)
  assert len(ids)==len(set(ids))==122
  expect(page.get_by_role('button',name='다음 50건')).to_be_disabled()
  page.get_by_role('button',name='처음 페이지').click();expect(page.locator('article h2')).to_have_count(50)
 run('pending 122 receipts across 3 pages: no missing/duplicate; stable total vs page count',pagination)
 def exact_tb():
  go('/firebase-admin/submissions?submissionId=tb-exact&status=completed')
  expect(page.locator('article h2')).to_have_text(['정확한 TB 접수'])
  link=page.get_by_role('link',name='이 접수의 검진 확인');href=link.get_attribute('href');q=parse_qs(urlparse(href).query)
  assert q=={'staffId':['S0'],'submissionId':['tb-exact'],'schoolYear':['2026'],'screeningType':['공단 확인서']}
  link.click();expect(page.get_by_text('접수번호 tb-exact',exact=False)).to_be_visible()
  expect(page.locator('#annual-screening-type select').first).to_have_value('2026')
  expect(page.get_by_text('QA 검진 유형 화면입니다.',exact=False)).to_be_visible()
  expect(page.get_by_role('button',name='확인 완료',exact=True)).to_be_disabled()
  assert any(x['resource']=='health-screening-types' and x['query']['schoolYear']==['2026'] for x in state['requests'])
  assert not any(x['resource']=='tb-screening-workflow' for x in state['requests'])
  go(href.replace('schoolYear=2026','schoolYear=2025'))
  expect(page.locator('#annual-screening-type select').first).to_have_value('2025')
  expect(page.get_by_text('접수번호 tb-exact',exact=False)).to_contain_text('2025년')
  assert any(x['resource']=='health-screening-types' and x['query']['schoolYear']==['2025'] for x in state['requests'])
 run('exact TB receipt ignores unrelated status filter; staff/year/type preserved; Preview write blocked',exact_tb)
 def roster():
  go('/firebase-admin/submission-status?item=cpr')
  expect(page.get_by_text('항목별 접수 총 621건',exact=False)).to_contain_text('대상 계정 32개')
  expect(page.get_by_text('현재 페이지 제출 계정',exact=True)).to_be_visible()
  expect(page.get_by_text('교직원 u00',exact=True)).to_be_visible()
  expect(page.locator('article h2')).to_have_count(25)
  first=page.locator('article h2').all_text_contents()
  page.get_by_role('link',name='제출 보기',exact=True).click();assert 'submissionId=cpr-individual' in page.url
  expect(page.locator('article h2')).to_have_text(['개별 CPR 접수'])
  go('/firebase-admin/submission-status?item=cpr');page.get_by_role('button',name='다음 대상자').click()
  expect(page.get_by_text('2페이지',exact=True)).to_be_visible();expect(page.get_by_text('교직원 u31',exact=True)).to_be_visible()
  expect(page.locator('article h2')).to_have_count(7)
  assert len(set(first+page.locator('article h2').all_text_contents()))==32
  expect(page.get_by_role('button',name='다음 대상자')).to_be_disabled()
  page.get_by_role('button',name='이전 대상자').click();expect(page.get_by_text('교직원 u00',exact=True)).to_be_visible()
 run('target 25/7 account pages; receipt/target/page aggregates distinguished; exact roster handoff',roster)
 def cpr_conflict():
  go('/firebase-admin/submissions?submissionId=cpr-individual')
  page.get_by_role('article').get_by_role('button',name='처리 완료',exact=True).click();expect(page.get_by_text('제출 상태가 변경되었습니다.')).to_be_visible()
  assert page.evaluate("window.submissionAudit.record('staff_submissions/cpr-individual').status")=='completed'
  assert page.evaluate("window.submissionAudit.record('staff_submission_status_qa/S0_cpr-training-2026').training.eventId")=='GROUP-CPR'
  page.get_by_role('article').get_by_role('button',name='보완 필요',exact=True).click();expect(page.get_by_text('제출 상태가 변경되었습니다.')).to_be_visible()
  assert page.evaluate("window.submissionAudit.record('staff_submission_status_qa/S0_cpr-training-2026').status")=='completed'
 run('real individual-review transaction preserves group completion and event through completion/rejection',cpr_conflict)
 def recovery():
  go('/training/attendance/GROUP-CPR?challenge=synthetic')
  canvas=page.locator('canvas');expect(canvas).to_be_visible();box=canvas.bounding_box()
  page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.mouse.move(box['x']+100,box['y']+55,steps=6);page.mouse.up()
  page.get_by_role('button',name='서명 제출',exact=True).click()
  expect(page.get_by_text('전자서명 출석이 완료되었습니다.')).to_be_visible()
  expect(page.get_by_text('출석 원본은 저장됐습니다.',exact=False)).to_be_visible()
  go('/firebase-admin/trainings/GROUP-CPR/attendance')
  page.get_by_role('button',name='CPR 현황 재계산',exact=True).click();expect(page.get_by_text('CPR 현황을 재계산했습니다.')).to_be_visible()
  assert state['reconcile']==1
  assert sum(x['resource']=='training-attendance-submit' for x in state['requests'])==1
 run('attendance success + projection pending -> admin reconstruction without another signature submission',recovery)
 def missing_index():
  go('/firebase-admin/submissions?status=submitted&indexMissing=1')
  expect(page.get_by_text('Firestore index 설정이 필요합니다.',exact=False)).to_be_visible()
  expect(page.locator('article h2')).to_have_count(0)
  go('/firebase-admin/submission-status?item=cpr&indexMissing=1')
  expect(page.get_by_text('Firestore index 설정이 필요합니다.',exact=False)).to_be_visible()
  expect(page.locator('article h2')).to_have_count(0)
  go('/firebase-admin/submissions?submissionId=tb-exact&indexMissing=1')
  expect(page.locator('article h2')).to_have_text(['정확한 TB 접수'])
 run('missing composite index shows explicit failure and no substituted results',missing_index)
 def denial():
  go('/firebase-admin/submissions?role=staff&submissionId=tb-exact')
  expect(page.locator('article h2')).to_have_count(0)
  expect(page.get_by_text('보건교사 관리자 권한이 없습니다.',exact=True)).to_be_visible()
 run('staff cannot open administrator receipt via known ID',denial)
 assert not errors,errors
 assert not state['external'],state['external']
 ctx.close();browser.close()
print(json.dumps({'passed':len(results),'cases':results,'external_requests':0,'live_resources':0},ensure_ascii=False))
