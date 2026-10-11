import React, { useEffect, useRef } from 'react';
import Editor, { DiffEditor, Monaco } from '@monaco-editor/react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../lib/ipc';
import { soundManager } from '../lib/sound';
import { X, Check, Undo, Save, SplitSquareVertical, Bot, Sparkles, Columns, Rows, Square } from 'lucide-react';

export const MonacoPanel: React.FC = () => {
  const {
    openTabs,
    activeTab,
    fileContents,
    activeDiff,
    closeTab,
    setActiveTab,
    updateFileContent,
    setDiff,
    theme,
    addLog,
    files,
    isAgentRunning,
    soundEnabled,
    editorSettings,
    splitTab,
    splitDirection,
    openFileInSplit,
    closeSplit,
    setSplitDirection,
  } = useAppStore(
    useShallow((s) => ({
      openTabs: s.openTabs,
      activeTab: s.activeTab,
      fileContents: s.fileContents,
      activeDiff: s.activeDiff,
      closeTab: s.closeTab,
      setActiveTab: s.setActiveTab,
      updateFileContent: s.updateFileContent,
      setDiff: s.setDiff,
      theme: s.theme,
      addLog: s.addLog,
      files: s.files,
      isAgentRunning: s.isAgentRunning,
      soundEnabled: s.soundEnabled,
      editorSettings: s.editorSettings,
      splitTab: s.splitTab,
      splitDirection: s.splitDirection,
      openFileInSplit: s.openFileInSplit,
      closeSplit: s.closeSplit,
      setSplitDirection: s.setSplitDirection,
    }))
  );

  const editorRef = useRef<any>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Record<string, string>>({});
  const prevActiveTabRef = useRef(activeTab);

  // Synchronisation différée (debounce 300ms) pour éviter les re-renders intempestifs du layout et du chat agent
  const debouncedUpdateContent = (path: string, content: string) => {
    pendingUpdatesRef.current[path] = content;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      updateFileContent(path, content);
      delete pendingUpdatesRef.current[path];
      debounceTimerRef.current = null;
    }, 300);
  };

  const flushPendingUpdates = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    Object.entries(pendingUpdatesRef.current).forEach(([p, content]) => {
      updateFileContent(p, content);
    });
    pendingUpdatesRef.current = {};
  };

  // Vider les modifications en attente lors d'un changement d'onglet
  useEffect(() => {
    if (prevActiveTabRef.current && prevActiveTabRef.current !== activeTab) {
      const oldTab = prevActiveTabRef.current;
      if (pendingUpdatesRef.current[oldTab] !== undefined) {
        updateFileContent(oldTab, pendingUpdatesRef.current[oldTab]);
        delete pendingUpdatesRef.current[oldTab];
      }
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab, updateFileContent]);

  // Vider les modifications au démontage
  useEffect(() => {
    return () => {
      flushPendingUpdates();
    };
  }, []);

  const getLanguage = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'rs':
        return 'rust';
      case 'py':
        return 'python';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'sh':
      case 'bash':
        return 'shell';
      case 'sql':
        return 'sql';
      default:
        return 'plaintext';
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeTab && value !== undefined) {
      debouncedUpdateContent(activeTab, value);
    }
  };

  const handleSplitEditorChange = (value: string | undefined) => {
    if (splitTab && value !== undefined) {
      debouncedUpdateContent(splitTab, value);
    }
  };

  const handleSave = async () => {
    if (!activeTab) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const content = pendingUpdatesRef.current[activeTab] !== undefined
      ? pendingUpdatesRef.current[activeTab]
      : fileContents[activeTab];

    if (pendingUpdatesRef.current[activeTab] !== undefined) {
      updateFileContent(activeTab, content);
      delete pendingUpdatesRef.current[activeTab];
    }

    if (content !== undefined) {
      try {
        await api.writeFile(activeTab, content);
        if (soundEnabled) soundManager.playSuccess();
        addLog('info', `Fichier enregistré : ${activeTab}`);
      } catch (err: any) {
        if (soundEnabled) soundManager.playError();
        addLog('error', `Erreur enregistrement ${activeTab} : ${err}`);
      }
    }
  };

  const handleAcceptDiff = async () => {
    if (!activeDiff) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    delete pendingUpdatesRef.current[activeDiff.path];
    try {
      await api.writeFile(activeDiff.path, activeDiff.modified);
      updateFileContent(activeDiff.path, activeDiff.modified);
      if (soundEnabled) soundManager.playSuccess();
      addLog('info', `Modifications de l'IA acceptées pour ${activeDiff.path}`);
      setDiff(null);
    } catch (err: any) {
      if (soundEnabled) soundManager.playError();
      addLog('error', `Erreur lors de l'application du diff : ${err}`);
    }
  };

  const handleRejectDiff = () => {
    if (!activeDiff) return;
    if (soundEnabled) soundManager.playClick();
    addLog('info', `Modifications de l'IA rejetées pour ${activeDiff.path}`);
    setDiff(null);
  };

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;

    // Raccourci Ctrl+S pour sauvegarder
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });

    // Raccourci Ctrl+L pour citer la sélection vers le chat
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
      const selection = editor.getSelection();
      const selectedText = editor.getModel()?.getValueInRange(selection);
      if (selectedText && selectedText.trim()) {
        const quote = `\`\`\`${getLanguage(activeTab || '')}\n${selectedText}\n\`\`\`\n`;
        const state = useAppStore.getState();
        state.addLog('info', 'Code sélectionné copié comme contexte pour le prompt');
      }
    });
  };

  if (openTabs.length === 0 && !activeDiff) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#090b10] text-gray-400 text-sm select-none p-6 relative overflow-hidden">
        {/* Glow de fond subtil */}
        <div className="absolute w-96 h-96 rounded-full bg-gradient-to-tr from-cyan-500/10 via-indigo-500/10 to-purple-500/10 blur-3xl pointer-events-none" />

        <div className="text-center space-y-4 max-w-md relative z-10 animate-fadeIn">
          {/* Logo 3D Singular Code vibrant */}
          <div className="relative mx-auto w-20 h-20 group">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 blur-lg opacity-40 group-hover:opacity-75 transition-opacity duration-500" />
            <img
              src="/singular-code-logo.png"
              alt="Singular Code"
              className="relative w-20 h-20 rounded-2xl object-contain shadow-2xl ring-1 ring-cyan-400/40 transform transition-transform duration-500 group-hover:scale-105"
            />
          </div>

          <div>
            <h2 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              Singular Code
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Environnement de développement intelligent autonome & sécurisé
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#121624]/80 border border-[#23293d] shadow-inner text-xs text-gray-400 space-y-2">
            <p className="text-gray-300 font-medium">Prêt pour coder :</p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-gray-300">
              <span className="px-2 py-0.5 rounded-md bg-[#1a2034] border border-[#2b334d]">Ctrl+P : Fichiers</span>
              <span className="px-2 py-0.5 rounded-md bg-[#1a2034] border border-[#2b334d]">/plan : Planifier</span>
              <span className="px-2 py-0.5 rounded-md bg-[#1a2034] border border-[#2b334d]">/tdd : Tester</span>
            </div>
            <p className="text-[11px] text-gray-500 pt-1">
              Sélectionnez un fichier dans l'explorateur ou écrivez une consigne dans le chat.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col h-full bg-[#0d1017] overflow-hidden">
      {/* Barre d'onglets */}
      <div className="flex items-center justify-between bg-[#0a0c12] border-b border-[#1c2234] px-2 text-xs select-none">
        <div className="flex items-center overflow-x-auto no-scrollbar py-1 gap-1">
          {openTabs.map((tab) => {
            const isActive = activeTab === tab;
            const fileName = tab.split('/').pop() || tab;
            const fileMeta = files.find((f) => f.path === tab);
            const isAiModified = fileMeta?.isModifiedByAi;

            return (
              <div
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer transition border text-xs ${
                  isActive
                    ? 'bg-[#151926] text-white border-indigo-500/50 shadow font-medium'
                    : 'bg-[#0e111a] text-gray-400 border-transparent hover:bg-[#141824] hover:text-gray-200'
                }`}
              >
                {isAiModified && (
                  <span className="flex items-center gap-0.5 px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-mono border border-purple-500/30">
                    <Bot className="w-2.5 h-2.5" /> IA
                  </span>
                )}

                <span className="truncate max-w-[150px] font-mono">{fileName}</span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab);
                  }}
                  className="p-0.5 rounded-lg opacity-40 group-hover:opacity-100 hover:bg-gray-700/50 text-gray-400 hover:text-white transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Boutons d'action éditeur */}
        <div className="flex items-center gap-2 px-2 py-1">
          {isAgentRunning && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px] animate-pulse">
              <Bot className="w-3 h-3" />
              <span>IA en action</span>
            </div>
          )}

          {activeDiff ? (
            <div className="flex items-center gap-1.5 bg-[#141824] px-2 py-1 rounded-xl border border-[#21283c]">
              <span className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                <SplitSquareVertical className="w-3 h-3" /> Diff IA
              </span>
              <button
                onClick={handleAcceptDiff}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition shadow"
              >
                <Check className="w-3 h-3" /> Accepter
              </button>
              <button
                onClick={handleRejectDiff}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-medium transition shadow"
              >
                <Undo className="w-3 h-3" /> Refuser
              </button>
            </div>
          ) : (
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#181d2c] hover:bg-indigo-600 text-gray-200 hover:text-white text-xs transition border border-[#21283c] hover:border-indigo-500 shadow-sm"
                title="Enregistrer (Ctrl+S)"
              >
                <Save className="w-3.5 h-3.5" /> Enregistrer
              </button>
            )}

            {/* Contrôles Vue Divisée (Split Editor - Item 7) */}
            {!activeDiff && activeTab && (
              <div className="flex items-center gap-1 bg-[#121622] p-0.5 rounded-xl border border-[#202638]">
                {splitTab ? (
                  <>
                    <button
                      onClick={() => setSplitDirection(splitDirection === 'vertical' ? 'horizontal' : 'vertical')}
                      className="p-1.5 rounded-lg hover:bg-[#1a2032] text-cyan-400 hover:text-cyan-300 transition"
                      title={splitDirection === 'vertical' ? 'Basculer en vue horizontale' : 'Basculer en vue verticale'}
                    >
                      {splitDirection === 'vertical' ? <Rows className="w-3.5 h-3.5" /> : <Columns className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={closeSplit}
                      className="p-1.5 rounded-lg hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 transition"
                      title="Fermer la vue divisée"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      const otherTab = openTabs.find((t) => t !== activeTab) || activeTab;
                      openFileInSplit(otherTab);
                    }}
                    className="p-1.5 rounded-lg hover:bg-[#1a2032] text-gray-400 hover:text-white transition"
                    title="Diviser l'éditeur (Split View)"
                  >
                    <Columns className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Éditeur ou Vue Diff ou Vue Divisée */}
      <div className="flex-1 w-full h-full overflow-hidden">
        {activeDiff ? (
          <DiffEditor
            original={activeDiff.original}
            modified={activeDiff.modified}
            language={getLanguage(activeDiff.path)}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              readOnly: true,
              renderSideBySide: true,
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        ) : splitTab && activeTab ? (
          /* VUE DIVISÉE (SPLIT VIEW) */
          <div className={`flex ${splitDirection === 'vertical' ? 'flex-row' : 'flex-col'} w-full h-full overflow-hidden divide-[#1c2234] ${splitDirection === 'vertical' ? 'divide-x' : 'divide-y'}`}>
            {/* Volet Principal (Gauche / Haut) */}
            <div className="flex-1 h-full overflow-hidden flex flex-col">
              <div className="px-3 py-1 bg-[#0e111a] border-b border-[#1c2234] text-[11px] font-mono text-gray-400 flex items-center justify-between">
                <span className="truncate">{activeTab.split('/').pop()}</span>
                <span className="text-[10px] text-gray-500">Principal</span>
              </div>
              <div className="flex-1 w-full h-full">
                <Editor
                  path={activeTab}
                  value={fileContents[activeTab] ?? ''}
                  language={getLanguage(activeTab)}
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  onChange={handleEditorChange}
                  onMount={handleEditorDidMount}
                  options={{
                    fontSize: editorSettings.fontSize,
                    fontFamily: editorSettings.fontFamily,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: editorSettings.tabSize,
                    wordWrap: editorSettings.wordWrap,
                    lineNumbers: editorSettings.lineNumbers,
                    cursorBlinking: editorSettings.cursorBlinking,
                    smoothScrolling: editorSettings.smoothScrolling,
                    renderWhitespace: editorSettings.renderWhitespace,
                  }}
                />
              </div>
            </div>

            {/* Volet Secondaire (Droite / Bas) */}
            <div className="flex-1 h-full overflow-hidden flex flex-col bg-[#090b10]">
              <div className="px-3 py-1 bg-[#101420] border-b border-[#1c2234] text-[11px] font-mono text-cyan-300 flex items-center justify-between">
                <span className="truncate font-semibold">{splitTab.split('/').pop()}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!splitTab) return;
                      if (debounceTimerRef.current) {
                        clearTimeout(debounceTimerRef.current);
                        debounceTimerRef.current = null;
                      }
                      const content = pendingUpdatesRef.current[splitTab] !== undefined
                        ? pendingUpdatesRef.current[splitTab]
                        : fileContents[splitTab];

                      if (pendingUpdatesRef.current[splitTab] !== undefined) {
                        updateFileContent(splitTab, content);
                        delete pendingUpdatesRef.current[splitTab];
                      }

                      if (content !== undefined) {
                        await api.writeFile(splitTab, content);
                        if (soundEnabled) soundManager.playSuccess();
                        addLog('info', `Fichier secondaire enregistré : ${splitTab}`);
                      }
                    }}
                    className="p-1 hover:bg-[#1a2032] rounded text-gray-400 hover:text-white transition"
                    title="Enregistrer ce fichier"
                  >
                    <Save className="w-3 h-3" />
                  </button>
                  <button
                    onClick={closeSplit}
                    className="p-1 hover:bg-[#1a2032] rounded text-gray-400 hover:text-white transition"
                    title="Fermer ce volet"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex-1 w-full h-full">
                <Editor
                  path={splitTab}
                  value={fileContents[splitTab] ?? ''}
                  language={getLanguage(splitTab)}
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  onChange={handleSplitEditorChange}
                  options={{
                    fontSize: editorSettings.fontSize,
                    fontFamily: editorSettings.fontFamily,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: editorSettings.tabSize,
                    wordWrap: editorSettings.wordWrap,
                    lineNumbers: editorSettings.lineNumbers,
                    cursorBlinking: editorSettings.cursorBlinking,
                    smoothScrolling: editorSettings.smoothScrolling,
                    renderWhitespace: editorSettings.renderWhitespace,
                  }}
                />
              </div>
            </div>
          </div>
        ) : activeTab ? (
          <Editor
            path={activeTab}
            value={fileContents[activeTab] ?? ''}
            language={getLanguage(activeTab)}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            options={{
              fontSize: editorSettings.fontSize,
              fontFamily: editorSettings.fontFamily,
              minimap: { enabled: editorSettings.minimap },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: editorSettings.tabSize,
              wordWrap: editorSettings.wordWrap,
              lineNumbers: editorSettings.lineNumbers,
              cursorBlinking: editorSettings.cursorBlinking,
              smoothScrolling: editorSettings.smoothScrolling,
              renderWhitespace: editorSettings.renderWhitespace,
              renderLineHighlight: 'all',
            }}
          />
        ) : null}
      </div>
    </div>
  );
};
