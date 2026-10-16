import test from 'node:test';
import assert from 'node:assert/strict';
import {submissionReviewHref,tbReviewContext,tbReviewHref} from './submissionNavigation.js';
test('exact receipt link is independent of status and does not expose a file URL',()=>{
 assert.equal(submissionReviewHref({id:'receipt-1',status:'rejected'}),'/firebase-admin/submissions?tab=staff&submissionId=receipt-1');
 assert.equal(submissionReviewHref({id:'../private'}),null);
});
test('TB handoff retains staff, numeric year, document type and receipt without invoking any service',()=>{
 const href=tbReviewHref({id:'tb-1',staffId:'S1',schoolYear:2026,documentType:'공단 확인서'});
 const url=new URL(href,'https://fixture.invalid');assert.equal(url.hash,'#annual-screening-type');
 assert.deepEqual(tbReviewContext(url.searchParams),{staffId:'S1',submissionId:'tb-1',schoolYear:2026,screeningType:'공단 확인서'});
 assert.equal(tbReviewHref({id:'tb-1',schoolYear:2026}),null);assert.equal(tbReviewContext('staffId=S1&submissionId=tb-1&schoolYear=invalid'),null);
});

test('context return links preserve exact receipt, task, staff and search while refusing external redirects',async()=>{
 const {adminReturnHref,withAdminReturn,staffWorkHref}=await import('./submissionNavigation.js');
 for(const value of ['https://outside.invalid','//outside.invalid','/\\outside.invalid','/training','javascript:alert(1)'])assert.equal(adminReturnHref(value),null);
 const before='/firebase-admin/submission-status?item=tb&status=all&search=synthetic';
 const next=new URL(withAdminReturn(submissionReviewHref({id:'tb-1'}),before),'https://fixture.invalid');
 assert.equal(next.searchParams.get('submissionId'),'tb-1');assert.equal(next.searchParams.get('returnTo'),before);
 const work=new URL(staffWorkHref({staffId:'S1',itemId:'tb',schoolYear:2026}),'https://fixture.invalid');
 assert.equal(work.searchParams.get('staffId'),'S1');assert.equal(work.searchParams.get('task'),'tb-screening-2026');assert.equal(work.searchParams.get('schoolYear'),'2026');
 assert.equal(staffWorkHref({staffId:'../S1',itemId:'tb'}),null);assert.equal(staffWorkHref({staffId:'S1',itemId:'recruit'}),null);assert.equal(staffWorkHref({staffId:'S1',itemId:'tb',schoolYear:0}),null);
});
test('TB exact review binding rejects other staff, year, receipt and document type',async()=>{
 const {matchesTbReviewEvidence}=await import('./submissionNavigation.js');
 const item={staffId:'S1'},evidence={staffId:'S1',schoolYear:2026,submissionId:'tb-1',documentType:'공단 확인서'};
 const context={...item,schoolYear:2026,submissionId:'tb-1',screeningType:'공단 확인서'};
 assert.equal(matchesTbReviewEvidence(item,evidence,2026,context),true);
 for(const patch of [{staffId:'S2'},{schoolYear:2025},{submissionId:'tb-2'},{documentType:'개별 확인서'}])assert.equal(matchesTbReviewEvidence(item,{...evidence,...patch},2026,context),false);
 assert.equal(matchesTbReviewEvidence(item,{...evidence,schoolYear:'2026'},2026,context),false);
});
