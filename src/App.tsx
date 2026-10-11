import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { api } from './lib/ipc';
import { Header } from './components/Header';
import { WelcomeView } from './components/WelcomeView';
import { ActivityBar } from './components/ActivityBar';
import { FileExplorer } from './components/FileExplorer';
import { GitSourceControl } from './components/GitSourceControl';
import { ChatSessionsDrawer } from './components/ChatSessionsDrawer';
import { PanelResizer } from './components/PanelResizer';
import { HardwareMonitorModal } from './components/HardwareMonitorModal';
import { MonacoPanel } from './components/MonacoPanel';
import { AgentChat } from './components/AgentChat';
import { BottomTerminal } from './components/BottomTerminal';
import { StatusBar } from './components/StatusBar';
import { PermissionModal } from './components/PermissionModal';
import { CommandPalette } from './components/CommandPalette';
import { ProjectsSidebar } from './components/ProjectsSidebar';
import { GlobalSearch } from './components/GlobalSearch';

// Lazy loading des modales et vues secondaires (Pack Optimisation Bundle)
const ArchitectureCanvas = React.lazy(() =>
  import('./components/ArchitectureCanvas').then((m) => ({ default: m.ArchitectureCanvas }))
);
const SettingsModal = React.lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const SkillsModal = React.lazy(() =>
  import('./components/SkillsModal').then((m) => ({ default: m.SkillsModal }))
);
const AuditLogModal = React.lazy(() =>
  import('./components/AuditLogModal').then((m) => ({ default: m.AuditLogModal }))
);
const CheckpointModal = React.lazy(() =>
  import('./components/CheckpointModal').then((m) => ({ default: m.CheckpointModal }))
);
const ProjectRulesModal = React.lazy(() =>
  import('./components/ProjectRulesModal').then((m) => ({ default: m.ProjectRulesModal }))
);
const PluginsModal = React.lazy(() =>
  import('./components/PluginsModal').then((m) => ({ default: m.PluginsModal }))
);
const DatabaseViewerModal = React.lazy(() =>
  import('./components/DatabaseViewerModal').then((m) => ({ default: m.DatabaseViewerModal }))
);

