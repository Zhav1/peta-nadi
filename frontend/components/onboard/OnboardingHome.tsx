'use client';

import React from 'react';
import OnboardNav from './OnboardNav';
import OnboardHero from './OnboardHero';
import ImageSequenceCanvas from './ImageSequenceCanvas';
import KineticFeatureGrid from './KineticFeatureGrid';
import LiveTelemetryShowcase from './LiveTelemetryShowcase';
import OnboardFooter from './OnboardFooter';

export default function OnboardingHome() {
  return (
    <main className="w-full min-h-screen bg-[#080d14] text-slate-100 selection:bg-white selection:text-[#080d14]">
      <OnboardNav />
      <OnboardHero />

      {/* 121-Frame Scroll-Driven Operational Narrative */}
      <section id="sequence">
        <ImageSequenceCanvas />
      </section>

      {/* Core Architectural Capabilities */}
      <KineticFeatureGrid />

      {/* Multi-Source National Data Feeds */}
      <LiveTelemetryShowcase />

      <OnboardFooter />
    </main>
  );
}
