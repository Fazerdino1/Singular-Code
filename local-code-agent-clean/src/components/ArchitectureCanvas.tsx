import React, { useState, useMemo } from 'react';
import {
  Workflow,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  FileCode,
  Shield,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
  Search,
  Copy,
  Check,
  Eye,
  GitBranch,
  Code2,
  Play,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface ArchNode {
  id: string;
  label: string;
  category: 'core' | 'security' | 'tools' | 'ui' | 'git' | 'file';
  path?: string;
  x: number;
  y: number;
  description: string;
}

export const ArchitectureCanvas: React.FC = () => {
  const { files, openFile, currentWorkspace } = useAppStore();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null);
  const [activeTab, setActiveTab] = useState<'canvas' | 'mermaid'>('canvas');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  // Noeuds fixes du système Singular Code
  const systemNodes: ArchNode[] = [
    {
      id: 'tauri-core',
      label: 'Tauri 2 Core Backend',
      category: 'core',
      path: 'src-tauri/src/lib.rs',
      x: 100,
      y: 120,
      description: 'Orchestrateur central Rust, IPC handlers, checkpoints atomiques et boucle ReAct.',
    },
    {
      id: 'agent-engine',
      label: 'Agent ReAct Engine',
      category: 'core',
      path: 'src-tauri/src/agent/mod.rs',
      x: 380,
      y: 120,
      description: 'Boucle de raisonnement autonome, mémoire long-terme .localagent/learnings.json et validation de syntaxe.',
    },
    {
      id: 'security-lsm',
      label: 'Linux Security & Landlock',
      category: 'security',
      path: 'src-tauri/src/security/landlock.rs',
      x: 100,
      y: 300,
      description: 'Confinement noyau Landlock LSM ABI v3, validation de chemin et audit immuable SHA-256.',
    },
    {
      id: 'bwrap-sandbox',
      label: 'Bubblewrap Sandbox',
      category: 'security',
      path: 'src-tauri/src/security/sandbox.rs',
      x: 100,
      y: 480,
      description: 'Isolation totale des processus Linux (namespaces PID, NET, IPC, MOUNT).',
    },
    {
      id: 'git-manager',
      label: 'Git Engine CLI',
      category: 'git',
      path: 'src-tauri/src/git/mod.rs',
      x: 380,
      y: 300,
      description: 'Gestion complète Git : status, diff, branches, commits, staging atomique.',
    },
    {
      id: 'tools-registry',
      label: 'Developer Tools Registry',
      category: 'tools',
      path: 'src-tauri/src/tools/mod.rs',
      x: 660,
      y: 120,
      description: 'AST symbol extraction, recherche sémantique hybride BM25 et auto-fix imports linter.',
    },
    {
      id: 'react-ui',
      label: 'React & Monaco Interface',
      category: 'ui',
      path: 'src/App.tsx',
      x: 660,
      y: 300,
      description: 'Interface utilisateur Singular Code avec Tailwind et Monaco.',
    },
    {
      id: 'zustand-store',
      label: 'Zustand State Store',
      category: 'ui',
      path: 'src/store/useAppStore.ts',
      x: 660,
      y: 480,
      description: 'Store réactif global : multi-sessions, transactions, apprentissages et télémétrie.',
    },
  ];

  // Extraire les fichiers clés du workspace pour les projeter
  const fileNodes: ArchNode[] = useMemo(() => {
    return files
      .filter((f) => !f.is_dir && (f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path.endsWith('.rs')))
      .slice(0, 8)
      .map((f, idx) => ({
        id: `file-${f.path}`,
        label: f.name,
        category: 'file' as const,
        path: f.path,
        x: 940 + (idx % 2) * 190,
        y: 110 + Math.floor(idx / 2) * 110,
        description: `Fichier du workspace : ${f.path}`,
      }));
  }, [files]);

  const allNodes = useMemo(() => [...systemNodes, ...fileNodes], [fileNodes]);

  const filteredNodes = useMemo(() => {
    return allNodes.filter((n) => {
      const matchQuery =
        n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.path && n.path.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchCat = filterCategory === 'all' || n.category === filterCategory;
      return matchQuery && matchCat;
    });
  }, [allNodes, searchQuery, filterCategory]);

  // Génération dynamique du diagramme Mermaid interactif (Item 14)
  const mermaidGraph = useMemo(() => {
    const wsName = currentWorkspace ? currentWorkspace.split('/').pop() : 'SingularCode';
    let code = `graph TD
    %% Architecture du projet ${wsName}
    subgraph Core ["Noyau & Orchestration"]
        Tauri["Tauri 2 Backend (Rust)"]
        Engine["Agent ReAct Engine"]
        Tools["Developer Tools Registry"]
    end

    subgraph Security ["Sécurité & Confinement Linux"]
        Landlock["Landlock LSM ABI v3"]
        Bwrap["Bubblewrap Sandbox"]
        Audit["Audit Logger (SHA-256)"]
    end

    subgraph Memory ["Mémoire & Transactions"]
        Learnings["Mémoire Long-Terme (.localagent/learnings.json)"]
        Checkpoints["Checkpoint & Rollback Manager"]
    end

    subgraph UI ["Interface Singular Code"]
        ReactApp["React 18 + Vite"]
        Monaco["Monaco Code Editor"]
        Store["Zustand Store"]
    end

    %% Relations de flux
    Tauri --> Engine
    Engine --> Tools
    Engine --> Learnings
    Engine --> Checkpoints
    Tools --> Bwrap
    Tools --> Landlock
    Landlock --> Audit
    ReactApp --> Store
    Store --> Tauri
    ReactApp --> Monaco
`;
    return code;
  }, [currentWorkspace]);

  const copyMermaidCode = () => {
    navigator.clipboard.writeText(mermaidGraph);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getNodeColor = (cat: string) => {
    switch (cat) {
      case 'core':
        return 'border-indigo-500/50 bg-[#161828] text-indigo-300 shadow-indigo-500/10';
      case 'security':
        return 'border-emerald-500/50 bg-[#12221b] text-emerald-300 shadow-emerald-500/10';
      case 'tools':
        return 'border-cyan-500/50 bg-[#102128] text-cyan-300 shadow-cyan-500/10';
      case 'git':
        return 'border-amber-500/50 bg-[#241c14] text-amber-300 shadow-amber-500/10';
      case 'ui':
        return 'border-violet-500/50 bg-[#1c1428] text-violet-300 shadow-violet-500/10';
      default:
        return 'border-zinc-700 bg-[#161820] text-zinc-300 shadow-zinc-800/10';
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#090a0f] select-none overflow-hidden relative">
      {/* Barre d'outils supérieure du Canvas */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none gap-2">
        <div className="flex items-center gap-2 pointer-events-auto bg-[#141620]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#272b3b] shadow-xl">
          <Workflow className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-zinc-100">Graphe d'Architecture (Item 14)</span>
          <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-zinc-700/50 text-[10px]">
            <button
              onClick={() => setActiveTab('canvas')}
              className={`px-2 py-0.5 rounded-md transition font-medium ${
                activeTab === 'canvas' ? 'bg-cyan-500 text-black font-bold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Canvas 2D
            </button>
            <button
              onClick={() => setActiveTab('mermaid')}
              className={`px-2 py-0.5 rounded-md transition font-medium ${
                activeTab === 'mermaid' ? 'bg-cyan-500 text-black font-bold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Mermaid Live
            </button>
          </div>
        </div>

        {/* Contrôles et Filtres */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {activeTab === 'canvas' && (
            <>
              {/* Filtre catégorie */}
              <div className="hidden lg:flex items-center gap-1 bg-[#141620]/90 backdrop-blur-md px-2 py-1 rounded-xl border border-[#272b3b] text-[10px]">
                {['all', 'core', 'security', 'tools', 'ui', 'file'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-1.5 py-0.5 rounded capitalize ${
                      filterCategory === cat ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Recherche de noeuds */}
              <div className="flex items-center gap-1.5 bg-[#141620]/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-[#272b3b] shadow-xl">
                <Search className="w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Chercher un module..."
                  className="bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none w-36 sm:w-44"
                />
              </div>

              {/* Contrôles de zoom */}
              <div className="flex items-center gap-1 bg-[#141620]/90 backdrop-blur-md p-1 rounded-xl border border-[#272b3b] shadow-xl">
                <button
                  onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}
                  className="p-1.5 hover:bg-[#202332] text-zinc-300 rounded-lg transition-colors"
                  title="Zoom avant"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
                  className="p-1.5 hover:bg-[#202332] text-zinc-300 rounded-lg transition-colors"
                  title="Zoom arrière"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-1.5 hover:bg-[#202332] text-zinc-300 rounded-lg transition-colors"
                  title="Réinitialiser vue"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {activeTab === 'mermaid' && (
            <button
              onClick={copyMermaidCode}
              className="flex items-center gap-1.5 bg-[#141620]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#272b3b] text-xs font-semibold text-zinc-200 hover:bg-[#1e2233] transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{copied ? "Copié !" : "Copier Mermaid"}</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'canvas' ? (
        /* Surface de dessin Canvas 2D */
        <div
          className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            backgroundImage: `radial-gradient(#1f2333 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        >
          <div
            className="absolute inset-0 transition-transform duration-75 origin-top-left"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {/* Lignes de flux SVG connectant les modules */}
            <svg className="absolute inset-0 w-[2400px] h-[2400px] pointer-events-none">
              <defs>
                <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.6" />
                </linearGradient>
              </defs>
              {/* Connexions principales avec courbes Bézier */}
              <path d="M 230 150 C 300 150, 310 150, 380 150" stroke="url(#edgeGrad)" strokeWidth="2" strokeDasharray="4 4" fill="none" />
              <path d="M 230 180 C 100 230, 100 240, 100 300" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" fill="none" opacity="0.6" />
              <path d="M 170 360 L 170 480" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" fill="none" opacity="0.6" />
              <path d="M 480 180 L 480 300" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" fill="none" opacity="0.5" />
              <path d="M 500 150 C 580 150, 580 150, 660 150" stroke="#06b6d4" strokeWidth="2" strokeDasharray="4 4" fill="none" opacity="0.6" />
              <path d="M 760 200 L 760 300" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4 4" fill="none" opacity="0.6" />
              <path d="M 760 380 L 760 480" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4 4" fill="none" opacity="0.6" />
              <path d="M 800 340 C 870 340, 870 140, 940 140" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 3" fill="none" opacity="0.4" />
              <path d="M 800 360 C 870 360, 870 240, 940 240" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 3" fill="none" opacity="0.4" />
            </svg>

            {/* Rendu des Noeuds */}
            {filteredNodes.map((node) => (
              <div
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(node);
                  if (node.path) {
                    openFile(node.path);
                  }
                }}
                style={{ left: node.x, top: node.y }}
                className={`absolute w-64 p-3 rounded-xl border shadow-xl backdrop-blur-sm cursor-pointer transition-all duration-200 hover:scale-105 hover:z-30 ${getNodeColor(
                  node.category
                )}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40">
                    {node.category}
                  </span>
                  {node.path && (
                    <ExternalLink className="w-3 h-3 text-zinc-400 hover:text-zinc-100" />
                  )}
                </div>
                <h4 className="font-semibold text-xs text-zinc-100 truncate mb-1">{node.label}</h4>
                <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                  {node.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Vue Diagramme Mermaid Interactif (Item 14) */
        <div className="flex-1 w-full h-full p-6 pt-20 overflow-y-auto max-w-5xl mx-auto space-y-4">
          <div className="bg-[#121420] border border-[#272b3b] rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-cyan-400" /> Diagramme Mermaid (Architecture Système)
              </span>
              <button
                onClick={copyMermaidCode}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1.5 transition"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? "Copié !" : "Copier le code Mermaid"}</span>
              </button>
            </div>
            <pre className="text-xs font-mono text-cyan-300/90 bg-[#090b12] p-4 rounded-xl overflow-x-auto border border-zinc-800/80 leading-relaxed">
              {mermaidGraph}
            </pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-[#121420] border border-indigo-500/30 rounded-xl p-3 space-y-1">
              <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                <Cpu className="w-4 h-4" /> Noyau & Confinement
              </div>
              <p className="text-zinc-400 text-[11px]">
                Tauri 2 Core asynchrone confiné par Landlock LSM ABI v3 et Bubblewrap namespaces sous Linux.
              </p>
            </div>
            <div className="bg-[#121420] border border-cyan-500/30 rounded-xl p-3 space-y-1">
              <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Mémoire Persistante
              </div>
              <p className="text-zinc-400 text-[11px]">
                .localagent/learnings.json injecté à chaque session avec rollback transactionnel multi-fichiers.
              </p>
            </div>
            <div className="bg-[#121420] border border-emerald-500/30 rounded-xl p-3 space-y-1">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Play className="w-4 h-4" /> Boucle TDD Auto-Repair
              </div>
              <p className="text-zinc-400 text-[11px]">
                Auto-test après génération et diagnostic immédiat des échecs en boucle fermée.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Volet détail latéral du noeud sélectionné */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 right-4 max-w-lg bg-[#141622]/95 backdrop-blur-lg border border-[#2d3246] p-3.5 rounded-2xl shadow-2xl z-30 flex items-start justify-between animate-in fade-in slide-in-from-bottom-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-zinc-100">{selectedNode.label}</span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                {selectedNode.category}
              </span>
            </div>
            <p className="text-xs text-zinc-400">{selectedNode.description}</p>
            {selectedNode.path && (
              <button
                onClick={() => selectedNode.path && openFile(selectedNode.path)}
                className="mt-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Ouvrir dans Monaco Editor ({selectedNode.path})</span>
              </button>
            )}
          </div>
          <button
            onClick={() => setSelectedNode(null)}
            className="text-zinc-500 hover:text-zinc-300 text-xs px-2 py-1 rounded"
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  );
};
