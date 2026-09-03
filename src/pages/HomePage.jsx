import FirebaseHomeAuthPanel from "../components/FirebaseHomeAuthPanel.jsx";
import HeroSection from "../components/HeroSection.jsx";
import PwaInstallCard from "../components/PwaInstallCard.jsx";
import QuickMenu from "../components/QuickMenu.jsx";
import { firebaseV2MenuItems } from "../data/firebaseV2Navigation.js";

export default function HomePage({ config }) {
  return (
    <>
      <HeroSection config={config} />
      <FirebaseHomeAuthPanel />
      <div className="md:hidden">
        <QuickMenu items={firebaseV2MenuItems.slice(0, 3)} className="pb-3" />
      </div>
      <PwaInstallCard />
      <div className="hidden md:block">
        <QuickMenu items={firebaseV2MenuItems} className="md:pb-8" />
      </div>
      <div className="md:hidden">
        <QuickMenu items={firebaseV2MenuItems.slice(3)} />
      </div>
    </>
  );
}
