'use client';

import React from 'react';
import { CloudLightning, Navigation2, Ship, Flame, DollarSign, MessageSquare, CheckCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface TelemetrySource {
  name: string;
  category: string;
  icon: React.ElementType;
  status: string;
  statusColor: string;
  detail: string;
  value: string;
}

const SOURCES: TelemetrySource[] = [
  {
    name: 'BMKG Indonesia',
    category: 'WEATHER & SEISMIC',
    icon: CloudLightning,
    status: 'HEALTHY (100%)',
    statusColor: 'text-emerald-400',
    detail: 'North Sumatra Regional Alert & Flood Inundation Polygons',
    value: '60s Polling',
  },
  {
    name: 'TomTom Traffic API',
    category: 'ROAD CONGESTION',
    icon: Navigation2,
    status: 'ACTIVE FLOW',
    statusColor: 'text-cyan-400',
    detail: 'Trans-Sumatra Highway Segment Traffic Speed & Incident Feed',
    value: 'Real-time Flow',
  },
  {
    name: 'AISstream.io Maritime',
    category: 'PORT & VESSEL QUEUE',
    icon: Ship,
    status: 'CONNECTED',
    statusColor: 'text-emerald-400',
    detail: 'Belawan International Port Vessel Queue Depth & AIS Tracking',
    value: 'WebSocket Streaming',
  },
  {
    name: 'NASA FIRMS',
    category: 'THERMAL ANOMALY',
    icon: Flame,
    status: 'SATELLITE ACTIVE',
    statusColor: 'text-amber-400',
    detail: 'Active Fire Hotspot GeoJSON Polygons & Infrared Signatures',
    value: 'MODIS / VIIRS Data',
  },
  {
    name: 'PIHPS Nasional',
    category: 'COMMODITY PRICES',
    icon: DollarSign,
    status: 'DAILY INGESTED',
    statusColor: 'text-cyan-400',
    detail: 'Cooking Oil, Chili, Rice, Shallot Strategic Commodity Baseline',
    value: 'Daily Ingestion',
  },
  {
    name: 'Lightpanda OSINT',
    category: 'SOCIAL DISRUPTION',
    icon: MessageSquare,
    status: 'LIVE STREAM',
    statusColor: 'text-purple-400',
    detail: 'Social Media & Citizen Ground Truth Report NER Extractor',
    value: 'NER Geo-Parser',
  },
];

export default function LiveTelemetryShowcase() {
  return (
    <section className="relative w-full bg-[#080d14] py-24 px-4 md:px-8 border-t border-white/10">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10 text-xs font-mono text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>MULTI-SENSOR DATA FUSION</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              Powered by real-time national
              <span className="bg-emerald-400 text-slate-950 px-3 py-0.5 mx-2 rounded-full font-black inline-block transform rotate-1">
                data
              </span>
              streams.
            </h2>
            <p className="text-slate-400 text-base md:text-lg">
              PetaNadi tidak menggunakan data buatan tunggal. Setiap sinyal anomali diverifikasi silang dari enam penyedia data terpercaya secara bersamaan.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/15 text-white text-sm font-semibold hover:bg-white/10 hover:border-white/30 transition-all cursor-pointer group shrink-0"
          >
            <span>View Live Dashboard Telemetry</span>
            <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Telemetry Sources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SOURCES.map((source, idx) => {
            const Icon = source.icon;
            return (
              <div
                key={idx}
                className="group p-6 rounded-2xl backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10 hover:border-cyan-400/40 transition-all cursor-pointer flex flex-col justify-between gap-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-xs font-mono font-bold ${source.statusColor}`}>
                    ● {source.status}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-mono text-slate-500 tracking-wider">
                    {source.category}
                  </span>
                  <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">
                    {source.name}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {source.detail}
                  </p>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Frequency</span>
                  <span className="text-slate-200 font-semibold">{source.value}</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
