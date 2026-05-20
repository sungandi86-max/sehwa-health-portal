import HeroSection from "../components/HeroSection.jsx";
import QuickMenu from "../components/QuickMenu.jsx";

export default function HomePage({ config }) {
  return (
    <>
      <HeroSection config={config} />
      <QuickMenu />
    </>
  );
}
