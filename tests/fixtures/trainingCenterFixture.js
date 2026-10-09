const TRAINING_HEADERS = ["eventId", "eventGroupId", "교육연도", "사용여부", "상태", "교육명", "담당부서", "담당자", "일자", "시작시간", "종료시간", "장소", "교육내용", "이수기준", "signatureOpenAt", "signatureCloseAt", "정렬순서"];
const TARGET_HEADERS = ["eventId", "교직원ID", "대상상태", "필수여부", "제외여부", "제외사유"];

const row = (headers, fields) => headers.map((header) => fields[header] ?? "");
const otherStaffHeaders = [...TARGET_HEADERS, "성명", "출석", "제출", "이수"];

export const trainingCenterSheetFixture = {
  trainings: [
    TRAINING_HEADERS,
    row(TRAINING_HEADERS, {
      eventId: "QA-TRAINING-001", eventGroupId: "QA-GROUP", 교육연도: "2026", 사용여부: "사용", 상태: "예정",
      교육명: "QA 교육 1", 담당부서: "보건실", 일자: "2026-10-10", 시작시간: "15:00", 종료시간: "16:00",
      장소: "강당", 교육내용: "QA 교육 내용", 정렬순서: "1",
    }),
    row(TRAINING_HEADERS, {
      eventId: "QA-TRAINING-002", eventGroupId: "QA-GROUP", 교육연도: "2026", 사용여부: "사용", 상태: "진행중",
      교육명: "QA 교육 2 · 긴 교육명을 사용해 작은 화면에서도 제목과 상태 표시가 자연스럽게 줄바꿈되는지 확인",
      담당부서: "연구부", 일자: "2026-10-11", 시작시간: "14:00", 종료시간: "15:00",
      장소: "시청각실", 교육내용: "QA 두 번째 교육 내용", 정렬순서: "2",
    }),
    row(TRAINING_HEADERS, { eventId: "QA-TRAINING-003", 사용여부: "미사용", 상태: "예정", 교육명: "미사용 QA 교육" }),
  ],
  targets: [
    otherStaffHeaders,
    row(otherStaffHeaders, { eventId: "QA-TRAINING-001", 교직원ID: "QA001", 대상상태: "대상", 필수여부: "Y", 제외여부: "N", 성명: "테스트 본인" }),
    row(otherStaffHeaders, { eventId: "QA-TRAINING-001", 교직원ID: "QA002", 대상상태: "대상", 필수여부: "N", 제외여부: "N", 성명: "테스트 타인", 출석: "타인 출석", 제출: "타인 제출", 이수: "타인 이수" }),
    row(otherStaffHeaders, { eventId: "QA-TRAINING-002", 교직원ID: "QA001", 대상상태: "비대상", 필수여부: "N", 제외여부: "N" }),
    row(otherStaffHeaders, { eventId: "QA-TRAINING-002", 교직원ID: "QA002", 대상상태: "대상", 필수여부: "Y", 제외여부: "N" }),
  ],
};

export const expectedTrainingList = [
  {
    eventId: "QA-TRAINING-001", eventGroupId: "QA-GROUP", title: "QA 교육 1", status: "예정",
    date: "2026-10-10", startTime: "15:00", endTime: "16:00", location: "강당", department: "보건실",
    targetStatus: "교육 대상", required: true,
  },
  {
    eventId: "QA-TRAINING-002", eventGroupId: "QA-GROUP",
    title: "QA 교육 2 · 긴 교육명을 사용해 작은 화면에서도 제목과 상태 표시가 자연스럽게 줄바꿈되는지 확인",
    status: "진행중", date: "2026-10-11", startTime: "14:00", endTime: "15:00",
    location: "시청각실", department: "연구부", targetStatus: "대상 아님", required: false,
  },
];

export const expectedTrainingDetail = {
  ...expectedTrainingList[0],
  description: "QA 교육 내용",
  materials: [],
};
