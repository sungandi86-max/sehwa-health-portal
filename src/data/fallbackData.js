export const appConfig = {
  appName: "세화여자고등학교 온라인 보건실",
  subtitle: "보건 안내 확인부터 자료 제출까지 한 곳에서 간편하게.",
  description:
    "보건 관련 안내와 제출 링크를 모바일에서도 쉽게 확인할 수 있도록 만든 교직원용 포털입니다.",
  privacyNotice: "학생 개인정보 및 민감정보는 앱 화면에 직접 표시하지 않습니다.",
  managerNote: "제출 자료 확인 및 세부 관리는 보건업무시트에서 별도로 진행됩니다."
};

export const quickMenuItems = [
  { id: "today", title: "오늘의 보건실", description: "오늘 또는 이번 주 확인할 보건 업무", icon: "📌" },
  { id: "upload", title: "제출·업로드 센터", description: "이수증, 검진 확인증, 확인 요청 제출", icon: "📤", featured: true },
  { id: "checkup", title: "검진·검사 안내", description: "1학년 건강검진, 2·3학년 결핵검진·소변검사", icon: "🩺" },
  { id: "education", title: "교육 자료실", description: "응급처치·예방교육·인식개선 자료", icon: "🎬" },
  { id: "homeroom", title: "담임 협조 요청", description: "회수, 확인, 전달이 필요한 항목", icon: "✅" },
  { id: "studentCare", title: "학생 건강관리 안내", description: "요보호학생 관련 권한 링크 안내", icon: "🔐" },
  { id: "resources", title: "건강정보/이벤트", description: "보건 안내문, 참고 자료, 보건실 이벤트", icon: "📋" },
  { id: "faq", title: "FAQ", description: "자주 묻는 질문 확인", icon: "❔" }
];

export const noticeItems = [
  {
    title: "전학년 성매매 예방교육 안내",
    titleLines: ["전학년 성매매", "예방교육 안내"],
    date: "5월 21일 5교시",
    target: "고1~고3 전체 학급",
    description:
      "담임 선생님께서는 안내된 유튜브 영상을 학급 교실에서 재생해주시고, 학생들이 교육 내용을 시청할 수 있도록 지도 부탁드립니다.",
    actionText: "예방교육 자료실에서 영상 링크 확인",
    status: "안내 중",
    badgeType: "pink"
  },
  {
    title: "교직원 결핵검진 확인 안내",
    titleLines: ["교직원 결핵검진", "확인 안내"],
    date: "별도 안내일까지",
    target: "교직원",
    description:
      "개별적으로 결핵검진 또는 흉부 X-ray 검진을 완료하신 경우 제출·업로드 센터에서 확인증을 제출해주세요.",
    actionText: "제출·업로드 센터에서 확인증 제출",
    status: "접수 중",
    badgeType: "green"
  },
  {
    title: "채용검진 대체 인정 확인 요청",
    titleLines: ["채용검진 대체 인정", "확인 요청"],
    date: "필요 시",
    target: "채용검진으로 결핵검진 대체 확인이 필요한 교직원",
    description:
      "채용검진 서류를 이미 행정실에 제출하신 경우, 보건실 앱에 결과지를 다시 업로드하지 않으셔도 됩니다. 확인 요청만 접수해주세요.",
    actionText: "파일 업로드 없이 확인 요청",
    status: "확인 요청",
    badgeType: "blue"
  }
];

export const uploadIntro = {
  title: "제출·업로드 센터",
  description: "교직원 보건 관련 이수증 및 검진 확인 자료를 제출하는 공간입니다.",
  notice: "제출 자료는 보건 업무 확인 목적으로만 사용되며, 앱 화면에는 개인별 제출 자료가 표시되지 않습니다.",
  subNotice: "제출 후 보건실 확인까지 시간이 소요될 수 있습니다. 파일 제출이 어려운 경우 보건실로 문의해주세요."
};

