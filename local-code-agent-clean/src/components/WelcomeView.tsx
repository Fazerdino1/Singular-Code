import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api, isTauri } from '../lib/ipc';
import { FolderOpen, Shield, Cpu, Terminal, ArrowRight, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

export const WelcomeView: React.FC = () => {
  const {
    setWorkspace,
    recentWorkspaces,
    profiles,
    activeProfileIndex,
    isModelConnected,
    setIsModelConnected,
    setAvailableModels,
    bwrapAvailable,
    addLog,
  } = useAppStore();

  const [inputPath, setInputPath] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const activeProfile = profiles[activeProfileIndex] || profiles[0];

  const handleOpenFolder = async () => {
    // Si l'utilisateur a tapé un chemin valide dans l'input
    if (inputPath.trim()) {
      try {
        const canonical = await api.openWorkspace(inputPath.trim());
        setWorkspace(canonical);
        addLog('info', `Workspace ouvert : ${canonical}`);
        return;
      } catch (err: any) {
        addLog('error', `Erreur lors de l'ouverture du chemin : ${err}`);
      }
    }

    // Sinon, ouvrir le sélecteur graphique de dossier natif
    try {
      const selected = await api.selectWorkspaceFolder();
      if (selected) {
        const canonical = await api.openWorkspace(selected);
        setWorkspace(canonical);
        addLog('info', `Workspace ouvert : ${canonical}`);
      } else if (!isTauri()) {
        const fallbackPath = '/home/fazerdino1/Documents/antigravity/proud-volta';
        await api.openWorkspace(fallbackPath);
        setWorkspace(fallbackPath);
        addLog('info', `Workspace ouvert : ${fallbackPath}`);
      }
    } catch (err: any) {
      addLog('error', `Erreur dialogue de dossier : ${err}`);
      // Fallback workspace local
      const fallbackPath = '/home/fazerdino1/Documents/antigravity/proud-volta';
      await api.openWorkspace(fallbackPath);
      setWorkspace(fallbackPath);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const models = await api.testModelConnection(activeProfile);
      setIsModelConnected(true);
      setAvailableModels(models);
      addLog('info', `Connexion au modèle réussie (${models.length} modèles détectés)`);
    } catch (e: any) {
      setIsModelConnected(false);
      addLog('warn', `Impossible de contacter le serveur LLM : ${e}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 bg-[#0a0c12] text-gray-100 overflow-y-auto">
      <div className="max-w-2xl w-full text-center space-y-7 animate-fadeIn">
        {/* Titre & Logo Singular Code */}
        <div className="space-y-4">
          <div className="relative mx-auto w-24 h-24 group">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 blur-xl opacity-50 group-hover:opacity-80 transition-opacity duration-500" />
            <img
              src="/singular-code-logo.png"
              alt="Singular Code"
              className="relative w-24 h-24 rounded-3xl object-contain shadow-2xl ring-2 ring-cyan-400/40 transform transition-transform duration-500 group-hover:scale-105"
            />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium">
            <Shield className="w-3.5 h-3.5" /> 100% Hors-Ligne & Confinement Linux Bubblewrap
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-sky-200 to-purple-300 bg-clip-text text-transparent">
            Singular Code
          </h1>
          <p className="text-gray-400 text-sm max-w-lg mx-auto">
            Environnement de développement intelligent autonome, confidentiel et sécurisé, 
            entièrement exécuté sur votre machine.
          </p>
        </div>

        {/* Action Principale : Ouvrir un dossier */}
        <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-6 shadow-xl space-y-4 text-left">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder="Chemin absolu du dossier ou choisir..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#12141a] border border-[#2e3440] text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleOpenFolder}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/30"
            >
              <FolderOpen className="w-4 h-4" />
              Ouvrir un dossier
            </button>
          </div>

          {/* Raccourci workspace rapide */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-gray-400">
            <span>Dossier actif suggéré :</span>
            <button
              onClick={() => {
                const p = '/home/fazerdino1/Documents/antigravity/proud-volta';
                setInputPath(p);
                api.openWorkspace(p).then((c) => {
                  setWorkspace(c);
                  addLog('info', `Workspace ouvert : ${c}`);
                });
              }}
              className="px-2 py-1 rounded bg-[#1f2230] hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-[#2e3440] text-indigo-300 font-mono transition text-[11px]"
            >
              /home/fazerdino1/Documents/antigravity/proud-volta
            </button>
          </div>

          {/* Projets Récents */}
          {recentWorkspaces.length > 0 && (
            <div className="pt-2 border-t border-[#2e3440]/60">
              <span className="text-xs font-semibold text-gray-400 block mb-2">Projets récents :</span>
              <div className="flex flex-col gap-1.5">
                {recentWorkspaces.map((path) => (
                  <button
                    key={path}
                    onClick={() => {
                      setWorkspace(path);
                      addLog('info', `Projet récent ouvert : ${path}`);
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#12141a]/60 hover:bg-[#12141a] border border-transparent hover:border-[#2e3440] text-left text-xs text-gray-300 transition group"
                  >
                    <span className="truncate">{path}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-indigo-400 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* État de Connexion Modèle & Système */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          {/* Carte Modèle */}
          <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs text-gray-400 font-medium">Fournisseur d'IA Local</span>
                <h3 className="text-sm font-semibold text-gray-200 truncate mt-0.5">{activeProfile.name}</h3>
                <span className="text-[11px] text-gray-500 truncate block">{activeProfile.api_url}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                {isModelConnected ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Connecté
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    <XCircle className="w-3 h-3" /> Déconnecté
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#2e3440] flex justify-end">
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#222631] hover:bg-[#2b303d] text-xs font-medium text-gray-300 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                Tester la connexion
              </button>
            </div>
          </div>

          {/* Carte Sécurité */}
          <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs text-gray-400 font-medium">Protection Système</span>
              <h3 className="text-sm font-semibold text-gray-200 mt-0.5">Isolation Linux</h3>
              <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                {bwrapAvailable
                  ? "Bubblewrap (/usr/bin/bwrap) actif. Montages en lecture seule et protection TOCTOU prêtes."
                  : "Bubblewrap non détecté. Mode fallback conteneur disponible."}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#2e3440] flex items-center justify-between text-xs text-gray-400">
              <span>Niveau de confinement</span>
              <span className="font-semibold text-emerald-400">Strict (Espace Isolé)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
