import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/ipc';
import {
  Search,
  FolderOpen,
  Cpu,
  Shield,
  Settings,
  Trash2,
  FilePlus,
  Undo2,
  FileCode,
  Code2,
  Play,
  RotateCcw,
  Sparkles,
  GitBranch,
  Terminal,
  ExternalLink,
} from 'lucide-react';

interface PaletteItem {
  id: string;
  category: 'action' | 'file' | 'symbol';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  run: () => void | Promise<void>;
}

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setSettingsOpen,
    setApprovalMode,
    setSandboxType,
    files,
    openFile,
    workspaceSymbols,
    fetchWorkspaceSymbols,
    lastTransaction,
    rollbackLastTransaction,
    addLog,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'files' | 'symbols' | 'actions'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Charger les symboles à l'ouverture
  useEffect(() => {
    if (isCommandPaletteOpen) {
      fetchWorkspaceSymbols();
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  // Raccourcis universels : Ctrl+P (fichiers), Cmd+K / Ctrl+K (tout), Ctrl+Shift+P (actions)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setActiveTab('actions');
        setCommandPaletteOpen(true);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setActiveTab('files');
        setCommandPaletteOpen(true);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActiveTab('all');
        setCommandPaletteOpen(true);
      } else if (e.key === 'Escape' && isCommandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen]);

  // Actions globales de l'environnement
  const actions: PaletteItem[] = useMemo(() => [
    {
      id: 'action-test-repair',
      category: 'action',
      title: 'Lancer les tests avec Auto-Réparation TDD (Item 1)',
      subtitle: 'Exécute la suite de tests et active la boucle d\'auto-réparation en cas d\'échec',
      icon: <Play className="w-4 h-4 text-emerald-400" />,
      run: async () => {
        addLog('info', '🧪 Lancement des tests avec validation en boucle fermée...');
        setCommandPaletteOpen(false);
        try {
          const res = await api.runTestSuiteAndAutoRepair();
          if (res.passed) {
            addLog('info', '✅ Tests validés à 100%');
          } else {
            addLog('error', `❌ Échec des tests : ${res.stderr || res.stdout}`);
          }
        } catch (e: any) {
          addLog('error', `Erreur suite de tests : ${e.message || e}`);
        }
      },
    },
    {
      id: 'action-rollback-last',
      category: 'action',
      title: lastTransaction
        ? `Rollback Transaction : Annuler modifications (${lastTransaction.modified_files.length} fichiers)`
        : 'Rollback Transaction (Aucune transaction récente)',
      subtitle: 'Restaure l\'état exact des fichiers d\'avant la dernière opération (Item 2)',
      icon: <RotateCcw className="w-4 h-4 text-amber-400" />,
      run: async () => {
        setCommandPaletteOpen(false);
        await rollbackLastTransaction();
      },
    },
    {
      id: 'action-mode-code',
      category: 'action',
      title: 'Passer en mode : Code (Édition directe & création de fichiers)',
      subtitle: 'Création et modification immédiate des fichiers sur le disque',
      icon: <Shield className="w-4 h-4 text-sky-400" />,
      run: () => {
        setApprovalMode('code');
        addLog('info', 'Mode Code activé');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'action-mode-architect',
      category: 'action',
      title: 'Passer en mode : Architect (Conception & Plan d\'action)',
      subtitle: 'Planification détaillée avant écriture concrète',
      icon: <Shield className="w-4 h-4 text-indigo-400" />,
      run: () => {
        setApprovalMode('architect');
        addLog('info', 'Mode Architect activé');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'action-mode-debug',
      category: 'action',
      title: 'Passer en mode : Debug (Diagnostic & correction de bugs)',
      subtitle: 'Analyse des logs et réparation ciblée des fichiers',
      icon: <Shield className="w-4 h-4 text-purple-400" />,
      run: () => {
        setApprovalMode('debug');
        addLog('info', 'Mode Debug activé');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'action-mode-yolo',
      category: 'action',
      title: 'Passer en mode : YOLO (Autonomie maximale)',
      subtitle: 'Exécution continue sans interruption',
      icon: <Shield className="w-4 h-4 text-rose-400" />,
      run: () => {
        setApprovalMode('yolo');
        addLog('info', 'Mode YOLO activé');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'action-skills',
      category: 'action',
      title: 'Gérer les Compétences de l\'Agent (Skills Manager)',
      subtitle: 'Activer ou configurer les modules de compétences',
      icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
      run: () => {
        useAppStore.getState().setSkillsOpen(true);
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'action-clear-chat',
      category: 'action',
      title: 'Effacer l\'historique du chat (/clear)',
      subtitle: 'Réinitialise les messages de la conversation active',
      icon: <Trash2 className="w-4 h-4 text-zinc-400" />,
      run: () => {
        useAppStore.setState({ messages: [] });
        addLog('info', 'Historique du chat effacé');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'action-settings',
      category: 'action',
      title: 'Ouvrir les Paramètres complets',
      subtitle: 'Configuration modèles, contextes, GPU et sécurité',
      icon: <Settings className="w-4 h-4 text-zinc-400" />,
      run: () => {
        setCommandPaletteOpen(false);
        setSettingsOpen(true);
      },
    },
  ], [lastTransaction]);

  // Fichiers du workspace convertis en items de palette
  const fileItems: PaletteItem[] = useMemo(() => {
    return files
      .filter((f) => !f.is_dir)
      .map((f) => ({
        id: `file-${f.path}`,
        category: 'file' as const,
        title: f.name,
        subtitle: f.path,
        icon: <FileCode className="w-4 h-4 text-indigo-400" />,
        run: () => {
          openFile(f.path);
          setCommandPaletteOpen(false);
        },
      }));
  }, [files]);

  // Symboles AST du workspace
  const symbolItems: PaletteItem[] = useMemo(() => {
    return workspaceSymbols.map((s, idx) => ({
      id: `symbol-${s.file_path}-${s.name}-${idx}`,
      category: 'symbol' as const,
      title: `${s.name} (${s.kind})`,
      subtitle: `${s.file_path} : ligne ${s.line_number}`,
      icon: <Code2 className="w-4 h-4 text-cyan-400" />,
      run: () => {
        openFile(String(s.file_path));
        setCommandPaletteOpen(false);
      },
    }));
  }, [workspaceSymbols]);

  // Filtrage combiné selon l'onglet et la recherche
  const allItems = useMemo(() => {
    let pool: PaletteItem[] = [];
    if (activeTab === 'all') {
      pool = [...actions, ...fileItems, ...symbolItems];
    } else if (activeTab === 'files') {
      pool = fileItems;
    } else if (activeTab === 'symbols') {
      pool = symbolItems;
    } else if (activeTab === 'actions') {
      pool = actions;
    }

    if (!query.trim()) return pool.slice(0, 50);

    const q = query.toLowerCase().trim();
    return pool
      .filter((item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [actions, fileItems, symbolItems, activeTab, query]);

  // Gestion des touches clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < allItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].run();
      }
    }
  };

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="bg-[#12141f] border border-[#2b3046] rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden text-zinc-200 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Champ de recherche */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#23283b] bg-[#171a29]">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTab === 'files'
                ? "Rechercher un fichier dans le workspace (ex: App.tsx)..."
                : activeTab === 'symbols'
                ? "Rechercher une fonction, classe ou struct AST..."
                : "Tapez une commande, un fichier ou un symbole..."
            }
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-medium"
          />
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/60 font-mono">
            ESC
          </span>
        </div>

        {/* Filtres par onglets */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#23283b] bg-[#141624] text-[11px]">
          {(['all', 'files', 'symbols', 'actions'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSelectedIndex(0);
              }}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              {tab === 'all' && `Tout (${actions.length + fileItems.length + symbolItems.length})`}
              {tab === 'files' && `Fichiers (${fileItems.length})`}
              {tab === 'symbols' && `Symboles AST (${symbolItems.length})`}
              {tab === 'actions' && `Actions (${actions.length})`}
            </button>
          ))}
        </div>

        {/* Liste des résultats */}
        <div className="overflow-y-auto p-2 space-y-1 divide-y divide-zinc-800/30 flex-1">
          {allItems.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">
              Aucun résultat pour "{query}". Essayez un autre terme ou basculez d'onglet.
            </div>
          ) : (
            allItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.run()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-lg'
                      : 'hover:bg-[#1a1d2e] text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold truncate">{item.title}</div>
                      {item.subtitle && (
                        <div
                          className={`text-[10px] truncate ${
                            isSelected ? 'text-indigo-100' : 'text-zinc-500'
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-zinc-800/80 text-zinc-400'
                      }`}
                    >
                      {item.category}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-mono opacity-80">↵</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Raccourcis de pied de page */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#23283b] bg-[#121420] text-[10px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span>↑↓ Naviguer</span>
            <span>↵ Valider</span>
            <span>Esc Fermer</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Ctrl+P Fichiers</span>
            <span>Cmd+K Universel</span>
          </div>
        </div>
      </div>
    </div>
  );
};
