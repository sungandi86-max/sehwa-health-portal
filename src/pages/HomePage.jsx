import FirebaseHomeAuthPanel from "../components/FirebaseHomeAuthPanel.jsx";
import HeroSection from "../components/HeroSection.jsx";
import PwaInstallCard from "../components/PwaInstallCard.jsx";
import QuickMenu from "../components/QuickMenu.jsx";
import { firebaseV2MenuItems } from "../data/firebaseV2Navigation.js";
import { quickMenuItems } from "../data/fallbackData.js";

const legacyMenuRoutes = {
  homeroom: "/homeroom",
  studentCare: "/student-care",
  resources: "/resources",
};

export default function HomePage({ config }) {
  const firebaseMenuById = new Map(firebaseV2MenuItems.map((item) => [item.id, item]));
  const legacyMenuById = new Map(quickMenuItems.map((item) => [item.id, item]));
  const restoredMenuItems = [
    firebaseMenuById.get("today"),
    firebaseMenuById.get("upload"),
    firebaseMenuById.get("checkup"),
    firebaseMenuById.get("education"),
    { ...legacyMenuById.get("homeroom"), href: legacyMenuRoutes.homeroom },
    { ...legacyMenuById.get("studentCare"), href: legacyMenuRoutes.studentCare },
    { ...legacyMenuById.get("resources"), href: legacyMenuRoutes.resources },
    firebaseMenuById.get("faq"),
  ].filter(Boolean);

  return (
    <>
      <HeroSection config={config} action={<FirebaseHomeAuthPanel />} />
      <PwaInstallCard />
      <QuickMenu items={restoredMenuItems} variant="portalCompact" />
    </>
  );
}
