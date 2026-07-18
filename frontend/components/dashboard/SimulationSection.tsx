'use client';

import React, { useState } from 'react';

export default function SimulationSection() {
  const [activeAgency, setActiveAgency] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    { sender: 'ai', text: 'Tactical Advisory Engine active. Operational baseline loaded for North Sumatra logistics corridor.' },
    { sender: 'user', text: 'Analyze impact of severe flood delays on the Trans-Sumatra Route.' },
    { sender: 'ai', text: 'ALERT: Flood depth at Demak segment exceeding 80cm. Logistics transit latency projected to spike by +150 minutes. I recommend dispatching a reroute order to the Southern Corridor.' }
  ]);
  const [inputVal, setInputVal] = useState('');

  const handleSend = () => {
    if (!inputVal.trim()) return;
    setMessages(prev => [...prev, { sender: 'user', text: inputVal }]);
    const userQ = inputVal.toLowerCase();
    setInputVal('');

    setTimeout(() => {
      let reply = 'Inference complete. Real-time GraphRAG shows nominal down-stream flow in the selected corridor.';
      if (userQ.includes('flood') || userQ.includes('demak') || userQ.includes('reroute')) {
        reply = 'RECOMMENDATION: Divert 40% of secondary logistics cargo from Belawan corridor to Southern Rail bypass. Projected inflation mitigation: -2.4%.';
      }
      setMessages(prev => [...prev, { sender: 'ai', text: reply }]);
    }, 1000);
  };

  return (
    <div className="w-full h-full grid grid-cols-12 gap-6 overflow-hidden pointer-events-auto">
      {/* Left Column: AI Advisor Chat & Scenario Overview */}
      <section className="col-span-12 lg:col-span-8 flex flex-col min-h-0 gap-6">
        
        {/* Scenario Overview HUD */}
        <div className="grid grid-cols-12 gap-4 shrink-0">
          <div className="col-span-6 bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 p-4 relative overflow-hidden rounded-sm">
            <p className="text-[9px] font-mono text-[#00F0FF] tracking-[0.2em] mb-1">SIMULATION_INSTANCE</p>
            <h1 className="text-lg font-headline font-bold uppercase tracking-tight text-on-surface">Active: Belawan Flash Flood</h1>
            <p className="text-[9px] text-slate-400 font-mono mt-1">LAT: 3.7922° N | LON: 98.6776° E</p>
          </div>
          <div className="col-span-3 bg-[#1e2024]/40 backdrop-blur-xl border border-l-2 border-l-[#ffb950] border-white/10 p-4 rounded-sm">
            <p className="text-[9px] font-mono text-[#ffb950] tracking-[0.2em] mb-1">AFFECTED_UNITS</p>
            <p className="text-2xl font-headline font-black text-on-surface">1,420</p>
            <p className="text-[9px] uppercase tracking-wider text-slate-400">Fleets / Containers</p>
          </div>
          <div className="col-span-3 bg-[#1e2024]/40 backdrop-blur-xl border border-l-2 border-l-red-400 border-white/10 p-4 rounded-sm">
            <p className="text-[9px] font-mono text-red-400 tracking-[0.2em] mb-1">PROJECTED_LOSS</p>
            <p className="text-2xl font-headline font-black text-red-400">IDR 4.2B</p>
            <p className="text-[9px] uppercase tracking-wider text-slate-400">-12.4% System Efficiency</p>
          </div>
        </div>

        {/* AI Conversation log */}
        <div className="flex-1 bg-[#1e2024]/20 border border-white/5 rounded-sm p-4 flex flex-col min-h-0">
          <div className="flex justify-between items-center pb-2 border-b border-white/10 shrink-0">
            <span className="text-[9px] font-headline font-bold uppercase text-[#00F0FF] tracking-wider">Gemini Advise & Mitigation Chat</span>
            <span className="text-[8px] font-mono text-slate-500">LIVE_INFERENCE_ACTIVE</span>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto space-y-3 p-2 my-2 custom-scrollbar text-xs font-light">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 max-w-[85%] rounded-sm ${
                  m.sender === 'user' 
                    ? 'bg-[#00F0FF]/15 text-[#00F0FF] border-r-2 border-[#00F0FF]' 
                    : 'bg-surface-container-high/40 text-slate-200 border-l-2 border-white/20'
                }`}>
                  <p className="font-mono text-[8px] opacity-40 uppercase tracking-widest mb-1">{m.sender === 'user' ? 'OPERATOR' : 'GEMINI_AI'}</p>
                  <p className="leading-relaxed">{m.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <div className="flex gap-2 border-t border-white/10 pt-3 shrink-0">
            <input 
              type="text" 
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask Gemini Advisor for alternative routes or mitigation steps..."
              className="flex-1 bg-[#0c0e12] border border-white/10 px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-[#00F0FF]/50"
            />
            <button 
              onClick={handleSend}
              className="px-4 py-2 bg-[#00F0FF] text-[#00363a] uppercase font-headline font-black text-xs tracking-wider rounded-sm hover:scale-[1.02] active:scale-95 transition-transform"
            >
              Send
            </button>
          </div>
        </div>

      </section>

      {/* Right Column: Agency Orchestration & Reroute Actions */}
      <section className="col-span-12 lg:col-span-4 bg-surface-container/30 backdrop-blur-md border border-white/5 p-6 flex flex-col gap-6 overflow-y-auto no-scrollbar rounded-sm">
        
        {/* Agency Orchestration list */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[#00F0FF] text-sm">account_tree</span>
            <h2 className="font-headline font-bold text-xs uppercase tracking-widest text-[#00F0FF]">Agency Orchestration {activeAgency ? `[${activeAgency}]` : ''}</h2>
          </div>

          <div className="space-y-3">
            {/* BULOG */}
            <div className="bg-[#1e2024]/40 border border-white/10 p-3 rounded-sm relative">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold font-headline uppercase tracking-wider">BULOG</span>
                <span className="text-[8px] text-[#00F0FF] font-mono">READY</span>
              </div>
              <p className="text-[10px] text-slate-400">Food Security & Logistics Management. 480 Storage units available in Sumatra-South.</p>
              <button 
                onClick={() => {
                  setActiveAgency('BULOG');
                  alert('Assigned cargo routing parameters to BULOG depots.');
                }}
                className="mt-2 w-full py-1 bg-surface-container-highest text-[8px] font-bold uppercase tracking-widest hover:bg-[#00F0FF] hover:text-[#00363a] transition-all"
              >
                Assign parameters
              </button>
            </div>

            {/* DISHUB */}
            <div className="bg-[#1e2024]/40 border border-white/10 p-3 rounded-sm relative">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold font-headline uppercase tracking-wider">DISHUB</span>
                <span className="text-[8px] text-[#00F0FF] font-mono">STANDBY</span>
              </div>
              <p className="text-[10px] text-slate-400">Transportation & Infrastructure Control. Real-time traffic diversion active.</p>
              <button 
                onClick={() => {
                  setActiveAgency('DISHUB');
                  alert('Assigned diversion parameters to DISHUB checkpoint arrays.');
                }}
                className="mt-2 w-full py-1 bg-surface-container-highest text-[8px] font-bold uppercase tracking-widest hover:bg-[#00F0FF] hover:text-[#00363a] transition-all"
              >
                Assign parameters
              </button>
            </div>

            {/* BNPB */}
            <div className="bg-[#1e2024]/40 border border-white/10 p-3 rounded-sm relative">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold font-headline uppercase tracking-wider">BNPB</span>
                <span className="text-[8px] text-[#ffb950] font-mono">CRITICAL</span>
              </div>
              <p className="text-[10px] text-slate-400">Disaster Mitigation & Relief. Rescue pooling active for flooded segments.</p>
              <button 
                onClick={() => {
                  setActiveAgency('BNPB');
                  alert('Assigned priority rescue support vectors to BNPB.');
                }}
                className="mt-2 w-full py-1 bg-surface-container-highest text-[8px] font-bold uppercase tracking-widest hover:bg-[#00F0FF] hover:text-[#00363a] transition-all"
              >
                Assign parameters
              </button>
            </div>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="mt-auto border-t border-white/10 pt-4">
          <button 
            onClick={() => alert('Mitigation action plan deployed successfully across all agencies!')}
            className="w-full py-3.5 bg-primary-container text-on-primary font-headline font-black uppercase tracking-[0.15em] hover:scale-[1.02] transition-transform active:scale-95 flex items-center justify-center gap-2 text-xs shadow-[0_0_15px_rgba(0,240,255,0.4)]"
          >
            <span className="material-symbols-outlined text-sm animate-pulse">rocket_launch</span>
            Deploy Unified Action Plan
          </button>
        </div>

      </section>
    </div>
  );
}
