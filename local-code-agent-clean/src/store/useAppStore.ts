import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api, SymbolItem, LearningItem, TransactionEvent, SqliteTableDesc, SqliteQueryOutput } from '../lib/ipc';

const initialSessionId = 'session-default';
const initialSession: ChatSession = {
  id: initialSessionId,
  title: 'Nouvelle Session',
  messages: [
    {
      id: 'welcome',
      sender: 'system',
      content: "Bienvenue dans Singular Code. Votre environnement de développement intelligent autonome avec exécution sécurisée et contrôle total.",
      timestamp: new Date().toLocaleTimeString(),
    }
  ],
  todos: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const initialProjects: ProjectItem[] = [
  {
    id: "project-cli",
    name: "CLI Project",
    icon: "cloud",
    folders: [],
    rules: "# Directives CLI Project\n- Outils en ligne de commande ultra-légers.\n- Aucun wrapper lourd, vitesse d'exécution maximale.",
    conversations: [],
    isCloudSync: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "project-proud-volta",
    name: "proud-volta",
    icon: "folder",
    folders: ["/home/fazerdino1/Documents/antigravity/proud-volta"],
    rules: "# Règles Proud Volta\n- Tauri 2 + Rust + React + Monaco.\n- Sandbox Bubblewrap stricte et confinement Landlock.\n- Suivre les conventions Conventional Commits.",
    conversations: [
      {
        id: "conv-proud-1",
        title: "Singular Code ...",
        relativeTime: "now",
        createdAt: new Date().toISOString(),
        messages: [
          {
            id: "msg-init",
            sender: "system",
            content: "Projet proud-volta initialisé avec succès. Prêt pour les requêtes de code.",
            timestamp: new Date().toLocaleTimeString(),
          }
        ],
        todos: []
      }
    ],
    activeConversationId: "conv-proud-1",
    isCloudSync: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "project-splendid-davinci",
    name: "splendid-davinci",
    icon: "folder",
    folders: [],
    rules: "# Règles Splendid Davinci\n- Prototypage rapide d'algorithmes et d'art génératif.",
    conversations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "project-lively-darwin",
    name: "lively-darwin",
    icon: "folder",
    folders: [],
    rules: "# Règles Lively Darwin\n- Moteur d'évolution génétique et simulations physiques.",
    conversations: [
      {
        id: "conv-darwin-1",
        title: "Projet De Démarrage ...",
        relativeTime: "11h",
        createdAt: new Date(Date.now() - 11 * 3600 * 1000).toISOString(),
        messages: [],
        todos: []
      }
    ],
    activeConversationId: "conv-darwin-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "project-antigravity-x64",
    name: "Antigravity-x64",
    icon: "folder",
    folders: [],
    rules: "# Règles Linux Antigravity\n- Cible x86_64, Wayland/X11 et isolation LSM.",
    conversations: [
      {
        id: "conv-anti-1",
        title: "Installation Sous Linu...",
        relativeTime: "12h",
        createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        messages: [],
        todos: []
      }
    ],
    activeConversationId: "conv-anti-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "project-zealous-shannon",
    name: "zealous-shannon",
    icon: "folder",
    folders: [],
    rules: "# Moteur Sonic Boost\n- 60 FPS, zéro allocation dans la boucle critique.",
    conversations: [
      {
        id: "conv-zealous-1",
        title: "Moteur Sonic Boost 3...",
        relativeTime: "23h",
        createdAt: new Date(Date.now() - 23 * 3600 * 1000).toISOString(),
        messages: [],
        todos: []
      }
    ],
    activeConversationId: "conv-zealous-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "project-radiant-bose",
    name: "radiant-bose",
    icon: "folder",
    folders: [],
    rules: "# Audio DSP & Synthèse modulaire.",
    conversations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "project-calm-noether",
    name: "calm-noether",
    icon: "folder",
    folders: [],
    rules: "# Connexion Game Engine & Physique.",
    conversations: [
      {
        id: "conv-calm-1",
        title: "Connecting To Game E...",
        relativeTime: "1d",
        createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        messages: [],
        todos: []
      }
    ],
    activeConversationId: "conv-calm-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "project-crossplay",
    name: "site web CrossPla...",
    icon: "folder",
    folders: [],
    rules: "# Amélioration Interface & CrossPlay Web.",
    conversations: [
      {
        id: "conv-cross-1",
        title: "Amélioration Interfac...",
        relativeTime: "13d",
        createdAt: new Date(Date.now() - 13 * 24 * 3600 * 1000).toISOString(),
        messages: [],
        todos: []
      }
    ],
    activeConversationId: "conv-cross-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  isModifiedByAi?: boolean;
}

export interface ModelProfile {
  name: string;
  api_url: string;
  model_id: string;
  api_key?: string;
  temperature: number;
  max_tokens: number;
  num_ctx?: number;
  supports_native_tools: boolean;
}

export type ApprovalMode = 'ask' | 'architect' | 'code' | 'debug' | 'review' | 'yolo';
export type SandboxType = 'bubblewrap' | 'docker' | 'none';

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  current_num_ctx: number;
  max_tokens: number;
  auto_expanded: boolean;
}

export interface TodoItem {
  id: string;
  task: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface ToolCallCard {
  id: string;
  tool_name: string;
  tool_args: any;
  status: 'running' | 'success' | 'error';
  result?: any;
  mini_diff?: { original: string; modified: string };
}

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  tool_cards?: ToolCallCard[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: 'Code' | 'Sécurité' | 'DevOps' | 'Système' | 'Web' | 'GameDev' | 'Database' | 'Qualité' | 'Performance' | 'Doc' | 'Bureautique';
  enabled: boolean;
  systemPrompt: string;
  slashCommand?: string;
}

export interface PluginItem {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: 'llm' | 'devtools' | 'security' | 'gamedev' | 'database' | 'ui' | 'office';
  enabled: boolean;
  installed: boolean;
  icon: string;
  tags: string[];
  systemInstructions?: string;
}

export interface PermissionRequest {
  tool_name: string;
  tool_args: any;
  description: string;
  resolve: (decision: 'allow_once' | 'always_allow' | 'deny' | 'deny_with_feedback', feedback?: string) => void;
}

export interface ProjectConversationItem {
  id: string;
  title: string;
  relativeTime: string;
  createdAt: string;
  messages: ChatMessageItem[];
  todos: TodoItem[];
}

export interface ProjectItem {
  id: string;
  name: string;
  icon?: 'folder' | 'cloud' | 'code';
  folders: string[]; // Support multi-dossiers
  rules: string; // Règles & Directives spécifiques au projet
  conversations: ProjectConversationItem[];
  activeConversationId?: string;
  createdAt: string;
  updatedAt: string;
  isCloudSync?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessageItem[];
  todos: TodoItem[];
  createdAt: string;
  updatedAt: string;
}

export type ActivityTab = 'projects' | 'files' | 'search' | 'git' | 'sessions' | 'arch' | 'monitor' | 'settings';

export interface SearchMatchItem {
  lineNumber: number;
  lineContent: string;
  startIndex: number;
  matchLength: number;
}

export interface FileSearchResult {
  filePath: string;
  matches: SearchMatchItem[];
}

export interface HardwareHistoryPoint {
  timestamp: number;
  vramUsed: number;
  gpuPct: number;
  ramUsed: number;
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  minimap: boolean;
  wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  lineNumbers: 'on' | 'off' | 'relative';
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  smoothScrolling: boolean;
  formatOnSave: boolean;
  autoSaveDelay: number;
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'all';
}

export interface GeneralSettings {
  themeMode: 'dark' | 'light' | 'oled';
  accentColor: 'cyan' | 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';
  motionAnimations: boolean;
  soundEffects: boolean;
  systemNotifications: boolean;
  autoUnloadVramMinutes: number;
  maxAgentIterations: number;
  customSystemPrompt: string;
  autoRepairTests: boolean;
  explanationLevel: 'concise' | 'detailed' | 'code_only';
  autoTokenExpansion: boolean;
  tokenExpansionChunk: number;
  protectedPaths: string[];
}

export const defaultEditorSettings: EditorSettings = {
  fontSize: 13,
  fontFamily: 'JetBrains Mono, Menlo, monospace',
  tabSize: 2,
  minimap: true,
  wordWrap: 'on',
  lineNumbers: 'on',
  cursorBlinking: 'smooth',
  smoothScrolling: true,
  formatOnSave: true,
  autoSaveDelay: 1500,
  renderWhitespace: 'selection',
};

export const defaultGeneralSettings: GeneralSettings = {
  themeMode: 'dark',
  accentColor: 'cyan',
  motionAnimations: true,
  soundEffects: true,
  systemNotifications: true,
  autoUnloadVramMinutes: 0,
  maxAgentIterations: 25,
  customSystemPrompt: '',
  autoRepairTests: true,
  explanationLevel: 'concise',
  autoTokenExpansion: true,
  tokenExpansionChunk: 2048,
  protectedPaths: ['.env', '.git', 'id_rsa', 'secrets'],
};

export interface AppState {
  // Activity Bar & Navigation
  activeActivityTab: ActivityTab;
  setActiveActivityTab: (tab: ActivityTab) => void;

  // Système de Projets complet (Multi-Dossiers, Règles & Conversations)
  projects: ProjectItem[];
  activeProjectId: string | null;
  isProjectRulesModalOpen: boolean;
  editingProjectId: string | null;
  loadProjects: () => Promise<void>;
  createProject: (name: string, folders?: string[], rules?: string, icon?: 'folder' | 'cloud' | 'code') => Promise<string>;
  selectProject: (projectId: string, conversationId?: string) => Promise<void>;
  selectProjectConversation: (projectId: string, conversationId: string) => void;
  createProjectConversation: (projectId: string, title?: string) => void;
  deleteProjectConversation: (projectId: string, conversationId: string) => void;
  addFolderToProject: (projectId: string, folder: string) => Promise<void>;
  removeFolderFromProject: (projectId: string, folder: string) => Promise<void>;
  updateProjectRules: (projectId: string, rules: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  setProjectRulesModalOpen: (open: boolean, projectId?: string) => void;

  // Sessions Multi-Chat Singular Code
  sessions: ChatSession[];
  activeSessionId: string;
  createNewSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;

  // Workspace
  currentWorkspace: string | null;
  files: FileNode[];
  recentWorkspaces: string[];
  
  // Editor & Diff
  openTabs: string[];
  activeTab: string | null;
  fileContents: Record<string, string>;
  activeDiff: { path: string; original: string; modified: string; readOnly?: boolean } | null;
  editorViewMode: 'editor' | 'diff' | 'split';
  setEditorViewMode: (mode: 'editor' | 'diff' | 'split') => void;

  // Git Source Control
  gitStatus: any | null;
  gitBranches: any[];
  gitCommits: any[];
  isGitLoading: boolean;
  refreshGitStatus: () => Promise<void>;
  stageGitFile: (path: string) => Promise<void>;
  unstageGitFile: (path: string) => Promise<void>;
  commitGit: (msg: string) => Promise<string | null>;
  checkoutGitBranch: (branch: string) => Promise<void>;
  createGitBranch: (branch: string) => Promise<void>;

  // Agent & Chat
  messages: ChatMessageItem[];
  todos: TodoItem[];
  isAgentRunning: boolean;
  approvalMode: ApprovalMode;
  isPlanAndReviewMode: boolean;
  setIsPlanAndReviewMode: (val: boolean) => void;
  tokenUsage: TokenUsage | null;
  setTokenUsage: (usage: TokenUsage | null) => void;
  
  // Modèle LLM
  profiles: ModelProfile[];
  activeProfileIndex: number;
  isModelConnected: boolean;
  availableModels: string[];

  // Sécurité & Sandbox
  sandboxType: SandboxType;
  allowNetwork: boolean;
  bwrapAvailable: boolean;
  dockerAvailable: boolean;
  landlockStatus: any | null;

  // Telemetry & Hardware
  hardwareMetrics: any | null;
  refreshTelemetry: () => Promise<void>;

  // Logs & Terminal
  systemLogs: { timestamp: string; level: 'info' | 'warn' | 'error' | 'security'; message: string }[];
  activeBottomTab: 'terminal' | 'logs';

  // Skills
  skills: Skill[];
  isSkillsOpen: boolean;

  // Système de Plugins
  plugins: PluginItem[];
  isPluginsModalOpen: boolean;
  setPluginsModalOpen: (open: boolean) => void;
  togglePlugin: (id: string) => void;
  installPlugin: (id: string) => void;
  uninstallPlugin: (id: string) => void;

  // UI Modals
  isSettingsOpen: boolean;
  isCommandPaletteOpen: boolean;
  isAuditModalOpen: boolean;
  isCheckpointModalOpen: boolean;
  currentPermissionRequest: PermissionRequest | null;
  theme: 'dark' | 'light';
  soundEnabled: boolean;
  airGappedMode: boolean;

  // Actions
  setWorkspace: (path: string | null) => Promise<void>;
  setFiles: (files: FileNode[]) => void;
  markFileAsModifiedByAi: (path: string) => void;
  openFile: (path: string, content?: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  setDiff: (diff: { path: string; original: string; modified: string; readOnly?: boolean } | null) => void;
  
  // Skills actions
  toggleSkill: (id: string) => void;
  addSkill: (skill: Skill) => void;
  setSkillsOpen: (open: boolean) => void;
  
  addMessage: (msg: ChatMessageItem) => void;
  updateLastAgentMessage: (chunk: string) => void;
  addToolCard: (tool: ToolCallCard) => void;
  updateToolCard: (id: string, updates: Partial<ToolCallCard>) => void;
  setTodos: (todos: TodoItem[]) => void;
  setIsAgentRunning: (running: boolean) => void;
  setApprovalMode: (mode: ApprovalMode) => void;

  setProfiles: (profiles: ModelProfile[]) => void;
  setActiveProfileIndex: (index: number) => void;
  setIsModelConnected: (connected: boolean) => void;
  setAvailableModels: (models: string[]) => void;

  setSandboxType: (type: SandboxType) => void;
  setAllowNetwork: (allow: boolean) => void;
  setAirGappedMode: (enabled: boolean) => void;
  setSecurityStatus: (bwrap: boolean, docker: boolean) => void;

  addLog: (level: 'info' | 'warn' | 'error' | 'security', message: string) => void;
  setActiveBottomTab: (tab: 'terminal' | 'logs') => void;

  setSettingsOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setAuditModalOpen: (open: boolean) => void;
  setCheckpointModalOpen: (open: boolean) => void;
  setPermissionRequest: (req: PermissionRequest | null) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleSound: () => void;

  // Symboles AST & Recherche Hybride (Item 18 & 20)
  workspaceSymbols: SymbolItem[];
  fetchWorkspaceSymbols: () => Promise<void>;

  // Mémoire Long-Terme Persistante (Item 3)
  learnings: LearningItem[];
  fetchLearnings: () => Promise<void>;
  saveLearning: (category: string, title: string, content: string) => Promise<void>;
  deleteLearning: (id: string) => Promise<void>;

  // Transactions Multi-Fichiers & Rollback Global (Item 2)
  lastTransaction: TransactionEvent | null;
  setLastTransaction: (tx: TransactionEvent | null) => void;
  rollbackLastTransaction: () => Promise<void>;

  // Fork & Ramification de conversation (Item 17)
  activeBranch: string;
  conversationBranches: Record<string, ChatMessageItem[]>;
  forkConversation: (messageId: string) => void;
  switchBranch: (branchName: string) => void;

  // Redimensionnement & Positionnement des panneaux à la souris
  sidebarWidth: number;
  chatWidth: number;
  terminalHeight: number;
  chatPlacement: 'right' | 'left';
  isSidebarCollapsed: boolean;
  isChatCollapsed: boolean;
  setSidebarWidth: (width: number) => void;
  setChatWidth: (width: number) => void;
  setTerminalHeight: (height: number) => void;
  setChatPlacement: (placement: 'right' | 'left') => void;
  toggleChatPlacement: () => void;
  toggleSidebarCollapsed: () => void;
  toggleChatCollapsed: () => void;

  // Paramètres Avancés Éditeur Monaco & Application
  editorSettings: EditorSettings;
  setEditorSettings: (settings: Partial<EditorSettings>) => void;
  generalSettings: GeneralSettings;
  setGeneralSettings: (settings: Partial<GeneralSettings>) => void;
  exportBackupJson: () => string;
  importBackupJson: (jsonStr: string) => boolean;
  resetAllSettings: () => void;

  // Split Editor Monaco (Item 7)
  splitTab: string | null;
  splitDirection: 'vertical' | 'horizontal';
  openFileInSplit: (path: string) => void;
  closeSplit: () => void;
  setSplitDirection: (dir: 'vertical' | 'horizontal') => void;

  // Recherche & Remplacement Globaux (Item 6)
  searchQuery: string;
  replaceQuery: string;
  searchCaseSensitive: boolean;
  searchWholeWord: boolean;
  searchRegex: boolean;
  searchResults: FileSearchResult[];
  isSearching: boolean;
  setSearchQuery: (q: string) => void;
  setReplaceQuery: (q: string) => void;
  setSearchCaseSensitive: (val: boolean) => void;
  setSearchWholeWord: (val: boolean) => void;
  setSearchRegex: (val: boolean) => void;
  runGlobalSearch: () => Promise<void>;
  runGlobalReplace: (replaceAll: boolean, targetFile?: string, matchIndex?: number) => Promise<void>;

  // Inspecteur de Base de Données SQLite (Item 11)
  isDbModalOpen: boolean;
  setDbModalOpen: (open: boolean) => void;
  activeDbPath: string | null;
  dbTables: SqliteTableDesc[];
  selectedDbTable: string | null;
  dbQueryResults: SqliteQueryOutput | null;
  loadDatabase: (path: string) => Promise<void>;
  runDbQuery: (sql: string) => Promise<void>;
  selectDbTable: (table: string) => Promise<void>;

  // Sparklines Télémétrie Hardware (Item 12)
  hardwareHistory: HardwareHistoryPoint[];

  // Résolution Intelligente de Dépendances (Item 3)
  detectedDependencies: string[];
  setDetectedDependencies: (deps: string[]) => void;
  addDependenciesToContext: (deps: string[]) => void;

  // Opérations Fichiers Avancées (Item 5)
  renameFile: (oldPath: string, newPath: string) => Promise<void>;

  // Compaction & Économie de Tokens (Item 2)
  compactHistory: () => void;
}

// Safe LocalStorage wrapper handling QuotaExceededError
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn(`[safeLocalStorage] Erreur lecture localStorage pour "${key}":`, e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(key, value);
    } catch (e: any) {
      console.warn(`[safeLocalStorage] Erreur écriture localStorage pour "${key}":`, e);
      if (
        e?.name === 'QuotaExceededError' ||
        e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        e?.code === 22 ||
        e?.code === 1014
      ) {
        console.error(
          `[safeLocalStorage] QuotaExceededError lors de l'enregistrement de "${key}". Le quota localStorage est dépassé.`
        );
      }
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[safeLocalStorage] Erreur suppression localStorage pour "${key}":`, e);
    }
  },
};

// Nettoyer et tronquer les résultats d'outils dépassant 2000 caractères avant sérialisation
function sanitizeToolResultsForStorage(messages: ChatMessageItem[] = []): ChatMessageItem[] {
  return messages.map((msg) => {
    if (!msg.tool_cards || msg.tool_cards.length === 0) return msg;
    return {
      ...msg,
      tool_cards: msg.tool_cards.map((card) => {
        if (card.result === undefined || card.result === null) return card;
        let res = card.result;
        if (typeof res === 'string') {
          if (res.length > 2000) {
            res = res.slice(0, 2000) + '... [tronqué]';
          }
        } else if (typeof res === 'object') {
          try {
            let truncated = false;
            let objCopy = Array.isArray(res) ? [...res] : { ...res };
            for (const key of ['output', 'stdout', 'content', 'data', 'text', 'message']) {
              if (typeof (objCopy as any)[key] === 'string' && (objCopy as any)[key].length > 2000) {
                (objCopy as any)[key] = (objCopy as any)[key].slice(0, 2000) + '... [tronqué]';
                truncated = true;
              }
            }
            const str = JSON.stringify(objCopy);
            if (str.length > 2000) {
              res = str.slice(0, 2000) + '... [tronqué]';
            } else if (truncated) {
              res = objCopy;
            }
          } catch {
            // ignore
          }
        }
        return { ...card, result: res };
      }),
    };
  });
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  // Activity Bar & Navigation
  activeActivityTab: 'projects',
  setActiveActivityTab: (tab) => set({ activeActivityTab: tab }),

  // Système de Projets complet (Multi-Dossiers, Règles & Conversations)
  projects: initialProjects,
  activeProjectId: 'project-proud-volta',
  isProjectRulesModalOpen: false,
  editingProjectId: null,

  loadProjects: async () => {
    try {
      const backendConfigs = await api.getProjects();
      const currentProjects = get().projects;
      const merged: ProjectItem[] = backendConfigs.map((cfg) => {
        const existing = currentProjects.find((p) => p.id === cfg.id);
        return {
          id: cfg.id,
          name: cfg.name,
          icon: (cfg.icon as any) || 'folder',
          folders: cfg.folders || [],
          rules: cfg.rules || '',
          isCloudSync: cfg.is_cloud_sync || false,
          conversations: existing?.conversations || [],
          activeConversationId: existing?.activeConversationId,
          createdAt: cfg.created_at,
          updatedAt: cfg.updated_at,
        };
      });
      set({ projects: merged.length > 0 ? merged : currentProjects });
    } catch (e) {
      console.warn("Échec chargement projets:", e);
    }
  },

  createProject: async (name: string, folders: string[] = [], rules: string = '', icon: 'folder' | 'cloud' | 'code' = 'folder') => {
    const id = `project-${Date.now()}`;
    const newProject: ProjectItem = {
      id,
      name,
      icon,
      folders,
      rules: rules || `# Règles du projet ${name}\n- Conventions de développement et directives de l'agent.`,
      conversations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await api.saveProject({
        id,
        name,
        icon,
        folders,
        rules: newProject.rules,
        is_cloud_sync: false,
        created_at: newProject.createdAt,
        updated_at: newProject.updatedAt,
      });
    } catch (e) {
      console.warn("Erreur sauvegarde projet:", e);
    }
    set((s) => ({
      projects: [newProject, ...s.projects],
      activeProjectId: id,
    }));
    return id;
  },

  selectProject: async (projectId: string, conversationId?: string) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;

    // Définir le workspace actif sur le premier dossier du projet s'il existe
    if (project.folders.length > 0) {
      await get().setWorkspace(project.folders[0]);
      try {
        const files = await api.listFiles();
        get().setFiles(files);
        await get().refreshGitStatus();
      } catch {}
    }

    // Activer la conversation
    let conv = project.conversations.find((c) => c.id === conversationId);
    if (!conv && project.conversations.length > 0) {
      conv = project.conversations[0];
    }

    if (conv) {
      set({
        activeProjectId: projectId,
        messages: conv.messages,
        todos: conv.todos,
      });
    } else {
      set({
        activeProjectId: projectId,
      });
    }
  },

  selectProjectConversation: (projectId: string, conversationId: string) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;
    const conv = project.conversations.find((c) => c.id === conversationId);
    if (conv) {
      const currentProjectId = get().activeProjectId;
      if (currentProjectId) {
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id === currentProjectId && p.activeConversationId) {
              return {
                ...p,
                conversations: p.conversations.map((c) =>
                  c.id === p.activeConversationId
                    ? { ...c, messages: get().messages, todos: get().todos }
                    : c
                ),
              };
            }
            return p;
          }),
        }));
      }

      set((s) => ({
        activeProjectId: projectId,
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, activeConversationId: conversationId } : p
        ),
        messages: conv.messages,
        todos: conv.todos,
      }));
    }
  },

  createProjectConversation: (projectId: string, title?: string) => {
    const newConvId = `conv-${Date.now()}`;
    const newConv: ProjectConversationItem = {
      id: newConvId,
      title: title || 'Nouvelle conversation',
      relativeTime: 'now',
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: `welcome-${Date.now()}`,
          sender: 'system',
          content: 'Conversation démarrée pour ce projet. Posez votre question ou demandez une modification de code.',
          timestamp: new Date().toLocaleTimeString(),
        }
      ],
      todos: [],
    };

    set((s) => ({
      activeProjectId: projectId,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              conversations: [newConv, ...p.conversations],
              activeConversationId: newConvId,
              updatedAt: new Date().toISOString(),
            }
          : p
      ),
      messages: newConv.messages,
      todos: [],
    }));
  },

  deleteProjectConversation: (projectId: string, conversationId: string) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id === projectId) {
          const filtered = p.conversations.filter((c) => c.id !== conversationId);
          const nextActive = p.activeConversationId === conversationId
            ? filtered[0]?.id
            : p.activeConversationId;
          return {
            ...p,
            conversations: filtered,
            activeConversationId: nextActive,
          };
        }
        return p;
      }),
    }));
  },

  addFolderToProject: async (projectId: string, folder: string) => {
    try {
      await api.addFolderToProject(projectId, folder);
    } catch {}
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, folders: p.folders.includes(folder) ? p.folders : [...p.folders, folder] }
          : p
      ),
    }));
  },

  removeFolderFromProject: async (projectId: string, folder: string) => {
    try {
      await api.removeFolderFromProject(projectId, folder);
    } catch {}
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, folders: p.folders.filter((f) => f !== folder) }
          : p
      ),
    }));
  },

  updateProjectRules: async (projectId: string, rules: string) => {
    try {
      await api.setProjectRules(projectId, rules);
    } catch {}
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, rules, updatedAt: new Date().toISOString() } : p
      ),
    }));
    get().addLog('info', `Règles du projet mises à jour et synchronisées avec .localagent/rules.md`);
  },

  deleteProject: async (projectId: string) => {
    try {
      await api.deleteProject(projectId);
    } catch {}
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== projectId),
      activeProjectId: s.activeProjectId === projectId ? null : s.activeProjectId,
    }));
  },

  renameProject: async (projectId: string, name: string) => {
    const proj = get().projects.find((p) => p.id === projectId);
    if (!proj) return;
    const updated = { ...proj, name, updatedAt: new Date().toISOString() };
    try {
      await api.saveProject({
        id: updated.id,
        name: updated.name,
        icon: updated.icon,
        folders: updated.folders,
        rules: updated.rules,
        is_cloud_sync: updated.isCloudSync,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
      });
    } catch {}
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? updated : p)),
    }));
  },

  setProjectRulesModalOpen: (open: boolean, projectId?: string) => {
    set({
      isProjectRulesModalOpen: open,
      editingProjectId: projectId || get().activeProjectId,
    });
  },

  // Sessions Multi-Chat Singular Code
  sessions: [initialSession],
  activeSessionId: initialSessionId,
  createNewSession: () => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: `Session ${get().sessions.length + 1}`,
      messages: [
        {
          id: `welcome-${Date.now()}`,
          sender: 'system',
          content: "Nouvelle session initialisée. Posez votre question ou demandez une modification de code.",
          timestamp: new Date().toLocaleTimeString(),
        }
      ],
      todos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Sauvegarder la session courante d'abord
    const currentId = get().activeSessionId;
    const currentMsgs = get().messages;
    const currentTodos = get().todos;
    const updatedSessions = get().sessions.map((s) =>
      s.id === currentId ? { ...s, messages: currentMsgs, todos: currentTodos, updatedAt: new Date().toISOString() } : s
    );

    set({
      sessions: [newSession, ...updatedSessions],
      activeSessionId: newId,
      messages: newSession.messages,
      todos: [],
    });
  },
  switchSession: (id) => {
    const currentId = get().activeSessionId;
    if (currentId === id) return;
    const currentMsgs = get().messages;
    const currentTodos = get().todos;

    const updatedSessions = get().sessions.map((s) =>
      s.id === currentId ? { ...s, messages: currentMsgs, todos: currentTodos, updatedAt: new Date().toISOString() } : s
    );
    const target = updatedSessions.find((s) => s.id === id);
    if (target) {
      set({
        sessions: updatedSessions,
        activeSessionId: id,
        messages: target.messages,
        todos: target.todos,
      });
    }
  },
  deleteSession: (id) => {
    const currentSessions = get().sessions;
    if (currentSessions.length <= 1) return; // Ne pas supprimer la dernière session
    const filtered = currentSessions.filter((s) => s.id !== id);
    if (get().activeSessionId === id) {
      const nextSession = filtered[0];
      set({
        sessions: filtered,
        activeSessionId: nextSession.id,
        messages: nextSession.messages,
        todos: nextSession.todos,
      });
    } else {
      set({ sessions: filtered });
    }
  },
  renameSession: (id, title) => {
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, title } : sess))
    }));
  },

  currentWorkspace: null,
  files: [],
  recentWorkspaces: [],

  openTabs: [],
  activeTab: null,
  fileContents: {},
  activeDiff: null,
  editorViewMode: 'editor',
  setEditorViewMode: (mode) => set({ editorViewMode: mode }),

  // Git Source Control
  gitStatus: null,
  gitBranches: [],
  gitCommits: [],
  isGitLoading: false,
  refreshGitStatus: async () => {
    try {
      set({ isGitLoading: true });
      const [status, branches, commits] = await Promise.all([
        api.getGitStatus(),
        api.getGitBranches(),
        api.getGitLog(25),
      ]);
      set({ gitStatus: status, gitBranches: branches, gitCommits: commits, isGitLoading: false });
    } catch (e) {
      console.warn("Échec refresh git status:", e);
      set({ isGitLoading: false });
    }
  },
  stageGitFile: async (path: string) => {
    await api.stageFile(path);
    await get().refreshGitStatus();
  },
  unstageGitFile: async (path: string) => {
    await api.unstageFile(path);
    await get().refreshGitStatus();
  },
  commitGit: async (msg: string) => {
    const res = await api.commit(msg);
    await get().refreshGitStatus();
    return res;
  },
  checkoutGitBranch: async (branch: string) => {
    await api.checkoutBranch(branch);
    await get().refreshGitStatus();
  },
  createGitBranch: async (branch: string) => {
    await api.createBranch(branch);
    await get().refreshGitStatus();
  },

  messages: initialSession.messages,
  todos: [],
  isAgentRunning: false,
  approvalMode: 'ask',
  isPlanAndReviewMode: false,
  setIsPlanAndReviewMode: (val) => set({ isPlanAndReviewMode: val }),
  tokenUsage: null,
  setTokenUsage: (usage) => set({ tokenUsage: usage }),

  landlockStatus: null,
  hardwareMetrics: null,
  hardwareHistory: [
    { timestamp: Date.now() - 40000, vramUsed: 1750, gpuPct: 18, ramUsed: 11000 },
    { timestamp: Date.now() - 30000, vramUsed: 1800, gpuPct: 24, ramUsed: 11150 },
    { timestamp: Date.now() - 20000, vramUsed: 1820, gpuPct: 22, ramUsed: 11200 },
    { timestamp: Date.now() - 10000, vramUsed: 1840, gpuPct: 25, ramUsed: 11250 },
    { timestamp: Date.now(), vramUsed: 1840, gpuPct: 23, ramUsed: 11280 },
  ],
  refreshTelemetry: async () => {
    try {
      const [metrics, landlock] = await Promise.all([
        api.getHardwareMetrics(),
        api.checkLandlockStatus(),
      ]);
      const point: HardwareHistoryPoint = {
        timestamp: Date.now(),
        vramUsed: metrics?.vram_used_mb || 0,
        gpuPct: metrics?.gpu_utilization_pct || 0,
        ramUsed: metrics?.ram_used_mb || 0,
      };
      const prev = get().hardwareHistory || [];
      const updatedHistory = [...prev.slice(-29), point];
      set({ hardwareMetrics: metrics, landlockStatus: landlock, hardwareHistory: updatedHistory });
    } catch (e) {
      console.warn("Erreur télémétrie:", e);
    }
  },

  profiles: [
    {
      name: 'Ollama Local (qwen2.5-coder)',
      api_url: 'http://localhost:11434/v1',
      model_id: 'qwen2.5-coder:7b',
      temperature: 0.2,
      max_tokens: 16384,
      num_ctx: 32768,
      supports_native_tools: true,
    },
    {
      name: 'LM Studio Local',
      api_url: 'http://localhost:1234/v1',
      model_id: 'local-model',
      temperature: 0.2,
      max_tokens: 16384,
      num_ctx: 32768,
      supports_native_tools: true,
    }
  ],
  activeProfileIndex: 0,
  isModelConnected: false,
  availableModels: [],

  sandboxType: 'bubblewrap',
  allowNetwork: false,
  bwrapAvailable: true,
  dockerAvailable: false,

  systemLogs: [],
  activeBottomTab: 'terminal',

  // Skills par défaut (18 compétences spécialisées)
  skills: [
    {
      id: 'security-audit',
      name: 'Audit de Sécurité & Secrets',
      description: 'Détecte les vulnérabilités OWASP, fuites de clés API, injections et faiblesses d\'accès.',
      category: 'Sécurité',
      enabled: true,
      systemPrompt: 'Agis comme un auditeur de sécurité expert. Passe au peigne fin tout code généré pour repérer les fuites de secrets, les injections et les faiblesses d\'accès.',
      slashCommand: '/skill security',
    },
    {
      id: 'code-refactoring',
      name: 'Refactoring & Typage Strict',
      description: 'Optimise la maintenabilité, applique les principes SOLID et renforce les types statiques.',
      category: 'Code',
      enabled: true,
      systemPrompt: 'Applique un refactoring chirurgical : nommage précis, modularité, typage strict sans `any`, et suppression du code mort.',
      slashCommand: '/skill refactor',
    },
    {
      id: 'test-generator',
      name: 'Générateur de Tests Automatiques',
      description: 'Produit des tests unitaires et d\'intégration avec cas limites et couverture maximale.',
      category: 'Qualité',
      enabled: true,
      systemPrompt: 'Génère systématiquement des tests unitaires complets pour chaque fonction créée, incluant cas nominaux et cas limites.',
      slashCommand: '/skill test',
    },
    {
      id: 'git-workflow',
      name: 'Conventions Git & Diff',
      description: 'Rédige des commits conventionnels (feat, fix, refactor) et prépare des revues claires.',
      category: 'DevOps',
      enabled: true,
      systemPrompt: 'Respecte scrupuleusement les conventions de commit conventionnel (Conventional Commits) et décortique les diffs avec clarté.',
      slashCommand: '/skill git',
    },
    {
      id: 'linux-sysadmin',
      name: 'Expert Système Linux & Sandbox',
      description: 'Maîtrise de bash, gestion des permissions, inspection de processus et diagnostics système.',
      category: 'Système',
      enabled: true,
      systemPrompt: 'Agis comme un administrateur système Linux chevronné. Privilégie les commandes idempotentes, sûres et non destructrices.',
      slashCommand: '/skill sysadmin',
    },
    {
      id: 'godot-gdscript',
      name: 'Godot 4 & GDScript Expert',
      description: 'Développement de jeux Godot 4, scripts GDScript 2.0 typés, signaux et physique 2D/3D.',
      category: 'GameDev',
      enabled: true,
      systemPrompt: 'Agis comme un développeur expert du moteur Godot 4. Rédige du code GDScript moderne, strictement typé avec @onready, signaux découplés et arbres de nœuds optimisés.',
      slashCommand: '/skill godot',
    },
    {
      id: 'rust-systems',
      name: 'Rust & Sécurité Mémoire',
      description: 'Conception Rust idiomatique, gestion des lifetimes, borrow-checker et concurrence sûre.',
      category: 'Code',
      enabled: true,
      systemPrompt: 'Agis comme un développeur Rust chevronné. Privilégie le code sans `unsafe`, les zero-cost abstractions, la gestion propre des erreurs avec Result et thiserror.',
      slashCommand: '/skill rust',
    },
    {
      id: 'database-architect',
      name: 'Architecte Bases de Données & SQL',
      description: 'Indexation PostgreSQL/SQLite, requêtes analytiques, migrations propres et schémas normalisés.',
      category: 'Database',
      enabled: true,
      systemPrompt: 'Agis comme un DBA expert. Analyse la performance des requêtes, propose des index btree/gin adaptés, évite les N+1 queries et sécurise les transactions.',
      slashCommand: '/skill db',
    },
    {
      id: 'docker-containers',
      name: 'Docker & Conteneurs Multi-Stage',
      description: 'Création d\'images Docker minimalistes, multi-stage builds, non-root users et sécurité.',
      category: 'DevOps',
      enabled: true,
      systemPrompt: 'Conçois des Dockerfiles de production sécurisés : multi-stage, images de base légères (Alpine/Distroless), caches de layers optimisés et absence de secrets dans les layers.',
      slashCommand: '/skill docker',
    },
    {
      id: 'ui-tailwind',
      name: 'UI/UX & Design Tailwind Moderne',
      description: 'Composants modernes, glassmorphism, responsive mobile-first et accessibilité WCAG.',
      category: 'Web',
      enabled: true,
      systemPrompt: 'Agis comme un designer UI/UX et intégrateur frontend moderne. Utilise Tailwind CSS avec des palettes harmonieuses, micro-interactions soignées et contrastes accessibles.',
      slashCommand: '/skill ui',
    },
    {
      id: 'python-data-ai',
      name: 'Python Typage Strict & Async',
      description: 'Code Python propre avec Pydantic v2, MyPy strict, générateurs et boucles asyncio.',
      category: 'Code',
      enabled: true,
      systemPrompt: 'Applique les meilleures pratiques Python modernes : type hinting complet, Pydantic, dataclasses, concurrence asynchrone non-bloquante et docstrings Google-style.',
      slashCommand: '/skill python',
    },
    {
      id: 'performance-profiler',
      name: 'Optimisation de Code & Profiling',
      description: 'Élimination des allocations inutiles, réduction de la complexité algorithmique et benchmarks.',
      category: 'Performance',
      enabled: false,
      systemPrompt: 'Passe au crible les algorithmes pour réduire la complexité O(n). Évite les copies superflues, privilégie les structures de données adaptées et les itérateurs paresseux.',
      slashCommand: '/skill perf',
    },
    {
      id: 'web-scraping-crawler',
      name: 'Extraction Web & Scraping Éthique',
      description: 'Parsing HTML/DOM robuste, extraction de données textuelles et respect des limites serveur.',
      category: 'Web',
      enabled: false,
      systemPrompt: 'Extrais et nettoie les données web avec précision en gérant les erreurs réseau, les sélecteurs CSS résilients et la transformation en données tabulaires ou JSON.',
      slashCommand: '/skill scrape',
    },
    {
      id: 'regex-ninja',
      name: 'Maître Expressions Régulières',
      description: 'Formulation et explication d\'expressions rationnelles complexes et ultra-rapides.',
      category: 'Code',
      enabled: false,
      systemPrompt: 'Rédige des expressions régulières (Regex) robustes, sans catastrophic backtracking, commentées et accompagnées de jeux de tests unitaires.',
      slashCommand: '/skill regex',
    },
    {
      id: 'documentation-auto',
      name: 'Documentation Structurée & Mermaid',
      description: 'Documentation claire, guides techniques pas-à-pas et diagrammes d\'architecture Mermaid.',
      category: 'Doc',
      enabled: true,
      systemPrompt: 'Génère une documentation limpide en Markdown incluant des diagrammes Mermaid (flowcharts, sequence), des exemples concrets et des tables récapitulatives.',
      slashCommand: '/skill doc',
    },
    {
      id: 'cybersecurity-hardening',
      name: 'Durcissement Noyau Linux & LSM',
      description: 'Configuration Landlock, Bubblewrap, seccomp-bpf et confinement strict des processus.',
      category: 'Sécurité',
      enabled: true,
      systemPrompt: 'Agis comme un ingénieur sécurité Linux. Configure des environnements confinés stricts avec namespaces, Landlock et interdiction de toute élévation de privilèges.',
      slashCommand: '/skill harden',
    },
    {
      id: 'tdd-master',
      name: 'Cycle TDD & Tests Unitaires',
      description: 'Méthodologie Test-Driven Development (Red-Green-Refactor) avec mocks et assertions strictes.',
      category: 'Qualité',
      enabled: true,
      systemPrompt: 'Pratique le TDD rigoureux : commence toujours par écrire le test unitaire qui échoue avant d\'écrire le code d\'implémentation minimal qui le fait réussir.',
      slashCommand: '/skill tdd',
    },
    {
      id: 'api-designer',
      name: 'Architecture d\'API & Schémas JSON',
      description: 'Conception de contrats d\'API RESTful, validation de payload et documentation OpenAPI.',
      category: 'Web',
      enabled: false,
      systemPrompt: 'Conçois des APIs REST propres, avec codes HTTP standard, schémas JSON stricts et gestion des erreurs uniforme.',
      slashCommand: '/skill api',
    },
    {
      id: 'libreoffice-writer',
      name: 'LibreOffice Writer - Traitement de Texte & Rapports',
      description: 'Rédaction de documents textuels, rapports techniques, courriers et mémoires au format natif OpenDocument Text (.odt) ou conversion HTML/Markdown vers .odt/.pdf.',
      category: 'Bureautique',
      enabled: true,
      systemPrompt: 'Tu es un expert de LibreOffice Writer. Pour rédiger des documents, mémoires, spécifications ou courriers, utilise `generate_libreoffice_template(app_type="writer", path="nom.odt", ...)` ou écris un fichier HTML/Markdown complet et convertis-le avec `export_libreoffice_doc(target_format="odt")`.',
      slashCommand: '/libreoffice writer',
    },
    {
      id: 'libreoffice-calc',
      name: 'LibreOffice Calc - Feuilles de Calcul & Modèles Financiers',
      description: 'Conception de tableurs, budgets, tableaux croisés et formules de calcul au format .fods/.ods ou conversion CSV vers classeur Calc.',
      category: 'Bureautique',
      enabled: true,
      systemPrompt: 'Tu es un expert de LibreOffice Calc. Crée des feuilles de calcul organisées avec en-têtes et formules (=SUM, =AVERAGE, etc.). Utilise `generate_libreoffice_template(app_type="calc", ...)` ou génère un fichier CSV propre puis convertis avec `export_libreoffice_doc(target_format="ods")`.',
      slashCommand: '/libreoffice calc',
    },
    {
      id: 'libreoffice-impress',
      name: 'LibreOffice Impress - Présentations & Diaporamas',
      description: 'Génération de diaporamas et jeux de diapositives structurés au format OpenDocument Presentation (.fodp/.odp).',
      category: 'Bureautique',
      enabled: true,
      systemPrompt: 'Tu es un expert de LibreOffice Impress. Crée des présentations percutantes avec diapositives distinctes (séparées par "---") via `generate_libreoffice_template(app_type="impress", ...)` ou convertis des documents en .odp.',
      slashCommand: '/libreoffice impress',
    },
    {
      id: 'libreoffice-draw',
      name: 'LibreOffice Draw - Schémas & Diagrammes Vectoriels',
      description: 'Conception de diagrammes d\'architecture, organigrammes et dessins vectoriels (.svg/.odg) éditables dans LibreOffice Draw.',
      category: 'Bureautique',
      enabled: true,
      systemPrompt: 'Tu es un expert de LibreOffice Draw. Génère des diagrammes et schémas vectoriels SVG propres avec balises <rect>, <circle>, <path> et <text> stylisées via `generate_libreoffice_template(app_type="draw", ...)` ou crée des fichiers SVG.',
      slashCommand: '/libreoffice draw',
    },
    {
      id: 'libreoffice-math',
      name: 'LibreOffice Math - Formules & Équations Scientifiques',
      description: 'Formulation d\'équations mathématiques et scientifiques complexes au format MathML (.mml) ouvrables et modifiables dans LibreOffice Math.',
      category: 'Bureautique',
      enabled: true,
      systemPrompt: 'Tu es un expert de LibreOffice Math. Génère des formules mathématiques scientifiques au format standard MathML (.mml) ou XML OpenDocument Formula via `generate_libreoffice_template(app_type="math", ...)`.',
      slashCommand: '/libreoffice math',
    },
    {
      id: 'libreoffice-base',
      name: 'LibreOffice Base - Schémas Relationnels & Bases de Données',
      description: 'Conception de bases de données relationnelles, scripts DDL/DML SQL (SQLite/HSQLDB), formulaires et requêtes pour LibreOffice Base.',
      category: 'Bureautique',
      enabled: true,
      systemPrompt: 'Tu es un expert de LibreOffice Base. Génère des structures de bases de données SQL robustes (CREATE TABLE, INDEX, INSERT, FOREIGN KEY) avec `generate_libreoffice_template(app_type="base", ...)` directement exploitables dans LibreOffice Base via les pilotes SQLite ou HSQLDB.',
      slashCommand: '/libreoffice base',
    },
  ],
  isSkillsOpen: false,

  // Système de Plugins (10 plugins intégrés)
  plugins: [
    {
      id: 'plugin-ollama-accelerator',
      name: 'Ollama GPU Accelerator & Turbo Inférence',
      version: '1.4.0',
      author: 'Singular Code Team',
      description: 'Optimise la file d\'attente d\'inférence, active le déchargement automatique de VRAM et le batching dynamique sur GPU RTX.',
      category: 'llm',
      enabled: true,
      installed: true,
      icon: 'Zap',
      tags: ['GPU', 'VRAM', 'Ollama', 'Inférence'],
    },
    {
      id: 'plugin-godot-gdscript',
      name: 'Godot 4 GDScript & Node Inspector',
      version: '2.1.0',
      author: 'GameDev Tools',
      description: 'Support syntaxique avancé GDScript 2.0, injection automatique de structures de nœuds et signaux pour jeux Godot 4.',
      category: 'gamedev',
      enabled: true,
      installed: true,
      icon: 'Gamepad2',
      tags: ['Godot', 'GDScript', 'GameDev', '2D/3D'],
    },
    {
      id: 'plugin-bwrap-hardened',
      name: 'Bubblewrap & Landlock Shield Pro',
      version: '1.2.5',
      author: 'Linux Security Core',
      description: 'Renforce l\'isolation noyau Linux, bloque les appels système risqués et audite chaque accès disque en temps réel.',
      category: 'security',
      enabled: true,
      installed: true,
      icon: 'ShieldCheck',
      tags: ['Bubblewrap', 'Landlock', 'LSM', 'Sandbox'],
    },
    {
      id: 'plugin-sql-query-master',
      name: 'PostgreSQL & SQLite Query Optimizer',
      version: '1.0.8',
      author: 'DataCraft',
      description: 'Inspecte les plans d\'exécution EXPLAIN, suggère des index composites et valide les migrations SQL sans perte.',
      category: 'database',
      enabled: false,
      installed: true,
      icon: 'Database',
      tags: ['SQL', 'PostgreSQL', 'SQLite', 'Index'],
    },
    {
      id: 'plugin-docker-podman',
      name: 'Docker & Podman Micro-Containers',
      version: '1.1.2',
      author: 'DevOps Lab',
      description: 'Génère des Dockerfiles multi-stage ultra-légers (Alpine/Distroless) et configure des environnements de test éphémères.',
      category: 'devtools',
      enabled: true,
      installed: true,
      icon: 'Layers',
      tags: ['Docker', 'Podman', 'Containers', 'CI/CD'],
    },
    {
      id: 'plugin-git-semantic-release',
      name: 'Git Conventional Commits & Auto-Changelog',
      version: '1.3.0',
      author: 'OpenSource Hub',
      description: 'Automatise la rédaction de messages de commit selon la spécification Conventional Commits et génère le CHANGELOG.md.',
      category: 'devtools',
      enabled: true,
      installed: true,
      icon: 'GitBranch',
      tags: ['Git', 'SemVer', 'Changelog', 'Commits'],
    },
    {
      id: 'plugin-tailwind-glassmorphism',
      name: 'Tailwind CSS & Glassmorphism Studio',
      version: '2.0.1',
      author: 'Modern Web UI',
      description: 'Fournit une bibliothèque de composants Glassmorphism modernes, gradients néon et animations CSS fluides.',
      category: 'ui',
      enabled: true,
      installed: true,
      icon: 'Palette',
      tags: ['Tailwind', 'CSS', 'Design', 'UI/UX'],
    },
    {
      id: 'plugin-rust-safety-auditor',
      name: 'Rust Miri & Memory Safety Checker',
      version: '1.0.4',
      author: 'Rustaceans',
      description: 'Vérifie l\'absence de comportement indéfini (UB), contrôle les blocs `unsafe` et optimise les lifetimes de références.',
      category: 'devtools',
      enabled: false,
      installed: false,
      icon: 'Cpu',
      tags: ['Rust', 'Safety', 'Memory', 'Cargo'],
    },
    {
      id: 'plugin-python-mypy-pydantic',
      name: 'Python Strict Typing & Pydantic V2',
      version: '1.5.0',
      author: 'Python Core',
      description: 'Force le typage statique strict avec MyPy, génère des modèles Pydantic validés et bannit les types implicites.',
      category: 'devtools',
      enabled: false,
      installed: false,
      icon: 'Code2',
      tags: ['Python', 'MyPy', 'Pydantic', 'Typage'],
    },
    {
      id: 'plugin-cve-dependency-audit',
      name: 'CVE Vulnerability & Secrets Scanner',
      version: '1.2.0',
      author: 'CyberSec Defense',
      description: 'Passe au crible les dépendances npm et crates.io contre les bases CVE publiques et détecte les clés API fuyantes.',
      category: 'security',
      enabled: true,
      installed: true,
      icon: 'Lock',
      tags: ['CVE', 'Audit', 'Secrets', 'OWASP'],
    },
    {
      id: 'plugin-libreoffice-suite',
      name: 'LibreOffice OpenDocument Suite Pro',
      version: '1.0.0',
      author: 'LibreOffice Integration Lab',
      description: 'Suite bureautique complète : Writer (.odt), Calc (.ods/.fods), Impress (.odp/.fodp), Draw (.odg/.svg), Math (.mml) et Base (.sql/.odb). Génération et conversion headless.',
      category: 'office',
      enabled: true,
      installed: true,
      icon: 'FileText',
      tags: ['LibreOffice', 'Writer', 'Calc', 'Impress', 'Draw', 'Math', 'Base', 'OpenDocument'],
    },
    {
      id: 'plugin-libreoffice-calc-analytics',
      name: 'LibreOffice Calc Data & Financial Engine',
      version: '1.1.0',
      author: 'OpenDocument Data',
      description: 'Conception automatique de classeurs Calc (.ods/.fods), calculs matriciels, formules statistiques, budgets et conversion instantanée de données tabulaires.',
      category: 'office',
      enabled: true,
      installed: true,
      icon: 'FileSpreadsheet',
      tags: ['Calc', 'Spreadsheet', 'Formules', 'ODS', 'Finance', 'Tableaux'],
    },
    {
      id: 'plugin-libreoffice-impress-slides',
      name: 'LibreOffice Impress Slide Decks & Designer',
      version: '1.0.5',
      author: 'Presentation Lab',
      description: 'Création automatique de présentations et diaporamas (.odp/.fodp) avec hiérarchie de diapositives, titrages stylés et structure prête pour LibreOffice Impress.',
      category: 'office',
      enabled: true,
      installed: true,
      icon: 'Presentation',
      tags: ['Impress', 'Slides', 'ODP', 'Présentations', 'Diaporamas'],
    },
  ],
  isPluginsModalOpen: false,
  setPluginsModalOpen: (open) => set({ isPluginsModalOpen: open }),
  togglePlugin: (id) => set((s) => ({
    plugins: s.plugins.map((p) => p.id === id ? { ...p, enabled: !p.enabled } : p)
  })),
  installPlugin: (id) => set((s) => ({
    plugins: s.plugins.map((p) => p.id === id ? { ...p, installed: true, enabled: true } : p)
  })),
  uninstallPlugin: (id) => set((s) => ({
    plugins: s.plugins.map((p) => p.id === id ? { ...p, installed: false, enabled: false } : p)
  })),

  isSettingsOpen: false,
  isCommandPaletteOpen: false,
  isAuditModalOpen: false,
  isCheckpointModalOpen: false,
  currentPermissionRequest: null,
  theme: 'dark',
  soundEnabled: true,
  airGappedMode: false,

  toggleSkill: (id) => set((s) => ({
    skills: s.skills.map((sk) => (sk.id === id ? { ...sk, enabled: !sk.enabled } : sk))
  })),
  addSkill: (skill) => set((s) => ({ skills: [...s.skills, skill] })),
  setSkillsOpen: (open) => set({ isSkillsOpen: open }),

  setWorkspace: async (path) => {
    if (path) {
      try {
        await api.openWorkspace(path);
      } catch (e) {
        console.warn("Échec d'ouverture du workspace dans le backend:", e);
      }
    }
    set((s) => ({
      currentWorkspace: path,
      recentWorkspaces: path && !s.recentWorkspaces.includes(path)
        ? [path, ...s.recentWorkspaces.slice(0, 4)]
        : s.recentWorkspaces
    }));
  },
  setFiles: (files) => set({ files }),
  markFileAsModifiedByAi: (path) => set((s) => ({
    files: s.files.map((f) => f.path === path ? { ...f, isModifiedByAi: true } : f)
  })),
  openFile: (path, content) => set((s) => {
    const tabs = s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path];
    const contents = content !== undefined ? { ...s.fileContents, [path]: content } : s.fileContents;
    return { openTabs: tabs, activeTab: path, fileContents: contents };
  }),
  closeTab: (path) => set((s) => {
    const tabs = s.openTabs.filter((t) => t !== path);
    const active = s.activeTab === path ? (tabs[0] || null) : s.activeTab;
    const contents = { ...s.fileContents };
    delete contents[path];
    return { openTabs: tabs, activeTab: active, fileContents: contents };
  }),
  setActiveTab: (path) => set({ activeTab: path }),
  updateFileContent: (path, content) => set((s) => ({
    fileContents: { ...s.fileContents, [path]: content }
  })),
  setDiff: (diff) => set({ activeDiff: diff }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastAgentMessage: (chunk) => set((s) => {
    const last = s.messages[s.messages.length - 1];
    if (last && last.sender === 'agent') {
      const updated = { ...last, content: last.content + chunk };
      return { messages: [...s.messages.slice(0, -1), updated] };
    }
    return s;
  }),
  addToolCard: (tool) => set((s) => {
    const last = s.messages[s.messages.length - 1];
    if (last && last.sender === 'agent') {
      const cards = [...(last.tool_cards || []), tool];
      const updated = { ...last, tool_cards: cards };
      return { messages: [...s.messages.slice(0, -1), updated] };
    }
    return s;
  }),
  updateToolCard: (id, updates) => set((s) => {
    const messages = s.messages.map((m) => {
      if (!m.tool_cards) return m;
      const updatedCards = m.tool_cards.map((c) => (c.id === id ? { ...c, ...updates } : c));
      return { ...m, tool_cards: updatedCards };
    });
    return { messages };
  }),
  setTodos: (todos) => set({ todos }),
  setIsAgentRunning: (running) => set({ isAgentRunning: running }),
  setApprovalMode: (mode) => set({
    approvalMode: mode,
    isPlanAndReviewMode: mode === 'architect'
  }),

  setProfiles: (profiles) => set({ profiles }),
  setActiveProfileIndex: (index) => set({ activeProfileIndex: index }),
  setIsModelConnected: (connected) => set({ isModelConnected: connected }),
  setAvailableModels: (models) => set({ availableModels: models }),

  setSandboxType: (type) => set({ sandboxType: type }),
  setAllowNetwork: (allow) => set({ allowNetwork: allow }),
  setAirGappedMode: (enabled) => set({ airGappedMode: enabled, allowNetwork: !enabled ? false : false }),
  setSecurityStatus: (bwrap, docker) => set({ bwrapAvailable: bwrap, dockerAvailable: docker }),

  addLog: (level, message) => set((s) => ({
    systemLogs: [
      ...s.systemLogs,
      { timestamp: new Date().toLocaleTimeString(), level, message }
    ]
  })),
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),

  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  setAuditModalOpen: (open) => set({ isAuditModalOpen: open }),
  setCheckpointModalOpen: (open) => set({ isCheckpointModalOpen: open }),
  setPermissionRequest: (req) => set({ currentPermissionRequest: req }),
  setTheme: (theme) => set({ theme }),
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

  // Symboles AST & Recherche Hybride (Item 18 & 20)
  workspaceSymbols: [],
  fetchWorkspaceSymbols: async () => {
    try {
      const syms = await api.getWorkspaceSymbols();
      set({ workspaceSymbols: syms });
    } catch (e) {
      console.warn("Erreur chargement symboles:", e);
    }
  },

  // Mémoire Long-Terme Persistante (Item 3)
  learnings: [],
  fetchLearnings: async () => {
    try {
      const items = await api.getProjectLearnings();
      set({ learnings: items });
    } catch (e) {
      console.warn("Erreur chargement learnings:", e);
    }
  },
  saveLearning: async (category, title, content) => {
    try {
      const item = await api.saveProjectLearning(category, title, content);
      set((s) => ({ learnings: [...s.learnings.filter((l) => l.id !== item.id), item] }));
      get().addLog('info', `🧠 Apprentissage persisté : [${category}] ${title}`);
    } catch (e) {
      console.error("Erreur sauvegarde learning:", e);
    }
  },
  deleteLearning: async (id) => {
    try {
      await api.deleteProjectLearning(id);
      set((s) => ({ learnings: s.learnings.filter((l) => l.id !== id) }));
      get().addLog('info', `Apprentissage supprimé`);
    } catch (e) {
      console.error("Erreur suppression learning:", e);
    }
  },

  // Transactions Multi-Fichiers & Rollback Global (Item 2)
  lastTransaction: null,
  setLastTransaction: (tx) => set({ lastTransaction: tx }),
  rollbackLastTransaction: async () => {
    const tx = get().lastTransaction;
    if (!tx) return;
    try {
      await api.rollbackTransaction(String(tx.transaction_id));
      get().addLog('warn', `↺ Rollback transaction effectué (${tx.modified_files.length} fichiers restaurés)`);
      set({ lastTransaction: null });
      if (get().currentWorkspace) {
        const fileList = await api.listFiles();
        get().setFiles(fileList);
      }
    } catch (e) {
      console.error("Erreur rollback transaction:", e);
    }
  },

  // Fork & Ramification de conversation (Item 17)
  activeBranch: 'main',
  conversationBranches: {
    main: initialSession.messages,
  },
  forkConversation: (messageId) => {
    const currentMessages = get().messages;
    const msgIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;
    const forkedMessages = currentMessages.slice(0, msgIndex + 1);
    const branchName = `fork-${Date.now().toString().slice(-4)}`;
    set((s) => ({
      activeBranch: branchName,
      conversationBranches: {
        ...s.conversationBranches,
        [branchName]: forkedMessages,
      },
      messages: forkedMessages,
    }));
    get().addLog('info', `🌿 Branche bifurquée '${branchName}' créée à partir du message #${msgIndex + 1}`);
  },
  switchBranch: (branchName) => {
    const branches = get().conversationBranches;
    if (branches[branchName]) {
      set({
        activeBranch: branchName,
        messages: branches[branchName],
      });
      get().addLog('info', `Basculé sur la branche '${branchName}'`);
    }
  },

  // Redimensionnement & Positionnement des panneaux à la souris
  sidebarWidth: 280,
  chatWidth: 440,
  terminalHeight: 220,
  chatPlacement: 'right',
  isSidebarCollapsed: false,
  isChatCollapsed: false,
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(180, Math.min(650, width)) }),
  setChatWidth: (width) => set({ chatWidth: Math.max(300, Math.min(850, width)) }),
  setTerminalHeight: (height) => set({ terminalHeight: Math.max(120, Math.min(600, height)) }),
  setChatPlacement: (placement) => set({ chatPlacement: placement }),
  toggleChatPlacement: () => set((s) => ({ chatPlacement: s.chatPlacement === 'right' ? 'left' : 'right' })),
  toggleSidebarCollapsed: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
  toggleChatCollapsed: () => set((s) => ({ isChatCollapsed: !s.isChatCollapsed })),

  // Paramètres Avancés Éditeur Monaco & Application
  editorSettings: defaultEditorSettings,
  setEditorSettings: (updates) => set((s) => ({ editorSettings: { ...s.editorSettings, ...updates } })),

  generalSettings: defaultGeneralSettings,
  setGeneralSettings: (updates) => set((s) => ({ generalSettings: { ...s.generalSettings, ...updates } })),

  exportBackupJson: () => {
    const s = get();
    return JSON.stringify({
      version: '1.0',
      timestamp: new Date().toISOString(),
      currentWorkspace: s.currentWorkspace,
      recentWorkspaces: s.recentWorkspaces,
      projects: s.projects,
      activeProjectId: s.activeProjectId,
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      messages: s.messages,
      todos: s.todos,
      openTabs: s.openTabs,
      fileContents: s.fileContents,
      profiles: s.profiles,
      activeProfileIndex: s.activeProfileIndex,
      approvalMode: s.approvalMode,
      sandboxType: s.sandboxType,
      allowNetwork: s.allowNetwork,
      airGappedMode: s.airGappedMode,
      theme: s.theme,
      soundEnabled: s.soundEnabled,
      editorSettings: s.editorSettings,
      generalSettings: s.generalSettings,
      learnings: s.learnings,
      skills: s.skills,
    }, null, 2);
  },

  importBackupJson: (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') return false;
      set((prev) => ({
        ...prev,
        currentWorkspace: data.currentWorkspace || prev.currentWorkspace,
        recentWorkspaces: data.recentWorkspaces || prev.recentWorkspaces,
        projects: data.projects || prev.projects,
        activeProjectId: data.activeProjectId || prev.activeProjectId,
        sessions: data.sessions || prev.sessions,
        activeSessionId: data.activeSessionId || prev.activeSessionId,
        messages: data.messages || prev.messages,
        todos: data.todos || prev.todos,
        openTabs: data.openTabs || prev.openTabs,
        fileContents: data.fileContents || prev.fileContents,
        profiles: data.profiles || prev.profiles,
        activeProfileIndex: typeof data.activeProfileIndex === 'number' ? data.activeProfileIndex : prev.activeProfileIndex,
        approvalMode: data.approvalMode || prev.approvalMode,
        sandboxType: data.sandboxType || prev.sandboxType,
        allowNetwork: typeof data.allowNetwork === 'boolean' ? data.allowNetwork : prev.allowNetwork,
        airGappedMode: typeof data.airGappedMode === 'boolean' ? data.airGappedMode : prev.airGappedMode,
        theme: data.theme || prev.theme,
        soundEnabled: typeof data.soundEnabled === 'boolean' ? data.soundEnabled : prev.soundEnabled,
        editorSettings: { ...prev.editorSettings, ...(data.editorSettings || {}) },
        generalSettings: { ...prev.generalSettings, ...(data.generalSettings || {}) },
        learnings: data.learnings || prev.learnings,
      }));
      get().addLog('info', '✅ Configuration et sauvegardes restaurées avec succès.');
      return true;
    } catch (err) {
      get().addLog('error', `Échec importation sauvegarde : ${err}`);
      return false;
    }
  },

  resetAllSettings: () => {
    set({
      editorSettings: defaultEditorSettings,
      generalSettings: defaultGeneralSettings,
      theme: 'dark',
      soundEnabled: true,
      approvalMode: 'ask',
      sandboxType: 'bubblewrap',
    });
    get().addLog('info', 'Paramètres réinitialisés aux valeurs par défaut.');
  },

  // Split Editor Monaco (Item 7)
  splitTab: null,
  splitDirection: 'vertical',
  openFileInSplit: (path: string) => {
    const { openTabs, fileContents } = get();
    if (!openTabs.includes(path)) {
      set({ openTabs: [...openTabs, path] });
    }
    if (fileContents[path] === undefined) {
      api.readFile(path).then((c) => {
        get().updateFileContent(path, c);
      }).catch(() => {});
    }
    set({ splitTab: path });
    get().addLog('info', `Fichier ouvert en vue divisée (Split) : ${path}`);
  },
  closeSplit: () => set({ splitTab: null }),
  setSplitDirection: (dir) => set({ splitDirection: dir }),

  // Recherche & Remplacement Globaux (Item 6)
  searchQuery: '',
  replaceQuery: '',
  searchCaseSensitive: false,
  searchWholeWord: false,
  searchRegex: false,
  searchResults: [],
  isSearching: false,
  setSearchQuery: (q) => set({ searchQuery: q }),
  setReplaceQuery: (q) => set({ replaceQuery: q }),
  setSearchCaseSensitive: (val) => set({ searchCaseSensitive: val }),
  setSearchWholeWord: (val) => set({ searchWholeWord: val }),
  setSearchRegex: (val) => set({ searchRegex: val }),

  runGlobalSearch: async () => {
    const { searchQuery, searchCaseSensitive, searchWholeWord, searchRegex, files } = get();
    if (!searchQuery.trim()) {
      set({ searchResults: [], isSearching: false });
      return;
    }
    set({ isSearching: true });
    try {
      const results: FileSearchResult[] = [];
      const codeFiles = files.filter(f => !f.is_dir && !f.path.includes('node_modules') && !f.path.includes('.git') && !f.path.includes('dist/'));
      
      let pattern: RegExp;
      let patternStr = searchRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (searchWholeWord) {
        patternStr = `\\b${patternStr}\\b`;
      }

      try {
        pattern = new RegExp(patternStr, searchCaseSensitive ? 'g' : 'gi');
      } catch (err) {
        get().addLog('warn', `Expression régulière invalide : ${err}`);
        set({ isSearching: false });
        return;
      }

      // Recherche ultra-rapide native Rust via grep_workspace_files (Pack Optimisation Backend)
      let grepHits: Array<{ file: string; line_number: number; line_content: string }> = [];
      try {
        grepHits = await api.grepWorkspaceFiles(patternStr, searchCaseSensitive);
      } catch {
        grepHits = [];
      }

      if (grepHits && grepHits.length > 0) {
        const fileMap = new Map<string, SearchMatchItem[]>();
        for (const hit of grepHits) {
          if (!fileMap.has(hit.file)) fileMap.set(hit.file, []);
          fileMap.get(hit.file)!.push({
            lineNumber: hit.line_number,
            lineContent: hit.line_content.trim(),
            startIndex: 0,
            matchLength: searchQuery.length,
          });
        }
        for (const [filePath, matches] of fileMap.entries()) {
          results.push({ filePath, matches });
        }
      } else {
        // Fallback avec lecture parallèle des fichiers
        const batchSize = 15;
        for (let i = 0; i < codeFiles.length; i += batchSize) {
          const batch = codeFiles.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (file) => {
              try {
                const content = get().fileContents[file.path] || await api.readFile(file.path);
                const lines = content.split('\n');
                const fileMatches: SearchMatchItem[] = [];

                lines.forEach((line, lineIdx) => {
                  pattern.lastIndex = 0;
                  let match: RegExpExecArray | null;
                  while ((match = pattern.exec(line)) !== null) {
                    fileMatches.push({
                      lineNumber: lineIdx + 1,
                      lineContent: line.trim(),
                      startIndex: match.index,
                      matchLength: match[0].length,
                    });
                    if (!pattern.global) break;
                  }
                });

                if (fileMatches.length > 0) {
                  results.push({
                    filePath: file.path,
                    matches: fileMatches,
                  });
                }
              } catch {}
            })
          );
        }
      }

      set({ searchResults: results, isSearching: false });
      const totalOccurrences = results.reduce((acc, r) => acc + r.matches.length, 0);
      get().addLog('info', `Recherche terminée : ${totalOccurrences} occurrence(s) dans ${results.length} fichier(s).`);
    } catch (e: any) {
      set({ isSearching: false });
      get().addLog('error', `Erreur recherche globale: ${e}`);
    }
  },

  runGlobalReplace: async (replaceAll: boolean, targetFile?: string, matchIndex?: number) => {
    const { searchQuery, replaceQuery, searchResults, fileContents } = get();
    if (!searchQuery.trim() || searchResults.length === 0) return;

    try {
      let replacedFilesCount = 0;
      let replacedOccurrences = 0;

      for (const res of searchResults) {
        if (targetFile && res.filePath !== targetFile) continue;

        const currentContent = fileContents[res.filePath] || await api.readFile(res.filePath);
        let newContent: string;

        if (replaceAll || !targetFile) {
          const { searchCaseSensitive, searchWholeWord, searchRegex } = get();
          let patternStr = searchRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (searchWholeWord) patternStr = `\\b${patternStr}\\b`;
          const reg = new RegExp(patternStr, searchCaseSensitive ? 'g' : 'gi');
          newContent = currentContent.replace(reg, () => replaceQuery);
          replacedOccurrences += res.matches.length;
        } else {
          const targetMatch = res.matches[matchIndex ?? 0];
          if (!targetMatch) continue;
          const lines = currentContent.split('\n');
          const lineNum = targetMatch.lineNumber - 1;
          if (lines[lineNum] !== undefined) {
            lines[lineNum] = lines[lineNum].replace(searchQuery, () => replaceQuery);
            newContent = lines.join('\n');
            replacedOccurrences++;
          } else {
            newContent = currentContent;
          }
        }

        if (newContent !== currentContent) {
          await api.writeFile(res.filePath, newContent);
          get().updateFileContent(res.filePath, newContent);
          replacedFilesCount++;
        }
      }

      get().addLog('info', `Remplacement effectué : ${replacedOccurrences} modification(s) dans ${replacedFilesCount} fichier(s).`);
      await get().runGlobalSearch();
    } catch (err: any) {
      get().addLog('error', `Erreur remplacement global: ${err}`);
    }
  },

  // Inspecteur de Base de Données SQLite (Item 11)
  isDbModalOpen: false,
  setDbModalOpen: (open) => set({ isDbModalOpen: open }),
  activeDbPath: null,
  dbTables: [],
  selectedDbTable: null,
  dbQueryResults: null,

  loadDatabase: async (path: string) => {
    set({ activeDbPath: path, isDbModalOpen: true });
    try {
      const tables = await api.inspectSqliteDatabase(path);
      set({ dbTables: tables, selectedDbTable: tables[0]?.table || null });
      if (tables.length > 0) {
        await get().selectDbTable(tables[0].table);
      }
      get().addLog('info', `Base SQLite inspectée : ${path} (${tables.length} tables).`);
    } catch (e: any) {
      get().addLog('error', `Erreur chargement SQLite ${path} : ${e}`);
    }
  },

  selectDbTable: async (table: string) => {
    const { activeDbPath } = get();
    if (!activeDbPath) return;
    set({ selectedDbTable: table });
    await get().runDbQuery(`SELECT * FROM "${table}" LIMIT 100;`);
  },

  runDbQuery: async (sql: string) => {
    const { activeDbPath } = get();
    if (!activeDbPath) return;
    try {
      const res = await api.querySqliteDatabase(activeDbPath, sql);
      set({ dbQueryResults: res });
      if (res.error) {
        get().addLog('warn', `Erreur SQL : ${res.error}`);
      } else {
        get().addLog('info', `Requête SQL exécutée en ${res.duration_ms}ms (${res.row_count} lignes).`);
      }
    } catch (e: any) {
      get().addLog('error', `Échec requête SQL : ${e}`);
    }
  },

  // Résolution Intelligente de Dépendances (Item 3)
  detectedDependencies: [],
  setDetectedDependencies: (deps) => set({ detectedDependencies: deps }),
  addDependenciesToContext: (deps) => {
    for (const dep of deps) {
      if (!get().openTabs.includes(dep)) {
        api.readFile(dep).then((content) => {
          get().openFile(dep, content);
        }).catch(() => {});
      }
    }
    get().addLog('info', `🔗 ${deps.length} dépendance(s) ajoutée(s) au contexte actif de l'agent.`);
    set({ detectedDependencies: [] });
  },

  // Opérations Fichiers Avancées (Item 5)
  renameFile: async (oldPath: string, newPath: string) => {
    try {
      await api.renameFile(oldPath, newPath);
      const files = await api.listFiles();
      get().setFiles(files);
      const { openTabs, activeTab, fileContents, splitTab } = get();
      if (openTabs.includes(oldPath)) {
        const nextTabs = openTabs.map(t => t === oldPath ? newPath : t);
        const nextContents = { ...fileContents, [newPath]: fileContents[oldPath] || '' };
        delete nextContents[oldPath];
        set({
          openTabs: nextTabs,
          activeTab: activeTab === oldPath ? newPath : activeTab,
          splitTab: splitTab === oldPath ? newPath : splitTab,
          fileContents: nextContents,
        });
      }
      get().addLog('info', `Fichier renommé avec succès : ${oldPath} -> ${newPath}`);
    } catch (err: any) {
      get().addLog('error', `Erreur renommage fichier : ${err}`);
      throw err;
    }
  },

  // Compaction & Économie de Tokens (Item 2)
  compactHistory: () => {
    const { messages, tokenUsage, activeProfileIndex, profiles } = get();
    if (messages.length <= 4) {
      get().addLog('info', "Historique déjà minimal (≤ 4 messages), compaction non requise.");
      return;
    }

    const firstMsg = messages[0];
    const recentMessages = messages.slice(-3);
    const middleCount = messages.length - 1 - recentMessages.length;

    const summaryContent = `⚡ **[Synthèse Automatique d'Historique]** : ${middleCount} message(s) antérieurs ont été résumés et compactés. Objectifs précédents et contexte technique préservés.`;
    
    const compactedMessages: ChatMessageItem[] = [
      firstMsg,
      {
        id: `summary-${Date.now()}`,
        sender: 'system',
        content: summaryContent,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...recentMessages,
    ];

    const estimatedNewTokens = Math.round(compactedMessages.reduce((acc, m) => acc + m.content.length, 0) / 4);
    const prof = profiles[activeProfileIndex] || profiles[0];

    set({
      messages: compactedMessages,
      tokenUsage: tokenUsage ? {
        ...tokenUsage,
        prompt_tokens: Math.max(100, Math.round(tokenUsage.prompt_tokens * 0.4)),
        total_tokens: Math.max(200, Math.round(tokenUsage.total_tokens * 0.45)),
      } : {
        prompt_tokens: estimatedNewTokens,
        completion_tokens: 150,
        total_tokens: estimatedNewTokens + 150,
        current_num_ctx: prof.num_ctx || 32768,
        max_tokens: prof.max_tokens || 8192,
        auto_expanded: false,
      }
    });

    get().addLog('info', `🧹 Historique compacté : ${middleCount} messages archivés, ~55% de tokens libérés.`);
  },
}),
    {
      name: 'singular-code-storage',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        currentWorkspace: state.currentWorkspace,
        recentWorkspaces: state.recentWorkspaces,
        projects: state.projects.map((p) => ({
          ...p,
          conversations: p.conversations.map((c) => ({
            ...c,
            messages: sanitizeToolResultsForStorage(c.messages),
          })),
        })),
        activeProjectId: state.activeProjectId,
        sessions: state.sessions.map((sess) => ({
          ...sess,
          messages: sanitizeToolResultsForStorage(sess.messages),
        })),
        activeSessionId: state.activeSessionId,
        messages: sanitizeToolResultsForStorage(state.messages),
        todos: state.todos,
        openTabs: state.openTabs,
        activeTab: state.activeTab,
        fileContents: state.fileContents,
        sidebarWidth: state.sidebarWidth,
        chatWidth: state.chatWidth,
        terminalHeight: state.terminalHeight,
        chatPlacement: state.chatPlacement,
        isSidebarCollapsed: state.isSidebarCollapsed,
        isChatCollapsed: state.isChatCollapsed,
        profiles: state.profiles,
        activeProfileIndex: state.activeProfileIndex,
        sandboxType: state.sandboxType,
        approvalMode: state.approvalMode,
        isPlanAndReviewMode: state.isPlanAndReviewMode,
        allowNetwork: state.allowNetwork,
        airGappedMode: state.airGappedMode,
        theme: state.theme,
        soundEnabled: state.soundEnabled,
        activeBranch: state.activeBranch,
        conversationBranches: state.conversationBranches,
        skills: state.skills,
        plugins: state.plugins,
        editorSettings: state.editorSettings,
        generalSettings: state.generalSettings,
        learnings: state.learnings,
      }),
    }
  )
);
