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
