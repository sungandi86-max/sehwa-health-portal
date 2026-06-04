import HeroSection from "../components/HeroSection.jsx";
import PwaInstallCard from "../components/PwaInstallCard.jsx";
import QuickMenu from "../components/QuickMenu.jsx";
import { quickMenuItems } from "../data/fallbackData.js";

export default function HomePage({ config }) {
  return (
    <>
      <HeroSection config={config} />
      <div className="md:hidden">
        <QuickMenu items={quickMenuItems.slice(0, 4)} className="pb-4" />
      </div>
      <PwaInstallCard />
      <div className="hidden md:block">
        <QuickMenu />
      </div>
      <div className="md:hidden">
        <QuickMenu items={quickMenuItems.slice(4)} />
      </div>
    </>
  );
}
