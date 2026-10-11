import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  GitCommit,
  Plus,
  Minus,
  RefreshCw,
  Check,
  Sparkles,
  GitPullRequest,
  FileCode,
  FilePlus,
  FileX,
  FileEdit,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api, GitFileStatus } from '../lib/ipc';
import { invoke } from '@tauri-apps/api/core';
import { DiffEditor } from '@monaco-editor/react';

export const GitSourceControl: React.FC = () => {
  const {
    gitStatus,
    gitBranches,
    gitCommits,
    isGitLoading,
    refreshGitStatus,
    stageGitFile,
    unstageGitFile,
    commitGit,
    checkoutGitBranch,
    createGitBranch,
    setDiff,
    openFile,
    addLog,
  } = useAppStore();

  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGeneratingAiMsg, setIsGeneratingAiMsg] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranchInput, setShowNewBranchInput] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [activeView, setActiveView] = useState<'changes' | 'graph'>('changes');
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);
  const [graphSearch, setGraphSearch] = useState('');
  const [diffPreview, setDiffPreview] = useState<{ path: string; original: string; modified: string } | null>(null);

  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);
  const [untrackedExpanded, setUntrackedExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    refreshGitStatus();
  }, []);

  const handleStageAll = async () => {
    if (!gitStatus) return;
    try {
      const allFiles = [
        ...gitStatus.unstaged.map((f: GitFileStatus) => f.path),
        ...gitStatus.untracked.map((f: any) => typeof f === 'string' ? f : f.path),
      ];
      for (const p of allFiles) {
        await stageGitFile(p);
      }
      addLog('info', `Indexation de ${allFiles.length} fichiers terminée.`);
    } catch (err: any) {
      addLog('error', `Erreur lors de l'indexation: ${err.message}`);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      const res = await commitGit(commitMessage.trim());
      addLog('info', `Commit effectué : ${res || commitMessage}`);
      setCommitMessage('');
    } catch (err: any) {
      addLog('error', `Erreur commit Git : ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleInspectDiff = async (path: string, staged: boolean) => {
    try {
      // 1. Charger la version originale HEAD via invoke get_git_file_content
      let original = '';
      try {
        original = await invoke<string>('get_git_file_content', { path, revision: 'HEAD' });
      } catch {
        try {
          original = await api.getGitFileContent(path, 'HEAD');
        } catch {
          original = '';
        }
      }

      // 2. Charger le contenu modifié
      let modified = '';
      try {
        modified = await api.readFile(path);
      } catch {
        try {
          modified = await api.getGitDiff(path, staged);
        } catch {
          modified = '';
        }
      }

      // 3. Ouvrir la vue Diff Monaco en lecture seule pour éviter toute corruption accidentelle
      setDiff({ path, original, modified, readOnly: true });
      openFile(path);
      setDiffPreview({ path, original, modified });
    } catch (err: any) {
      addLog('error', `Impossible de lire le diff pour ${path} : ${err.message}`);
    }
  };

  const handleAiCommitMessage = async () => {
    setIsGeneratingAiMsg(true);
    try {
      // Obtenir le diff général pour aider l'IA
      let fullDiff = '';
      try {
        fullDiff = await api.getGitDiff(undefined, true);
      } catch {
        try {
          fullDiff = await api.getGitDiff(undefined, false);
        } catch {
          fullDiff = '';
        }
      }

      const { profiles, activeProfileIndex } = useAppStore.getState();
      const profile = profiles?.[activeProfileIndex] || profiles?.[0];

      let generatedMsg = '';

      // Génération sécurisée par fetch direct sans commande sandbox shell
      if (profile?.api_url) {
        try {
          const diffSummary = fullDiff.trim().slice(0, 1500) || 
            (gitStatus?.staged?.map((f: any) => `${f.status}: ${f.path}`).join('\n') ?? 'Modifications dans le projet');

          const prompt = `You are a git commit message generator. Based on the following git diff, generate a concise, single-line Conventional Commit message (e.g. 'feat: add git integration', 'fix: correct path encoding', 'refactor: simplify diff viewer'). Respond ONLY with the commit message, no explanation, no markdown quotes.\n\nDiff:\n${diffSummary}`;

          const baseUrl = profile.api_url.endsWith('/') ? profile.api_url.slice(0, -1) : profile.api_url;
          const url = `${baseUrl}/chat/completions`;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(profile.api_key ? { Authorization: `Bearer ${profile.api_key}` } : {}),
            },
            body: JSON.stringify({
              model: profile.model_id,
              messages: [
                { role: 'system', content: 'You generate short conventional commit messages.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.2,
              max_tokens: 50,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const text = data?.choices?.[0]?.message?.content?.trim();
            if (text) {
              generatedMsg = text.replace(/^["'`]|["'`]$/g, '').trim();
            }
          }
        } catch (fetchErr) {
          console.warn("Direct fetch for AI commit message failed, falling back to smart heuristic:", fetchErr);
        }
      }

      // Fallback heuristique sécurisé sans exécution de commande shell
      if (!generatedMsg) {
        const stagedFiles = gitStatus?.staged || [];
        if (stagedFiles.length === 1) {
          const file = stagedFiles[0];
          const fileName = file.path.split('/').pop() || file.path;
          const action = file.status === 'added' ? 'feat: add' : file.status === 'deleted' ? 'chore: remove' : 'fix: update';
          generatedMsg = `${action} ${fileName}`;
        } else if (stagedFiles.length > 1) {
          const filesPreview = stagedFiles.slice(0, 2).map((f: any) => f.path.split('/').pop()).join(', ');
          generatedMsg = `feat: update ${filesPreview}${stagedFiles.length > 2 ? ` and ${stagedFiles.length - 2} others` : ''}`;
        } else {
          generatedMsg = 'feat: update project files';
        }
      }

      setCommitMessage(generatedMsg);
      addLog('info', `Message de commit suggéré par l'IA : "${generatedMsg}"`);
    } catch (e: any) {
      setCommitMessage('feat: update project files');
    } finally {
      setIsGeneratingAiMsg(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    try {
      await createGitBranch(newBranchName.trim());
      addLog('info', `Branche '${newBranchName.trim()}' créée avec succès.`);
      setNewBranchName('');
      setShowNewBranchInput(false);
    } catch (err: any) {
      addLog('error', `Erreur création branche : ${err.message}`);
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    try {
      await checkoutGitBranch(branchName);
      addLog('info', `Basculé sur la branche '${branchName}'.`);
      setShowBranchMenu(false);
    } catch (err: any) {
      addLog('error', `Erreur checkout : ${err.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'added':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">A</span>;
      case 'modified':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">M</span>;
      case 'deleted':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">D</span>;
      case 'renamed':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">R</span>;
      default:
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">U</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0e1017] border-r border-[#1e2029] select-none text-zinc-300">
      {/* En-tête Git */}
      <div className="p-3 border-b border-[#1e2029] flex items-center justify-between bg-[#12141d]">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase">Contrôle de Source</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => refreshGitStatus()}
            className={`p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#1f2230] transition-colors ${
              isGitLoading ? 'animate-spin text-emerald-400' : ''
            }`}
            title="Rafraîchir l'état Git"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sélecteur de vue : Changements vs Graphe Git (Item 10) */}
      <div className="flex border-b border-[#1e2029] bg-[#10121a] p-1.5 gap-1.5">
        <button
          onClick={() => setActiveView('changes')}
          className={`flex-1 py-1 px-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
            activeView === 'changes'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#181a24]'
          }`}
        >
          <GitCommit className="w-3.5 h-3.5" />
          <span>Changements</span>
          {((gitStatus?.staged?.length || 0) + (gitStatus?.unstaged?.length || 0) + (gitStatus?.untracked?.length || 0)) > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-300 text-[10px] font-mono">
              {(gitStatus?.staged?.length || 0) + (gitStatus?.unstaged?.length || 0) + (gitStatus?.untracked?.length || 0)}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveView('graph')}
          className={`flex-1 py-1 px-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
            activeView === 'graph'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#181a24]'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Graphe Git</span>
          <span className="px-1.5 py-0.2 rounded-full bg-zinc-700/50 text-zinc-300 text-[10px] font-mono">
            {gitCommits.length}
          </span>
        </button>
      </div>

      {activeView === 'changes' ? (
        <>
          {/* Sélecteur de branche & Info remote */}
          <div className="p-2.5 bg-[#141620] border-b border-[#1e2029]">
        <div className="relative">
          <button
            onClick={() => setShowBranchMenu(!showBranchMenu)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#1a1d2b] hover:bg-[#222538] border border-[#2b2f42] text-xs font-medium text-zinc-200 transition-colors"
          >
            <div className="flex items-center gap-2 truncate">
              <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{gitStatus?.current_branch || 'main'}</span>
              {gitStatus && (gitStatus.ahead > 0 || gitStatus.behind > 0) && (
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
                  {gitStatus.ahead > 0 && (
                    <span className="text-emerald-400 flex items-center">
                      <ArrowUpRight className="w-3 h-3" />
                      {gitStatus.ahead}
                    </span>
                  )}
                  {gitStatus.behind > 0 && (
                    <span className="text-amber-400 flex items-center">
                      <ArrowDownLeft className="w-3 h-3" />
                      {gitStatus.behind}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          </button>

          {/* Menu déroulant des branches */}
          {showBranchMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#161822] border border-[#2b2f42] rounded-lg shadow-2xl z-30 overflow-hidden py-1">
              <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-[#232635] flex items-center justify-between">
                <span>Branches Locales</span>
                <button
                  onClick={() => setShowNewBranchInput(!showNewBranchInput)}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-[10px]"
                >
                  <Plus className="w-3 h-3" />
                  Nouvelle
                </button>
              </div>

              {showNewBranchInput && (
                <div className="p-2 border-b border-[#232635] flex gap-1">
                  <input
                    type="text"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="nom-de-branche..."
                    className="flex-1 bg-[#0e1017] border border-[#2b2f42] rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-emerald-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                  />
                  <button
                    onClick={handleCreateBranch}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                  >
                    Créer
                  </button>
                </div>
              )}

              <div className="max-h-48 overflow-y-auto">
                {gitBranches.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => handleCheckoutBranch(b.name)}
                    className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between hover:bg-[#202333] transition-colors ${
                      b.is_current ? 'text-emerald-400 font-semibold bg-emerald-500/10' : 'text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{b.name}</span>
                    {b.is_current && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zone de Commit */}
      <div className="p-3 border-b border-[#1e2029] bg-[#10121a]">
        <div className="relative">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Message de commit (Ctrl+Enter pour valider)..."
            rows={2}
            className="w-full bg-[#181a24] border border-[#282c3f] rounded-lg p-2 text-xs text-zinc-200 placeholder-zinc-500 resize-none outline-none focus:border-indigo-500 transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleCommit();
              }
            }}
          />
        </div>

        <div className="flex gap-1.5 mt-2">
          <button
            onClick={handleCommit}
            disabled={isCommitting || !commitMessage.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-lg text-xs font-medium shadow-md transition-all"
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>{isCommitting ? 'Commit en cours...' : 'Valider'}</span>
          </button>

          <button
            onClick={handleAiCommitMessage}
            disabled={isGeneratingAiMsg}
            title="Générer un message de commit via IA"
            className="p-1.5 rounded-lg bg-[#1f2232] hover:bg-[#282c40] text-amber-400 border border-[#2b3046] transition-colors"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAiMsg ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Listes de fichiers (Staged, Unstaged, Untracked) */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#181a24]">
        {/* CHANGEMENTS INDEXÉS (STAGED) */}
        <div>
          <button
            onClick={() => setStagedExpanded(!stagedExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-400 hover:bg-[#141622] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {stagedExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Indexés pour le commit</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400">
              {gitStatus?.staged?.length || 0}
            </span>
          </button>

          {stagedExpanded && gitStatus?.staged && gitStatus.staged.length > 0 && (
            <div className="px-2 pb-2 space-y-0.5">
              {gitStatus.staged.map((f: GitFileStatus) => (
                <div
                  key={f.path}
                  className="group flex items-center justify-between px-2 py-1 rounded-md text-xs hover:bg-[#1a1d2b] transition-colors cursor-pointer"
                  onClick={() => handleInspectDiff(f.path, true)}
                >
                  <div className="flex items-center gap-2 truncate">
                    {getStatusBadge(f.status)}
                    <span className="truncate text-zinc-300 font-mono text-[11px]">{f.path}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      unstageGitFile(f.path);
                    }}
                    title="Désindexer (unstage)"
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-400 rounded transition-opacity"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MODIFICATIONS NON-INDEXÉES */}
        <div>
          <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-400 hover:bg-[#141622] transition-colors">
            <button
              onClick={() => setUnstagedExpanded(!unstagedExpanded)}
              className="flex items-center gap-1.5 flex-1 text-left"
            >
              {unstagedExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Modifications</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 ml-1">
                {gitStatus?.unstaged?.length || 0}
              </span>
            </button>

            {gitStatus?.unstaged && gitStatus.unstaged.length > 0 && (
              <button
                onClick={handleStageAll}
                title="Tout indexer"
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Tout
              </button>
            )}
          </div>

          {unstagedExpanded && gitStatus?.unstaged && gitStatus.unstaged.length > 0 && (
            <div className="px-2 pb-2 space-y-0.5">
              {gitStatus.unstaged.map((f: GitFileStatus) => (
                <div
                  key={f.path}
                  className="group flex items-center justify-between px-2 py-1 rounded-md text-xs hover:bg-[#1a1d2b] transition-colors cursor-pointer"
                  onClick={() => handleInspectDiff(f.path, false)}
                >
                  <div className="flex items-center gap-2 truncate">
                    {getStatusBadge(f.status)}
                    <span className="truncate text-zinc-300 font-mono text-[11px]">{f.path}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      stageGitFile(f.path);
                    }}
                    title="Indexer (stage)"
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-emerald-400 rounded transition-opacity"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FICHIERS NON-SUIVIS (UNTRACKED) */}
        {gitStatus?.untracked && gitStatus.untracked.length > 0 && (
          <div>
            <button
              onClick={() => setUntrackedExpanded(!untrackedExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-400 hover:bg-[#141622] transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {untrackedExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span>Fichiers Non-Suivis</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-600/30 text-zinc-300">
                {gitStatus.untracked.length}
              </span>
            </button>

            {untrackedExpanded && (
              <div className="px-2 pb-2 space-y-0.5">
                {gitStatus.untracked.map((item: any) => {
                  const path = typeof item === 'string' ? item : item.path;
                  return (
                    <div
                      key={path}
                      className="group flex items-center justify-between px-2 py-1 rounded-md text-xs hover:bg-[#1a1d2b] transition-colors cursor-pointer"
                      onClick={() => openFile(path)}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300">?</span>
                        <span className="truncate text-zinc-400 font-mono text-[11px]">{path}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          stageGitFile(path);
                        }}
                        title="Ajouter au suivi"
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-emerald-400 rounded transition-opacity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* HISTORIQUE RÉCENT DES COMMITS */}
        <div>
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-400 hover:bg-[#141622] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {historyExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Historique Récent</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              {gitCommits.length}
            </span>
          </button>

          {historyExpanded && (
            <div className="px-2 pb-2 space-y-1.5">
              {gitCommits.map((c) => (
                <div
                  key={c.hash}
                  className="p-2 rounded-lg bg-[#141622] border border-[#202332] text-xs flex flex-col gap-1 hover:border-[#2e334a] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {c.short_hash}
                    </span>
                    <span className="text-[10px] text-zinc-500">{c.date}</span>
                  </div>
                  <p className="text-zinc-200 font-medium line-clamp-2">{c.message}</p>
                  <span className="text-[10px] text-zinc-500 truncate">{c.author}</span>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
        </>
      ) : (
        /* GRAPHE GIT INTERACTIF (Item 10) */
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c12]">
          {/* Barre de recherche dans les commits & bouton nouvelle branche */}
          <div className="p-2.5 border-b border-[#1e2029] bg-[#12141f] flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={graphSearch}
                onChange={(e) => setGraphSearch(e.target.value)}
                placeholder="Filtrer commits..."
                className="w-full bg-[#090a10] border border-[#232738] rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <button
              onClick={() => setShowNewBranchInput(!showNewBranchInput)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-medium transition flex items-center gap-1 shrink-0"
              title="Créer une nouvelle branche"
            >
              <Plus className="w-3 h-3" /> Branche
            </button>
          </div>

          {showNewBranchInput && (
            <div className="p-2.5 border-b border-[#1e2029] bg-[#161926] flex gap-2 animate-fadeIn">
              <input
                type="text"
                autoFocus
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="nom-de-branche..."
                className="flex-1 bg-[#090a10] border border-emerald-500 rounded-lg px-2.5 py-1 text-xs text-white outline-none font-mono"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
              />
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition"
              >
                Créer
              </button>
              <button
                onClick={() => setShowNewBranchInput(false)}
                className="p-1 hover:bg-[#202538] text-zinc-400 hover:text-white rounded-lg"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Arborescence Visuelle SVG des Commits */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {gitCommits.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">
                Aucun commit dans l'historique du dépôt.
              </div>
            ) : (
              gitCommits
                .filter((c) =>
                  !graphSearch.trim() ||
                  c.message.toLowerCase().includes(graphSearch.toLowerCase()) ||
                  c.short_hash.toLowerCase().includes(graphSearch.toLowerCase()) ||
                  c.author.toLowerCase().includes(graphSearch.toLowerCase())
                )
                .map((c, idx, arr) => {
                  const isCurrentHead = idx === 0;
                  const matchingBranch = gitBranches.find(
                    (b) => b.commit_hash === c.short_hash || b.commit_hash === c.hash
                  );
                  const isSelected = selectedCommit?.hash === c.hash;

                  return (
                    <div
                      key={c.hash}
                      onClick={() => setSelectedCommit(isSelected ? null : c)}
                      className={`relative flex items-start gap-3 p-2.5 rounded-xl border transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-[#181c2b] border-emerald-500/60 shadow-lg'
                          : 'bg-[#10131e] border-[#1e2335] hover:bg-[#141826] hover:border-[#2a3048]'
                      }`}
                    >
                      {/* Nœud Graphique SVG avec Connecteur vertical */}
                      <div className="flex flex-col items-center shrink-0 w-6 pt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-transform duration-200 group-hover:scale-125 flex items-center justify-center ${
                            isCurrentHead
                              ? 'bg-emerald-400 border-white shadow-md shadow-emerald-400/50'
                              : matchingBranch
                              ? 'bg-cyan-400 border-cyan-200'
                              : 'bg-zinc-700 border-zinc-500'
                          }`}
                        >
                          <div className="w-1 h-1 bg-black rounded-full" />
                        </div>
                        {idx < arr.length - 1 && (
                          <div className="w-0.5 h-12 bg-gradient-to-b from-zinc-600 via-zinc-700 to-transparent mt-1" />
                        )}
                      </div>

                      {/* Contenu du Commit */}
                      <div className="flex-1 overflow-hidden space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                              {c.short_hash}
                            </span>

                            {isCurrentHead && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                HEAD
                              </span>
                            )}

                            {matchingBranch && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                                <GitBranch className="w-2.5 h-2.5" />
                                {matchingBranch.name}
                              </span>
                            )}
                          </div>

                          <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                            {c.date}
                          </span>
                        </div>

                        <p className="text-zinc-200 text-xs font-medium line-clamp-2">
                          {c.message}
                        </p>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-zinc-500 truncate max-w-[150px]">
                            {c.author}
                          </span>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCheckoutBranch(c.short_hash);
                              }}
                              className="px-2 py-0.5 rounded bg-[#1e2336] hover:bg-emerald-600 text-zinc-300 hover:text-white text-[10px] font-mono transition"
                              title="Checkout ce commit"
                            >
                              Checkout
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setNewBranchName(`branch-${c.short_hash}`);
                                setShowNewBranchInput(true);
                              }}
                              className="px-2 py-0.5 rounded bg-[#1e2336] hover:bg-cyan-600 text-zinc-300 hover:text-white text-[10px] font-mono transition"
                              title="Créer une branche depuis ce commit"
                            >
                              +Branche
                            </button>
                          </div>
                        </div>

                        {/* Tiroir d'inspection du commit sélectionné */}
                        {isSelected && (
                          <div className="mt-2 pt-2 border-t border-[#23293e] text-zinc-400 text-[11px] space-y-1.5 animate-fadeIn">
                            <div className="text-[10px] font-mono text-zinc-500 break-all">
                              Hash : {c.hash}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const diff = await api.getGitDiff(undefined, false);
                                    setDiff({ path: `Commit: ${c.short_hash}`, original: '', modified: diff });
                                  } catch (err: any) {
                                    addLog('error', `Erreur inspection diff commit: ${err.message}`);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition shadow flex items-center gap-1"
                              >
                                <FileCode className="w-3 h-3" /> Inspecter le Diff
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(c.hash);
                                  addLog('info', `Hash de commit copié : ${c.short_hash}`);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#1e2336] hover:bg-[#282f48] text-zinc-300 text-[11px] transition"
                              >
                                Copier Hash
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* Visualiseur Diff Monaco Dédié en Lecture Seule */}
      {diffPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#10121a] border border-[#232738] rounded-2xl w-full max-w-5xl h-[75vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 bg-[#141724] border-b border-[#232738]">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-xs text-zinc-200 font-medium">{diffPreview.path}</span>
                <span className="text-[10px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50">
                  HEAD (Original) ↔ Fichier Modifié (Lecture seule)
                </span>
              </div>
              <button
                onClick={() => setDiffPreview(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-[#202538] transition"
                title="Fermer la vue diff"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 w-full h-full">
              <DiffEditor
                original={diffPreview.original}
                modified={diffPreview.modified}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