export const uploadItems = [
  {
    title: "심폐소생술 이수증 제출",
    titleLines: ["심폐소생술", "이수증 제출"],
    description: "개별적으로 심폐소생술 교육을 이수하신 교직원은 이수증 파일을 제출해주세요.",
    target: "개별 이수 교직원",
    documentType: "심폐소생술 이수증",
    deadline: "별도 안내일까지",
    fileGuide: "권장 파일명: 성명_심폐소생술이수증",
    buttonText: "이수증 업로드하기",
    url: "",
    status: "접수 중",
    uploadType: "file",
    highlight: true
  },
  {
    title: "결핵검진 확인증 제출",
    titleLines: ["결핵검진", "확인증 제출"],
    description: "개별적으로 결핵검진 또는 흉부 X-ray 검진을 완료하신 교직원은 확인 가능한 자료를 제출해주세요.",
    target: "개별 검진 완료 교직원",
    documentType: "결핵검진 확인증 또는 흉부 X-ray 확인 자료",
    deadline: "별도 안내일까지",
    fileGuide: "권장 파일명: 성명_결핵검진확인증\n확인 필요 항목: 성명, 검진일자, 검진 항목",
    buttonText: "확인증 업로드하기",
    url: "",
    status: "접수 중",
    uploadType: "file",
    highlight: true
  },
  {
    title: "채용검진 대체 인정 확인 요청",
    titleLines: ["채용검진 대체 인정", "확인 요청"],
    description: "채용검진 서류를 이미 행정실에 제출하신 경우, 보건실 앱에 결과지를 다시 업로드하지 않으셔도 됩니다.",
    target: "채용검진으로 결핵검진 대체 인정 확인이 필요한 교직원",
    documentType: "파일 제출 없음",
    deadline: "별도 안내일까지",
    fileGuide:
      "보건실에서는 결핵검진 인정 여부 확인을 위해 흉부 X-ray 검진일자 확인만 필요합니다. 채용검진 결과지 전체에는 보건 업무 목적과 직접 관련 없는 건강정보가 포함될 수 있으므로, 앱에서는 파일을 받지 않고 확인 요청만 접수합니다.",
    buttonText: "확인 요청하기",
    url: "",
    status: "확인 요청",
    uploadType: "request",
    highlight: false
  },
  {
    title: "기타 보건 관련 자료 제출",
    titleLines: ["기타 보건 관련", "자료 제출"],
    description: "보건실에서 별도로 안내한 자료를 제출하는 메뉴입니다.",
    target: "별도 안내 대상자",
    documentType: "보건실 요청 자료",
    deadline: "별도 안내일까지",
    fileGuide: "보건실에서 안내받은 자료만 제출해주세요.",
    buttonText: "기타 자료 제출하기",
    url: "",
    status: "필요 시",
    uploadType: "file",
    highlight: false
  }
];

export const checkupItems = [
  {
    title: "1학년 건강검진 안내",
    description: "1학년 학생 건강검진 일정, 장소, 문진표 작성 방법, 학급별 이동 순서를 확인합니다.",
    target: "1학년 학생 및 담임교사",
    details: ["검진 일정 및 장소 확인", "학급별 이동 순서 확인", "문진표 작성 및 회수 안내", "결석자 또는 미검진자 처리 안내"],
    buttonText: "1학년 건강검진 안내 보기",
    url: "",
    status: "안내 중"
  },
  {
    title: "2·3학년 결핵검진 안내",
    description: "2·3학년 학생 결핵검진 일정, 장소, 학급별 이동 및 미검진자 처리 방법을 확인합니다.",
    target: "2·3학년 학생 및 담임교사",
    details: ["검진 일정 및 장소 확인", "학급별 이동 순서 확인", "검진 당일 학생 이동 안내", "결석자 또는 미검진자 확인"],
    buttonText: "학생 결핵검진 안내 보기",
    url: "",
    status: "안내 중"
  },
  {
    title: "2·3학년 소변검사 안내",
    description: "2·3학년 학생 소변검사 일정, 준비사항, 검사 당일 안내 및 미검사자 처리 방법을 확인합니다.",
    target: "2·3학년 학생 및 담임교사",
    details: ["검사 일정 및 장소 확인", "검사 전 안내사항 확인", "검사 당일 학급 안내", "미검사자 확인 및 추후 안내"],
    buttonText: "소변검사 안내 보기",
    url: "",
    status: "안내 중"
  },
  {
    title: "교직원 결핵검진 안내",
    description: "교직원 결핵검진 일정, 장소, 인정 기준, 개별검진 제출 방법을 확인합니다.",
    target: "교직원",
    details: ["검진 가능 시간 확인", "검진 장소 확인", "개별검진 확인증 제출 방법", "채용검진 대체 인정 확인 방법"],
    buttonText: "교직원 결핵검진 안내 보기",
    url: "",
    status: "확인 필요"
  },
  {
    title: "문진표·명단 자료",
    description: "담임 배부용 문진표, 명렬표, 회수 확인 자료를 확인합니다.",
    target: "담임교사",
    details: ["문진표 작성 안내", "명렬표 확인", "회수 체크 자료", "검진 당일 학생 이동 안내"],
    buttonText: "자료실 열기",
    url: "",
    status: "자료"
  }
];

