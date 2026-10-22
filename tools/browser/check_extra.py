"""Reuses existing training-phase2 React fixtures; mocks only local API transport."""
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4179'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844}); external=[]
 def route(r):
  if not r.request.url.startswith(BASE+'/'):external.append(r.request.url);r.abort();return
  if '/api/' in r.request.url:
   if 'staff-identity' in r.request.url:r.fulfill(json={'ok':True,'identity':{'staffId':'FIXTURE-B' if mismatch[0] else 'FIXTURE-A','name':'Synthetic'}})
   else:r.fulfill(json={'ok':True,'items':[],'counts':{'target':1,'signed':0,'excluded':0},'rows':[]})
  else:r.continue_()
 mismatch=[False];ctx.route('**/*',route);page=ctx.new_page()
 for view,marker in [('admin','교육 관리'),('targets','대상'),('qr','단일 QR 생성'),('summary','상태 필터'),('final','PDF 다운로드')]:
  page.goto(BASE+'/tests/fixtures/training-phase2.html?view='+view+'&role=admin')
  if view=='admin':expect(page.locator('h1').first).to_be_visible()
  elif view=='targets':
   page.get_by_role('button',name='대상자 명단 보기',exact=True).click();expect(page.get_by_text('테스트 교직원',exact=True).first).to_be_visible()
  elif view=='qr':expect(page.get_by_role('button',name=marker,exact=True)).to_be_visible()
  elif view=='summary':expect(page.get_by_role('combobox')).to_be_visible()
  else:expect(page.get_by_role('button',name=marker,exact=True)).to_be_visible()
  print('PASS existing training-phase2 fixture',view,flush=True)
 page.goto(BASE+'/fixture/write?role=staff');expect(page.get_by_text('protected-write',exact=True)).to_be_visible();print('PASS canonical writer identity match',flush=True)
 mismatch[0]=True;page.reload();expect(page.get_by_text('교직원 정보 연결을 확인해 주세요.',exact=True)).to_be_visible();expect(page.get_by_text('protected-write',exact=True)).to_have_count(0);print('PASS canonical writer identity mismatch denied',flush=True)
 assert not external;ctx.close();b.close()
