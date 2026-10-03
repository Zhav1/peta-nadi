'use client';
import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, SkipForward, Pause, Play, RotateCcw } from 'lucide-react';
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
        <div className="w-16 h-16 rounded-full bg-[#0c1017] border border-[#1c2432] flex items-center justify-center mb-6 shadow-xl">
          <img src="/logo_prehub.png" alt="PreHub Logo" className="w-9 h-9 object-contain" />
        </div>
        <h1 className="text-xl font-bold mb-2">PreHub Presenter Remote</h1>
        <p className="text-sm text-slate-400 max-w-xs mb-8">
          Control the dashboard directly from your phone. Ensure you have the dashboard open on desktop first.
        </p>
        <button
          onClick={handleStartDemo}
          className="w-full max-w-xs py-3 rounded-md font-semibold bg-white hover:bg-slate-200 text-[#080d14] transition-colors shadow-sm cursor-pointer text-sm"
        >
          Start New Demo Run
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080d14] text-slate-100 flex flex-col p-6 select-none justify-between">
      {/* Top Bar */}
      <div className="text-center py-4 border-b border-[#1c2432]">
        <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
          Presenter Remote Control
        </span>
        <div className="text-xs text-slate-400 font-mono mt-1">ID: {crisisId}</div>
      </div>

      {/* Main Control Panel */}
      <div className="flex-1 flex flex-col items-center justify-center py-10 gap-6">
        <div className="text-center">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Current Stage
          </span>
          <h2 className="text-2xl font-bold text-slate-100 px-4 font-sans">
            {stageName}
          </h2>
          <span className="text-xs text-slate-300 font-mono font-medium block mt-2">
            Stage {stage + 1} of 5
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-xs bg-[#0c1017] border border-[#1c2432] h-2 rounded-full overflow-hidden">
          <div
            className="bg-white h-full rounded-full transition-all duration-300"
            style={{ width: `${((stage + 1) / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col gap-3 pb-8">
        {stage < 4 ? (
          <button
            onClick={handleNextStep}
            className="w-full py-3.5 rounded-md text-sm font-semibold bg-white hover:bg-slate-200 text-[#080d14] transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <SkipForward className="w-4 h-4 text-[#080d14]" />
            <span>Next Step</span>
          </button>
        ) : (
          <div className="w-full py-3.5 text-center border border-emerald-500/20 bg-emerald-500/10 rounded-md text-emerald-400 font-semibold text-sm flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Demo Run Completed</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setIsAuto((prev) => !prev)}
            className={`flex-1 py-3 rounded-md text-xs font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              isAuto
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'border-[#1c2432] bg-[#121822] text-slate-300 hover:text-white'
            }`}
          >
            {isAuto ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause Auto</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Auto Advance</span>
              </>
            )}
          </button>

          <button
            onClick={handleRestart}
            className="flex-1 py-3 rounded-md text-xs font-semibold border border-[#1c2432] bg-[#121822] text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restart Demo</span>
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
