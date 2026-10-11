import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, ToolCallCard } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { api, LearningItem, SymbolItem } from '../lib/ipc';
import { soundManager } from '../lib/sound';
import {
  Send, Square, Sparkles, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronRight,
  Copy, Check, Terminal, FileCode, ListTodo, AtSign, Globe, Undo2, Layers, RotateCcw,
  BookOpen, HelpCircle, Compass, Download, Code, ArrowUpRight, BrainCircuit, Shield,
  GitBranch, Workflow, Image, CheckSquare, Zap, Play, Plus, Trash2, X, Code2, Database,
  Link2, FileText
} from 'lucide-react';

interface SlashCommandDef {
  command: string;
  label: string;
  description: string;
  icon: any;
  needsArgs: boolean;
  example?: string;
}

const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    command: '/libreoffice',
    label: '/libreoffice <writer|calc|impress|draw|math|base> [nom]',
    description: 'Créer un document compatible LibreOffice (Writer, Calc, Impress, Draw, Math, Base)',
    icon: FileText,
    needsArgs: false,
    example: '/libreoffice calc budget_2026',
  },
  {
    command: '/tdd',
    label: '/tdd',
    description: 'Exécuter la suite de tests et boucle d\'auto-réparation automatique',
    icon: Play,
    needsArgs: false,
  },
  {
    command: '/rollback',
    label: '/rollback',
    description: 'Annuler immédiatement la dernière transaction atomique multi-fichiers',
    icon: Undo2,
    needsArgs: false,
  },
  {
    command: '/unload',
    label: '/unload',
    description: 'Décharger immédiatement les modèles de la VRAM (100% GPU libre)',
    icon: Zap,
    needsArgs: false,
  },
  {
    command: '/learnings',
    label: '/learnings',
    description: 'Gérer la mémoire persistante du projet (.localagent/learnings.json)',
    icon: BrainCircuit,
    needsArgs: false,
  },
  {
    command: '/web',
    label: '/web <recherche>',
    description: 'Recherche web (DuckDuckGo) & documentation en direct',
    icon: Globe,
    needsArgs: true,
    example: '/web rust axum websockets',
  },
  {
    command: '/git',
    label: '/git',
    description: 'Inspecter et synchroniser le contrôle de code source Git',
    icon: GitBranch,
    needsArgs: false,
  },
  {
    command: '/arch',
    label: '/arch',
    description: 'Afficher le Canvas d\'Architecture Singular Code',
    icon: Workflow,
    needsArgs: false,
  },
  {
    command: '/plan',
    label: '/plan',
    description: 'Basculer en Mode Plan & Review (Validation avant édition)',
    icon: CheckSquare,
    needsArgs: false,
  },
  {
    command: '/image',
    label: '/image <chemin_image>',
    description: 'Analyse multimodale locale de maquette/image avec Gemma4',
    icon: Image,
    needsArgs: true,
    example: '/image screenshots/app_mockup.png',
  },
  {
    command: '/skills',
    label: '/skills',
    description: 'Ouvrir le panneau des compétences expertes de l\'agent',
    icon: Sparkles,
    needsArgs: false,
  },
  {
    command: '/mode',
    label: '/mode <ask|architect|code|debug|review|yolo>',
    description: 'Changer le mode d\'opération de l\'agent (6 modes)',
    icon: Compass,
    needsArgs: true,
    example: '/mode yolo',
  },
  {
    command: '/undo',
    label: '/undo',
    description: 'Restaurer le dernier checkpoint / snapshot de sécurité',
    icon: Undo2,
    needsArgs: false,
  },
  {
    command: '/compact',
    label: '/compact',
    description: 'Compacter l\'historique des messages pour économiser les tokens',
    icon: Layers,
    needsArgs: false,
  },
  {
    command: '/clear',
    label: '/clear',
    description: 'Effacer toute la conversation actuelle',
    icon: RotateCcw,
    needsArgs: false,
  },
  {
    command: '/init',
    label: '/init',
    description: 'Générer le fichier AGENT.md pour configurer le projet',
    icon: BookOpen,
    needsArgs: false,
  },
  {
    command: '/help',
    label: '/help',
    description: 'Afficher le guide complet des commandes et de l\'agent',
    icon: HelpCircle,
    needsArgs: false,
  },
];

