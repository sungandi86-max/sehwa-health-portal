export const STUDENT_REPLY_RETIRED_CODE = "STUDENT_TB_REPLY_RETIRED";
export const STUDENT_REPLY_RETIRED_MESSAGE = "해당 제출 기능은 운영이 종료되었습니다. 관련 문의는 학교 보건실로 해주시기 바랍니다.";

export function isRetiredStudentReply(type) {
  return typeof type === "string" && ["student_tb_reply", "student-file", "student_file", "studentfile", "tbreply"]
    .includes(type.trim().toLowerCase());
}
