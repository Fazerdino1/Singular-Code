import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Shield, Cpu, Activity, Wifi, WifiOff, Volume2, VolumeX, History, Lock, FileSearch } from 'lucide-react';
import { api } from '../lib/ipc';

export const StatusBar: React.FC = () => {
  const {
    profiles,
    activeProfileIndex,
    sandboxType,
    approvalMode,
    isModelConnected,
    allowNetwork,
    messages,
    soundEnabled,
    toggleSound,
    airGappedMode,
    setAirGappedMode,
    setAuditModalOpen,
    setCheckpointModalOpen,
    hardwareHistory,
  } = useAppStore(
    useShallow((s) => ({
      profiles: s.profiles,
      activeProfileIndex: s.activeProfileIndex,
      sandboxType: s.sandboxType,
      approvalMode: s.approvalMode,
      isModelConnected: s.isModelConnected,
      allowNetwork: s.allowNetwork,
      messages: s.messages,
      soundEnabled: s.soundEnabled,
      toggleSound: s.toggleSound,
      airGappedMode: s.airGappedMode,
      setAirGappedMode: s.setAirGappedMode,
      setAuditModalOpen: s.setAuditModalOpen,
      setCheckpointModalOpen: s.setCheckpointModalOpen,
      hardwareHistory: s.hardwareHistory,
    }))
  );

  const [metrics, setMetrics] = useState<{
    gpu_name: string;
    vram_total_mb: number;
    vram_used_mb: number;
    gpu_utilization_pct: number;
    ram_total_mb: number;
    ram_used_mb: number;
  } | null>(null);

  const activeProfile = profiles[activeProfileIndex] || profiles[0];

  useEffect(() => {
    let isMounted = true;
    let timerId: any = null;

    const fetchMetrics = async () => {
      if (document.hidden) return; // Économie d'énergie : ne pas réveiller le GPU si fenêtre masquée
      try {
        const m = await api.getHardwareMetrics();
        if (isMounted) setMetrics(m);
      } catch {}
    };

    const scheduleNext = () => {
      const delay = document.hidden ? 25000 : 3500;
      timerId = setTimeout(async () => {
        if (!isMounted) return;
        await fetchMetrics();
        scheduleNext();
      }, delay);
    };

    fetchMetrics();
    scheduleNext();

    const handleVisibilityChange = () => {
      if (!document.hidden && isMounted) {
        fetchMetrics();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Estimation du nombre de tokens
  const totalChars = messages.reduce((acc, m) => acc + m.content.length, 0);
  const estimatedTokens = Math.round(totalChars / 4);
  const maxTokens = activeProfile.max_tokens || 8192;
  const tokenPercent = Math.min(100, Math.round((estimatedTokens / maxTokens) * 100));

  // VRAM stats
  const vramPercent = metrics && metrics.vram_total_mb > 0
    ? Math.round((metrics.vram_used_mb / metrics.vram_total_mb) * 100)
    : 0;

  // Sparkline Télémetrie VRAM temps réel (Item 12)
  const vramHistory = hardwareHistory?.slice(-12) || [];
  const maxVram = metrics?.vram_total_mb || 8192;
  const sparklinePoints = vramHistory.map((pt, i) => {
    const x = (i / Math.max(1, vramHistory.length - 1)) * 32;
    const y = 10 - Math.min(10, Math.max(1, (pt.vramUsed / maxVram) * 10));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <footer className="flex h-7 items-center justify-between border-t border-[#1c2234] bg-[#07080d] px-3 select-none text-[11px] text-gray-400 overflow-x-auto no-scrollbar gap-2 z-20">
      <div className="flex items-center gap-3 shrink-0">
        {/* Modèle actif */}
        <div className="flex items-center gap-1.5 text-gray-300">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-mono text-[10px]">{activeProfile.model_id}</span>
        </div>

        {/* Métriques Matérielles GPU VRAM & Sparkline (Item 12 & Optimisation VRAM) */}
        {metrics && metrics.vram_total_mb > 0 && (
          <div
            onClick={async () => {
              try {
                const res = await api.unloadLocalModels();
                useAppStore.getState().addLog('info', `🧹 VRAM : ${res}`);
              } catch (e) {
                useAppStore.getState().addLog('error', `Erreur déchargement VRAM : ${e}`);
              }
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#131722] border border-[#1f2638] text-gray-300 font-mono text-[10px] cursor-pointer hover:bg-[#1a2030] hover:border-cyan-500/40 transition group"
            title={`${metrics.gpu_name} - Utilisation GPU : ${metrics.gpu_utilization_pct}%\n💡 Cliquer pour libérer immédiatement la VRAM (décharger les modèles Ollama)`}
          >
            <Activity className="w-3 h-3 text-emerald-400 shrink-0 group-hover:text-cyan-400" />
            <span>VRAM: {metrics.vram_used_mb}MB / {metrics.vram_total_mb}MB</span>

            {/* Sparkline SVG Temps Réel */}
            {vramHistory.length > 1 && (
              <svg className="w-8 h-2.5 shrink-0 overflow-visible" viewBox="0 0 32 10">
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparklinePoints}
                />
                <circle
                  cx={32}
                  cy={10 - Math.min(10, Math.max(1, ((vramHistory[vramHistory.length - 1]?.vramUsed || 0) / maxVram) * 10))}
                  r="1.5"
                  fill="#34d399"
                />
              </svg>
            )}

            <div className="w-8 h-1.5 bg-[#20273a] rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full ${
                  vramPercent > 85 ? 'bg-rose-500' : vramPercent > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${vramPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Sandbox */}
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span className="capitalize">{sandboxType}</span>
        </div>

        {/* Mode d'approbation */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Mode :</span>
          <span className="text-indigo-300 font-semibold uppercase">{approvalMode}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Bouton Journal d'Audit (Item 17) */}
        <button
          onClick={() => setAuditModalOpen(true)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#161a27] text-gray-400 hover:text-purple-300 transition"
          title="Consulter le journal d'audit immuable"
        >
          <FileSearch className="w-3 h-3 text-purple-400" />
          <span>Audit</span>
        </button>

        {/* Bouton Snapshots (Item 20) */}
        <button
          onClick={() => setCheckpointModalOpen(true)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#161a27] text-gray-400 hover:text-amber-300 transition"
          title="Gérer les snapshots et restaurer des fichiers"
        >
          <History className="w-3 h-3 text-amber-400" />
          <span>Snapshots</span>
        </button>

        {/* Mode Air-Gapped (Item 10) */}
        <button
          onClick={() => {
            const next = !airGappedMode;
            setAirGappedMode(next);
            useAppStore.getState().addLog('security', next ? '🛡️ Mode Air-Gapped activé (isolation absolue)' : 'Mode standard');
          }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition ${
            airGappedMode
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 font-semibold'
              : 'hover:bg-[#161a27] text-gray-500'
          }`}
          title="Mode Air-Gapped : Coupe tout réseau, strip les résolveurs DNS et isole complètement le bac à sable"
        >
          <Lock className="w-3 h-3 text-purple-400" />
          <span>Air-Gapped: {airGappedMode ? 'ON' : 'OFF'}</span>
        </button>

        {/* Réseau interactif */}
        <button
          onClick={async () => {
            const next = !allowNetwork;
            useAppStore.getState().setAllowNetwork(next);
            await api.setNetworkAccess(next);
            useAppStore.getState().addLog('info', next ? '🌐 Réseau activé' : '🔒 Réseau sandbox coupé');
          }}
          className="flex items-center gap-1 hover:opacity-80 transition cursor-pointer"
          title="Basculer l'accès Internet"
        >
          {allowNetwork ? (
            <span className="flex items-center gap-1 text-sky-400 font-medium">
              <Wifi className="w-3 h-3" /> Net: On
            </span>
          ) : (
            <span className="flex items-center gap-1 text-gray-500">
              <WifiOff className="w-3 h-3" /> Net: Off
            </span>
          )}
        </button>

        {/* Son (Item 53) */}
        <button
          onClick={toggleSound}
          className="p-1 rounded hover:bg-[#161a27] text-gray-400 hover:text-white transition"
          title={soundEnabled ? 'Retour sonore activé' : 'Retour sonore coupé'}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> : <VolumeX className="w-3.5 h-3.5 text-gray-600" />}
        </button>

        {/* Jauge Contexte */}
        <div className="flex items-center gap-1.5 font-mono">
          <span>{estimatedTokens}/{maxTokens} tks</span>
          <div className="w-14 h-1.5 bg-[#181d2c] rounded-full overflow-hidden">
            <div
              className={`h-full ${
                tokenPercent > 80 ? 'bg-rose-500' : tokenPercent > 50 ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${tokenPercent}%` }}
            />
          </div>
        </div>

        {/* Statut connexion */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isModelConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} />
          <span className={isModelConnected ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
            {isModelConnected ? 'Prêt' : 'Attente'}
          </span>
        </div>
      </div>
    </footer>
  );
};