// Résolution Intelligente de Dépendances (Item 3)
function extractLocalDependencies(
  filePath: string,
  content: string,
  allFiles: { path: string }[]
): string[] {
  if (!content) return [];
  const found = new Set<string>();
  const allPaths = allFiles.map((f) => f.path);

  // 1. JS / TS imports: import ... from './...' or require('./...')
  const jsRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?|require\s*\(\s*)['"](\.[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = jsRegex.exec(content)) !== null) {
    const rawTarget = m[1];
    const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
    const cleanRel = rawTarget.replace(/^\.\//, '');
    const candidates = [
      dir ? `${dir}/${cleanRel}` : cleanRel,
      dir ? `${dir}/${cleanRel}.ts` : `${cleanRel}.ts`,
      dir ? `${dir}/${cleanRel}.tsx` : `${cleanRel}.tsx`,
      dir ? `${dir}/${cleanRel}.js` : `${cleanRel}.js`,
      dir ? `${dir}/${cleanRel}.jsx` : `${cleanRel}.jsx`,
      dir ? `${dir}/${cleanRel}/index.ts` : `${cleanRel}/index.ts`,
      dir ? `${dir}/${cleanRel}/index.tsx` : `${cleanRel}/index.tsx`,
    ];
    for (const c of candidates) {
      if (allPaths.includes(c)) {
        found.add(c);
        break;
      }
    }
  }

  // 2. Rust mod / use crate: mod xxx;
  const rustModRegex = /mod\s+([a-zA-Z0-9_]+)\s*;/g;
  while ((m = rustModRegex.exec(content)) !== null) {
    const modName = m[1];
    const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
    const candidates = [
      dir ? `${dir}/${modName}.rs` : `${modName}.rs`,
      dir ? `${dir}/${modName}/mod.rs` : `${modName}/mod.rs`,
    ];
    for (const c of candidates) {
      if (allPaths.includes(c)) {
        found.add(c);
        break;
      }
    }
  }

  // 3. Python imports: from .xxx import ...
  const pyRegex = /from\s+\.?([a-zA-Z0-9_]+)\s+import/g;
  while ((m = pyRegex.exec(content)) !== null) {
    const modName = m[1];
    const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
    const candidates = [
      dir ? `${dir}/${modName}.py` : `${modName}.py`,
      `${modName}.py`,
    ];
    for (const c of candidates) {
      if (allPaths.includes(c)) {
        found.add(c);
        break;
      }
    }
  }

  return Array.from(found).filter((p) => p !== filePath);
}

const AgentChatComponent: React.FC = () => {
  const {
    messages,
    addMessage,
    updateLastAgentMessage,
    addToolCard,
    updateToolCard,
    todos,
    setTodos,
    isAgentRunning,
    setIsAgentRunning,
    profiles,
    activeProfileIndex,
    approvalMode,
    files,
    addLog,
    activeTab,
    openTabs,
    fileContents,
    updateFileContent,
    openFile,
    soundEnabled,
    isPlanAndReviewMode,
    setIsPlanAndReviewMode,
    setActiveActivityTab,
    tokenUsage,
    setTokenUsage,
    workspaceSymbols,
    fetchWorkspaceSymbols,
    learnings,
    fetchLearnings,
    saveLearning,
    deleteLearning,
    lastTransaction,
    setLastTransaction,
    rollbackLastTransaction,
    activeBranch,
    conversationBranches,
    forkConversation,
    switchBranch,
    detectedDependencies,
    setDetectedDependencies,
    addDependenciesToContext,
    compactHistory,
  } = useAppStore(
    useShallow((s) => ({
      messages: s.messages,
      addMessage: s.addMessage,
      updateLastAgentMessage: s.updateLastAgentMessage,
      addToolCard: s.addToolCard,
      updateToolCard: s.updateToolCard,
      todos: s.todos,
      setTodos: s.setTodos,
      isAgentRunning: s.isAgentRunning,
      setIsAgentRunning: s.setIsAgentRunning,
      profiles: s.profiles,
      activeProfileIndex: s.activeProfileIndex,
      approvalMode: s.approvalMode,
      files: s.files,
      addLog: s.addLog,
      activeTab: s.activeTab,
      openTabs: s.openTabs,
      fileContents: s.fileContents,
      updateFileContent: s.updateFileContent,
      openFile: s.openFile,
      soundEnabled: s.soundEnabled,
      isPlanAndReviewMode: s.isPlanAndReviewMode,
      setIsPlanAndReviewMode: s.setIsPlanAndReviewMode,
      setActiveActivityTab: s.setActiveActivityTab,
      tokenUsage: s.tokenUsage,
      setTokenUsage: s.setTokenUsage,
      workspaceSymbols: s.workspaceSymbols,
      fetchWorkspaceSymbols: s.fetchWorkspaceSymbols,
      learnings: s.learnings,
      fetchLearnings: s.fetchLearnings,
      saveLearning: s.saveLearning,
      deleteLearning: s.deleteLearning,
      lastTransaction: s.lastTransaction,
      setLastTransaction: s.setLastTransaction,
      rollbackLastTransaction: s.rollbackLastTransaction,
      activeBranch: s.activeBranch,
      conversationBranches: s.conversationBranches,
      forkConversation: s.forkConversation,
      switchBranch: s.switchBranch,
      detectedDependencies: s.detectedDependencies,
      setDetectedDependencies: s.setDetectedDependencies,
      addDependenciesToContext: s.addDependenciesToContext,
      compactHistory: s.compactHistory,
    }))
  );

  const [input, setInput] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showLearningsModal, setShowLearningsModal] = useState(false);
  const [newLearningTitle, setNewLearningTitle] = useState('');
  const [newLearningCategory, setNewLearningCategory] = useState('architecture');
  const [newLearningContent, setNewLearningContent] = useState('');
  const [isTddRunning, setIsTddRunning] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeProfile = profiles[activeProfileIndex] || profiles[0];

  useEffect(() => {
    if (chatEndRef.current) {
      if (isAgentRunning) {
        // Défilement direct sans interpolation fluide pendant le streaming pour éviter le thrashing du compositeur GPU
        chatEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      } else {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [messages, isAgentRunning]);

  // Écouter l'événement d'insertion de mention depuis l'explorateur de fichiers (Item 5)
  useEffect(() => {
    const handleMention = (e: any) => {
      const path = e.detail;
      if (!path) return;
      setInput((prev) => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} @${path} ` : `@${path} `;
      });
      textareaRef.current?.focus();
    };
    window.addEventListener('insert-chat-mention', handleMention);
    return () => window.removeEventListener('insert-chat-mention', handleMention);
  }, []);

  // Résolution Intelligente de Dépendances en temps réel (Item 3)
  useEffect(() => {
    if (!activeTab || !fileContents[activeTab]) {
      setDetectedDependencies([]);
      return;
    }
    const deps = extractLocalDependencies(activeTab, fileContents[activeTab], files);
    const unopenDeps = deps.filter((d) => !openTabs.includes(d));
    setDetectedDependencies(unopenDeps);
  }, [activeTab, fileContents[activeTab || ''], files, openTabs]);

  // Écouter les événements temps réel de l'agent avec Buffer de Streaming Throttled (Pack Optimisation FPS)
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let isMounted = true;
    let tokenBuffer = '';
    let flushTimeout: any = null;

    const flushTokenBuffer = () => {
      if (tokenBuffer.length > 0) {
        updateLastAgentMessage(tokenBuffer);
        tokenBuffer = '';
      }
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
    };

    api.listenAgentEvents((event: any) => {
      if (!isMounted) return;
      if (event.step_type !== 'token') {
        flushTokenBuffer();
      }

      switch (event.step_type) {
        case 'token':
          tokenBuffer += event.content;
          if (!flushTimeout) {
            flushTimeout = setTimeout(() => {
              if (isMounted) flushTokenBuffer();
            }, 45); // 45ms batching = ~22fps fluide sans surcharge CPU
          }
          break;
        case 'token_usage':
          if (event.token_usage) {
            setTokenUsage(event.token_usage);
          }
          break;
        case 'context_expanded': {
          if (event.token_usage) {
            setTokenUsage(event.token_usage);
          }
          addLog('warn', event.content);
          const lastMsg = useAppStore.getState().messages.slice(-1)[0];
          if (lastMsg && lastMsg.sender === 'agent') {
            updateLastAgentMessage(`\n\n> ⚡ *${event.content}*\n\n`);
          }
          break;
        }
        case 'thought': {
          addLog('info', `Agent : ${event.content}`);
          // Ajouter un conteneur de pensée dans le dernier message
          const lastMsg = useAppStore.getState().messages.slice(-1)[0];
          if (lastMsg && lastMsg.sender === 'agent') {
            setExpandedThoughts((prev) => ({ ...prev, [lastMsg.id]: true }));
            // Stocker comme note de réflexion
            updateLastAgentMessage(`\n<think>\n${event.content}\n</think>\n`);
          }
          break;
        }
        case 'tool_call': {
          const cardId = event.tool_id || `tool_${Date.now()}`;
          const newCard: ToolCallCard = {
            id: cardId,
            tool_name: event.tool_name || 'outil',
            tool_args: event.tool_args,
            status: 'running',
          };
          addToolCard(newCard);
          setExpandedCards((prev) => ({ ...prev, [cardId]: true }));
          break;
        }
        case 'tool_result': {
          if (event.tool_id) {
            updateToolCard(event.tool_id, {
              status: 'success',
              result: event.tool_result,
            });
            if (event.tool_name === 'todo_write' && event.tool_result?.todos) {
              setTodos(event.tool_result.todos);
            }
            const fn = (event.tool_name || '').toLowerCase();
            if (['write_file', 'create_file', 'new_file', 'touch', 'edit_file', 'delete_file', 'move_file', 'create_dir'].includes(fn)) {
              api.listFiles().then((list) => {
                const filtered = (list || []).filter((node: any) =>
                  !node.name.startsWith('.local_agent') &&
                  node.name !== 'checkpoints' &&
                  !node.path.startsWith('.local_agent') &&
                  !node.path.startsWith('checkpoints')
                );
                const affectedPath = event.tool_result?.path || event.tool_result?.modified;
                if (affectedPath) {
                  useAppStore.getState().markFileAsModifiedByAi(affectedPath);
                }
                useAppStore.getState().setFiles(filtered);
              }).catch(() => {});
            }
          }
          break;
        }
        case 'done':
          setIsAgentRunning(false);
          addLog('info', 'Tour de l\'agent terminé avec succès');
          if (useAppStore.getState().soundEnabled) soundManager.playSuccess();
          api.listFiles().then((list) => {
            const filtered = (list || []).filter((node: any) =>
              !node.name.startsWith('.local_agent') &&
              node.name !== 'checkpoints' &&
              !node.path.startsWith('.local_agent') &&
              !node.path.startsWith('checkpoints')
            );
            useAppStore.getState().setFiles(filtered);
          }).catch(() => {});
          break;
        case 'error':
          setIsAgentRunning(false);
          addLog('error', `Erreur agent : ${event.content}`);
          if (useAppStore.getState().soundEnabled) soundManager.playError();
          updateLastAgentMessage(`\n\n❌ **Erreur :** ${event.content}`);
          break;
      }
    }).then((unsub) => {
      if (!isMounted) {
        if (typeof unsub === 'function') unsub();
      } else {
        unlistenFn = unsub;
      }
    });

    return () => {
      isMounted = false;
      flushTokenBuffer();
      if (typeof unlistenFn === 'function') unlistenFn();
    };
  }, []);

  // Écouter les événements de transaction atomique multi-fichiers (Item 2) et charger données initiales (Items 3 & 18)
  useEffect(() => {
    let unlistenTx: (() => void) | null = null;
    let isMounted = true;

    api.listenAgentTransactions((tx) => {
      if (!isMounted) return;
      setLastTransaction(tx);
      addLog('info', `Transaction atomique enregistrée : ${tx.modified_files?.length || 0} fichier(s)`);
    }).then((unsub) => {
      if (!isMounted) {
        if (typeof unsub === 'function') unsub();
      } else {
        unlistenTx = unsub;
      }
    });

    fetchLearnings().catch(() => {});
    fetchWorkspaceSymbols().catch(() => {});

    return () => {
      isMounted = false;
      if (typeof unlistenTx === 'function') unlistenTx();
    };
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isAgentRunning) return;

    const userText = input.trim();
    setInput('');

    if (userText.startsWith('/')) {
      handleSlashCommand(userText);
      return;
    }

    addMessage({
      id: `user_${Date.now()}`,
      sender: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString(),
    });

    addMessage({
      id: `agent_${Date.now()}`,
      sender: 'agent',
      content: '',
      timestamp: new Date().toLocaleTimeString(),
    });

    setIsAgentRunning(true);
    addLog('info', `Début du tour de l'agent : ${userText.slice(0, 50)}...`);

    // Préparation de l'historique récent (10 derniers messages, sans <think> pour préserver le contexte)
    const historyPayload = messages
      .slice(-10)
      .filter((m) => m.content && m.content.trim().length > 0 && m.sender !== 'system')
      .map((m) => {
        let clean = m.content;
        if (clean.includes('<think>') && clean.includes('</think>')) {
          const s = clean.indexOf('<think>');
          const e = clean.indexOf('</think>');
          clean = (clean.substring(0, s) + clean.substring(e + 8)).trim();
        }
        return {
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: clean.slice(0, 2500),
        };
      });

    const activeProject = useAppStore.getState().projects.find(
      (p) => p.id === useAppStore.getState().activeProjectId
    );
    const projectRules = activeProject?.rules;
    const projectFolders = activeProject?.folders;

    // Expansion dynamique des mentions intelligentes (Item 19)
    let expandedText = userText;
    if (expandedText.includes('@git')) {
      const git = useAppStore.getState().gitStatus;
      const gitContext = git?.is_git_repo
        ? `[Contexte Git : Branche: ${git.current_branch}, ${git.staged?.length || 0} staged, ${git.unstaged?.length || 0} unstaged, ${git.untracked?.length || 0} untracked]`
        : `[Contexte Git : Non initialisé]`;
      expandedText = expandedText.replace(/@git\b/g, () => gitContext);
    }
    if (expandedText.includes('@learnings')) {
      const storedLearnings = useAppStore.getState().learnings;
      const learningsSummary = storedLearnings.length > 0
        ? `[Mémoire Long-Terme Persistante (${storedLearnings.length} règles) :\n${storedLearnings.map(l => `- [${l.category}] ${l.title}: ${l.content}`).join('\n')}]`
        : `[Mémoire Long-Terme : Aucune règle persistante enregistrée pour le moment]`;
      expandedText = expandedText.replace(/@learnings\b/g, () => learningsSummary);
    }
    if (expandedText.includes('@terminal')) {
      const logs = useAppStore.getState().systemLogs.slice(-5);
      const logSummary = `[Derniers logs système / terminal :\n${logs.map(l => `[${l.level}] ${l.message}`).join('\n')}]`;
      expandedText = expandedText.replace(/@terminal\b/g, () => logSummary);
    }
    if (expandedText.includes('@docs')) {
      const activeProj = useAppStore.getState().projects.find(
        (p) => p.id === useAppStore.getState().activeProjectId
      );
      const docsContext = activeProj?.rules
        ? `[Directives/Règles Projet :\n${activeProj.rules}]`
        : `[Directives/Règles Projet : Aucune règle définie]`;
      expandedText = expandedText.replace(/@docs\b/g, () => docsContext);
    }

    let promptToSend = expandedText;
    if (approvalMode === 'architect') {
      promptToSend = `[MODE ARCHITECTE : Établis d'abord l'architecture avec todo_write, puis génère directement les fichiers réels].\n\n${expandedText}`;
    }

    try {
      await api.runAgentLoop(
        promptToSend,
        activeProfile,
        approvalMode,
        historyPayload,
        projectRules,
        projectFolders
      );
    } catch (err: any) {
      addLog('error', `Échec exécution de l'agent : ${err}`);
      if (useAppStore.getState().soundEnabled) soundManager.playError();
      updateLastAgentMessage(`\n\n❌ **Échec :** ${err}`);
    } finally {
      setIsAgentRunning(false);
    }
  };

  const handleSlashCommand = async (fullCommand: string) => {
    const parts = fullCommand.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (command) {
      case '/tdd': {
        setIsTddRunning(true);
        addMessage({
          id: `tdd_start_${Date.now()}`,
          sender: 'system',
          content: `🧪 **Lancement de la suite de tests avec Boucle d'Auto-Réparation TDD (Item 1)...**`,
          timestamp: new Date().toLocaleTimeString(),
        });
        addLog('info', 'Exécution de la suite de tests et boucle auto-repair...');
        try {
          const report = await api.runTestSuiteAndAutoRepair();
          if (report.passed) {
            if (soundEnabled) soundManager.playSuccess();
            addMessage({
              id: `tdd_res_${Date.now()}`,
              sender: 'system',
              content: `✅ **Tests passés avec succès !**\n- Commande : \`${report.command}\`\n- Durée : ${report.duration_ms}ms\n\n\`\`\`bash\n${report.stdout.trim() || 'Tous les tests passent.'}\n\`\`\``,
              timestamp: new Date().toLocaleTimeString(),
            });
          } else {
            if (soundEnabled) soundManager.playError();
            addMessage({
              id: `tdd_res_${Date.now()}`,
              sender: 'system',
              content: `❌ **Échec des tests (Code ${report.exit_code}) :**\n- Commande : \`${report.command}\`\n\n\`\`\`bash\n${(report.stderr || report.stdout).trim()}\n\`\`\`\n\n💡 *L'agent peut corriger automatiquement ces erreurs avec le mode /mode debug ou un prompt direct.*`,
              timestamp: new Date().toLocaleTimeString(),
            });
          }
        } catch (err: any) {
          addMessage({
            id: `tdd_err_${Date.now()}`,
            sender: 'system',
            content: `❌ Erreur lors de l'exécution TDD : ${err}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        } finally {
          setIsTddRunning(false);
        }
        break;
      }

      case '/rollback': {
        if (!lastTransaction) {
          addMessage({
            id: `rb_none_${Date.now()}`,
            sender: 'system',
            content: `ℹ️ Aucune transaction atomique active à annuler.`,
            timestamp: new Date().toLocaleTimeString(),
          });
          return;
        }
        try {
          await rollbackLastTransaction();
          if (soundEnabled) soundManager.playSuccess();
          addMessage({
            id: `rb_done_${Date.now()}`,
            sender: 'system',
            content: `⏪ **Rollback Global Réussi** : Transaction \`${String(lastTransaction.transaction_id).slice(-8)}\` annulée.\nTous les ${lastTransaction.modified_files?.length || 0} fichier(s) ont été restaurés à leur état exact antérieur.`,
            timestamp: new Date().toLocaleTimeString(),
          });
        } catch (err: any) {
          addMessage({
            id: `rb_err_${Date.now()}`,
            sender: 'system',
            content: `❌ Erreur lors du Rollback : ${err}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        break;
      }

      case '/unload':
      case '/local-unload': {
        try {
          const res = await api.unloadLocalModels();
          if (soundEnabled) soundManager.playSuccess();
          addMessage({
            id: `unload_${Date.now()}`,
            sender: 'system',
            content: `🧹 **Libération de la VRAM GPU Réussie** :\n${res}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        } catch (err: any) {
          addMessage({
            id: `unload_err_${Date.now()}`,
            sender: 'system',
            content: `❌ Erreur lors du déchargement VRAM : ${err}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        break;
      }

      case '/learnings': {
        await fetchLearnings();
        setShowLearningsModal(true);
        addMessage({
          id: `learn_open_${Date.now()}`,
          sender: 'system',
          content: `🧠 Panneau de la **Mémoire Long-Terme Persistante** ouvert (${learnings.length} règle(s) chargées).`,
          timestamp: new Date().toLocaleTimeString(),
        });
        break;
      }

      case '/git': {
        setActiveActivityTab('git');
        await useAppStore.getState().refreshGitStatus();
        const status = useAppStore.getState().gitStatus;
        addMessage({
          id: `git_${Date.now()}`,
          sender: 'system',
          content: status?.is_git_repo
            ? `🌿 **Contrôle de Source Git Actif**\n- Branche : \`${status.current_branch}\`\n- Indexés (staged) : ${status.staged?.length || 0}\n- Non-indexés (unstaged) : ${status.unstaged?.length || 0}\n- Fichiers non-suivis : ${status.untracked?.length || 0}`
            : `⚠️ Le répertoire actuel n'est pas un dépôt Git.`,
          timestamp: new Date().toLocaleTimeString(),
        });
        break;
      }

      case '/arch': {
        setActiveActivityTab('arch');
        addMessage({
          id: `arch_${Date.now()}`,
          sender: 'system',
          content: `🗺️ **Canvas d'Architecture Singular Code** ouvert dans la vue centrale.`,
          timestamp: new Date().toLocaleTimeString(),
        });
        break;
      }

      case '/plan': {
        const next = !isPlanAndReviewMode;
        setIsPlanAndReviewMode(next);
        addMessage({
          id: `plan_${Date.now()}`,
          sender: 'system',
          content: next
            ? `📋 **Mode Plan & Review ACTIVÉ** : L'Agent produira une architecture détaillée étape par étape et demandera confirmation avant modification de code.`
            : `⚡ **Mode Plan & Review DÉSACTIVÉ** : Retour au mode d'exécution standard.`,
          timestamp: new Date().toLocaleTimeString(),
        });
        break;
      }

      case '/image': {
        if (!args.trim()) {
          addMessage({
            id: `img_err_${Date.now()}`,
            sender: 'system',
            content: `ℹ️ **Usage :** \`/image <chemin_image>\` (ex: \`/image screenshots/app_mockup.png\`)`,
            timestamp: new Date().toLocaleTimeString(),
          });
          return;
        }

        addMessage({
          id: `img_user_${Date.now()}`,
          sender: 'user',
          content: fullCommand,
          timestamp: new Date().toLocaleTimeString(),
        });

        addLog('info', `Analyse visuelle multimodale locale de : ${args}`);
        try {
          const res = await api.analyzeLocalImage(args, "Analyse cette interface ou maquette de façon détaillée.");
          addMessage({
            id: `img_res_${Date.now()}`,
            sender: 'system',
            content: `🖼️ **Analyse Visuelle Locale (Gemma4 Multimodal)** de \`${args}\` :\n\n${res.analysis || JSON.stringify(res, null, 2)}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        } catch (err: any) {
          addMessage({
            id: `img_err_${Date.now()}`,
            sender: 'system',
            content: `❌ Erreur analyse visuelle locale : ${err}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        break;
      }

      case '/web': {
        if (!args.trim()) {
          addMessage({
            id: `web_err_${Date.now()}`,
            sender: 'system',
            content: `ℹ️ **Usage :** \`/web <requête>\` (ex: \`/web axum rust websocket\`)`,
            timestamp: new Date().toLocaleTimeString(),
          });
          return;
        }

        addMessage({
          id: `web_user_${Date.now()}`,
          sender: 'user',
          content: fullCommand,
          timestamp: new Date().toLocaleTimeString(),
        });

        addLog('info', `Recherche Web lancée : "${args}"`);
        try {
          const results = await api.webSearch(args, 5);
          if (!results || results.length === 0) {
            addMessage({
              id: `web_res_${Date.now()}`,
              sender: 'system',
              content: `🔍 **Recherche Web pour :** *${args}*\nAucun résultat trouvé.`,
              timestamp: new Date().toLocaleTimeString(),
            });
          } else {
            const formatted = results
              .map((r, i) => `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}`)
              .join('\n\n');
            addMessage({
              id: `web_res_${Date.now()}`,
              sender: 'system',
              content: `🌐 **Résultats de recherche pour :** *${args}*\n\n${formatted}`,
              timestamp: new Date().toLocaleTimeString(),
            });
          }
        } catch (err: any) {
          addMessage({
            id: `web_err_${Date.now()}`,
            sender: 'system',
            content: `❌ Erreur de recherche : ${err}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        break;
      }

      case '/skills':
        useAppStore.getState().setSkillsOpen(true);
        break;

      case '/mode': {
        const mode = args.toLowerCase().trim();
        if (['ask', 'architect', 'code', 'debug', 'review', 'yolo'].includes(mode)) {
          useAppStore.getState().setApprovalMode(mode as any);
          addLog('info', `Mode d'opération changé pour : ${mode.toUpperCase()}`);
          addMessage({
            id: `mode_${Date.now()}`,
            sender: 'system',
            content: `🎯 Mode d'opération configuré sur **${mode.toUpperCase()}**.`,
            timestamp: new Date().toLocaleTimeString(),
          });
        } else {
          addMessage({
            id: `mode_err_${Date.now()}`,
            sender: 'system',
            content: `ℹ️ **Usage :** \`/mode <ask|architect|code|debug|review|yolo>\``,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        break;
      }

      case '/undo': {
        try {
          const cps = await api.listCheckpoints();
          if (cps && cps.length > 0) {
            const last = cps[cps.length - 1];
            await api.restoreCheckpoint(last.id);
            if (soundEnabled) soundManager.playSuccess();
            addMessage({
              id: `undo_${Date.now()}`,
              sender: 'system',
              content: `⏪ Snapshot restauré avec succès : **${last.description || last.id}** (${last.files_count || 0} fichiers)`,
              timestamp: new Date().toLocaleTimeString(),
            });
            const list = await api.listFiles();
            useAppStore.getState().setFiles(list);
          } else {
            addMessage({
              id: `undo_none_${Date.now()}`,
              sender: 'system',
              content: `ℹ️ Aucun point de restauration antérieur disponible.`,
              timestamp: new Date().toLocaleTimeString(),
            });
          }
        } catch (err: any) {
          addMessage({
            id: `undo_err_${Date.now()}`,
            sender: 'system',
            content: `❌ Erreur de restauration : ${err}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        break;
      }

      case '/compact': {
        const allMsgs = useAppStore.getState().messages;
        if (allMsgs.length <= 4) {
          addMessage({
            id: `compact_${Date.now()}`,
            sender: 'system',
            content: `ℹ️ Historique déjà compact (${allMsgs.length} messages).`,
            timestamp: new Date().toLocaleTimeString(),
          });
        } else {
          const keepLast = allMsgs.slice(-4);
          useAppStore.setState({
            messages: [
              {
                id: `compact_sum_${Date.now()}`,
                sender: 'system',
                content: `🗜️ **Contexte compacté** : ${allMsgs.length - 4} messages archivés pour préserver les tokens.`,
                timestamp: new Date().toLocaleTimeString(),
              },
              ...keepLast,
            ],
          });
        }
        break;
      }

      case '/clear':
        useAppStore.setState({ messages: [] });
        break;

      case '/init': {
        try {
          const ws = useAppStore.getState().currentWorkspace || "Workspace";
          await api.writeFile("AGENT.md", `# Configuration Singular Code - ${ws}\n\n## Directives du projet\n- Suivre les conventions du codebase existant.\n- Vérifier avec des tests unitaires après chaque changement.\n- Éviter les réécritures complètes de fichiers volumineux, privilégier \`edit_file\`.\n\n## Outils disponibles\n- Fichiers : read_file, write_file, edit_file, delete_file, move_file\n- Navigation : list_dir, glob_files, grep_files, search_semantic, ast_grep\n- Exécution : run_command (sandbox bwrap), run_test_suite\n- Diagnostic : check_http_service, calculate_code_metrics, inspect_sqlite_db\n- Web : web_search, fetch_url\n- Tâches : todo_write\n`);
          addMessage({
            id: `init_${Date.now()}`,
            sender: 'system',
            content: `✅ Fichier \`AGENT.md\` créé avec succès dans le workspace !`,
            timestamp: new Date().toLocaleTimeString(),
          });
          const list = await api.listFiles();
          useAppStore.getState().setFiles(list);
        } catch (err: any) {
          addMessage({
            id: `init_err_${Date.now()}`,
            sender: 'system',
            content: `❌ Erreur création AGENT.md : ${err}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        break;
      }

      case '/libreoffice': {
        const subArgs = args.trim().split(/\s+/);
        const subCmd = subArgs[0]?.toLowerCase();
        const docName = subArgs.slice(1).join('_').trim();

        if (!subCmd || ['help', 'aide', 'info', '?'].includes(subCmd)) {
          addMessage({
            id: `lo_info_${Date.now()}`,
            sender: 'system',
            content: `### 📄 Suite Bureautique LibreOffice Compatible\n\nVous pouvez créer et exporter des documents 100% compatibles avec la suite LibreOffice :\n\n- \`/libreoffice writer [nom]\` : Document texte Writer (.odt / .pdf)\n- \`/libreoffice calc [nom]\` : Feuille de calcul Calc (.fods / .ods / .csv)\n- \`/libreoffice impress [nom]\` : Présentation Impress (.fodp / .odp)\n- \`/libreoffice draw [nom]\` : Schéma vectoriel Draw (.svg / .odg)\n- \`/libreoffice math [nom]\` : Formules & équations Math (.mml / MathML)\n- \`/libreoffice base [nom]\` : Base de données Base (.sql / .odb)\n\n*LibreOffice 26.x est détecté localement sur ce système.*`,
            timestamp: new Date().toLocaleTimeString(),
          });
          break;
        }

        let targetType = 'writer';
        let targetExt = 'odt';
        let targetTitle = docName || 'Document_Writer';
        let targetSample = 'Titre du document : ' + (docName || 'Rapport Singular Code') + '\n\nCe document au format OpenDocument Text (.odt) est directement éditable dans LibreOffice Writer sans aucune conversion.';

        if (subCmd === 'calc') {
          targetType = 'calc';
          targetExt = 'fods';
          targetTitle = docName || 'Feuille_de_Calcul';
          targetSample = 'ID,Designation,Quantite,Prix_Unitaire,Total\n1,Licence_Pro,10,250,2500\n2,Support_Technique,5,400,2000\n3,Formation_Agent_IA,2,1200,2400';
        } else if (subCmd === 'impress') {
          targetType = 'impress';
          targetExt = 'fodp';
          targetTitle = docName || 'Presentation_Singular';
          targetSample = 'Diapositive 1 : Singular Code & LibreOffice\nCréation de documents OpenDocument en temps réel.\n---\nDiapositive 2 : Performance & Autonomie\n- Exécution locale sur Linux\n- Formats FODT, FODS, FODP natifs\n- Export PDF et ODT sans dépendance cloud';
        } else if (subCmd === 'draw') {
          targetType = 'draw';
          targetExt = 'svg';
          targetTitle = docName || 'Schema_Architecture';
          targetSample = '<svg width="600" height="350" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="40" width="220" height="100" rx="10" fill="#2563eb" /><text x="140" y="95" fill="#ffffff" font-size="16" font-family="sans-serif" text-anchor="middle">Singular Code Agent</text><rect x="350" y="40" width="220" height="100" rx="10" fill="#059669" /><text x="460" y="95" fill="#ffffff" font-size="16" font-family="sans-serif" text-anchor="middle">LibreOffice Suite</text><path d="M 250 90 L 350 90" stroke="#94a3b8" stroke-width="4" fill="none" /></svg>';
        } else if (subCmd === 'math') {
          targetType = 'math';
          targetExt = 'mml';
          targetTitle = docName || 'Formule_Mathematique';
          targetSample = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo><mo>=</mo><msubsup><mo>∫</mo><mn>0</mn><mi>∞</mi></msubsup><msup><mi>e</mi><mrow><mo>−</mo><msup><mi>x</mi><mn>2</mn></msup></mrow></msup><mi>d</mi><mi>x</mi><mo>=</mo><mfrac><msqrt><mi>π</mi></msqrt><mn>2</mn></mfrac></mrow></math>';
        } else if (subCmd === 'base') {
          targetType = 'base';
          targetExt = 'sql';
          targetTitle = docName || 'Schema_Base';
          targetSample = 'CREATE TABLE clients (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  nom TEXT NOT NULL,\n  email TEXT UNIQUE,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE projets (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  client_id INTEGER REFERENCES clients(id),\n  titre TEXT NOT NULL,\n  statut TEXT DEFAULT \'en_cours\'\n);\n\nINSERT INTO clients (nom, email) VALUES (\'Entreprise Alpha\', \'contact@alpha.com\');\nINSERT INTO projets (client_id, titre) VALUES (1, \'Déploiement Singular Code\');';
        }

        const fileName = `${targetTitle}.${targetExt}`;
        try {
          const res = await api.generateLibreofficeTemplate(
            targetType,
            fileName,
            targetTitle,
            targetSample
          );

          if (soundEnabled) soundManager.playSuccess();
          addMessage({
            id: `lo_create_${Date.now()}`,
            sender: 'system',
            content: `📄 **Document LibreOffice généré avec succès !**\n\n- **Application :** LibreOffice ${targetType.toUpperCase()}\n- **Fichier :** \`${fileName}\`\n- **Détails :** ${res}\n\nVous pouvez l'ouvrir directement dans LibreOffice ou demander à l'agent de modifier son contenu.`,
            timestamp: new Date().toLocaleTimeString(),
          });
          const list = await api.listFiles();
          useAppStore.getState().setFiles(list);
        } catch (err: any) {
          if (soundEnabled) soundManager.playError();
          addMessage({
            id: `lo_err_${Date.now()}`,
            sender: 'system',
            content: `❌ **Erreur génération document LibreOffice :** ${err}`,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        break;
      }

      case '/help':
        addMessage({
          id: `help_${Date.now()}`,
          sender: 'system',
          content: `### 🚀 Guide des Commandes Slash & Fonctionnalités :\n\n- \`/libreoffice <writer|calc|impress|draw|math|base> [nom]\` : Générer un document LibreOffice natif (.odt, .fods, .fodp, etc.)\n- \`/web <requête>\` : Recherche internet en direct via DuckDuckGo\n- \`/skills\` : Ouvrir le gestionnaire des compétences expertes (avec suite LibreOffice)\n- \`/mode <ask|architect|code|debug|review|yolo>\` : Basculer parmi les 6 modes de collaboration\n- \`/undo\` : Annuler et restaurer le dernier checkpoint automatique\n- \`/compact\` : Compacter l'historique pour économiser les tokens\n- \`/clear\` : Effacer la conversation\n- \`/init\` : Créer le fichier \`AGENT.md\` pour guider l'IA\n- \`/help\` : Afficher cette aide\n\n**Astuce :** Vous pouvez aussi glisser-déposer des fichiers dans le chat ou mentionner avec \`@fichier\` !`,
          timestamp: new Date().toLocaleTimeString(),
        });
        break;

      default:
        addMessage({
          id: `unknown_${Date.now()}`,
          sender: 'system',
          content: `⚠️ Commande inconnue : \`${command}\`. Tapez \`/help\` pour voir la liste des commandes disponibles.`,
          timestamp: new Date().toLocaleTimeString(),
        });
    }
  };

  const handleStop = async () => {
    try {
      await api.abortAgent();
      setIsAgentRunning(false);
      addLog('info', 'Arrêt de l\'agent demandé par l\'utilisateur.');
    } catch (err: any) {
      addLog('error', `Erreur arrêt : ${err}`);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    if (soundEnabled) soundManager.playClick();
    setTimeout(() => setCopiedId(null), 2000);
  };

  const insertIntoMonaco = (code: string) => {
    if (activeTab) {
      updateFileContent(activeTab, code);
      addLog('info', `Code inséré dans l'onglet Monaco actif : ${activeTab}`);
    } else {
      openFile('nouveau_code.ts', code);
      addLog('info', "Nouvel onglet créé dans Monaco avec le code sélectionné");
    }
    if (soundEnabled) soundManager.playSuccess();
  };

  const exportChatToMarkdown = () => {
    const md = messages
      .map((m) => `### ${m.sender.toUpperCase()} [${m.timestamp}]\n\n${m.content}\n`)
      .join('\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent_session_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    a.click();
    addLog('info', 'Historique de conversation exporté en Markdown.');
  };

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleThought = (id: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectSlashCommand = (cmd: SlashCommandDef) => {
    if (cmd.needsArgs) {
      setInput(`${cmd.command} `);
      setShowSlashMenu(false);
      textareaRef.current?.focus();
    } else {
      setShowSlashMenu(false);
      handleSlashCommand(cmd.command);
    }
  };

  const filteredSlashCommands = SLASH_COMMANDS.filter((c) =>
    c.command.toLowerCase().includes(input.toLowerCase())
  );

  // Todo stats
  const totalTodos = todos.length;
  const doneTodos = todos.filter((t) => t.status === 'done').length;
  const progressPercent = totalTodos > 0 ? Math.round((doneTodos / totalTodos) * 100) : 0;

  // Cache de mémoïsation du parsing Markdown pour éviter de recalculer les regex sur l'historique (Pack Optimisation FPS)
  const parsedContentCache = useRef(new Map<string, React.ReactNode[]>());

  // Découper et afficher le contenu avec blocs de code et réflexion
  const renderMessageContent = (content: string, msgId: string) => {
    if (!content) return null;
    const cacheKey = `${msgId}_${content.length}_${expandedThoughts[msgId] ? 'exp' : 'col'}`;
    if (parsedContentCache.current.has(cacheKey)) {
      return parsedContentCache.current.get(cacheKey)!;
    }

    // Détection des balises de réflexion <think>...</think>
    let thinkingPart = '';
    let mainContent = content;
    const thinkStart = content.indexOf('<think>');
    const thinkEnd = content.indexOf('</think>');
    if (thinkStart !== -1 && thinkEnd !== -1 && thinkEnd > thinkStart) {
      thinkingPart = content.slice(thinkStart + 7, thinkEnd).trim();
      mainContent = (content.slice(0, thinkStart) + content.slice(thinkEnd + 8)).trim();
    }

    const parts: React.ReactNode[] = [];

    // Bloc de réflexion dépliable
    if (thinkingPart) {
      const isExpanded = expandedThoughts[msgId] ?? false;
      parts.push(
        <div key={`thought_${msgId}`} className="mb-2 rounded-xl border border-purple-500/30 bg-purple-950/20 overflow-hidden shadow-inner">
          <button
            type="button"
            onClick={() => toggleThought(msgId)}
            className="w-full flex items-center justify-between px-3 py-2 bg-purple-900/20 hover:bg-purple-900/30 text-purple-300 transition text-[11px]"
          >
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-purple-400 animate-pulse" />
              <span className="font-semibold">Processus de Réflexion (CoT)</span>
            </div>
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {isExpanded && (
            <div className="p-3 text-[11px] font-mono text-purple-200/90 bg-[#0d0914] whitespace-pre-wrap leading-relaxed border-t border-purple-500/20 max-h-60 overflow-y-auto">
              {thinkingPart}
            </div>
          )}
        </div>
      );
    }

    // Détection des blocs de code Markdown ```...```
    const codeRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeRegex.exec(mainContent)) !== null) {
      const textBefore = mainContent.slice(lastIndex, match.index);
      if (textBefore) {
        parts.push(
          <div key={`text_${lastIndex}`} className="whitespace-pre-wrap leading-relaxed">
            {textBefore}
          </div>
        );
      }

      const lang = match[1] || 'code';
      const code = match[2];
      const blockId = `${msgId}_code_${match.index}`;

      parts.push(
        <div key={blockId} className="my-2 rounded-xl border border-[#23293d] bg-[#0c0e15] overflow-hidden shadow-lg">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#141824] border-b border-[#23293d] text-[10px] text-gray-400 font-mono">
            <span className="uppercase text-indigo-400 font-semibold">{lang}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => insertIntoMonaco(code)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white transition font-sans"
                title="Insérer directement dans l'éditeur Monaco"
              >
                <ArrowUpRight className="w-3 h-3" /> Monaco
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(code, blockId)}
                className="flex items-center gap-1 hover:text-white transition font-sans"
              >
                {copiedId === blockId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copier
              </button>
            </div>
          </div>
          <pre className="p-3 text-[11px] font-mono text-gray-200 overflow-x-auto leading-normal">
            <code>{code}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    const remainingText = mainContent.slice(lastIndex);
    if (remainingText) {
      parts.push(
        <div key={`text_end_${lastIndex}`} className="whitespace-pre-wrap leading-relaxed">
          {remainingText}
        </div>
      );
    }

    if (parsedContentCache.current.size > 250) {
      const first = parsedContentCache.current.keys().next().value;
      if (first) parsedContentCache.current.delete(first);
    }
    parsedContentCache.current.set(cacheKey, parts);

    return parts;
  };

  return (
    <div className="flex flex-col h-full bg-[#090b10] border-l border-[#1c2234] text-gray-200 text-xs">
      {/* Barre supérieure du Chat Singular Code */}
      <div className="flex flex-col border-b border-[#1c2234] bg-[#0c0e15] select-none">
        {/* Ligne 1 : Titre & Actions principales */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#1c2234]/60">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/singular-code-logo.png"
              alt="Singular Code"
              className="w-5 h-5 rounded-md object-contain shadow-sm shrink-0 ring-1 ring-cyan-500/30"
            />
            <div className="min-w-0">
              <span className="font-bold text-gray-100 block text-xs truncate">Singular Code</span>
              <span className="text-[10px] text-gray-400 font-mono truncate max-w-[130px] block">
                {activeProfile.model_id}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                fetchLearnings();
                setShowLearningsModal(true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141824] hover:bg-[#1f2638] text-gray-300 hover:text-white border border-[#22273a] transition text-[11px]"
              title="Gérer la mémoire persistante du projet (.localagent/learnings.json)"
            >
              <BrainCircuit className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] font-mono text-purple-300">
                {learnings.length}
              </span>
            </button>

            <button
              type="button"
              onClick={exportChatToMarkdown}
              className="p-1.5 rounded-lg bg-[#141824] hover:bg-[#1f2638] text-gray-400 hover:text-white transition"
              title="Exporter l'historique en Markdown"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Badge de Mode Actif Compact (Non coupé, modifiable dans le Header principal) */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${
                approvalMode === 'ask'
                  ? 'text-amber-400 border-amber-500/20 bg-amber-500/10'
                  : approvalMode === 'architect'
                  ? 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10'
                  : approvalMode === 'code'
                  ? 'text-sky-400 border-sky-500/20 bg-sky-500/10'
                  : approvalMode === 'debug'
                  ? 'text-purple-400 border-purple-500/20 bg-purple-500/10'
                  : approvalMode === 'review'
                  ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                  : 'text-rose-400 border-rose-500/20 bg-rose-500/10'
              }`}
              title={`Mode actuel : ${approvalMode.toUpperCase()} (sélecteur disponible dans la barre du haut)`}
            >
              <Shield className="w-3 h-3 shrink-0" />
              <span>{approvalMode.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Ligne 2 : Sous-barre contextuelle (Branches de fork, Décomposition des Tokens & Compaction) */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#090b10] text-[10px] text-gray-400 gap-2 border-b border-[#1c2234]/40">
          {/* Sélecteur de branches de conversation (Item 17) */}
          <div className="flex items-center gap-1 shrink-0 bg-[#121520] px-2 py-0.5 rounded-md border border-[#202538]" title="Arbre de ramification de conversation (Item 17)">
            <GitBranch className="w-3 h-3 text-indigo-400 shrink-0" />
            <select
              value={activeBranch}
              onChange={(e) => switchBranch(e.target.value)}
              className="bg-transparent text-gray-200 text-[10px] font-mono focus:outline-none cursor-pointer max-w-[100px] truncate"
            >
              {Object.keys(conversationBranches).map((b) => (
                <option key={b} value={b} className="bg-[#121520] text-gray-200">
                  {b} {b === activeBranch ? '★' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Graphique de Contexte & Décomposition des Tokens en Temps Réel (Item 2) */}
          {(() => {
            const tokenCapacity = tokenUsage?.current_num_ctx || activeProfile.num_ctx || 32768;
            const directivesTokens = Math.min(1500, Math.round(1000 + (learnings.length * 60)));
            const historyTokens = Math.round(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
            const bufferTokens = Math.round(
              openTabs.reduce((acc, p) => acc + (fileContents[p]?.length || 0), 0) / 4
            );
            const completionTokens = tokenUsage?.completion_tokens || 0;
            const usedTokens = Math.min(
              tokenCapacity,
              directivesTokens + historyTokens + bufferTokens + completionTokens
            );
            const freeTokens = Math.max(0, tokenCapacity - usedTokens);

            const pctDirectives = Math.max(1, Math.round((directivesTokens / tokenCapacity) * 100));
            const pctBuffer = Math.min(40, Math.round((bufferTokens / tokenCapacity) * 100));
            const pctHistory = Math.min(50, Math.round((historyTokens / tokenCapacity) * 100));
            const pctCompletion = Math.min(25, Math.round((completionTokens / tokenCapacity) * 100));
            const pctFree = Math.max(0, 100 - (pctDirectives + pctBuffer + pctHistory + pctCompletion));

            return (
              <div className="flex items-center gap-2 flex-1 max-w-sm justify-end">
                <div
                  className="flex-1 flex flex-col gap-0.5 cursor-pointer"
                  title={`Budget Contexte : ${usedTokens.toLocaleString()} / ${tokenCapacity.toLocaleString()} tks (${Math.round((usedTokens / tokenCapacity) * 100)}%)\n• Directives système : ${directivesTokens} tks (${pctDirectives}%)\n• Fichiers ouverts (Buffer) : ${bufferTokens} tks (${pctBuffer}%)\n• Historique de discussion : ${historyTokens} tks (${pctHistory}%)\n• Réponses générées : ${completionTokens} tks (${pctCompletion}%)\n• Marge libre disponible : ${freeTokens.toLocaleString()} tks (${pctFree}%)`}
                >
                  <div className="flex items-center justify-between text-[9px] font-mono leading-tight">
                    <div className="flex items-center gap-1 text-gray-300">
                      <Zap className={`w-2.5 h-2.5 ${tokenUsage?.auto_expanded ? 'text-amber-400 animate-pulse' : 'text-cyan-400'}`} />
                      <span className="font-semibold text-gray-200">{usedTokens.toLocaleString()}</span>
                      <span className="text-gray-500">/ {tokenCapacity.toLocaleString()} tks</span>
                    </div>
                    <span className="text-gray-400 text-[8px] font-sans">
                      {pctFree}% libre
                    </span>
                  </div>

                  {/* Barre segmentée multicolore */}
                  <div className="w-full h-1.5 rounded-full bg-[#181d2c] flex overflow-hidden">
                    <div
                      style={{ width: `${pctDirectives}%` }}
                      className="bg-purple-500 h-full transition-all"
                      title={`Directives : ${directivesTokens} tks`}
                    />
                    <div
                      style={{ width: `${pctBuffer}%` }}
                      className="bg-emerald-400 h-full transition-all"
                      title={`Fichiers ouverts : ${bufferTokens} tks`}
                    />
                    <div
                      style={{ width: `${pctHistory}%` }}
                      className="bg-sky-400 h-full transition-all"
                      title={`Historique : ${historyTokens} tks`}
                    />
                    <div
                      style={{ width: `${pctCompletion}%` }}
                      className="bg-amber-400 h-full transition-all"
                      title={`Générés : ${completionTokens} tks`}
                    />
                    <div
                      style={{ width: `${pctFree}%` }}
                      className="bg-[#242b3d] h-full"
                      title={`Libre : ${freeTokens} tks`}
                    />
                  </div>
                </div>

                {/* Bouton Compacter en 1-clic (Item 2) */}
                <button
                  type="button"
                  onClick={() => {
                    compactHistory();
                    if (soundEnabled) soundManager.playSuccess();
                  }}
                  disabled={messages.length <= 2}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#151a27] hover:bg-[#20273a] text-gray-300 hover:text-white border border-[#232a3d] disabled:opacity-40 text-[9px] transition shrink-0"
                  title="Compacter l'historique pour libérer ~55% de tokens"
                >
                  <Layers className="w-3 h-3 text-cyan-400" />
                  <span>Compacter</span>
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Bannière de Rollback Global Atomique (Item 2) */}
      {lastTransaction && (
        <div className="bg-gradient-to-r from-amber-950/40 via-indigo-950/30 to-[#0e111a] border-b border-amber-500/30 px-3 py-2 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2 text-xs">
            <span className="p-1 rounded bg-amber-500/20 text-amber-400 font-mono text-[10px]">
              Tx #{String(lastTransaction.transaction_id).slice(-8)}
            </span>
            <span className="text-gray-200">
              Transaction atomique : <strong className="text-amber-300">{lastTransaction.modified_files?.length || 0} fichier(s)</strong> modifiés
            </span>
            <span className="text-[10px] text-gray-500 hidden sm:inline truncate max-w-xs">
              ({lastTransaction.modified_files?.map(f => String(f).split('/').pop()).join(', ')})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await rollbackLastTransaction();
                addLog('info', `Rollback de la transaction atomique ${lastTransaction.transaction_id}`);
                if (soundEnabled) soundManager.playSuccess();
              }}
              className="px-2.5 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition text-[11px] flex items-center gap-1.5 font-medium shadow-sm"
              title="Annuler tous les changements de cette transaction en 1 clic"
            >
              <Undo2 className="w-3 h-3" /> Rollback
            </button>
            <button
              onClick={() => setLastTransaction(null)}
              className="p-1 text-gray-500 hover:text-gray-300"
              title="Masquer la notification"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Tâches en direct (Todo list) avec barre de progression */}
      {todos.length > 0 && (
        <div className="bg-[#0f131f] border-b border-[#1c2234] p-3 space-y-2">
          <div className="flex items-center justify-between text-gray-300 font-semibold text-[11px]">
            <div className="flex items-center gap-1.5">
              <ListTodo className="w-3.5 h-3.5 text-indigo-400" />
              <span>Plan d'action en temps réel</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-mono text-[10px]">
                {doneTodos}/{totalTodos} ({progressPercent}%)
              </span>
              {doneTodos === totalTodos && (
                <button
                  type="button"
                  onClick={() => setTodos([])}
                  className="text-[10px] text-gray-500 hover:text-gray-300 px-1"
                  title="Effacer le plan terminé"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Barre de progression fluide */}
          <div className="w-full h-1.5 bg-[#181d2c] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-2 text-xs">
                {todo.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                {todo.status === 'in_progress' && <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />}
                {todo.status === 'pending' && <span className="w-3.5 h-3.5 rounded-full border border-gray-600 shrink-0" />}
                <span className={todo.status === 'done' ? 'line-through text-gray-500' : 'text-gray-300'}>
                  {todo.task}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone de Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`group flex flex-col space-y-1 ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            {/* Bulle de texte */}
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 shadow-md text-xs relative transition-all duration-200 ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-br from-cyan-600 via-indigo-600 to-purple-600 text-white font-normal shadow-indigo-600/20'
                  : msg.sender === 'system'
                  ? 'bg-[#131726]/90 text-sky-200 border border-sky-500/25 shadow-sm'
                  : 'bg-[#101420] text-gray-200 border border-[#1e2538]'
              }`}
            >
              {renderMessageContent(msg.content, msg.id) || (
                msg.sender === 'agent' && isAgentRunning ? (
                  <div className="flex items-center gap-2 text-indigo-400 animate-pulse">
                    <BrainCircuit className="w-4 h-4" /> En cours d'analyse et réflexion...
                  </div>
                ) : null
              )}
            </div>

            {/* Actions rapides au survol (Forker la branche, copier, horodatage) */}
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity px-1 text-[10px] text-gray-500">
              <span>{msg.timestamp}</span>
              <button
                type="button"
                onClick={() => {
                  forkConversation(msg.id);
                  addLog('info', `Branche de conversation forkée à partir du message ${msg.id}`);
                  if (soundEnabled) soundManager.playSuccess();
                }}
                className="hover:text-indigo-400 p-0.5 rounded transition flex items-center gap-1"
                title="Bifurquer la conversation (Fork) à partir de ce message (Item 17)"
              >
                <GitBranch className="w-3 h-3" /> Forker
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(msg.content, msg.id)}
                className="hover:text-gray-300 p-0.5 rounded transition"
                title="Copier le contenu du message"
              >
                {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>

            {/* Cartes d'outils dépliables pour les agents */}
            {msg.tool_cards && msg.tool_cards.length > 0 && (
              <div className="w-full space-y-2 mt-1">
                {msg.tool_cards.map((card) => {
                  const isExpanded = expandedCards[card.id];
                  const toolParamDisplay = card.tool_args?.path || card.tool_args?.command || card.tool_args?.query || (typeof card.tool_args === 'string' ? card.tool_args : JSON.stringify(card.tool_args));
                  return (
                    <div
                      key={card.id}
                      className="bg-[#10131d] border border-[#1f2638] rounded-xl overflow-hidden shadow-sm"
                    >
                      <div
                        onClick={() => toggleCard(card.id)}
                        className="flex items-center justify-between px-3 py-2 bg-[#151926] cursor-pointer hover:bg-[#1a2030] transition"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {card.tool_name === 'run_command' || card.tool_name === 'run_test_suite' ? (
                            <Terminal className="w-3.5 h-3.5 text-sky-400" />
                          ) : card.tool_name === 'web_search' || card.tool_name === 'fetch_url' ? (
                            <Globe className="w-3.5 h-3.5 text-cyan-400" />
                          ) : (
                            <FileCode className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          <span className="font-semibold text-gray-200 font-mono text-[11px]">{card.tool_name}</span>
                          <span className="text-[10px] text-gray-400 truncate max-w-[200px]">
                            {toolParamDisplay}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {card.tool_args?.path && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openFile(card.tool_args.path);
                              }}
                              className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-[10px] transition font-sans flex items-center gap-1"
                              title="Ouvrir dans l'éditeur Monaco"
                            >
                              <FileCode className="w-3 h-3" /> Ouvrir
                            </button>
                          )}
                          {card.status === 'running' && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                              <Clock className="w-3 h-3 animate-spin" /> En cours
                            </span>
                          )}
                          {card.status === 'success' && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Succès
                            </span>
                          )}
                          {card.status === 'error' && (
                            <span className="flex items-center gap-1 text-[10px] text-rose-400 font-medium">
                              <AlertCircle className="w-3 h-3" /> Erreur
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-3 bg-[#0a0c12] border-t border-[#1f2638] text-[11px] font-mono text-gray-300 space-y-2">
                          <div>
                            <span className="text-gray-500 font-sans block mb-1">Paramètres d'appel :</span>
                            <pre className="bg-[#121520] p-2 rounded-lg overflow-x-auto text-indigo-300">
                              {JSON.stringify(card.tool_args, null, 2)}
                            </pre>
                          </div>

                          {card.result && (
                            <div>
                              <div className="flex items-center justify-between text-gray-500 font-sans mb-1">
                                <span>Résultat retourné :</span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(JSON.stringify(card.result, null, 2), card.id)}
                                  className="flex items-center gap-1 text-gray-400 hover:text-white"
                                >
                                  {copiedId === card.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  Copier
                                </button>
                              </div>
                              <pre className="bg-[#121520] p-2 rounded-lg overflow-x-auto max-h-52 text-emerald-300">
                                {typeof card.result === 'object'
                                  ? JSON.stringify(card.result, null, 2)
                                  : String(card.result)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Menu contextuel Commandes Slash (/) */}
      {showSlashMenu && filteredSlashCommands.length > 0 && (
        <div className="bg-[#131724] border border-[#232a3d] shadow-2xl max-h-60 overflow-y-auto p-1.5 mx-3 mb-2 rounded-2xl text-xs z-50">
          <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-[#232a3d]/60">
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
              Commandes slash ({filteredSlashCommands.length})
            </span>
            <span className="text-[9px] text-gray-500 font-mono">
              ↑↓ naviguer • ↵ valider • Esc fermer
            </span>
          </div>
          <div className="space-y-0.5">
            {filteredSlashCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedSlashIndex;
              return (
                <button
                  key={cmd.command}
                  type="button"
                  onClick={() => selectSlashCommand(cmd)}
                  className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-xl text-left transition ${
                    isSelected ? 'bg-indigo-600 text-white shadow' : 'text-gray-200 hover:bg-[#1a2032]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-indigo-400'}`} />
                    <span className="font-mono font-semibold text-xs">{cmd.label}</span>
                  </div>
                  <span className={`text-[11px] truncate max-w-[220px] ${isSelected ? 'text-indigo-100' : 'text-gray-400'}`}>
                    {cmd.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Menu contextuel @ (Item 19 & Item 18) : Sources spéciales, Fichiers, Symboles AST */}
      {showMentionMenu && (
        <div className="bg-[#131724] border border-[#232a3d] shadow-2xl max-h-64 overflow-y-auto p-1.5 mx-3 mb-2 rounded-2xl text-xs z-50">
          {/* Sources spéciales */}
          <div className="mb-2">
            <span className="px-2 py-1 text-[10px] text-indigo-400 font-semibold uppercase tracking-wider block">
              Contextes spéciaux :
            </span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => {
                  setInput((prev) => `${prev}@git `);
                  setShowMentionMenu(false);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-indigo-600 hover:text-white rounded-xl text-left transition bg-[#181d2c] text-gray-300"
              >
                <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-mono font-semibold">@git</span>
                <span className="text-[10px] text-gray-400 truncate">Statut Git</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInput((prev) => `${prev}@learnings `);
                  setShowMentionMenu(false);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-indigo-600 hover:text-white rounded-xl text-left transition bg-[#181d2c] text-gray-300"
              >
                <BrainCircuit className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="font-mono font-semibold">@learnings</span>
                <span className="text-[10px] text-gray-400 truncate">Mémoire ({learnings.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInput((prev) => `${prev}@terminal `);
                  setShowMentionMenu(false);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-indigo-600 hover:text-white rounded-xl text-left transition bg-[#181d2c] text-gray-300"
              >
                <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-mono font-semibold">@terminal</span>
                <span className="text-[10px] text-gray-400 truncate">Derniers logs</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInput((prev) => `${prev}@docs `);
                  setShowMentionMenu(false);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-indigo-600 hover:text-white rounded-xl text-left transition bg-[#181d2c] text-gray-300"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-mono font-semibold">@docs</span>
                <span className="text-[10px] text-gray-400 truncate">Règles AGENT</span>
              </button>
            </div>
          </div>

          {/* Fichiers du projet */}
          {files.length > 0 && (
            <div className="mb-2">
              <span className="px-2 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">
                Fichiers ({files.length}) :
              </span>
              <div className="space-y-0.5 max-h-28 overflow-y-auto">
                {files.slice(0, 15).map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => {
                      setInput((prev) => `${prev}@${f.path} `);
                      setShowMentionMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1 hover:bg-indigo-600 hover:text-white rounded-lg text-left transition"
                  >
                    <FileCode className="w-3 h-3 text-sky-400 shrink-0" />
                    <span className="truncate text-gray-300 hover:text-white font-mono text-[11px]">{f.path}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Symboles AST (Item 18) */}
          {workspaceSymbols.length > 0 && (
            <div>
              <span className="px-2 py-1 text-[10px] text-emerald-400 font-semibold uppercase tracking-wider block">
                Symboles AST ({workspaceSymbols.length}) :
              </span>
              <div className="space-y-0.5 max-h-28 overflow-y-auto">
                {workspaceSymbols.slice(0, 15).map((sym, i) => (
                  <button
                    key={`${sym.name}-${i}`}
                    type="button"
                    onClick={() => {
                      setInput((prev) => `${prev}@${sym.file_path}#${sym.name} `);
                      setShowMentionMenu(false);
                    }}
                    className="flex items-center justify-between w-full px-2 py-1 hover:bg-emerald-600 hover:text-white rounded-lg text-left transition"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Code2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="font-mono font-semibold text-[11px] text-emerald-200">{String(sym.name)}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 font-sans border border-emerald-800/40">
                        {String(sym.kind)}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono truncate max-w-[120px]">
                      {String(sym.file_path).split('/').pop()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Résolution Intelligente de Dépendances (Item 3) */}
      {detectedDependencies.length > 0 && (
        <div className="mx-3 mb-2 p-2 rounded-xl bg-gradient-to-r from-cyan-950/40 to-[#121624] border border-cyan-500/30 flex items-center justify-between gap-2 text-xs shadow-md animate-fadeIn">
          <div className="flex items-center gap-2 min-w-0">
            <Link2 className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
            <div className="min-w-0">
              <span className="text-gray-200 font-medium">
                Dépendances détectées : <strong className="text-cyan-300">+{detectedDependencies.length} fichier(s)</strong>
              </span>
              <span className="text-[10px] text-gray-500 ml-1.5 font-mono truncate hidden sm:inline">
                ({detectedDependencies.slice(0, 3).map((d) => d.split('/').pop()).join(', ')}
                {detectedDependencies.length > 3 ? '...' : ''})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                addDependenciesToContext(detectedDependencies);
                if (soundEnabled) soundManager.playSuccess();
              }}
              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-[11px] transition shadow flex items-center gap-1"
              title="Ajouter automatiquement ces fichiers dans les onglets et le contexte de l'agent"
            >
              <Plus className="w-3 h-3" /> Ajouter au contexte
            </button>
            <button
              type="button"
              onClick={() => setDetectedDependencies([])}
              className="p-1 text-gray-500 hover:text-gray-300 transition"
              title="Ignorer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Zone de saisie avec Drag & Drop Universel (Item 15) */}
      <div
        className={`relative p-3 border-t border-[#1c2234] bg-[#0c0f16] transition-all ${
          isDraggingOver ? 'bg-indigo-950/40 border-indigo-500/80 ring-2 ring-indigo-500/30' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          const droppedFiles = Array.from(e.dataTransfer.files);
          if (droppedFiles.length > 0) {
            const hasImage = droppedFiles.some((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
            if (hasImage) {
              const img = droppedFiles.find((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
              const imgPath = (img as any).path || img?.name || '';
              setInput((prev) => `/image ${imgPath}`);
              addLog('info', `Fichier image détecté : commande /image ${imgPath} prête pour analyse multimodale Gemma4`);
            } else {
              const mentions = droppedFiles.map((f) => `@${(f as any).path || f.name}`).join(' ');
              setInput((prev) => (prev ? `${prev} ${mentions}` : mentions));
              addLog('info', `${droppedFiles.length} fichier(s) inséré(s) dans le prompt de contexte`);
            }
          }
        }}
      >
        {isDraggingOver && (
          <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-sm z-30 flex items-center justify-center rounded-t-xl border-2 border-dashed border-indigo-400 animate-pulse pointer-events-none">
            <div className="flex items-center gap-2 text-indigo-200 text-xs font-semibold">
              <Download className="w-5 h-5 text-indigo-400" />
              <span>Déposez vos images (vision Gemma4) ou fichiers sources pour contexte...</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex flex-col gap-2">
          <div className="relative flex items-center">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                if (val.startsWith('/') && !val.includes(' ')) {
                  setShowSlashMenu(true);
                  setSelectedSlashIndex(0);
                } else {
                  setShowSlashMenu(false);
                }
                if (val.endsWith('@')) {
                  setShowMentionMenu(true);
                } else if (!val.includes('@')) {
                  setShowMentionMenu(false);
                }
              }}
              onKeyDown={(e) => {
                if (showSlashMenu && filteredSlashCommands.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedSlashIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    selectSlashCommand(filteredSlashCommands[selectedSlashIndex]);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowSlashMenu(false);
                    return;
                  }
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isDraggingOver
                  ? 'Déposez votre fichier ici pour l\'insérer dans le prompt...'
                  : 'Que voulez-vous créer ? Tapez / pour les outils ou glissez un fichier...'
              }
              className="w-full resize-none px-3.5 py-2.5 pr-20 bg-[#121622] border border-[#21283c] rounded-2xl text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition shadow-inner"
            />

            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowMentionMenu(!showMentionMenu)}
                className="p-1 rounded-lg hover:bg-[#20273a] text-gray-400 hover:text-white transition"
                title="Mentionner des contextes, fichiers ou symboles (@)"
              >
                <AtSign className="w-3.5 h-3.5" />
              </button>

              {isAgentRunning ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium transition shadow"
                  title="Interrompre l'agent"
                >
                  <Square className="w-3 h-3 fill-white" /> Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition shadow-md"
                  title="Envoyer à l'agent"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Modale de gestion de la Mémoire Long-Terme Persistante (Item 3) */}
      {showLearningsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#10141f] border border-[#232a3d] rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-5 py-4 border-b border-[#232a3d] flex items-center justify-between bg-[#151a28]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-100 text-sm">Mémoire Long-Terme Persistante</h3>
                  <p className="text-[11px] text-gray-400">Stockée dans <code className="text-purple-300">.localagent/learnings.json</code> et injectée au LLM</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLearningsModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#20273a] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
              {/* Formulaire d'ajout rapide */}
              <div className="p-3.5 rounded-xl bg-[#141825] border border-[#23293d] space-y-2.5">
                <span className="font-semibold text-gray-200 block text-[11px]">Ajouter un nouvel apprentissage :</span>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newLearningTitle}
                    onChange={(e) => setNewLearningTitle(e.target.value)}
                    placeholder="Titre de la règle..."
                    className="col-span-2 px-3 py-1.5 rounded-lg bg-[#0c0e15] border border-[#23293d] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                  <select
                    value={newLearningCategory}
                    onChange={(e) => setNewLearningCategory(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-[#0c0e15] border border-[#23293d] text-gray-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="architecture">Architecture</option>
                    <option value="convention">Convention</option>
                    <option value="bugfix">Bugfix</option>
                    <option value="performance">Performance</option>
                    <option value="style">Style</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={newLearningContent}
                  onChange={(e) => setNewLearningContent(e.target.value)}
                  placeholder="Explication détaillée ou règle que l'IA doit toujours respecter..."
                  className="w-full resize-none px-3 py-1.5 rounded-lg bg-[#0c0e15] border border-[#23293d] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!newLearningTitle.trim() || !newLearningContent.trim()}
                    onClick={async () => {
                      if (!newLearningTitle.trim() || !newLearningContent.trim()) return;
                      await saveLearning(newLearningCategory, newLearningTitle.trim(), newLearningContent.trim());
                      setNewLearningTitle('');
                      setNewLearningContent('');
                      if (soundEnabled) soundManager.playSuccess();
                      addLog('info', 'Nouvel apprentissage persistant sauvegardé avec succès.');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium disabled:opacity-40 transition flex items-center gap-1.5 shadow"
                  >
                    <Plus className="w-3.5 h-3.5" /> Enregistrer la règle
                  </button>
                </div>
              </div>

              {/* Liste des apprentissages */}
              <div className="space-y-2">
                <span className="font-semibold text-gray-400 block text-[11px] uppercase tracking-wider">
                  Règles actuelles ({learnings.length}) :
                </span>
                {learnings.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 border border-dashed border-[#23293d] rounded-xl">
                    Aucune règle enregistrée pour l'instant. Utilisez le formulaire ci-dessus ou demandez à l'agent d'apprendre avec <code className="text-purple-400">save_learning</code>.
                  </div>
                ) : (
                  learnings.map((item) => (
                    <div
                      key={String(item.id)}
                      className="p-3 rounded-xl bg-[#141825] border border-[#23293d] flex items-start justify-between gap-3 hover:border-purple-500/40 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-100">{String(item.title)}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 uppercase">
                            {String(item.category)}
                          </span>
                        </div>
                        <p className="text-gray-300 text-[11px] leading-relaxed whitespace-pre-wrap">{String(item.content)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteLearning(String(item.id));
                          if (soundEnabled) soundManager.playSuccess();
                        }}
                        className="p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                        title="Supprimer cet apprentissage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[#232a3d] bg-[#151a28] flex justify-between items-center text-[11px] text-gray-400">
              <span>Ces connaissances sont automatiquement réinjectées lors de chaque prompt.</span>
              <button
                type="button"
                onClick={() => setShowLearningsModal(false)}
                className="px-3 py-1 rounded-lg bg-[#22293d] hover:bg-[#2c354e] text-gray-200 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const AgentChat = React.memo(AgentChatComponent);
AgentChat.displayName = 'AgentChat';
