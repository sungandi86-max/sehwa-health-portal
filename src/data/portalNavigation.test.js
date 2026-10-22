import test from 'node:test';
import assert from 'node:assert/strict';
import {portalMenuItems,isPortalMenuActive} from './portalNavigation.js';
test('shared portal navigation keeps distinct services and marks nested routes without prefix collisions',()=>{
 assert.equal(new Set(portalMenuItems.map(i=>i.id)).size,portalMenuItems.length);
 assert.ok(portalMenuItems.every(i=>i.title && i.href.startsWith('/')));
 assert.equal(portalMenuItems.find(i=>i.id==='educationCenter').href,'/training');
 assert.equal(isPortalMenuActive('/training/attendance/event','/training'),true);
 assert.equal(isPortalMenuActive('/training-reports','/training'),false);
 assert.equal(isPortalMenuActive('/firebase-faq','/firebase-faq'),true);
});
