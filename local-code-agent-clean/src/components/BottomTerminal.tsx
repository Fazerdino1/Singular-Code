import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../lib/ipc';
import { Terminal, FileText, ChevronDown, ChevronUp, Trash2, Plus, X, Shield } from 'lucide-react';

interface BottomTerminalProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface TermSession {
  id: number;
  title: string;
  shell: 'bash' | 'zsh' | 'sh' | 'python3' | 'node';
}

export const BottomTerminal: React.FC<BottomTerminalProps> = ({ isCollapsed, onToggleCollapse }) => {
  const {
    activeBottomTab,
    setActiveBottomTab,
    systemLogs,
    terminalHeight,
  } = useAppStore(
    useShallow((s) => ({
      activeBottomTab: s.activeBottomTab,
      setActiveBottomTab: s.setActiveBottomTab,
      systemLogs: s.systemLogs,
      terminalHeight: s.terminalHeight,
    }))
  );

  const [sessions, setSessions] = useState<TermSession[]>([
    { id: 1, title: 'Terminal 1', shell: 'bash' }
  ]);
  const [activeSessionId, setActiveSessionId] = useState(1);

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const commandInputRef = useRef<string>('');

  const currentSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || { id: 1, title: 'Terminal 1', shell: 'bash' };

  const getShellPrompt = (shell: string) => {
    switch (shell) {
      case 'python3':
        return '\r\n\x1b[33m>>> \x1b[0m';
      case 'node':
        return '\r\n\x1b[32m> \x1b[0m';
      case 'zsh':
        return `\r\n\x1b[32muser@sandbox\x1b[0m:\x1b[35m/workspace\x1b[0m (zsh)% `;
      default:
        return `\r\n\x1b[32muser@sandbox\x1b[0m:\x1b[34m/workspace\x1b[0m$ `;
    }
  };

  const initTerminal = () => {
    if (!terminalContainerRef.current) return;
    if (xtermInstance.current) {
      xtermInstance.current.dispose();
      xtermInstance.current = null;
    }

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 12,
      theme: {
        background: '#090b10',
        foreground: '#c0caf5',
        cursor: '#7aa2f7',
        selectionBackground: '#33467c',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalContainerRef.current);
    try {
      fit.fit();
    } catch {}

    term.writeln(`\x1b[38;2;99;102;241m[Terminal #${currentSession.id} - ${currentSession.shell.toUpperCase()}]\x1b[0m Bac à sable Bubblewrap actif.`);
    term.write(getShellPrompt(currentSession.shell));

    term.onData(async (data) => {
      if (data === '\r') {
        const cmd = commandInputRef.current.trim();
        commandInputRef.current = '';
        term.writeln('');

        if (cmd) {
          try {
            let executableCmd = cmd;
            if (currentSession.shell === 'python3') {
              executableCmd = `python3 -c "${cmd.replace(/"/g, '\\"')}"`;
            } else if (currentSession.shell === 'node') {
              executableCmd = `node -e "${cmd.replace(/"/g, '\\"')}"`;
            }

            const out = await api.runSandboxCommand(executableCmd);
            if (out.stdout) {
              term.writeln(out.stdout.replace(/\n/g, '\r\n'));
            }
            if (out.stderr) {
              term.writeln(`\x1b[31m${out.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
            }
            term.writeln(`\x1b[90m(Code sortie: ${out.exit_code}, ${out.duration_ms}ms)\x1b[0m`);
          } catch (err: any) {
            term.writeln(`\x1b[31mErreur d'exécution: ${err}\x1b[0m`);
          }
        }
        term.write(getShellPrompt(currentSession.shell));
      } else if (data === '\u007F') {
        if (commandInputRef.current.length > 0) {
          commandInputRef.current = commandInputRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else {
        commandInputRef.current += data;
        term.write(data);
      }
    });

    xtermInstance.current = term;
    fitAddon.current = fit;
  };

  useEffect(() => {
    if (!isCollapsed && activeBottomTab === 'terminal') {
      const timer = setTimeout(() => {
        initTerminal();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCollapsed, activeBottomTab, activeSessionId, currentSession.shell]);

  const addTerminal = (shell: 'bash' | 'zsh' | 'sh' | 'python3' | 'node' = 'bash') => {
    const nextId = (sessions[sessions.length - 1]?.id || 0) + 1;
    const newSession: TermSession = {
      id: nextId,
      title: `${shell === 'python3' ? 'Python' : shell === 'node' ? 'Node' : 'Terminal'} ${nextId}`,
      shell,
    };
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(nextId);
  };

  const changeShell = (id: number, newShell: 'bash' | 'zsh' | 'sh' | 'python3' | 'node') => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, shell: newShell, title: `${newShell} ${s.id}` } : s))
    );
  };

  const clearCurrentTerminal = () => {
    if (xtermInstance.current) {
      xtermInstance.current.clear();
      xtermInstance.current.write(getShellPrompt(currentSession.shell));
    }
  };

  const closeTerminal = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) return;
    const nextSessions = sessions.filter((s) => s.id !== id);
    setSessions(nextSessions);
    if (activeSessionId === id) {
      setActiveSessionId(nextSessions[0].id);
    }
  };

  return (
    <div
      style={{ height: isCollapsed ? 32 : terminalHeight }}
      className={`flex flex-col bg-[#090b10] border-t border-[#1c2234] select-none shrink-0 ${
        isCollapsed ? 'transition-[height] duration-150' : ''
      }`}
    >
      {/* Barre d'onglets Terminal & Logs */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-[#1c2234] bg-[#0d1017] text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Onglets des terminaux */}
          {sessions.map((sess) => {
            const isActive = activeBottomTab === 'terminal' && activeSessionId === sess.id && !isCollapsed;
            return (
              <div
                key={sess.id}
                onClick={() => {
                  if (isCollapsed) onToggleCollapse();
                  setActiveBottomTab('terminal');
                  setActiveSessionId(sess.id);
                }}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer transition ${
                  isActive
                    ? 'bg-[#181d2c] text-indigo-400 font-medium border border-indigo-500/30'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#121622]'
                }`}
              >
                <Terminal className="w-3 h-3" />
                <span className="text-[11px] font-mono">{sess.title}</span>
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => closeTerminal(sess.id, e)}
                    className="p-0.5 rounded opacity-40 group-hover:opacity-100 hover:text-white"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={() => addTerminal()}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-[#141824] transition"
            title="Ouvrir un nouveau terminal sandbox"
          >
            <Plus className="w-3 h-3" />
          </button>

          <div className="h-3 w-[1px] bg-gray-800 mx-1" />

          {/* Onglet Logs Système */}
          <button
            onClick={() => {
              if (isCollapsed) onToggleCollapse();
              setActiveBottomTab('logs');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition ${
              activeBottomTab === 'logs' && !isCollapsed
                ? 'bg-[#181d2c] text-indigo-400 font-medium border border-indigo-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#121622]'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span className="text-[11px]">Logs Système ({systemLogs.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeBottomTab === 'terminal' && !isCollapsed && (
            <>
              {/* Sélecteur de Shell (Item 8) */}
              <div className="flex items-center gap-1.5 bg-[#121622] px-2 py-0.5 rounded-lg border border-[#202538]">
                <span className="text-[10px] text-gray-500 font-mono">Shell:</span>
                <select
                  value={currentSession.shell}
                  onChange={(e) => changeShell(currentSession.id, e.target.value as any)}
                  className="bg-transparent text-cyan-300 font-mono text-[10px] focus:outline-none cursor-pointer"
                >
                  <option value="bash" className="bg-[#121622] text-gray-200">bash</option>
                  <option value="zsh" className="bg-[#121622] text-gray-200">zsh</option>
                  <option value="sh" className="bg-[#121622] text-gray-200">sh</option>
                  <option value="python3" className="bg-[#121622] text-amber-300">python3</option>
                  <option value="node" className="bg-[#121622] text-emerald-300">node</option>
                </select>
              </div>

              {/* Bouton Nettoyer Terminal */}
              <button
                onClick={clearCurrentTerminal}
                className="p-1 rounded-lg hover:bg-[#1a2030] text-gray-400 hover:text-white transition"
                title="Effacer l'écran du terminal (Clear)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {activeBottomTab === 'logs' && !isCollapsed && (
            <button
              onClick={() => useAppStore.setState({ systemLogs: [] })}
              className="p-1 rounded-lg hover:bg-[#1a2030] text-gray-400 hover:text-white transition"
              title="Effacer les logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-lg hover:bg-[#1a2030] text-gray-400 hover:text-white transition"
            title={isCollapsed ? 'Agrandir le panneau' : 'Replier le panneau'}
          >
            {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Corps du panneau */}
      {!isCollapsed && (
        <div className="flex-1 w-full h-full overflow-hidden p-2 bg-[#090b10]">
          {activeBottomTab === 'terminal' ? (
            <div ref={terminalContainerRef} className="w-full h-full" />
          ) : (
            <div className="w-full h-full overflow-y-auto space-y-1 font-mono text-[11px] text-gray-300 p-2">
              {systemLogs.length === 0 ? (
                <div className="text-gray-500 py-6 text-center">Aucun log enregistré dans la session.</div>
              ) : (
                systemLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">[{log.timestamp}]</span>
                    <span
                      className={`font-semibold shrink-0 uppercase text-[9px] px-1.5 py-0.2 rounded ${
                        log.level === 'error'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : log.level === 'warn'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : log.level === 'security'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
