import { Link } from "react-router-dom";
import FirebaseHomeAuthPanel from "../components/FirebaseHomeAuthPanel.jsx";
import HeroSection from "../components/HeroSection.jsx";
import PwaInstallCard from "../components/PwaInstallCard.jsx";
import QuickMenu from "../components/QuickMenu.jsx";
import { firebaseV2MenuItems } from "../data/firebaseV2Navigation.js";

export default function HomePage({ config }) {
  const coreMenuItems = firebaseV2MenuItems.filter((item) => item.id !== "faq");
  const faqItem = firebaseV2MenuItems.find((item) => item.id === "faq");

  return (
    <>
      <HeroSection config={config} action={<FirebaseHomeAuthPanel />} />
      <PwaInstallCard />
      <QuickMenu items={coreMenuItems} variant="portalCompact" />
      {faqItem && (
        <section className="mx-auto w-full max-w-6xl px-3 pb-4 sm:px-4 md:pb-5 lg:max-w-[1280px]">
          <Link
            to={faqItem.href}
            className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] border border-[#DDEAE7] bg-white/82 px-3 py-2 text-left transition hover:border-[#BFEBDC] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 sm:px-4"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#102047]">{faqItem.title}</span>
              <span className="block truncate text-xs font-medium text-[#627083]">{faqItem.description}</span>
            </span>
            <span className="shrink-0 text-xs font-bold text-[#08754B]">FAQ 열기 →</span>
          </Link>
        </section>
      )}
    </>
  );
}
