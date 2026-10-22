import Header from "../../src/components/Header.jsx";
import Home from "../../src/pages/HomePage.jsx";
import HealthPanel from "../../src/components/HealthScreeningTypeAdminPanel.jsx";
import MyStatus from "../../src/pages/MySubmissionStatusPage.jsx";
import TrainingAdmin from '../../src/pages/FirebaseTrainingAdminPage.jsx';
import Submissions from '../../src/pages/FirebaseAdminSubmissionsPage.jsx';
import Status from '../../src/pages/FirebaseSubmissionStatusPage.jsx';
import StaffStatus from '../../src/pages/FirebaseStaffSubmissionStatusAdminPage.jsx';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import Faq from '../../src/pages/FirebaseFaqPage.jsx';
import {default as Training,TrainingDetailPage} from '../../src/pages/TrainingCenterPage.jsx';
import Attendance from '../../src/pages/TrainingAttendancePage.jsx';
import AdminGate from '../../src/components/FirebaseAdminRoleAccessGate.jsx';
import StaffGate from '../../src/components/FirebaseStaffSubmissionAccessGate.jsx';
import StudentGate from '../../src/components/FirebaseStudentHealthAccessGate.jsx';
import Qr from '../../src/pages/FirebaseTrainingQrPage.jsx';
import AdminAttendance from '../../src/pages/FirebaseTrainingAttendanceAdminPage.jsx';
import {TrainingGroupManager} from '../../src/components/TrainingGroupManager.jsx';
import {TrainingAttendanceContent} from '../../src/pages/TrainingAttendancePage.jsx';
import '../../src/index.css';
const bundleEvents=[
 {eventId:'EVENT-A',title:'연구부 교직원 연수',date:'2026-10-21',department:'연구부',ownerStaffId:'OWNER-A',ownerName:'담당 A'},
 {eventId:'EVENT-B',title:'정보보안 교육',date:'2026-10-21',department:'정보부',ownerStaffId:'OWNER-B',ownerName:'담당 B'},
 {eventId:'EVENT-C',title:'학생안전 예방교육',date:'2026-10-21',department:'학생안전부',ownerStaffId:'OWNER-C',ownerName:'담당 C'},
];
const bundleGroup={groupId:'GROUP-ABC',name:'부서 공동 필수교육',managerStaffId:'OWNER-A',managerName:'담당 A',revision:3,ready:true,lockedAt:null,canEdit:true,canManageQr:true,eventIds:bundleEvents.map(item=>item.eventId),events:bundleEvents.map(item=>({...item,approved:true,canApprove:false}))};
const bundleCheck=async()=>({ok:true,group:{groupId:bundleGroup.groupId,name:bundleGroup.name,revision:3},items:bundleEvents.map(item=>({eventId:item.eventId,title:item.title,eligible:true,reason:''})),canSubmit:true});
const bundleSubmit=async()=>({ok:true,eventIds:bundleEvents.map(item=>item.eventId),signedAt:'2026-10-21T07:00:00.000Z',cprProjectionSynced:true});
createRoot(document.getElementById('root')).render(<BrowserRouter><Header/><Routes>
 <Route path="/" element={<Home config={{appName:"합성 온라인 보건실",subtitle:"합성 테스트"}}/>}/>
 <Route path="/my-submission-status" element={<MyStatus/>}/>
 <Route path="/fixture/tb-panel" element={<AdminGate>{()=> <HealthPanel initialSchoolYear={2026} reviewContext={{staffId:"S0",submissionId:"tb-exact",schoolYear:2026,screeningType:"공단 확인서"}}/>}</AdminGate>}/>
 <Route path="/firebase-admin/trainings" element={<TrainingAdmin/>}/>
 <Route path="/firebase-admin/submissions" element={<Submissions/>}/>
 <Route path="/firebase-admin/submission-status" element={<Status/>}/>
 <Route path="/firebase-admin/staff-submission-status" element={<StaffStatus/>}/>
 <Route path="/firebase-faq" element={<Faq/>}/>
 <Route path="/training" element={<Training/>}/><Route path="/training/:eventId" element={<TrainingDetailPage/>}/>
 <Route path="/training/attendance/:eventId" element={<Attendance/>}/>
 <Route path="/training/attendance/group/:eventGroupId" element={<Attendance group/>}/>
 <Route path="/fixture/staff" element={<StaffGate readOnly>{()=> <p>protected-staff</p>}</StaffGate>}/>
 <Route path="/fixture/write" element={<StaffGate>{()=> <p>protected-write</p>}</StaffGate>}/>
 <Route path="/fixture/admin" element={<AdminGate>{()=> <p>protected-admin</p>}</AdminGate>}/>
 <Route path="/fixture/homeroom" element={<StudentGate>{()=> <p>protected-homeroom</p>}</StudentGate>}/>
 <Route path="/firebase-admin/trainings/:eventId/qr" element={<Qr/>}/>
 <Route path="/firebase-admin/trainings/:eventId/attendance" element={<AdminAttendance/>}/>
 <Route path="/firebase-admin/trainings/:eventId/final-sheet" element={<AdminAttendance finalSheet/>}/>
 <Route path="/fixture/training-groups" element={<main className="mx-auto max-w-[1500px] space-y-4 p-4"><TrainingGroupManager hasTopLevelAdminAccess loadCandidates={async()=>({items:bundleEvents})} loadGroups={async()=>({actorStaffId:'OWNER-A',items:[bundleGroup]})} saveGroup={async()=>({ok:true})} approveEvent={async()=>({ok:true})} createQr={async()=>({ok:true,path:'/training/attendance/group/GROUP-ABC?challenge=fixture',expiresAt:'2099-01-01T00:00:00.000Z',group:{groupId:bundleGroup.groupId,name:bundleGroup.name,revision:3,events:bundleEvents.map(({eventId,title})=>({eventId,title}))}})}/></main>}/>
 <Route path="/fixture/training-group-attendance" element={<TrainingAttendanceContent displayName="합성 교직원" group id="GROUP-ABC" challenge="fixture" checkAttendance={bundleCheck} submitAttendance={bundleSubmit}/>}/>
</Routes></BrowserRouter>);
