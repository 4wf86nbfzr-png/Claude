"use client";

import "./landing.css";
import { Hero } from "./Hero";
import { Downloads } from "./Downloads";
import { Assistant } from "./Assistant";
import { LandingHeader } from "./LandingHeader";
import { Story } from "./Story";
import { HorizontalFeatures } from "./HorizontalFeatures";
import { Screens } from "./Screens";
import { DemoSection, FAQ, FinalCTA, Honesty, Industries, LandingFooter, Pricing } from "./Sections";

export function Landing() {
  return (
    <div className="landing">
      <LandingHeader />
      <main id="inhalt">
        <Hero />
        <Downloads />
        <Story />
        <HorizontalFeatures />
        <Screens />
        <Industries />
        <Honesty />
        <DemoSection />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <LandingFooter />
      <Assistant />
    </div>
  );
}