export const educationItems = [
  {
    title: "1학년 응급처치교육",
    target: "1학년 전체",
    duration: "현장 강사 진행",
    schedule: "별도 안내",
    description: "각 학급 교실에서 강사가 직접 진행하는 교육입니다. 담임 선생님께서는 교육 일정을 확인해주세요.",
    buttonText: null,
    url: "",
    teacherGuide: "별도 영상 링크나 자료 열람 없이, 안내된 시간에 강사가 각 교실로 입실하여 교육을 진행합니다. 담임 선생님께서는 학급에서 교육이 원활히 진행될 수 있도록 협조해주세요.",
    confirmation: "현장 진행 여부는 보건실에서 확인합니다.",
    status: "현장 진행"
  },
  {
    title: "성폭력 예방교육",
    target: "고1~고3 전체",
    duration: "약 20분",
    schedule: "별도 안내",
    description: "성폭력 예방교육 영상 링크를 확인한 후 학급에서 재생해주세요.",
    buttonText: "영상 링크 열기",
    url: "",
    teacherGuide: "영상 링크를 확인한 후 학급에서 재생해주세요.",
    confirmation: "교육 실시 후 별도 안내에 따라 확인합니다.",
    status: "자료"
  },
  {
    title: "성매매 예방교육",
    target: "고1~고3 전체",
    duration: "약 20분",
    schedule: "5월 21일 5교시",
    description: "성매매 예방교육 영상 링크를 확인한 후 학급에서 재생해주세요.",
    buttonText: "영상 링크 열기",
    url: "",
    teacherGuide: "영상 링크를 확인한 후 학급에서 재생해주세요.",
    confirmation: "별도 제출 없이 학급별 교육 실시 여부는 필요 시 확인합니다.",
    status: "실시 예정"
  },
  {
    title: "가정폭력 예방교육",
    target: "고1~고3 전체",
    duration: "약 20분",
    schedule: "별도 안내",
    description: "가정폭력 예방교육 영상 링크를 확인한 후 학급에서 재생해주세요.",
    buttonText: "영상 링크 열기",
    url: "",
    teacherGuide: "영상 링크를 확인한 후 학급에서 재생해주세요.",
    confirmation: "교육 실시 후 별도 안내에 따라 확인합니다.",
    status: "자료"
  },
  {
    title: "양성평등교육",
    target: "고1~고3 전체",
    duration: "약 20분",
    schedule: "별도 안내",
    description: "양성평등교육 영상 링크를 확인한 후 학급에서 재생해주세요.",
    buttonText: "영상 링크 열기",
    url: "",
    teacherGuide: "영상 링크를 확인한 후 학급에서 재생해주세요.",
    confirmation: "교육 실시 여부는 필요 시 별도 확인합니다.",
    status: "자료"
  },
  {
    title: "장애인식 개선교육(1학기)",
    target: "고1~고3 전체",
    duration: "약 20분",
    schedule: "1학기 별도 안내",
    description: "1학기 장애인식 개선교육 영상 링크를 확인한 후 학급에서 재생해주세요.",
    buttonText: "영상 링크 열기",
    url: "",
    teacherGuide: "영상 링크를 확인한 후 학급에서 재생해주세요.",
    confirmation: "교육 실시 후 별도 안내에 따라 확인합니다.",
    status: "자료"
  },
  {
    title: "장애인식 개선교육(2학기)",
    target: "고1~고3 전체",
    duration: "약 20분",
    schedule: "2학기 별도 안내",
    description: "2학기 장애인식 개선교육 영상 링크를 확인한 후 학급에서 재생해주세요.",
    buttonText: "영상 링크 열기",
    url: "",
    teacherGuide: "영상 링크를 확인한 후 학급에서 재생해주세요.",
    confirmation: "교육 실시 후 별도 안내에 따라 확인합니다.",
    status: "자료"
  },
  {
    title: "약물 오남용 예방교육(1학기)",
    target: "고1~고3 전체",
    duration: "약 20분",
    schedule: "1학기 별도 안내",
    description: "1학기 약물 오남용 예방교육 영상 링크를 확인한 후 학급에서 재생해주세요.",
    buttonText: "영상 링크 열기",
    url: "",
    teacherGuide: "영상 링크를 확인한 후 학급에서 재생해주세요.",
    confirmation: "교육 실시 후 별도 안내에 따라 확인합니다.",
    status: "자료"
  },
  {
    title: "약물 오남용 예방교육(2학기)",
    target: "고1~고3 전체",
    duration: "약 20분",
    schedule: "2학기 별도 안내",
    description: "2학기 약물 오남용 예방교육 영상 링크를 확인한 후 학급에서 재생해주세요.",
    buttonText: "영상 링크 열기",
    url: "",
    teacherGuide: "영상 링크를 확인한 후 학급에서 재생해주세요.",
    confirmation: "교육 실시 후 별도 안내에 따라 확인합니다.",
    status: "자료"
  }
];

