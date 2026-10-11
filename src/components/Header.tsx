import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Shield, Terminal, Settings, Sun, Moon, Search, Folder, AlertTriangle, Sparkles, Wifi, WifiOff, ArrowLeftRight, PanelLeft, PanelRight, Blocks } from 'lucide-react';
import { ModelSelectorDropdown } from './ModelSelectorDropdown';
import { ModeSelectorDropdown } from './ModeSelectorDropdown';
import { api } from '../lib/ipc';

export const Header: React.FC = () => {
  const {
    currentWorkspace,
    sandboxType,
    allowNetwork,
    setAllowNetwork,
    addLog,
    skills,
    plugins,
    setPluginsModalOpen,
    theme,
    setTheme,
    setSettingsOpen,
    setCommandPaletteOpen,
    setSkillsOpen,
    setWorkspace,
    chatPlacement,
    toggleChatPlacement,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
    isChatCollapsed,
    toggleChatCollapsed,
  } = useAppStore(
    useShallow((s) => ({
      currentWorkspace: s.currentWorkspace,
      sandboxType: s.sandboxType,
      allowNetwork: s.allowNetwork,
      setAllowNetwork: s.setAllowNetwork,
      addLog: s.addLog,
      skills: s.skills,
      plugins: s.plugins,
      setPluginsModalOpen: s.setPluginsModalOpen,
      theme: s.theme,
      setTheme: s.setTheme,
      setSettingsOpen: s.setSettingsOpen,
      setCommandPaletteOpen: s.setCommandPaletteOpen,
      setSkillsOpen: s.setSkillsOpen,
      setWorkspace: s.setWorkspace,
      chatPlacement: s.chatPlacement,
      toggleChatPlacement: s.toggleChatPlacement,
      isSidebarCollapsed: s.isSidebarCollapsed,
      toggleSidebarCollapsed: s.toggleSidebarCollapsed,
      isChatCollapsed: s.isChatCollapsed,
      toggleChatCollapsed: s.toggleChatCollapsed,
    }))
  );

  const toggleNetwork = async () => {
    const next = !allowNetwork;
    setAllowNetwork(next);
    await api.setNetworkAccess(next);
    addLog('info', next ? '🌐 Réseau & Accès Web activés dans la sandbox' : '🔒 Réseau sandbox coupé (isolation stricte)');
  };

  const activeSkillsCount = skills.filter((s) => s.enabled).length;
  const activePluginsCount = plugins.filter((p) => p.installed && p.enabled).length;

  const getSandboxBadge = () => {
    switch (sandboxType) {
      case 'bubblewrap':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="w-3 h-3" /> Bubblewrap
          </span>
        );
      case 'docker':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Terminal className="w-3 h-3" /> Docker
          </span>
        );
      case 'none':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> Hors Sandbox
          </span>
        );
    }
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-[#1c2234] bg-[#0c0e15] px-3 select-none text-xs z-50 relative">
      <div className="flex items-center gap-3 min-w-0">
        {/* Logo Singular Code & Nom */}
        <div
          className="flex items-center gap-2 cursor-pointer font-semibold text-gray-200 group"
          onClick={() => setWorkspace(null)}
          title="Singular Code - Retour à l'accueil"
        >
          <img
            src="/singular-code-logo.png"
            alt="Singular Code"
            className="w-7 h-7 rounded-lg object-contain shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-500/30 transition-transform duration-300 group-hover:scale-110 group-hover:shadow-cyan-400/40"
          />
          <div className="flex flex-col">
            <span className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              Singular Code
            </span>
          </div>
        </div>

        {/* Workspace path pill */}
        {currentWorkspace && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#161a27] text-gray-300 max-w-xs truncate border border-[#23293c]">
            <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate font-mono text-[11px]" title={currentWorkspace}>
              {currentWorkspace.split('/').pop()}
            </span>
          </div>
        )}

        {/* Badges Sandbox & Réseau */}
        <div className="hidden md:flex items-center gap-2">
          {getSandboxBadge()}

          <button
            onClick={toggleNetwork}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              allowNetwork
                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25'
                : 'bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/20'
            }`}
            title={allowNetwork ? "Accès Web & Réseau actif (cliquez pour couper)" : "Réseau coupé (cliquez pour autoriser l'accès web)"}
          >
            {allowNetwork ? <Wifi className="w-3 h-3 text-sky-400" /> : <WifiOff className="w-3 h-3 text-gray-500" />}
            <span className="hidden lg:inline">Net: {allowNetwork ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Contrôles de Réorganisation / Disposition à la souris */}
        <div className="flex items-center gap-1 bg-[#131724] p-0.5 rounded-lg border border-[#22273a] text-gray-400">
          <button
            onClick={toggleSidebarCollapsed}
            className={`p-1.5 rounded-md transition ${isSidebarCollapsed ? 'text-gray-500 hover:text-gray-300' : 'text-cyan-400 bg-cyan-950/40'}`}
            title={isSidebarCollapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleChatPlacement}
            className="p-1.5 rounded-md hover:text-white hover:bg-[#1f2638] transition flex items-center gap-1 text-[11px]"
            title={`Changer la place du Chat avec la souris : actuellement à ${chatPlacement === 'right' ? 'DROITE' : 'GAUCHE'} (cliquer pour permuter)`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden xl:inline text-[10px] font-mono text-gray-400">
              Chat: {chatPlacement === 'right' ? 'Droite' : 'Gauche'}
            </span>
          </button>

          <button
            onClick={toggleChatCollapsed}
            className={`p-1.5 rounded-md transition ${isChatCollapsed ? 'text-gray-500 hover:text-gray-300' : 'text-purple-400 bg-purple-950/40'}`}
            title={isChatCollapsed ? "Déplier le panneau de chat" : "Replier le panneau de chat"}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Sélecteur de Mode d'Opération (Placé dans le Header pour visibilité et éviter toute coupure) */}
        <ModeSelectorDropdown align="right" />

        {/* Sélecteur de Modèle Sophistiqué */}
        <ModelSelectorDropdown />

        {/* Bouton Skills Manager */}
        <button
          onClick={() => setSkillsOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141824] hover:bg-[#1f2638] text-gray-200 border border-[#22273a] transition text-xs font-medium"
          title="Gérer les compétences (Skills)"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden md:inline">Skills</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            {activeSkillsCount}
          </span>
        </button>

        {/* Bouton Plugins Manager */}
        <button
          onClick={() => setPluginsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141824] hover:bg-[#1f2638] text-gray-200 border border-[#22273a] transition text-xs font-medium"
          title="Gérer les plugins de l'application"
        >
          <Blocks className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden md:inline">Plugins</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {activePluginsCount}
          </span>
        </button>

        {/* Bouton Palette de Commandes */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141824] hover:bg-[#1f2638] text-gray-300 border border-[#22273a] transition"
          title="Palette de commandes (Ctrl+Shift+P)"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden lg:inline text-[11px] text-gray-400 font-mono">Ctrl+P</span>
        </button>

        {/* Thème */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 rounded-lg hover:bg-[#1f2638] text-gray-300 transition"
          title="Basculer le thème"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Paramètres */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded-lg hover:bg-[#1f2638] text-gray-300 transition"
          title="Paramètres de configuration Singular Code"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
