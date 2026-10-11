import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, ApprovalMode } from '../store/useAppStore';
import {
  Shield, Compass, Code, Bug, CheckSquare, Flame, ChevronDown, Check
} from 'lucide-react';

export interface ModeConfig {
  id: ApprovalMode;
  name: string;
  description: string;
  icon: React.ReactNode;
  colorClass: string;
  badgeBg: string;
}

export const MODES: ModeConfig[] = [
  {
    id: 'ask',
    name: 'Ask',
    description: 'Demande confirmation pour chaque action de modification ou commande.',
    icon: <Shield className="w-3.5 h-3.5 text-amber-400" />,
    colorClass: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    badgeBg: 'bg-amber-500',
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Conception et décomposition du plan avant toute modification.',
    icon: <Compass className="w-3.5 h-3.5 text-indigo-400" />,
    colorClass: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10',
    badgeBg: 'bg-indigo-500',
  },
  {
    id: 'code',
    name: 'Code',
    description: 'Édition directe et autonome de fichiers avec exécution shell supervisée.',
    icon: <Code className="w-3.5 h-3.5 text-sky-400" />,
    colorClass: 'text-sky-400 border-sky-500/20 bg-sky-500/10',
    badgeBg: 'bg-sky-500',
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Investigation approfondie des erreurs, des tests et des logs système.',
    icon: <Bug className="w-3.5 h-3.5 text-purple-400" />,
    colorClass: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
    badgeBg: 'bg-purple-500',
  },
  {
    id: 'review',
    name: 'Review',
    description: 'Revue de code, audit des failles de sécurité et génération de diffs.',
    icon: <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />,
    colorClass: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    badgeBg: 'bg-emerald-500',
  },
  {
    id: 'yolo',
    name: 'YOLO',
    description: 'Autonomie totale dans le bac à sable sans aucune interruption.',
    icon: <Flame className="w-3.5 h-3.5 text-rose-400" />,
    colorClass: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
    badgeBg: 'bg-rose-500',
  },
];

export interface ModeSelectorDropdownProps {
  align?: 'left' | 'right';
  compact?: boolean;
}

export const ModeSelectorDropdown: React.FC<ModeSelectorDropdownProps> = ({
  align = 'right',
  compact = false,
}) => {
  const { approvalMode, setApprovalMode, addLog } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeMode = MODES.find((m) => m.id === approvalMode) || MODES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectMode = (mode: ApprovalMode) => {
    setApprovalMode(mode);
    addLog('info', `Mode d'opération sélectionné : ${mode.toUpperCase()}`);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Bouton déclencheur avec badge de mode actif */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all duration-200 shadow-sm hover:brightness-110 active:scale-95 ${activeMode.colorClass}`}
        title={`Mode actif de l'agent : ${activeMode.name} (cliquer pour changer de mode)`}
      >
        <span className="shrink-0">{activeMode.icon}</span>
        <span>Mode : {activeMode.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Menu déroulant des 6 modes - ancré à droite pour ne jamais être coupé */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-2 w-72 rounded-2xl bg-[#14161f]/95 backdrop-blur-xl border border-[#2b3042] shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-[100] overflow-hidden text-gray-200 py-1.5 text-xs animate-in fade-in zoom-in-95 duration-150 ring-1 ring-white/5`}
        >
          <div className="px-3.5 py-2 text-gray-400 text-[10px] font-bold uppercase tracking-wider border-b border-[#222738] flex items-center justify-between">
            <span>Modes d'Opération de l'Agent</span>
            <span className="text-[10px] font-mono text-indigo-400">6 Modes</span>
          </div>

          <div className="py-1 max-h-[360px] overflow-y-auto">
            {MODES.map((mode) => {
              const isCurrent = mode.id === approvalMode;
              return (
                <div
                  key={mode.id}
                  onClick={() => handleSelectMode(mode.id)}
                  className={`flex items-start justify-between px-3.5 py-2.5 cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-indigo-600/20 text-white font-medium border-l-2 border-indigo-400'
                      : 'hover:bg-[#1c1f2e] text-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 p-1 rounded-md bg-[#1d2232] border border-[#2c3245]">
                      {mode.icon}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-xs">{mode.name}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Actif
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 leading-snug mt-0.5">{mode.description}</p>
                    </div>
                  </div>
                  {isCurrent && <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-1 ml-2" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
