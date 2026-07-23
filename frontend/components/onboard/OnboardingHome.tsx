'use client';

import React from 'react';
import OnboardNav from './OnboardNav';
import OnboardHero from './OnboardHero';
import ImageSequenceCanvas from './ImageSequenceCanvas';
import InteractiveDemoShowcase from './InteractiveDemoShowcase';
import KineticFeatureGrid from './KineticFeatureGrid';
import LiveTelemetryShowcase from './LiveTelemetryShowcase';
import OnboardFooter from './OnboardFooter';

export default function OnboardingHome() {
  return (
    <main className="w-full min-h-screen bg-[#080d14] text-slate-100 selection:bg-cyan-500 selection:text-slate-950">
      <OnboardNav />
      <OnboardHero />

      {/* 121-Frame Scroll-Driven Image Sequence Section */}
      <section id="sequence">
        <ImageSequenceCanvas />
      </section>

      {/* Interactive Module Showcase Tabs Section */}
      <InteractiveDemoShowcase />

      {/* Kinetic Features Grid Section */}
      <section id="features">
        <KineticFeatureGrid />
      </section>

      {/* Live Telemetry Showcase Section */}
      <section id="telemetry">
        <LiveTelemetryShowcase />
      </section>

      <OnboardFooter />
    </main>
  );
}
