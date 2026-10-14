"use client";

import "./landing.css";
import { Hero } from "./Hero";
import { Intro, INTRO_BOOT } from "./Intro";
import { ProductShowcase } from "./ProductShowcase";
import { Downloads } from "./Downloads";
import { Assistant } from "./Assistant";
import { LandingHeader } from "./LandingHeader";
import { Story } from "./Story";
import { HorizontalFeatures } from "./HorizontalFeatures";
import { IsoJourney } from "./IsoJourney";
import { ScrollMotion } from "./ScrollMotion";
import { DemoSection, FAQ, FinalCTA, Honesty, Industries, LandingFooter, Pricing } from "./Sections";

export function Landing() {
  return (
    <div className="landing">
      {/* entscheidet vor dem Hydrieren, ob das Intro läuft (einmal je Sitzung); ohne JS bleibt alles sichtbar */}
      <script dangerouslySetInnerHTML={{ __html: INTRO_BOOT }} />
      <Intro />
      <LandingHeader />
      <main id="inhalt">
        <Hero />
        <ProductShowcase />
        <Downloads />
        <IsoJourney />
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
      <Assistant />
      <ScrollMotion />
    </div>
  );
}