export const homeroomRequestItems = [
  {
    title: "문진표 회수 확인",
    target: "해당 학급 담임교사",
    deadline: "종례 전",
    description: "학생 인적사항, 체크 누락, 보호자 서명 여부를 확인 후 회수해주세요.",
    checklist: ["학생 인적사항 작성 여부", "체크 누락 여부", "보호자 서명 여부", "미제출 학생 확인"],
    status: "확인 필요"
  },
  {
    title: "예방교육 영상 재생",
    target: "전학급 담임교사",
    deadline: "해당 차시",
    description: "안내된 영상 링크를 교실에서 재생하고 학생들이 시청할 수 있도록 지도해주세요.",
    checklist: ["영상 링크 접속", "교실 화면 및 음향 확인", "학생 시청 지도", "수업 종료 후 마무리 안내"],
    status: "실시 예정"
  },
  {
    title: "검진 당일 학생 이동 안내",
    target: "검진 대상 학급 담임교사",
    deadline: "검진 당일",
    description: "학급별 검진 시간에 맞춰 학생들이 지정 장소로 이동할 수 있도록 안내해주세요.",
    checklist: ["학급별 검진 시간 확인", "문진표 지참 여부 확인", "검진 장소 안내", "결석자 및 미검진자 확인"],
    status: "안내 중"
  }
];

export const studentCareIntro = {
  title: "학생 건강관리 안내",
  description: "건강상 배려가 필요한 학생 관련 자료는 별도 권한이 부여된 링크에서 확인해주세요.",
  privacyNotice: "앱 화면에는 학생 이름, 질병명, 연락처 등 개인정보 및 민감정보를 표시하지 않습니다.",
  guide: "담임 선생님께서는 학급 학생 중 건강상 배려가 필요한 학생이 있는지 확인하시고, 수업·행사·현장체험학습 운영 시 필요한 사항은 보건실과 사전 협의해주세요."
};

export const studentCareItems = [
  {
    title: "학생 건강관리 자료 확인",
    description: "건강상 배려가 필요한 학생 관련 자료는 별도 권한이 부여된 링크에서 확인해주세요.",
    privacyNotice: "비밀번호가 설정되어 있습니다. 비밀번호는 보건실로 문의해주세요.",
    buttonText: "요보호학생 확인 링크 열기",
    url: "",
    status: "권한 필요"
  },
  {
    title: "보건실 입실 현황 확인",
    description: "보건실 입실 중인 학생 현황은 별도 권한이 부여된 링크에서 확인해주세요.",
    privacyNotice: "권한이 부여된 교직원만 열람 가능합니다.",
    buttonText: "보건실 입실현황 열기",
    url: "https://docs.google.com/spreadsheets/d/1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs/edit?gid=415753895#gid=415753895",
    status: "권한 필요"
  },
];

