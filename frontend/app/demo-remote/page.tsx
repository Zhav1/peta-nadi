'use client';
import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../lib/api';

function DemoRemoteClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const crisisId = searchParams.get('crisis_id');

  const [stage, setStage] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [stageName, setStageName] = useState<string>('Injecting Events');
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll status from backend to stay in sync
  const pollStatus = useCallback(async (cid: string) => {
    try {
      const statusRes = await api.demo.status(cid);
      setStage(statusRes.stage);
      setStageName(statusRes.stage_name);
      setIsRunning(true);
      if (statusRes.stage >= 4) {
        setIsAuto(false);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  // Sync state on load and set up polling interval
  useEffect(() => {
    if (crisisId) {
      pollStatus(crisisId);
      const interval = setInterval(() => pollStatus(crisisId), 2000);
      return () => clearInterval(interval);
    } else {
      setIsRunning(false);
    }
  }, [crisisId, pollStatus]);

  // Start a new demo run from phone
  const handleStartDemo = async () => {
    try {
      const res = await api.demo.start({ mock_agents: true, offline: true });
      router.push(`/demo-remote?crisis_id=${res.crisis_id}`);
    } catch (err) {
      console.error('Failed to start demo remote:', err);
    }
  };

  // Next step
  const handleNextStep = async () => {
    if (!crisisId) return;
    try {
      const res = await api.demo.advance(crisisId);
      setStage(res.stage);
      setStageName(res.stage_name);
      if (res.stage >= 4) {
        setIsAuto(false);
      }
    } catch (err) {
      console.error('Failed to advance stage:', err);
    }
  };

  // Auto-advance logic
  useEffect(() => {
    if (isAuto && crisisId) {
      autoIntervalRef.current = setInterval(() => {
        setStage((prev) => {
          if (prev < 4) {
            const next = prev + 1;
            api.demo.advance(crisisId).catch(console.error);
            return next;
          } else {
            setIsAuto(false);
            return prev;
          }
        });
      }, 15000);
    } else {
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    }

    return () => {
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    };
  }, [isAuto, crisisId]);

  const handleRestart = async () => {
    if (!crisisId) return;
    try {
      const res = await api.demo.start({ mock_agents: true, offline: true });
      router.push(`/demo-remote?crisis_id=${res.crisis_id}`);
      setIsAuto(false);
    } catch (err) {
      console.error('Failed to restart demo:', err);
    }
  };

  if (!isRunning || !crisisId) {
    return (
      <div className="min-h-screen bg-[#080d14] text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6 shadow-lg shadow-cyan-500/20">
          <img src="/logo_petanadi.png" alt="PetaNadi Logo" className="w-10 h-10 object-contain" />
        </div>
        <h1 className="text-xl font-bold mb-2">PetaNadi Presenter Remote</h1>
        <p className="text-sm text-slate-400 max-w-xs mb-8">
          Control the dashboard directly from your phone. Ensure you have the dashboard open on desktop first.
        </p>
        <button
          onClick={handleStartDemo}
          className="w-full max-w-xs py-4 rounded-xl font-bold bg-cyan-500 text-slate-950 active:scale-95 transition shadow-lg shadow-cyan-500/10"
        >
          Start New Demo Run
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080d14] text-slate-100 flex flex-col p-6 select-none justify-between">
      {/* Top Bar */}
      <div className="text-center py-4 border-b border-slate-900">
        <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
          Presenter Remote Control
        </span>
        <div className="text-xs text-slate-400 font-mono mt-1">ID: {crisisId}</div>
      </div>

      {/* Main Control Panel */}
      <div className="flex-1 flex flex-col items-center justify-center py-10 gap-6">
        <div className="text-center">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
            Current Stage
          </span>
          <h2 className="text-2xl font-black text-slate-100 px-4">
            {stageName}
          </h2>
          <span className="text-xs text-cyan-400 font-bold block mt-2">
            Stage {stage + 1} of 5
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-xs bg-slate-950/80 border border-slate-900 h-3 rounded-full overflow-hidden">
          <div
            className="bg-cyan-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${((stage + 1) / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col gap-3 pb-8">
        {stage < 4 ? (
          <button
            onClick={handleNextStep}
            className="w-full py-5 rounded-2xl text-base font-bold bg-cyan-500 text-slate-950 active:scale-95 hover:bg-cyan-400 transition shadow-lg shadow-cyan-500/15"
          >
            ⏭ Next Step
          </button>
        ) : (
          <div className="w-full py-4 text-center border border-emerald-500/20 bg-emerald-950/10 rounded-2xl text-emerald-400 font-bold text-sm">
            ✓ Demo Run Completed
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setIsAuto((prev) => !prev)}
            className={`flex-1 py-4 rounded-xl text-xs font-bold border transition ${
              isAuto
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'border-slate-800 bg-slate-900/40 text-slate-300 active:scale-95'
            }`}
          >
            {isAuto ? '⏸ Pause Auto' : '▶ Auto Advance'}
          </button>

          <button
            onClick={handleRestart}
            className="flex-1 py-4 rounded-xl text-xs font-bold border border-slate-800 bg-slate-900/40 text-slate-300 active:scale-95 transition"
          >
            ↺ Restart Demo
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DemoRemotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080d14] text-slate-400 flex items-center justify-center font-bold">
        Loading remote...
      </div>
    }>
      <DemoRemoteClient />
    </Suspense>
  );
}
