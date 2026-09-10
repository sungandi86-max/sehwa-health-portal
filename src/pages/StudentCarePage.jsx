import { PortalBackToHome } from "../components/PortalSubpageLayout.jsx";
import StudentCareSection from "../components/StudentCareSection.jsx";

export default function StudentCarePage({ items }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[1280px] px-3 pt-4 sm:px-4 sm:pt-5">
        <PortalBackToHome />
      </div>
      <StudentCareSection items={items} />
    </>
  );
}
