import HeroSection from "../components/HeroSection.jsx";
import PwaInstallCard from "../components/PwaInstallCard.jsx";
import QuickMenu from "../components/QuickMenu.jsx";

export default function HomePage({ config }) {
  return (
    <>
      <HeroSection config={config} />
      <PwaInstallCard />
      <QuickMenu />
    </>
  );
}