export default function App() {
  const {
    currentWorkspace,
    theme,
    activeActivityTab,
    sidebarWidth,
    setSidebarWidth,
    chatWidth,
    setChatWidth,
    terminalHeight,
    setTerminalHeight,
    chatPlacement,
    isSidebarCollapsed,
    isChatCollapsed,
    isSettingsOpen,
    isAuditModalOpen,
    isCheckpointModalOpen,
    isSkillsOpen,
    isPluginsModalOpen,
    isProjectRulesModalOpen,
    isDbModalOpen,
    isCommandPaletteOpen,
    currentPermissionRequest,
  } = useAppStore(
    useShallow((s) => ({
      currentWorkspace: s.currentWorkspace,
      theme: s.theme,
      activeActivityTab: s.activeActivityTab,
      sidebarWidth: s.sidebarWidth,
      setSidebarWidth: s.setSidebarWidth,
      chatWidth: s.chatWidth,
      setChatWidth: s.setChatWidth,
      terminalHeight: s.terminalHeight,
      setTerminalHeight: s.setTerminalHeight,
      chatPlacement: s.chatPlacement,
      isSidebarCollapsed: s.isSidebarCollapsed,
      isChatCollapsed: s.isChatCollapsed,
      isSettingsOpen: s.isSettingsOpen,
      isAuditModalOpen: s.isAuditModalOpen,
      isCheckpointModalOpen: s.isCheckpointModalOpen,
      isSkillsOpen: s.isSkillsOpen,
      isPluginsModalOpen: s.isPluginsModalOpen,
      isProjectRulesModalOpen: s.isProjectRulesModalOpen,
      isDbModalOpen: s.isDbModalOpen,
      isCommandPaletteOpen: s.isCommandPaletteOpen,
      currentPermissionRequest: s.currentPermissionRequest,
    }))
  );

  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);

  // Callbacks de redimensionnement mémoïsés pour éviter les re-renders intempestifs des PanelResizers
  const handleChatResizeLeft = useCallback((delta: number) => {
    const current = useAppStore.getState().chatWidth;
    setChatWidth(current + delta);
  }, [setChatWidth]);

  const handleChatResizeRight = useCallback((delta: number) => {
    const current = useAppStore.getState().chatWidth;
    setChatWidth(current - delta);
  }, [setChatWidth]);

  const handleChatReset = useCallback(() => {
    setChatWidth(440);
  }, [setChatWidth]);

  const handleSidebarResize = useCallback((delta: number) => {
    const current = useAppStore.getState().sidebarWidth;
    setSidebarWidth(current + delta);
  }, [setSidebarWidth]);

  const handleSidebarReset = useCallback(() => {
    setSidebarWidth(280);
  }, [setSidebarWidth]);

  const handleTerminalResize = useCallback((delta: number) => {
    const current = useAppStore.getState().terminalHeight;
    setTerminalHeight(current - delta);
  }, [setTerminalHeight]);

  const handleTerminalReset = useCallback(() => {
    setTerminalHeight(220);
  }, [setTerminalHeight]);

  // Initialisation au démarrage
  useEffect(() => {
    const {
      setSecurityStatus,
      setWorkspace,
      profiles,
      activeProfileIndex,
      setIsModelConnected,
      setAvailableModels,
    } = useAppStore.getState();

    // Vérifier l'état système (bwrap, docker)
    api.getSystemStatus().then((status) => {
      setSecurityStatus(status.bwrap_available, status.docker_available);
      if (status.current_workspace) {
        setWorkspace(status.current_workspace);
      }
    }).catch(console.error);

    // Tester la connexion du modèle actif
    const activeProf = profiles[activeProfileIndex] || profiles[0];
    api.testModelConnection(activeProf).then((models) => {
      setIsModelConnected(true);
      setAvailableModels(models);
    }).catch(() => {
      setIsModelConnected(false);
    });

    // Raccourci Global Ctrl+Shift+F pour la recherche
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        useAppStore.getState().setActiveActivityTab('search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Composant du Volet Secondaire (Explorateur, Projets, Git, etc.)
  const renderSidebarContent = () => {
    if (isSidebarCollapsed) return null;
    return (
      <div
        style={{ width: sidebarWidth }}
        className="shrink-0 h-full overflow-hidden flex flex-col bg-[#0c0e15]"
      >
        {activeActivityTab === 'projects' && <ProjectsSidebar />}
        {activeActivityTab === 'files' && <FileExplorer />}
        {activeActivityTab === 'search' && <GlobalSearch />}
        {activeActivityTab === 'git' && <GitSourceControl />}
        {activeActivityTab === 'sessions' && <ChatSessionsDrawer />}
        {activeActivityTab === 'monitor' && <HardwareMonitorModal />}
      </div>
    );
  };

  // Composant du Panneau de Chat Agent
  const renderChatContent = () => {
    if (isChatCollapsed) return null;
    return (
      <div
        style={{ width: chatWidth }}
        className="shrink-0 h-full overflow-hidden flex flex-col"
      >
        <AgentChat />
      </div>
    );
  };

  return (
    <div className={`flex h-screen w-screen flex-col overflow-hidden ${theme === 'light' ? 'light' : 'dark'} bg-[#08090e]`}>
      {/* Barre supérieure */}
      <Header />

      {/* Vue Principale */}
      {!currentWorkspace ? (
        <div className="flex flex-1 overflow-hidden">
          <ActivityBar />
          {activeActivityTab === 'projects' && (
            <div style={{ width: sidebarWidth }} className="shrink-0 h-full border-r border-[#1e2029]">
              <ProjectsSidebar />
            </div>
          )}
          {activeActivityTab === 'monitor' && (
            <div style={{ width: sidebarWidth + 40 }} className="shrink-0 h-full border-r border-[#1e2029]">
              <HardwareMonitorModal />
            </div>
          )}
          {activeActivityTab === 'sessions' && (
            <div style={{ width: sidebarWidth }} className="shrink-0 h-full border-r border-[#1e2029]">
              <ChatSessionsDrawer />
            </div>
          )}
          <div className="flex-1 flex overflow-hidden">
            <WelcomeView />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Panneaux horizontaux réorganisables & redimensionnables à la souris */}
          <div className="flex flex-1 overflow-hidden relative">
            {/* GAUCHE : Activity Bar */}
            <ActivityBar />

            {/* Agencement selon la place choisie pour le Chat (gauche ou droite) */}
            {chatPlacement === 'left' ? (
              <>
                {/* 1. Chat placé à gauche */}
                {renderChatContent()}
                {!isChatCollapsed && (
                  <PanelResizer
                    direction="vertical"
                    onResize={handleChatResizeLeft}
                    onReset={handleChatReset}
                    title="Ajuster la largeur du chat à la souris"
                  />
                )}

                {/* 2. Volet secondaire */}
                {renderSidebarContent()}
                {!isSidebarCollapsed && (
                  <PanelResizer
                    direction="vertical"
                    onResize={handleSidebarResize}
                    onReset={handleSidebarReset}
                    title="Ajuster la largeur du volet à la souris"
                  />
                )}

                {/* 3. Centre : Monaco Editor ou Canvas */}
                <div className="flex-1 min-w-[200px] flex flex-col h-full overflow-hidden">
                  <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-gray-500">Chargement du Canvas...</div>}>
                    {activeActivityTab === 'arch' ? <ArchitectureCanvas /> : <MonacoPanel />}
                  </React.Suspense>
                </div>
              </>
            ) : (
              <>
                {/* 1. Volet secondaire à gauche */}
                {renderSidebarContent()}
                {!isSidebarCollapsed && (
                  <PanelResizer
                    direction="vertical"
                    onResize={handleSidebarResize}
                    onReset={handleSidebarReset}
                    title="Ajuster la largeur du volet à la souris"
                  />
                )}

                {/* 2. Centre : Monaco Editor ou Canvas */}
                <div className="flex-1 min-w-[200px] flex flex-col h-full overflow-hidden">
                  <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-gray-500">Chargement du Canvas...</div>}>
                    {activeActivityTab === 'arch' ? <ArchitectureCanvas /> : <MonacoPanel />}
                  </React.Suspense>
                </div>

                {/* 3. Chat placé à droite */}
                {!isChatCollapsed && (
                  <PanelResizer
                    direction="vertical"
                    onResize={handleChatResizeRight}
                    onReset={handleChatReset}
                    title="Ajuster la largeur du chat à la souris"
                  />
                )}
                {renderChatContent()}
              </>
            )}
          </div>

          {/* Séparateur horizontal pour redimensionner le Terminal à la souris */}
          {!isTerminalCollapsed && (
            <PanelResizer
              direction="horizontal"
              onResize={handleTerminalResize}
              onReset={handleTerminalReset}
              title="Ajuster la hauteur du terminal à la souris"
            />
          )}

          {/* BAS : Terminal xterm.js et Logs */}
          <BottomTerminal
            isCollapsed={isTerminalCollapsed}
            onToggleCollapse={() => setIsTerminalCollapsed(!isTerminalCollapsed)}
          />
        </div>
      )}

      {/* Barre d'état */}
      <StatusBar />

      {/* Modales globales différées (React.lazy + Suspense) */}
      <React.Suspense fallback={null}>
        {currentPermissionRequest && <PermissionModal />}
        {isSettingsOpen && <SettingsModal />}
        {isCommandPaletteOpen && <CommandPalette />}
        {isSkillsOpen && <SkillsModal />}
        {isAuditModalOpen && <AuditLogModal />}
        {isCheckpointModalOpen && <CheckpointModal />}
        {isProjectRulesModalOpen && <ProjectRulesModal />}
        {isPluginsModalOpen && <PluginsModal />}
        {isDbModalOpen && <DatabaseViewerModal />}
      </React.Suspense>
    </div>
  );
}
