"use client";

import "./landing.css";
import { Hero } from "./Hero";
import { LandingHeader } from "./LandingHeader";
import { Story } from "./Story";
import { HorizontalFeatures } from "./HorizontalFeatures";
import { DemoSection, FAQ, FinalCTA, Honesty, Industries, LandingFooter, Pricing } from "./Sections";

export function Landing() {
  return (
    <div className="landing">
      <LandingHeader />
      <main id="inhalt">
        <Hero />
        <Story />
        <HorizontalFeatures />
        <Industries />
        <Honesty />
        <DemoSection />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
