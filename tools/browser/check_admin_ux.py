"""Real Chromium + React; synthetic SDK/HTTP only, blocks non-loopback traffic.
Production-policy fixture on 4180 tests UI contract only, never a live TB API.
"""
import json
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def session(port=4179,mobile=False):
  base=f'http://127.0.0.1:{port}';ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':900})
  state={'external':[],'writes':[],'review':'pending','revision':0,'completed':False,'signed':False,'errors':[]}
  def route(r):
   url=r.request.url
   if not url.startswith(base+'/'):state['external'].append(urlparse(url).hostname);r.abort();return
   if '/api/' not in url:r.continue_();return
   qs=parse_qs(urlparse(url).query);resource=qs.get('resource',[''])[0]
   if resource=='health-screening-types':
    year=int(qs.get('schoolYear',['2026'])[0]);body={'ok':True,'items':[{'staffId':'S0','name':'합성 TB 대상','schoolYear':year,'screeningType':'nhis','revision':1,'selfChoice':{'screeningType':'nhis'},'workflow':{'completed':state['completed'],'evidence':[{'staffId':'S0','schoolYear':year,'submissionId':'tb-exact','documentType':'공단 확인서','reviewState':state['review'],'checkupDate':'2026-10-01','evidenceFiles':[{'fileId':'SYNTHETIC_FILE_ONLY','fileName':'합성 확인서.pdf'}]}],'status':{'revision':state['revision']}}}]}
    body['items'].append({'staffId':'S1','name':'다른 합성 교직원','schoolYear':year,'screeningType':'nhis','revision':1})
   elif resource=='tb-screening-workflow':
    assert port==4180,'QA must never invoke production TB mutation';assert r.request.method=='POST'
    value=r.request.post_data_json;assert value['staffId']=='S0' and value['schoolYear']==2026 and value['submissionId']=='tb-exact' and value['expectedRevision']==state['revision']
    state['writes'].append(value);state['revision']+=1;state['review']='confirmed' if value['action']=='confirm' else 'invalid';state['completed']=value['action']=='confirm'
    body={'ok':True,'item':{'status':'completed' if state['completed'] else 'rejected','revision':state['revision']}}
   elif resource=='training-list':body={'ok':True,'items':[{'eventId':'UX-CPR','title':'합성 교육','status':'진행중','date':'2026-10-16','targetStatus':'교육 대상'}]}
   elif resource=='training-detail':body={'ok':True,'item':{'eventId':'UX-CPR','title':'합성 교육','status':'진행중','date':'2026-10-16','materials':[]}}
   elif resource=='training-attendance-check':body={'ok':True,'items':[{'eventId':'UX-CPR','title':'합성 교육','eligible':not state['signed'],'reason':'이미 출석했습니다.' if state['signed'] else ''}],'canSubmit':not state['signed']}
   elif resource=='training-attendance-submit':state['signed']=True;body={'ok':True,'eventIds':['UX-CPR'],'signedAt':'2026-10-16T00:00:00Z','cprProjectionSynced':False}
   elif resource=='training-admin-list':body={'ok':True,'items':[],'summaries':{}}
   elif resource=='training-admin-directory':body={'ok':True,'items':[]}
   elif resource=='training-my-status':body={'ok':True,'items':[]}
   elif urlparse(url).path=='/api/portal':body={'ok':True,'notices':[],'schedules':[],'items':[]}
   elif not resource:body={'ok':True,'directory':[{'staffId':f'S{i}','name':f'합성 {i}','employmentStatus':'재직','department':'합성부서'} for i in range(32)]}
   else:r.fulfill(status=503,json={'ok':False,'message':'Synthetic resource not configured'});return
   r.fulfill(json=body)
  ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda e:state['errors'].append(str(e)))
  return base,ctx,page,state
 def close(ctx,state):assert not state['external'],state['external'];assert not state['errors'],state['errors'];ctx.close()
 base,ctx,page,state=session()
 page.goto(base+'/firebase-admin/submission-status?role=admin&audit=1&item=cpr&search=u00')
 expect(page.get_by_placeholder('이름, 이메일, 보직 검색')).to_have_value('u00')
 expect(page.get_by_role('link',name='제출 보기',exact=True)).to_have_count(1)
 page.get_by_role('link',name='제출 보기',exact=True).click();assert 'submissionId=cpr-individual' in page.url
 expect(page.get_by_role('heading',name='개별 CPR 접수',exact=True)).to_be_visible()
 page.get_by_role('link',name='이전 현황으로 돌아가기',exact=True).click()
 expect(page.get_by_placeholder('이름, 이메일, 보직 검색')).to_have_value('u00')
 page.get_by_role('link',name='제출 보기',exact=True).click();page.get_by_role('link',name='이 교직원 업무현황',exact=True).click()
 assert parse_qs(urlparse(page.url).query)['staffId']==['S0'];expect(page.get_by_text('선택 교직원 S0 · 2026학년도 요청',exact=False)).to_be_visible()
 page.get_by_role('link',name='정확한 접수자료 확인',exact=True).click();expect(page.get_by_role('heading',name='개별 CPR 접수',exact=True)).to_be_visible()
 results.append('A PC exact receipt, staff/task context and search-preserving round trip')
 page.goto(base+'/firebase-admin/submissions?submissionId=tb-exact')
 page.get_by_role('button',name='이 화면에서 검진 확인',exact=True).click()
 expect(page.get_by_text('접수번호 tb-exact',exact=False)).to_contain_text('S0 · 2026년 · 자료유형 공단 확인서')
 expect(page.get_by_role('button',name='확인 완료',exact=True)).to_be_disabled()
 expect(page.get_by_role('button',name='자료 무효',exact=True)).to_be_disabled()
 assert not state['writes'];assert page.get_by_role('link',name='자료 보기',exact=True).get_attribute('href').endswith('SYNTHETIC_FILE_ONLY')
 page.screenshot(path='/tmp/admin-ux-tb-pc.png',full_page=True)
 results.append('B QA inline evidence review preserves exact receipt/year/type; production mutation blocked')
 page.get_by_role('link',name='이 교직원 업무현황',exact=True).click()
 page.get_by_role('link',name='2026 CPR 학교 단체교육 일괄 등록',exact=True).click()
 expect(page.get_by_role('region',name='2026 CPR 오프라인 일괄 등록')).to_be_visible()
 page.get_by_role('link',name='CPR 통합 이수현황',exact=True).first.click()
 assert parse_qs(urlparse(page.url).query)['task']==['cpr-training-2026']
 results.append('C discoverable existing CPR batch registration and integrated completion view')
 expect(page.get_by_label('상태 필터',exact=True)).to_have_value('all')
 page.goto(base+'/firebase-admin/staff-submission-status?role=admin&audit=1&staffId=S0&schoolYear=2026&task=cpr-training-2026')
 expect(page.get_by_text('표시 1명 · 선택 교직원 S0',exact=False)).to_be_visible()
 expect(page.get_by_role('table').get_by_text('다른 합성 교직원',exact=True)).to_have_count(0)
 page.evaluate("history.pushState({},'', '?role=admin&audit=1&staffId=S1&schoolYear=2026&task=cpr-training-2026&filterStatus=completed');dispatchEvent(new PopStateEvent('popstate'))")
 expect(page.get_by_label('상태 필터',exact=True)).to_have_value('completed')
 expect(page.get_by_text('표시 1명 · 선택 교직원 S1',exact=False)).to_be_visible()
 page.reload();expect(page.get_by_text('표시 1명 · 선택 교직원 S1',exact=False)).to_be_visible()
 page.goto(base+'/firebase-admin/submission-status?role=admin&audit=1&item=cpr&search=u00')
 page.evaluate("history.pushState({},'', '?role=admin&audit=1&item=cpr&search=u01');dispatchEvent(new PopStateEvent('popstate'))")
 expect(page.get_by_placeholder('이름, 이메일, 보직 검색')).to_have_value('u01')
 page.go_back();expect(page.get_by_placeholder('이름, 이메일, 보직 검색')).to_have_value('u00')
 results.append('G PC focused staff panel, completed CPR visibility and SPA/back/reload query restoration')

 page.goto(base+'/?role=admin')
 header=page.get_by_role('navigation',name='주요 메뉴')
 titles=header.get_by_role('button').all_text_contents();assert len(titles)==8
 for title in titles:expect(page.locator('main').get_by_role('button',name=title,exact=False) if page.locator('main').count() else page.get_by_role('button',name=title,exact=False).last).to_be_visible()
 page.goto(base+'/training/UX-CPR')
 expect(page.get_by_role('button',name='교직원 교육센터',exact=True)).to_have_attribute('aria-current','page')
 expect(page.get_by_text('QR 출석은 교육 현장에서 제공하는 유효한 QR을 스캔해 시작합니다.',exact=False)).to_be_visible()
 expect(page.get_by_role('button',name='출석 시작',exact=True)).to_have_count(0)
 results.append('shared home/header service names and active nested training location; no challenge bypass')
 close(ctx,state)
 base,ctx,page,state=session(mobile=True)

 page.goto(base+'/firebase-admin/staff-submission-status?role=admin&audit=1&staffId=S0&schoolYear=2026&task=cpr-training-2026')
 expect(page.get_by_text('표시 1명 · 선택 교직원 S0',exact=False)).to_be_visible()
 expect(page.get_by_role('table').get_by_text('다른 합성 교직원',exact=True)).to_have_count(0)
 page.goto(base+'/firebase-admin/staff-submission-status?role=admin&audit=1&submissionId=tb-exact&schoolYear=2026')
 expect(page.get_by_text('검진 연결 정보가 올바르지 않습니다.',exact=False)).to_be_visible()
 expect(page.get_by_role('button',name='확인 완료',exact=True)).to_have_count(0)
 assert not state['writes']
 results.append('H mobile focused TB panel and malformed receipt context rejection without mutation')
 page.goto(base+'/training/attendance/UX-CPR?role=staff&challenge=synthetic')
 expect(page.get_by_label('전자서명 입력 영역',exact=True)).to_be_visible()
 expect(page.get_by_role('link',name='대시보드로',exact=True)).to_have_count(0)
 canvas=page.locator('canvas');box=canvas.bounding_box();page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.mouse.move(box['x']+100,box['y']+45,steps=5);page.mouse.up()
 page.get_by_role('button',name='서명 제출',exact=True).click()
 expect(page.get_by_text('전자서명 출석이 완료되었습니다.',exact=True)).to_be_visible()
 expect(page.get_by_text('출석 원본은 저장됐습니다.',exact=False)).to_be_visible()
 page.screenshot(path='/tmp/admin-ux-attendance-mobile.png',full_page=True)
 page.get_by_role('link',name='내 이수현황',exact=True).click();assert urlparse(page.url).path=='/my-submission-status';expect(page.get_by_role('link',name='대시보드로',exact=True)).to_have_count(0)
 page.get_by_role('button',name='홈으로',exact=True).click();assert urlparse(page.url).path=='/'
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 results.append('D mobile valid mocked challenge/signature completion -> projection-pending notice -> own status -> home')
 page.goto(base+'/firebase-admin/submissions?role=staff&audit=1&submissionId=tb-exact')
 expect(page.get_by_text('보건교사 관리자 권한이 없습니다.',exact=True)).to_be_visible();expect(page.get_by_role('button',name='이 화면에서 검진 확인',exact=True)).to_have_count(0)
 page.goto(base+'/firebase-admin/trainings?role=admin&mode=manual-cpr-2026');expect(page.get_by_role('region',name='2026 CPR 오프라인 일괄 등록')).to_be_visible()
 page.evaluate("window.fixtureSwitchRole('staff')");expect(page.get_by_role('region',name='2026 CPR 오프라인 일괄 등록')).to_have_count(0);expect(page.get_by_role('button',name='관리자 화면',exact=True)).to_have_count(0)
 page.evaluate("window.fixtureSwitchRole('admin')");expect(page.get_by_role('region',name='2026 CPR 오프라인 일괄 등록')).to_be_visible()
 page.evaluate('window.fixtureSignOut()');expect(page.get_by_role('region',name='2026 CPR 오프라인 일괄 등록')).to_have_count(0)
 page.goto(base+'/firebase-admin/trainings?role=staff&mode=manual-cpr-2026');page.reload();expect(page.get_by_role('region',name='2026 CPR 오프라인 일괄 등록')).to_have_count(0)
 results.append('E/F staff denied admin direct URL; admin logout and staff reload do not retain protected panel')
 close(ctx,state)
 base,ctx,page,state=session(4180)
 page.goto(base+'/fixture/tb-panel?role=admin')
 expect(page.get_by_role('button',name='확인 완료',exact=True)).to_be_enabled();page.get_by_role('button',name='확인 완료',exact=True).click()
 expect(page.get_by_role('table').get_by_text('결핵검진 상태: 완료',exact=True)).to_be_visible();assert len(state['writes'])==1
 expect(page.get_by_role('button',name='확인 완료',exact=True)).to_have_count(0)
 page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='자료 무효',exact=True).click()
 expect(page.get_by_text('자료 무효 처리가 저장되었습니다.',exact=False)).to_be_visible();assert len(state['writes'])==2
 expect(page.get_by_role('button',name='확인 완료',exact=True)).to_have_count(0);expect(page.get_by_role('button',name='자료 무효',exact=True)).to_have_count(0)
 results.append('production-policy synthetic panel calls existing confirm/invalidate contract and refreshes status; no invalid evidence reconfirm')
 close(ctx,state);browser.close()
print(json.dumps({'passed':len(results),'cases':results,'live_resources':0},ensure_ascii=False))
