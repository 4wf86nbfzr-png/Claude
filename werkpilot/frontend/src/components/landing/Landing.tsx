"use client";

import "./landing.css";
import { Hero } from "./Hero";
import { Downloads } from "./Downloads";
import { Assistant } from "./Assistant";
import { LandingHeader } from "./LandingHeader";
import { Story } from "./Story";
import { HorizontalFeatures } from "./HorizontalFeatures";
import { IsoJourney } from "./IsoJourney";
import { ScrollFilm } from "./ScrollFilm";
import { ScrollMotion } from "./ScrollMotion";
import { DemoSection, FAQ, FinalCTA, Honesty, Industries, LandingFooter, Pricing } from "./Sections";

export function Landing() {
  return (
    <div className="landing">
      <LandingHeader />
      <main id="inhalt">
        <Hero />
        <Downloads />
        <ScrollFilm />
        <Story />
        <HorizontalFeatures />
        <IsoJourney />
        <Industries />
        <Honesty />
        <DemoSection />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <LandingFooter />
      <Assistant />
      <ScrollMotion />
    </div>
  );
}
