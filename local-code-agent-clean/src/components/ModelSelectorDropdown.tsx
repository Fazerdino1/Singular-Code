import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/ipc';
import {
  ChevronRight, Check, Activity, ChevronUp, ChevronDown, RefreshCw,
  BrainCircuit, Zap, Sparkles, Sliders
} from 'lucide-react';

export type ReasoningEffort = 'None' | 'Minimal' | 'Low' | 'Medium' | 'High' | 'Deep' | 'Ultra' | 'Max';

export interface ReasoningLevelInfo {
  id: ReasoningEffort;
  label: string;
  tokens: number;
  description: string;
  temp: number;
  badgeColor: string;
}

export const REASONING_LEVELS: ReasoningLevelInfo[] = [
  { id: 'None', label: 'Désactivé (0 tks)', tokens: 0, description: 'Pensée brute instantanée sans étape de réflexion.', temp: 0.5, badgeColor: 'text-zinc-400 bg-zinc-800/60' },
  { id: 'Minimal', label: 'Micro (512 tks)', tokens: 512, description: 'Micro-vérification ultra-rapide des syntaxes et regex.', temp: 0.35, badgeColor: 'text-sky-400 bg-sky-950/60 border-sky-800/40' },
  { id: 'Low', label: 'Faible (1 024 tks)', tokens: 1024, description: 'Intuition rapide pour les petites fonctions et conversions.', temp: 0.3, badgeColor: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/40' },
  { id: 'Medium', label: 'Équilibré (2 048 tks)', tokens: 2048, description: 'Raisonnement standard équilibrant vitesse et exactitude.', temp: 0.2, badgeColor: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40' },
  { id: 'High', label: 'Élevé (4 096 tks)', tokens: 4096, description: 'Décomposition pas-à-pas et validation des cas limites.', temp: 0.15, badgeColor: 'text-amber-400 bg-amber-950/60 border-amber-800/40' },
  { id: 'Deep', label: 'Profond (8 192 tks)', tokens: 8192, description: 'Analyse en profondeur, refactoring lourd et audit de code.', temp: 0.1, badgeColor: 'text-orange-400 bg-orange-950/60 border-orange-800/40' },
  { id: 'Ultra', label: 'Ultra (16 384 tks)', tokens: 16384, description: 'Architecture globale, algorithmes complexes et simulations.', temp: 0.05, badgeColor: 'text-purple-400 bg-purple-950/60 border-purple-800/40' },
  { id: 'Max', label: 'Maximal (32 768 tks)', tokens: 32768, description: 'Chaîne de pensée exhaustive avec auto-critique approfondie.', temp: 0.0, badgeColor: 'text-rose-400 bg-rose-950/60 border-rose-800/40' },
];

export interface ModelItem {
  id: string;
  name: string;
  family: string;
  size?: string;
  effort: ReasoningEffort;
  badge?: string;
}

export const ModelSelectorDropdown: React.FC = () => {
  const {
    profiles,
    activeProfileIndex,
    setProfiles,
    isModelConnected,
    setIsModelConnected,
    addLog,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const [activeSubmenuModelId, setActiveSubmenuModelId] = useState<string | null>(null);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [submenuTop, setSubmenuTop] = useState<number>(40);
  const [modelList, setModelList] = useState<ModelItem[]>([]);
  const [selectedEffort, setSelectedEffort] = useState<Record<string, ReasoningEffort>>({
    'qwen2.5-coder:7b': 'High',
    'qwen2.5-coder:1.5b': 'Low',
    'gemma4:e4b': 'Medium',
    'granite4.2:8b': 'Medium',
    'ministral-3:14b': 'Deep',
    'qwen3.8:27b': 'Ultra',
    'gemma4:26b': 'High',
    'gemma4:12b': 'Medium',
  });
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentProfile = profiles[activeProfileIndex] || profiles[0];

  // Charger tous les modèles installés localement
  const loadLocalModels = async () => {
    setIsLoadingModels(true);
    try {
      const models = await api.testModelConnection(currentProfile);
      if (models && models.length > 0) {
        setIsModelConnected(true);
        const mapped: ModelItem[] = models.map((m: string) => {
          let badge = undefined;
          if (m.includes('1.5b') || m.includes('mini')) badge = 'Fast';
          else if (m.includes('7b') || m.includes('8b')) badge = 'Recommended';
          else if (m.includes('27b') || m.includes('26b')) badge = 'Heavy';

          return {
            id: m,
            name: m,
            family: m.split(':')[0] || 'LLM',
            effort: selectedEffort[m] || 'Medium',
            badge,
          };
        });
        setModelList(mapped);
      }
    } catch (e) {
      console.warn("Erreur chargement modèles:", e);
      setModelList([
        { id: 'qwen2.5-coder:7b', name: 'qwen2.5-coder:7b', family: 'qwen', effort: 'High', badge: 'Recommended' },
        { id: 'qwen2.5-coder:1.5b', name: 'qwen2.5-coder:1.5b', family: 'qwen', effort: 'Low', badge: 'Fast' },
        { id: 'gemma4:e4b', name: 'gemma4:e4b', family: 'gemma', effort: 'Medium', badge: 'Vision' },
        { id: 'granite4.2:8b', name: 'granite4.2:8b', family: 'granite', effort: 'Medium' },
        { id: 'ministral-3:14b', name: 'ministral-3:14b', family: 'ministral', effort: 'Deep' },
        { id: 'qwen3.8:27b', name: 'qwen3.8:27b', family: 'qwen', effort: 'Ultra' },
      ]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    loadLocalModels();
  }, []);

  // Fermer quand on clique dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveSubmenuModelId(null);
        setExpandedModelId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectModel = (modelId: string) => {
    const effort = selectedEffort[modelId] || 'High';
    const levelInfo = REASONING_LEVELS.find((l) => l.id === effort) || REASONING_LEVELS[4];
    const updatedProfiles = [...profiles];
    updatedProfiles[activeProfileIndex] = {
      ...currentProfile,
      model_id: modelId,
      temperature: levelInfo.temp,
      name: `Local (${modelId})`,
    };
    setProfiles(updatedProfiles);
    addLog('info', `Modèle actif changé : ${modelId} (Réflexion: ${effort} - ${levelInfo.tokens} tks)`);
    setIsOpen(false);
    setActiveSubmenuModelId(null);
    setExpandedModelId(null);
  };

  const handleSelectEffort = (modelId: string, effort: ReasoningEffort) => {
    setSelectedEffort((prev) => ({ ...prev, [modelId]: effort }));
    const levelInfo = REASONING_LEVELS.find((l) => l.id === effort) || REASONING_LEVELS[4];
    const updatedProfiles = [...profiles];
    updatedProfiles[activeProfileIndex] = {
      ...currentProfile,
      model_id: modelId,
      temperature: levelInfo.temp,
      name: `Local (${modelId})`,
    };
    setProfiles(updatedProfiles);
    addLog('info', `Niveau de réflexion pour ${modelId} fixé à ${effort} (${levelInfo.tokens} tks, temp: ${levelInfo.temp})`);
    setActiveSubmenuModelId(null);
    setExpandedModelId(null);
  };

  const openSubmenuForModel = (modelId: string, rowElement: HTMLElement) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (menuContainerRef.current) {
      const parentRect = menuContainerRef.current.getBoundingClientRect();
      const rowRect = rowElement.getBoundingClientRect();
      const offsetTop = rowRect.top - parentRect.top;
      setSubmenuTop(Math.max(4, Math.min(offsetTop, 260)));
    }
    setActiveSubmenuModelId(modelId);
  };

  const currentEffort = selectedEffort[currentProfile.model_id] || 'High';
  const currentLevelInfo = REASONING_LEVELS.find((l) => l.id === currentEffort) || REASONING_LEVELS[4];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Bouton déclencheur avec indicateur modèle et niveau */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setActiveSubmenuModelId(null);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#181a24] hover:bg-[#202434] border border-[#2b3044] text-xs text-gray-200 transition-all shadow-sm hover:border-indigo-500/50"
        title="Changer de modèle LLM et niveau de réflexion"
      >
        <span className={`w-2 h-2 rounded-full ${isModelConnected ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-amber-400 animate-pulse'}`} />
        <span className="font-semibold text-gray-100 max-w-[130px] truncate font-mono text-[11px]">
          {currentProfile.model_id}
        </span>
        <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${currentLevelInfo.badgeColor}`}>
          {currentEffort}
        </span>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>

      {/* Menu principal déroulant avec z-index très élevé pour flotter au-dessus de tout */}
      {isOpen && (
        <div
          ref={menuContainerRef}
          className="absolute right-0 mt-2 w-80 rounded-2xl bg-[#141620]/95 backdrop-blur-xl border border-[#2a2f42] shadow-[0_20px_60px_rgba(0,0,0,0.7)] z-[100] text-gray-200 py-1.5 text-xs animate-in fade-in zoom-in-95 duration-150 ring-1 ring-white/5"
        >
          {/* En-tête */}
          <div className="flex items-center justify-between px-4 py-2 text-gray-400 text-[11px] font-bold border-b border-[#222638] uppercase tracking-wider">
            <div className="flex items-center gap-1.5 text-indigo-300">
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>Modèles & Niveaux de Réflexion</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                loadLocalModels();
              }}
              className="p-1 rounded-md hover:bg-[#202434] text-gray-400 hover:text-white transition"
              title="Actualiser les modèles locaux Ollama / vLLM"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>

          {/* Liste des modèles scrollable */}
          <div className="max-h-72 overflow-y-auto py-1 divide-y divide-[#1e2230]/50">
            {modelList.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-xs">
                Recherche des modèles locaux...
              </div>
            ) : (
              modelList.map((model) => {
                const isCurrent = currentProfile.model_id === model.id;
                const effort = selectedEffort[model.id] || 'High';
                const levelInfo = REASONING_LEVELS.find((l) => l.id === effort) || REASONING_LEVELS[4];
                const isExpanded = expandedModelId === model.id;

                return (
                  <div key={model.id} className="flex flex-col">
                    <div
                      className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition select-none ${
                        isCurrent
                          ? 'bg-indigo-600/20 text-white font-medium border-l-2 border-indigo-400'
                          : 'hover:bg-[#1c1f2c] text-gray-300'
                      }`}
                      onClick={() => handleSelectModel(model.id)}
                    >
                      {/* Nom et Badges */}
                      <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                        <span className="truncate max-w-[130px] font-mono text-[11px] text-white" title={model.name}>
                          {model.name}
                        </span>
                        
                        {/* Bouton cliquable de niveau de réflexion */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedModelId(isExpanded ? null : model.id);
                          }}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition hover:scale-105 ${levelInfo.badgeColor}`}
                          title={`Raisonnement : ${effort} (${levelInfo.tokens} tks). Cliquer pour modifier`}
                        >
                          {effort}
                        </button>

                        {model.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-[#222638] text-gray-400 font-normal">
                            {model.badge}
                          </span>
                        )}
                      </div>

                      {/* Flèche accordéon et coche */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-1">
                        {isCurrent && <Check className="w-3.5 h-3.5 text-indigo-400 font-bold" />}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedModelId(isExpanded ? null : model.id);
                          }}
                          className={`p-1 rounded-md transition hover:bg-[#25293d] ${
                            isExpanded ? 'bg-indigo-600/30 text-indigo-300' : 'text-gray-400'
                          }`}
                          title="Ouvrir la sélection des 8 niveaux de réflexion"
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Grille Accordéon des 8 Niveaux de Réflexion (Intégrée proprement sans risque de chevauchement) */}
                    {isExpanded && (
                      <div className="p-3 bg-[#10121a] border-y border-[#222636] space-y-2 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                          <span className="font-semibold text-indigo-300">Niveaux de Réflexion (8 Paliers) :</span>
                          <span className="font-mono text-gray-500">tokens / budget</span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          {REASONING_LEVELS.map((lvl) => {
                            const isLvlActive = effort === lvl.id;
                            return (
                              <button
                                key={lvl.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectEffort(model.id, lvl.id);
                                }}
                                className={`flex items-center justify-between p-2 rounded-lg border text-left transition ${
                                  isLvlActive
                                    ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-sm ring-1 ring-indigo-400/40'
                                    : 'bg-[#151722] border-[#222636] text-gray-400 hover:text-white hover:bg-[#1c1f2e]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className="font-semibold text-[11px] truncate">{lvl.id}</span>
                                    {isLvlActive && <Check className="w-3 h-3 text-indigo-400 shrink-0" />}
                                  </div>
                                  <span className="text-[9px] font-mono text-gray-500 block truncate">
                                    {lvl.tokens > 0 ? `${lvl.tokens} tks` : 'Direct'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Section Réflexion Active & Budget Tokens */}
          <div className="p-3 bg-[#0f1118] border-t border-[#222638] rounded-b-2xl space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Raisonnement actif :</span>
              </span>
              <span className="font-bold text-white font-mono">
                {currentEffort} ({currentLevelInfo.tokens > 0 ? `${currentLevelInfo.tokens} tokens` : 'Instant'})
              </span>
            </div>
            <p className="text-[10px] text-gray-500 leading-tight">
              {currentLevelInfo.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
