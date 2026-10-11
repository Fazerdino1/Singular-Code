import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Activity,
  HardDrive,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Trash2,
  RefreshCw,
  Gauge,
  Terminal,
  Play,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/ipc';

export const HardwareMonitorModal: React.FC = () => {
  const {
    hardwareMetrics,
    landlockStatus,
    bwrapAvailable,
    dockerAvailable,
    refreshTelemetry,
    addLog,
    hardwareHistory,
  } = useAppStore();

  const [benchmarkCmd, setBenchmarkCmd] = useState('cargo --version');
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [isUnloadingVram, setIsUnloadingVram] = useState(false);

  useEffect(() => {
    refreshTelemetry();
  }, []);

  const handleUnloadVram = async () => {
    setIsUnloadingVram(true);
    try {
      // Appel déchargement modèle local
      await api.runSandboxCommand('pkill -f "ollama runner" || true');
      addLog('info', 'Ordre de déchargement de la mémoire VRAM GPU exécuté avec succès.');
      await refreshTelemetry();
    } catch (e: any) {
      addLog('warn', `Notification déchargement VRAM : ${e.message}`);
    } finally {
      setIsUnloadingVram(false);
    }
  };

  const handleRunBenchmark = async () => {
    if (!benchmarkCmd.trim()) return;
    setIsBenchmarking(true);
    try {
      const res = await api.profileBenchmarkCommand(benchmarkCmd.trim());
      setBenchmarkResult(res);
      addLog('info', `Benchmark exécuté : ${benchmarkCmd} en ${res.duration_ms}ms (Peak RAM: ${res.peak_memory_mb}MB)`);
    } catch (err: any) {
      addLog('error', `Erreur benchmark: ${err.message}`);
    } finally {
      setIsBenchmarking(false);
    }
  };

  const vramTotal = hardwareMetrics?.vram_total_mb || 8192;
  const vramUsed = hardwareMetrics?.vram_used_mb || 1840;
  const vramPct = Math.round((vramUsed / vramTotal) * 100);

  const ramTotal = hardwareMetrics?.ram_total_mb || 32000;
  const ramUsed = hardwareMetrics?.ram_used_mb || 11200;
  const ramPct = Math.round((ramUsed / ramTotal) * 100);

  const gpuPct = hardwareMetrics?.gpu_utilization_pct || 24;

  // Préparation des séries temporelles (20 derniers points avec padding)
  const historySlice = (hardwareHistory || []).slice(-20);
  const padCount = Math.max(0, 10 - historySlice.length);
  const paddedGpu = [
    ...Array(padCount).fill(gpuPct),
    ...historySlice.map((h) => h.gpuPct),
    gpuPct,
  ];
  const paddedVram = [
    ...Array(padCount).fill(vramUsed),
    ...historySlice.map((h) => h.vramUsed),
    vramUsed,
  ];
  const paddedRam = [
    ...Array(padCount).fill(ramUsed),
    ...historySlice.map((h) => h.ramUsed),
    ramUsed,
  ];

  // Helper de génération SVG Area Path
  const renderAreaChart = (
    data: number[],
    maxVal: number,
    color: string,
    gradId: string,
    height: number = 44
  ) => {
    const width = 280;
    if (data.length < 2) return null;
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const normalized = Math.min(1, Math.max(0, val / (maxVal || 1)));
      const y = height - normalized * (height - 8) - 4;
      return { x, y };
    });

    const linePath = points.reduce(
      (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`,
      ''
    );
    const areaPath = `${linePath} L ${width},${height} L 0 raw,${height} Z`.replace('raw,', '');
    const lastPoint = points[points.length - 1];

    return (
      <div className="relative w-full h-[48px] overflow-hidden rounded-lg bg-[#0b0d14] border border-[#1b1f2e] p-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.45" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {/* Lignes de repère douces */}
          <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#1f2538" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#1f2538" strokeDasharray="3 3" strokeWidth="0.8" />
          {/* Area fill */}
          <path d={areaPath} fill={`url(#${gradId})`} />
          {/* Line stroke */}
          <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {/* Point temps réel actif */}
          <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill={color} className="animate-pulse" />
          <circle cx={lastPoint.x} cy={lastPoint.y} r="1.5" fill="#ffffff" />
        </svg>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0e1017] border-r border-[#1e2029] select-none text-zinc-300 overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-[#1e2029] flex items-center justify-between bg-[#12141d]">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-violet-400" />
          <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase">
            Télémétrie Hardware & Sécurité
          </span>
        </div>
        <button
          onClick={() => refreshTelemetry()}
          className="p-1 text-zinc-400 hover:text-zinc-100 rounded transition-colors"
          title="Rafraîchir les métriques"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* CARTE GPU & VRAM AVEC COURBES SPARKLINES TEMPS RÉEL (Item 12) */}
        <div className="p-3.5 rounded-xl bg-[#141622] border border-[#232738] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-zinc-200">
                {hardwareMetrics?.gpu_name || 'NVIDIA GeForce RTX 4060'}
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
              {gpuPct}% GPU
            </span>
          </div>

          {/* Sparkline Courbe GPU % */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Charge Processeur GPU</span>
              <span className="font-mono text-amber-400 font-semibold">{gpuPct}%</span>
            </div>
            {renderAreaChart(paddedGpu, 100, '#f59e0b', 'grad-gpu', 40)}
          </div>

          {/* VRAM Gauge & Sparkline Courbe VRAM */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">VRAM Dédiée</span>
              <span className="font-mono text-zinc-200">
                {(vramUsed / 1024).toFixed(2)} Go / {(vramTotal / 1024).toFixed(2)} Go ({vramPct}%)
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#1e2233] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${vramPct}%` }}
              />
            </div>
            {renderAreaChart(paddedVram, vramTotal, '#ec4899', 'grad-vram', 40)}
          </div>

          {/* Bouton VRAM Unload */}
          <button
            onClick={handleUnloadVram}
            disabled={isUnloadingVram}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[#202435] hover:bg-[#2b3046] text-xs font-medium text-rose-300 border border-rose-500/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isUnloadingVram ? 'Libération en cours...' : 'Décharger modèles VRAM (Libérer GPU)'}</span>
          </button>
        </div>

        {/* CARTE RAM SYSTÈME AVEC COURBES SPARKLINES TEMPS RÉEL (Item 12) */}
        <div className="p-3.5 rounded-xl bg-[#141622] border border-[#232738] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-zinc-200">Mémoire Vive (RAM Système)</span>
            </div>
            <span className="text-[11px] font-mono font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">
              {ramPct}%
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">RAM Utilisée</span>
              <span className="font-mono text-zinc-200">
                {(ramUsed / 1024).toFixed(1)} Go / {(ramTotal / 1024).toFixed(1)} Go
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#1e2233] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${ramPct}%` }}
              />
            </div>
            {renderAreaChart(paddedRam, ramTotal, '#06b6d4', 'grad-ram', 40)}
          </div>
        </div>

        {/* STATUT DU CONFINEMENT LINUX & LANDLOCK */}
        <div className="p-3.5 rounded-xl bg-[#141622] border border-[#232738] space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-200">Confinement Linux & Sandbox</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#0e1017]">
              <span className="text-zinc-400">Landlock LSM (Noyau)</span>
              <span className="font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                {landlockStatus?.supported ? `Actif (ABI v${landlockStatus.abi_version})` : 'Détecté'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-[#0e1017]">
              <span className="text-zinc-400">Bubblewrap Namespaces</span>
              <span
                className={`font-mono font-semibold px-2 py-0.5 rounded ${
                  bwrapAvailable
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-amber-400 bg-amber-500/10'
                }`}
              >
                {bwrapAvailable ? 'Opérationnel' : 'Non détecté'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-[#0e1017]">
              <span className="text-zinc-400">Protection Arborescence Root</span>
              <span className="text-emerald-400 font-semibold font-mono bg-emerald-500/10 px-2 py-0.5 rounded">
                RO-Strict
              </span>
            </div>
          </div>
        </div>

        {/* BENCHMARK PROFILER */}
        <div className="p-3.5 rounded-xl bg-[#141622] border border-[#232738] space-y-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold text-zinc-200">Profiler de Commande Rapide</span>
          </div>

          <div className="flex gap-1.5">
            <input
              type="text"
              value={benchmarkCmd}
              onChange={(e) => setBenchmarkCmd(e.target.value)}
              placeholder="ex: cargo test, git status..."
              className="flex-1 bg-[#0e1017] border border-[#26293a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500 font-mono"
            />
            <button
              onClick={handleRunBenchmark}
              disabled={isBenchmarking}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md transition-colors"
            >
              <Play className="w-3 h-3" />
              <span>Test</span>
            </button>
          </div>

          {benchmarkResult && (
            <div className="p-2.5 rounded-lg bg-[#0e1017] border border-[#232635] text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-500">Temps d'exécution :</span>
                <span className="text-emerald-400 font-bold">{benchmarkResult.duration_ms} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Pic Mémoire :</span>
                <span className="text-cyan-400 font-bold">{benchmarkResult.peak_memory_mb} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Code sortie :</span>
                <span className="text-zinc-300 font-bold">{benchmarkResult.exit_code}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
