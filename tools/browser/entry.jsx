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
import '../../src/index.css';
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
 <Route path="/firebase-admin/trainings" element={<TrainingAdmin/>}/>
 <Route path="/firebase-admin/submissions" element={<Submissions/>}/>
 <Route path="/firebase-admin/submission-status" element={<Status/>}/>
 <Route path="/firebase-admin/staff-submission-status" element={<StaffStatus/>}/>
 <Route path="/firebase-faq" element={<Faq/>}/>
 <Route path="/training" element={<Training/>}/><Route path="/training/:eventId" element={<TrainingDetailPage/>}/>
 <Route path="/training/attendance/:eventId" element={<Attendance/>}/>
 <Route path="/fixture/staff" element={<StaffGate readOnly>{()=> <p>protected-staff</p>}</StaffGate>}/>
 <Route path="/fixture/write" element={<StaffGate>{()=> <p>protected-write</p>}</StaffGate>}/>
 <Route path="/fixture/admin" element={<AdminGate>{()=> <p>protected-admin</p>}</AdminGate>}/>
 <Route path="/fixture/homeroom" element={<StudentGate>{()=> <p>protected-homeroom</p>}</StudentGate>}/>
 <Route path="/firebase-admin/trainings/:eventId/qr" element={<Qr/>}/>
 <Route path="/firebase-admin/trainings/:eventId/attendance" element={<AdminAttendance/>}/>
 <Route path="/firebase-admin/trainings/:eventId/final-sheet" element={<AdminAttendance finalSheet/>}/>
</Routes></BrowserRouter>);
