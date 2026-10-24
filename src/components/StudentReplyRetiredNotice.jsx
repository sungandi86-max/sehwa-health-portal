import { STUDENT_REPLY_RETIRED_MESSAGE } from "../../common/studentReplyRetirement.js";
import { PortalPageLayout } from "./PortalSubpageLayout.jsx";

export default function StudentReplyRetiredNotice() {
  return (
    <PortalPageLayout>
      <div className="bogunon-panel space-y-3 p-4" role="status">
        <h1 className="text-lg font-semibold">제출 기능 종료 안내</h1>
        <p className="text-sm leading-7">{STUDENT_REPLY_RETIRED_MESSAGE}</p>
      </div>
    </PortalPageLayout>
  );
}
