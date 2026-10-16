"""Loopback Chromium integration: real React pages/gates, synthetic SDK + HTTP.
Does NOT validate Firebase Auth, Rules, Vercel, or live Drive storage.
"""
import json,sys
from playwright.sync_api import sync_playwright, expect
from pathlib import Path

def synthetic_pdf():
 objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>']
 data=b'%PDF-1.4\n'; offsets=[0]
 for i,obj in enumerate(objects,1):
  offsets.append(len(data)); data+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
 start=len(data); data+=b'xref\n0 4\n0000000000 65535 f \n'
 for n in offsets[1:]:data+=f'{n:010} 00000 n \n'.encode()
 return data+b'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'

BASE='http://127.0.0.1:4179'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def context(role='staff',scenario='valid'):
  ctx=browser.new_context(viewport={'width':390,'height':844});state={'signed':False,'attempts':0,'external':[]}
  def route(req):
   url=req.request.url
   if not url.startswith(BASE+'/'):
    state['external'].append(url.split('/')[2]);req.abort();return
   if '/api/' not in url:req.continue_();return
   from urllib.parse import urlparse,parse_qs
   resource=parse_qs(urlparse(url).query).get('resource',[''])[0]
   if resource=='training-final-sheet' and parse_qs(urlparse(url).query).get('download')==['pdf']:
    req.fulfill(content_type='application/pdf',headers={'Content-Disposition':'attachment; filename=synthetic-roster.pdf'},body=synthetic_pdf());return
   event={'eventId':'fixture-event','title':'합성 CPR 교육','status':'진행중','date':'2026-10-16','targetStatus':'교육 대상','required':True,'ownerStaffId':'FIXTURE-A'}
   if resource=='training-list':body={'ok':True,'items':[event]}
   elif resource=='training-detail':body={'ok':True,'item':{**event,'description':'합성 교육 설명','materials':[]}}
   elif resource=='training-attendance-check':
    reason='이미 출석이 기록되었습니다.' if state['signed'] or scenario=='duplicate' else '교육 대상이 아닙니다.' if scenario=='nontarget' else '교육 대상에서 제외되었습니다.' if scenario=='excluded' else ''
    if scenario=='error':req.fulfill(status=503,json={'ok':False,'message':'합성 조회 오류'});return
    body={'ok':True,'items':[{'eventId':'fixture-event','title':event['title'],'eligible':not reason,'reason':reason}],'canSubmit':not reason}
   elif resource=='training-attendance-submit':
    state['attempts']+=1
    if scenario=='retry' and state['attempts']==1:req.fulfill(status=503,json={'ok':False,'message':'합성 저장 실패. 다시 시도해 주세요.'});return
    if scenario=='bad-success':req.fulfill(json={'ok':False});return
    state['signed']=True;body={'ok':True,'eventIds':['fixture-event'],'signedAt':'2026-10-16T00:00:00Z'}
   elif resource=='training-admin-list':body={'ok':True,'items':[{'eventId':'fixture-event','교육명':'합성 CPR 교육','사용여부':'Y','eventGroupId':''}],'summaries':{}}
   elif resource in ['training-attendance-summary','training-final-sheet']:
    body={'ok':True,'event':{'eventId':'fixture-event','title':event['title'],'date':event['date']},'rows':[{'staffId':'FIXTURE-A','name':'Synthetic','status':'서명 완료' if state['signed'] else '미서명'}],'counts':{'target':1,'signed':int(state['signed']),'excluded':0}}
   elif resource=='training-qr':body={'ok':True,'path':'/training/attendance/fixture-event?challenge=fixture','eventCount':1,'expiresAt':'2099-01-01'}
   elif resource=='staff-identity':body={'ok':True,'identity':{'staffId':'FIXTURE-A','name':'Synthetic'}}
   else:body={'ok':True,'items':[],'status':'skipped'}
   req.fulfill(json=body)
  ctx.route('**/*',route);return ctx,state
 def run(name,fn):
  fn();results.append({'scenario':name,'status':'PASS'});print('PASS',name,flush=True)
 for role in ['anonymous','pending','staff','homeroom','admin','health','inactive','missing']:
  ctx,state=context(role);page=ctx.new_page()
  for path,marker,allowed in [('/firebase-faq','합성 FAQ 질문',role in ['staff','homeroom','admin','health']),('/fixture/staff','protected-staff',role in ['staff','homeroom','admin','health']),('/fixture/admin','protected-admin',role in ['admin','health']),('/fixture/homeroom','protected-homeroom',role in ['homeroom','health']),('/training','합성 CPR 교육',role in ['staff','homeroom','admin','health'])]:
   page.goto(BASE+path+'?role='+role)
   page.wait_for_timeout(650)
   if allowed:expect(page.get_by_text(marker,exact=(marker.startswith('protected'))).first).to_be_visible(timeout=5000)
   else:
    expect(page.get_by_text(marker,exact=(marker.startswith('protected'))).first).not_to_be_visible()
    expect(page.locator('h1').first).to_be_visible()
   results.append({'scenario':role+':'+path,'status':'PASS'});print('PASS',role,path,flush=True)
  assert not state['external'];ctx.close()
 print('PASS 8-role x 5 real page/gate combinations',flush=True)
 ctx,state=context();page=ctx.new_page()
 def listing():
  page.goto(BASE+'/training?role=staff');expect(page.get_by_text('합성 CPR 교육').first).to_be_visible();page.get_by_text('교육 상세 보기').click();expect(page.get_by_text('합성 교육 설명')).to_be_visible();page.reload();expect(page.get_by_text('합성 교육 설명')).to_be_visible()
 run('list-detail-target-direct-url-refresh-session',listing)
 ctx.close()
 for scenario in ['duplicate','nontarget','excluded','error']:
  ctx,state=context(scenario=scenario);page=ctx.new_page();page.goto(BASE+'/training/attendance/fixture-event?role=staff&challenge=fixture');page.wait_for_timeout(500)
  expect(page.locator('canvas')).to_have_count(0);expect(page.get_by_text('전자서명 출석이 완료되었습니다.')).to_have_count(0)
  assert state['attempts']==0;results.append({'scenario':scenario+'-no-signature-no-false-completion','status':'PASS'});ctx.close()
 for scenario in ['valid','retry']:
  ctx,state=context(scenario=scenario);page=ctx.new_page();page.goto(BASE+'/training/attendance/fixture-event?role=staff&challenge=fixture')
  canvas=page.locator('canvas');expect(canvas).to_be_visible();box=canvas.bounding_box();page.mouse.move(box['x']+20,box['y']+30);page.mouse.down();page.mouse.move(box['x']+100,box['y']+60,steps=5);page.mouse.up()
  page.get_by_role('button',name='서명 제출',exact=True).click()
  if scenario=='retry':expect(page.get_by_role('alert')).to_be_visible();expect(page.get_by_text('전자서명 출석이 완료되었습니다.')).to_have_count(0);page.get_by_role('button',name='서명 제출',exact=True).click()
  expect(page.get_by_text('전자서명 출석이 완료되었습니다.')).to_be_visible();page.reload();expect(page.locator('canvas')).to_have_count(0);expect(page.get_by_text('이미 출석이 기록되었습니다.')).to_be_visible();assert not state['external'];results.append({'scenario':scenario+'-ink-submit-complete-refresh-no-duplicate','status':'PASS'});ctx.close()
 ctx,state=context();page=ctx.new_page();page.goto(BASE+'/firebase-faq?role=staff&delay=1');page.wait_for_timeout(100);page.evaluate('window.fixtureSignOut()');page.wait_for_timeout(1200);expect(page.get_by_text('합성 FAQ 질문')).to_have_count(0);results.append({'scenario':'signout-during-pending-assignment-no-stale-access','status':'PASS'});ctx.close()
 ctx,state=context();page=ctx.new_page();page.goto(BASE+'/firebase-faq?role=staff&hang=1');expect(page.get_by_text('권한 확인 시간이 초과되었습니다. 새로고침 후 다시 확인해 주세요.')).to_be_visible(timeout=18000);expect(page.get_by_text('합성 FAQ 질문')).to_have_count(0);results.append({'scenario':'hung-permission-check-terminates-denied','status':'PASS'});ctx.close()
 # Real administrative pages with intercepted API responses; no live storage.
 ctx,state=context(role='admin');page=ctx.new_page();state['signed']=True
 page.goto(BASE+'/firebase-admin/trainings/fixture-event/qr?role=admin');page.get_by_role('button',name='단일 QR 생성',exact=True).click();expect(page.locator('svg:has(title)').first).to_be_visible();results.append({'scenario':'admin-qr-real-page-mock-api','status':'PASS'})
 page.goto(BASE+'/firebase-admin/trainings/fixture-event/attendance?role=admin');expect(page.get_by_text('Synthetic').first).to_be_visible();expect(page.get_by_text('서명 완료').first).to_be_visible();results.append({'scenario':'admin-attendance-confirmation-real-page','status':'PASS'})
 page.goto(BASE+'/firebase-admin/trainings/fixture-event/final-sheet?role=admin');expect(page.get_by_role('button',name='PDF 다운로드')).to_be_visible();expect(page.get_by_text('Synthetic').first).to_be_visible();
 with page.expect_download() as download:
  page.get_by_role('button',name='PDF 다운로드').click()
 assert Path(download.value.path()).read_bytes().startswith(b'%PDF-');results.append({'scenario':'final-roster-render-and-synthetic-pdf-download','status':'PASS'});assert not state['external'];ctx.close()
 ctx,state=context(scenario='bad-success');page=ctx.new_page();page.goto(BASE+'/training/attendance/fixture-event?role=staff&challenge=fixture');canvas=page.locator('canvas');expect(canvas).to_be_visible();box=canvas.bounding_box();page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.mouse.move(box['x']+70,box['y']+40);page.mouse.up();page.get_by_role('button',name='서명 제출',exact=True).click();expect(page.get_by_role('alert')).to_be_visible();expect(page.get_by_text('전자서명 출석이 완료되었습니다.')).to_have_count(0);results.append({'scenario':'http-200-unconfirmed-response-never-completes','status':'PASS'});ctx.close()
 browser.close()
print(json.dumps({'passed':len(results),'cases':results},ensure_ascii=False))
