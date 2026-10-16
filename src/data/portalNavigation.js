import { firebaseV2MenuItems } from './firebaseV2Navigation.js';
import { quickMenuItems } from './fallbackData.js';
const entry = (id) => firebaseV2MenuItems.find(item => item.id === id);
export const portalMenuItems = [
  entry('today'), {...entry('upload'),description:'보건서류 제출 · 감염병 보고'}, entry('checkup'),
  {...entry('education'),description:'학생 보건교육 자료와 안내 문서'},
  {id:'educationCenter',title:'교직원 교육센터',description:'교육 일정 · 교육 대상 확인 · QR 출석 안내',href:'/training'},
  {...quickMenuItems.find(item=>item.id==='studentCare'),href:'/student-care'},
  {...quickMenuItems.find(item=>item.id==='resources'),href:'/resources'}, entry('faq'),
];
export function isPortalMenuActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
