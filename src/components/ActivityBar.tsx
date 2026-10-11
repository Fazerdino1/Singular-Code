import React, { useEffect } from 'react';
import {
  FolderKanban,
  FolderTree,
  GitBranch,
  MessagesSquare,
  Workflow,
  Cpu,
  Sparkles,
  History,
  ShieldCheck,
  Settings,
  Flame,
  Blocks,
  Search,
  Database,
} from 'lucide-react';
import { useAppStore, ActivityTab } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

export const ActivityBar: React.FC = () => {
  const {
    activeActivityTab,
    setActiveActivityTab,
    projects,
    gitStatus,
    refreshGitStatus,
    sessions,
    searchResults,
    setSettingsOpen,
    setSkillsOpen,
    setCheckpointModalOpen,
    setAuditModalOpen,
    setDbModalOpen,
    plugins,
    setPluginsModalOpen,
    hardwareMetrics,
    refreshTelemetry,
  } = useAppStore(
    useShallow((s) => ({
      activeActivityTab: s.activeActivityTab,
      setActiveActivityTab: s.setActiveActivityTab,
      projects: s.projects,
      gitStatus: s.gitStatus,
      refreshGitStatus: s.refreshGitStatus,
      sessions: s.sessions,
      searchResults: s.searchResults,
      setSettingsOpen: s.setSettingsOpen,
      setSkillsOpen: s.setSkillsOpen,
      setCheckpointModalOpen: s.setCheckpointModalOpen,
      setAuditModalOpen: s.setAuditModalOpen,
      setDbModalOpen: s.setDbModalOpen,
      plugins: s.plugins,
      setPluginsModalOpen: s.setPluginsModalOpen,
      hardwareMetrics: s.hardwareMetrics,
      refreshTelemetry: s.refreshTelemetry,
    }))
  );

  useEffect(() => {
    refreshGitStatus();
    refreshTelemetry();
    const interval = setInterval(() => {
      refreshTelemetry();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const totalGitChanges = gitStatus
    ? (gitStatus.staged?.length || 0) +
      (gitStatus.unstaged?.length || 0) +
      (gitStatus.untracked?.length || 0)
    : 0;

  const topItems: {
    id: ActivityTab;
    label: string;
    icon: React.ReactNode;
    badge?: number | string;
    badgeColor?: string;
  }[] = [
    {
      id: 'projects',
      label: 'Projets & Espaces de Travail',
      icon: <FolderKanban className="w-5 h-5" />,
      badge: projects.length > 0 ? projects.length : undefined,
      badgeColor: 'bg-indigo-600 text-white',
    },
    {
      id: 'files',
      label: 'Explorateur de Fichiers',
      icon: <FolderTree className="w-5 h-5" />,
    },
    {
      id: 'search',
      label: 'Recherche & Remplacement (Ctrl+Shift+F)',
      icon: <Search className="w-5 h-5" />,
      badge: searchResults.length > 0 ? searchResults.reduce((acc, r) => acc + r.matches.length, 0) : undefined,
      badgeColor: 'bg-cyan-500 text-black',
    },
    {
      id: 'git',
      label: 'Contrôle de Source Git',
      icon: <GitBranch className="w-5 h-5" />,
      badge: totalGitChanges > 0 ? totalGitChanges : undefined,
      badgeColor: 'bg-emerald-500 text-black',
    },
    {
      id: 'sessions',
      label: 'Sessions de Chat Multi-Agents',
      icon: <MessagesSquare className="w-5 h-5" />,
      badge: sessions.length > 1 ? sessions.length : undefined,
      badgeColor: 'bg-indigo-500 text-white',
    },
    {
      id: 'arch',
      label: 'Canvas d\'Architecture Système',
      icon: <Workflow className="w-5 h-5" />,
    },
    {
      id: 'monitor',
      label: 'Télémétrie Hardware & GPU',
      icon: <Cpu className="w-5 h-5" />,
      badge: hardwareMetrics?.vram_used_mb
        ? `${Math.round(hardwareMetrics.vram_used_mb / 1024)}G`
        : undefined,
      badgeColor: 'bg-violet-600 text-white',
    },
  ];

  return (
    <aside className="w-13 w-[52px] bg-[#090b10] border-r border-[#1e2029] flex flex-col justify-between items-center py-2 select-none z-20 shrink-0">
      {/* Haut : Navigation Principale */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* Logo Singular Code */}
        <div className="p-1 mb-2 group relative cursor-pointer" title="Singular Code">
          <img
            src="/singular-code-logo.png"
            alt="Singular Code"
            className="w-8 h-8 rounded-xl object-contain shadow-lg shadow-cyan-500/30 ring-1 ring-cyan-500/40 transition-transform duration-300 group-hover:scale-110"
          />
        </div>

        {topItems.map((item) => {
          const isActive = activeActivityTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveActivityTab(item.id)}
              title={item.label}
              className={`relative group w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400 shadow-inner'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#191b24]'
              }`}
            >
              {/* Active Indicator Bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 rounded-r" />
              )}

              {item.icon}

              {/* Badge */}
              {item.badge !== undefined && (
                <span
                  className={`absolute -top-1 -right-1 text-[9px] font-bold px-1 min-w-[15px] h-[15px] rounded-full flex items-center justify-center shadow-md ${
                    item.badgeColor || 'bg-indigo-500 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {/* Tooltip Hover */}
              <div className="absolute left-14 px-2.5 py-1 bg-[#181922] border border-[#2d3142] text-xs font-medium text-zinc-200 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl">
                {item.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bas : Outils & Paramètres */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* Checkpoints */}
        <button
          onClick={() => setCheckpointModalOpen(true)}
          title="Historique des Snapshots"
          className="relative group w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#191b24] transition-colors"
        >
          <History className="w-5 h-5" />
          <div className="absolute left-14 px-2.5 py-1 bg-[#181922] border border-[#2d3142] text-xs font-medium text-zinc-200 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl">
            Historique des Checkpoints
          </div>
        </button>

        {/* Skills */}
        <button
          onClick={() => setSkillsOpen(true)}
          title="Skills & Capacités Agent"
          className="relative group w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-amber-400 hover:bg-[#191b24] transition-colors"
        >
          <Sparkles className="w-5 h-5" />
          <div className="absolute left-14 px-2.5 py-1 bg-[#181922] border border-[#2d3142] text-xs font-medium text-zinc-200 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl">
            Gestionnaire de Skills
          </div>
        </button>

        {/* Audit Log */}
        <button
          onClick={() => setAuditModalOpen(true)}
          title="Journal d'Audit de Sécurité"
          className="relative group w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:bg-[#191b24] transition-colors"
        >
          <ShieldCheck className="w-5 h-5" />
          <div className="absolute left-14 px-2.5 py-1 bg-[#181922] border border-[#2d3142] text-xs font-medium text-zinc-200 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl">
            Journal d'Audit LSM / Sandbox
          </div>
        </button>

        {/* Database Inspector (Item 11) */}
        <button
          onClick={() => setDbModalOpen(true)}
          title="Inspecteur de Base de Données SQLite"
          className="relative group w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-cyan-400 hover:bg-[#191b24] transition-colors"
        >
          <Database className="w-5 h-5" />
          <div className="absolute left-14 px-2.5 py-1 bg-[#181922] border border-[#2d3142] text-xs font-medium text-zinc-200 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl">
            Inspecteur Base de Données (SQLite)
          </div>
        </button>

        {/* Plugins */}
        <button
          onClick={() => setPluginsModalOpen(true)}
          title="Gestionnaire de Plugins"
          className="relative group w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-indigo-400 hover:bg-[#191b24] transition-colors"
        >
          <Blocks className="w-5 h-5" />
          {plugins.filter((p) => p.installed && p.enabled).length > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-[#090b10]" />
          )}
          <div className="absolute left-14 px-2.5 py-1 bg-[#181922] border border-[#2d3142] text-xs font-medium text-zinc-200 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl">
            Gestionnaire de Plugins ({plugins.filter((p) => p.installed && p.enabled).length} actifs)
          </div>
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Paramètres de l'application"
          className="relative group w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#191b24] transition-colors"
        >
          <Settings className="w-5 h-5" />
          <div className="absolute left-14 px-2.5 py-1 bg-[#181922] border border-[#2d3142] text-xs font-medium text-zinc-200 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl">
            Paramètres & Modèles
          </div>
        </button>
      </div>
    </aside>
  );
};