export const resourceItems = [
  { title: "건강검진 안내문", category: "건강검진", description: "학생 건강검진 일정, 장소, 준비사항을 정리한 안내문입니다.", buttonText: "자료 열기", url: "" },
  { title: "문진표 작성 안내", category: "건강검진", description: "학생 문진표 작성 방법과 담임 확인사항을 정리한 자료입니다.", buttonText: "자료 열기", url: "" },
  { title: "교직원 결핵검진 안내문", category: "교직원 검진", description: "교직원 결핵검진 일정, 인정 기준, 확인증 제출 방법을 정리한 자료입니다.", buttonText: "자료 열기", url: "" },
  { title: "예방교육 영상 링크 모음", category: "예방교육", description: "학급에서 재생할 수 있는 예방교육 영상 링크를 모아둔 자료입니다.", buttonText: "자료 열기", url: "" },
  { title: "감염병 예방 안내문", category: "감염병", description: "학급 안내용 감염병 예방 수칙과 안내문입니다.", buttonText: "자료 열기", url: "" },
  { title: "보건실 이용 안내", category: "보건실 안내", description: "학생 보건실 이용 시 담임 및 교과 선생님께서 참고하실 안내입니다.", buttonText: "자료 열기", url: "" },
  { title: "응급상황 대응 안내", category: "응급상황", description: "수업 중 응급상황 발생 시 교직원이 참고할 기본 대응 안내입니다.", buttonText: "자료 열기", url: "" }
];

export const messageTemplates = [
  {
    title: "성매매 예방교육 안내",
    category: "예방교육",
    content:
      "안녕하세요, 보건실입니다.\n\n오늘 5교시 전학년 대상 성매매 예방교육이 진행됩니다.\n담임 선생님께서는 안내된 링크의 영상을 학급 교실에서 재생해주시고,\n학생들이 교육 내용을 시청할 수 있도록 지도 부탁드립니다.\n\n감사합니다."
  },
  {
    title: "결핵검진 확인증 제출 안내",
    category: "교직원 검진",
    content:
      "안녕하세요, 보건실입니다.\n\n개별적으로 결핵검진 또는 흉부 X-ray 검진을 완료하신 경우,\n온라인 보건실의 제출·업로드 센터에서 확인증을 제출해주시기 바랍니다.\n\n제출 후 보건실 확인까지 시간이 소요될 수 있습니다.\n감사합니다."
  },
  {
    title: "채용검진 대체 인정 확인 안내",
    category: "교직원 검진",
    content:
      "안녕하세요, 보건실입니다.\n\n채용검진 서류를 이미 행정실에 제출하신 경우,\n보건실 앱에 결과지를 다시 업로드하지 않으셔도 됩니다.\n\n보건실에서는 결핵검진 인정 여부 확인을 위해 흉부 X-ray 검진일자 확인만 필요하므로,\n온라인 보건실에서 확인 요청만 접수해주시기 바랍니다.\n\n감사합니다."
  },
  {
    title: "문진표 회수 요청",
    category: "문진표",
    content:
      "안녕하세요, 보건실입니다.\n\n건강검진 문진표 회수와 관련하여 안내드립니다.\n담임 선생님께서는 학생 인적사항, 체크 누락, 보호자 서명 여부를 확인하신 후 회수 부탁드립니다.\n\n감사합니다."
  }
];

export const faqItems = [
  { question: "결핵검진 확인증은 어디에 제출하나요?", answer: "제출·업로드 센터의 '결핵검진 확인증 제출' 메뉴에서 업로드해주세요." },
  { question: "채용검진을 받았는데 결핵검진으로 인정되나요?", answer: "채용검진 서류를 이미 행정실에 제출하신 경우 보건실 앱에 결과지를 다시 업로드하지 않으셔도 됩니다. 보건실에서는 흉부 X-ray 검진일자 확인만 필요하므로 '채용검진 대체 인정 확인 요청' 메뉴에서 확인 요청만 접수해주세요." },
  { question: "채용검진 결과지를 앱에 업로드해야 하나요?", answer: "아니요. 채용검진 결과지 전체에는 보건 업무 목적과 직접 관련 없는 건강정보가 포함될 수 있으므로, 앱에서는 채용검진 결과지 파일을 받지 않습니다." },
  { question: "요보호학생 자료가 열리지 않습니다.", answer: "학생 건강관리 자료는 권한이 부여된 교직원만 열람 가능합니다. 권한이 필요한 경우 보건실로 문의해주세요." },
  { question: "앱에 제 제출 여부가 표시되나요?", answer: "아니요. 앱 화면에는 개인별 제출현황이나 제출 파일이 표시되지 않습니다. 제출현황은 보건업무시트에서 보건실이 별도로 관리합니다." }
];
