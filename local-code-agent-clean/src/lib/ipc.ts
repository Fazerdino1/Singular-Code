import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Détecter si on s'exécute dans l'environnement Tauri
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export const api = {
  getSystemStatus: async () => {
    if (isTauri()) {
      return await invoke<any>('get_system_status');
    }
    return {
      bwrap_available: true,
      docker_available: false,
      os_name: "Linux (Nobara/Fedora)",
      current_workspace: "/home/fazerdino1/Documents/antigravity/proud-volta",
    };
  },

  selectWorkspaceFolder: async (): Promise<string | null> => {
    if (isTauri()) {
      try {
        const folder = await invoke<string | null>('select_workspace_folder');
        return folder;
      } catch (e) {
        console.warn("Dialogue natif échoué via command, tentative avec plugin:", e);
        try {
          const { open } = await import('@tauri-apps/plugin-dialog');
          const res = await open({ directory: true, multiple: false });
          return typeof res === 'string' ? res : null;
        } catch (err2) {
          console.error("Plugin dialog échoué:", err2);
          return null;
        }
      }
    }
    return null;
  },

  openWorkspace: async (path: string) => {
    if (isTauri()) {
      return await invoke<string>('open_workspace', { path });
    }
    return path;
  },

  listFiles: async () => {
    if (isTauri()) {
      return await invoke<any[]>('list_workspace_files');
    }
    return [
      { name: "src", path: "src", is_dir: true, size: 4096 },
      { name: "App.tsx", path: "src/App.tsx", is_dir: false, size: 1200 },
      { name: "main.tsx", path: "src/main.tsx", is_dir: false, size: 300 },
      { name: "index.css", path: "src/index.css", is_dir: false, size: 500 },
      { name: "package.json", path: "package.json", is_dir: false, size: 850 },
      { name: "AGENT.md", path: "AGENT.md", is_dir: false, size: 450, isModifiedByAi: true },
      { name: "README.md", path: "README.md", is_dir: false, size: 1500 },
    ];
  },

  readFile: async (relPath: string) => {
    if (isTauri()) {
      return await invoke<string>('read_workspace_file', { relPath });
    }
    return `// Fichier : ${relPath}\nconsole.log("Aperçu du fichier en mode développement");\n`;
  },

  writeFile: async (relPath: string, content: string) => {
    if (isTauri()) {
      return await invoke<number>('write_workspace_file', { relPath, content });
    }
    return content.length;
  },

  deleteFile: async (relPath: string) => {
    if (isTauri()) {
      return await invoke<void>('delete_workspace_file', { relPath });
    }
  },

  renameFile: async (oldPath: string, newPath: string) => {
    if (isTauri()) {
      return await invoke<void>('rename_workspace_file', { oldPath, newPath });
    }
  },

  createDir: async (relPath: string) => {
    if (isTauri()) {
      return await invoke<void>('create_workspace_dir', { relPath });
    }
  },

  getDiff: async (relPath: string, newContent: string) => {
    if (isTauri()) {
      return await invoke<any>('get_file_diff', { relPath, newContent });
    }
    return {
      original: `// Version originale de ${relPath}\nconst version = 1;\n`,
      modified: newContent,
      has_changes: true,
    };
  },

  runSandboxCommand: async (command: string) => {
    if (isTauri()) {
      return await invoke<any>('execute_sandbox_command', { command });
    }
    return {
      stdout: `[Sandbox Simulator] Exécution de: ${command}\nSortie simulée OK.\n`,
      stderr: "",
      exit_code: 0,
      truncated: false,
      duration_ms: 45,
    };
  },

  testModelConnection: async (profile: any) => {
    if (isTauri()) {
      return await invoke<string[]>('test_model_connection', { profile });
    }
    // Simulation
    if (profile.api_url.includes("11434")) {
      return ["qwen2.5-coder:7b", "qwen2.5-coder:1.5b", "gemma4:e4b"];
    }
    return ["local-model-v1", "chat-default"];
  },

  listCheckpoints: async () => {
    if (isTauri()) {
      return await invoke<any[]>('list_checkpoints');
    }
    return [
      { id: "cp-1", timestamp: new Date().toISOString(), description: "Snapshot initial", files_count: 14 }
    ];
  },

  restoreCheckpoint: async (checkpointId: string) => {
    if (isTauri()) {
      return await invoke<void>('restore_checkpoint', { checkpointId });
    }
  },

  runAgentLoop: async (
    prompt: string,
    profile: any,
    approvalMode: string,
    history?: Array<{ role: string; content: string }>,
    projectRules?: string,
    projectFolders?: string[]
  ) => {
    if (isTauri()) {
      return await invoke<void>('run_agent_loop', {
        prompt,
        profile,
        approvalMode,
        history,
        projectRules,
        projectFolders,
      });
    }
  },

  abortAgent: async () => {
    if (isTauri()) {
      return await invoke<void>('abort_agent');
    }
  },

  listenAgentEvents: async (callback: (event: any) => void): Promise<() => void> => {
    if (isTauri()) {
      return await listen('agent:event', (e) => callback(e.payload));
    }
    return () => {};
  },

  setNetworkAccess: async (allow: boolean) => {
    if (isTauri()) {
      return await invoke<void>('set_network_access', { allow });
    }
  },

  webSearch: async (query: string, limit?: number): Promise<{ title: string; url: string; snippet: string }[]> => {
    if (isTauri()) {
      return await invoke<any[]>('web_search', { query, limit });
    }
    return [
      {
        title: `Recherche web simulée : ${query}`,
        url: "https://duckduckgo.com/?q=" + encodeURIComponent(query),
        snippet: `Résultat simulé pour "${query}". Activez le backend Tauri pour des recherches réelles en direct.`
      }
    ];
  },

  fetchUrl: async (url: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('fetch_url', { url });
    }
    return `[Simulation Contenu Web pour ${url}]\nPage téléchargée avec succès.`;
  },

  getHardwareMetrics: async (): Promise<{
    gpu_name: string;
    vram_total_mb: number;
    vram_used_mb: number;
    gpu_utilization_pct: number;
    ram_total_mb: number;
    ram_used_mb: number;
  }> => {
    if (isTauri()) {
      return await invoke<any>('get_hardware_metrics');
    }
    return {
      gpu_name: "NVIDIA GeForce RTX 4060 (Simulé)",
      vram_total_mb: 8188,
      vram_used_mb: 1840,
      gpu_utilization_pct: 22,
      ram_total_mb: 32000,
      ram_used_mb: 11400,
    };
  },

  unloadLocalModels: async (): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('unload_local_models');
    }
    return "Modèles déchargés de la VRAM (Simulé)";
  },

  sendSystemNotification: async (title: string, message: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('send_system_notification', { title, message });
    }
    console.log(`[Notification] ${title}: ${message}`);
  },

  restoreFileCheckpoint: async (checkpointId: string, relPath: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('restore_file_checkpoint', { checkpointId, relPath });
    }
  },

  getAuditLogs: async (limit?: number): Promise<any[]> => {
    if (isTauri()) {
      return await invoke<any[]>('get_audit_logs', { limit });
    }
    return [
      {
        timestamp: new Date().toISOString(),
        actor: "agent",
        action_type: "tool_call",
        target: "read_file",
        status: "success",
        details: { path: "src/App.tsx" }
      }
    ];
  },

  // --- GIT SOURCE CONTROL ---
  getGitStatus: async (): Promise<GitStatus> => {
    if (isTauri()) {
      return await invoke<GitStatus>('get_git_status');
    }
    return {
      is_git_repo: true,
      current_branch: "main",
      staged: [
        { path: "src/components/ActivityBar.tsx", status: "added" }
      ],
      unstaged: [
        { path: "src/lib/ipc.ts", status: "modified" },
        { path: "src/store/useAppStore.ts", status: "modified" }
      ],
      untracked: [
        { path: "src/components/GitSourceControl.tsx", status: "untracked" },
        { path: "src/components/ArchitectureCanvas.tsx", status: "untracked" }
      ],
      files: [
        { path: "src/components/ActivityBar.tsx", status: "added" },
        { path: "src/lib/ipc.ts", status: "modified" },
        { path: "src/store/useAppStore.ts", status: "modified" },
        { path: "src/components/GitSourceControl.tsx", status: "untracked" },
        { path: "src/components/ArchitectureCanvas.tsx", status: "untracked" }
      ]
    };
  },

  getGitFileContent: async (path: string, revision?: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('get_git_file_content', { path, revision });
    }
    return `// Content of ${path} (${revision || 'HEAD'})`;
  },

  getGitDiff: async (path?: string, staged?: boolean): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('get_git_diff', { path, staged });
    }
    return `diff --git a/${path || 'file'} b/${path || 'file'}\n--- a/${path || 'file'}\n+++ b/${path || 'file'}\n@@ -1,5 +1,9 @@\n+// Modifications simulées\n+export const gitReady = true;\n`;
  },

  getGitLog: async (limit?: number): Promise<GitCommitInfo[]> => {
    if (isTauri()) {
      return await invoke<GitCommitInfo[]>('get_git_log', { limit });
    }
    return [
      {
        hash: "7f4c3a9182390abc1234567890abcdef12345678",
        short_hash: "7f4c3a9",
        author: "Dev Local <dev@local.box>",
        date: "Il y a 1 heure",
        message: "feat: add Antigravity 2.0 ActivityBar and Git integration"
      },
      {
        hash: "e29b183acbd89410192837465abcde9876543210",
        short_hash: "e29b183",
        author: "Dev Local <dev@local.box>",
        date: "Il y a 3 heures",
        message: "refactor: optimize bwrap sandbox memory limits and Landlock checks"
      }
    ];
  },

  getGitBranches: async (): Promise<GitBranchInfo[]> => {
    if (isTauri()) {
      return await invoke<GitBranchInfo[]>('get_git_branches');
    }
    return [
      { name: "main", is_current: true, is_remote: false, commit_hash: "7f4c3a9" },
      { name: "feature/antigravity-ui", is_current: false, is_remote: false, commit_hash: "e29b183" }
    ];
  },

  stageFile: async (path: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('git_stage_file', { path });
    }
  },

  unstageFile: async (path: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('git_unstage_file', { path });
    }
  },

  commit: async (message: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('git_commit', { message });
    }
    return `[main 1a2b3c4] ${message}`;
  },

  checkoutBranch: async (branch: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('git_checkout_branch', { branch });
    }
  },

  createBranch: async (branch: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('git_create_branch', { branch });
    }
  },

  // --- SÉCURITÉ & DIAGNOSTICS LINUX ---
  checkLandlockStatus: async (): Promise<LandlockStatus> => {
    if (isTauri()) {
      return await invoke<LandlockStatus>('check_landlock_status');
    }
    return {
      available: true,
      active: true,
      enforced: true,
      reason: null,
    };
  },

  inspectBinaryFile: async (relPath: string): Promise<any> => {
    if (isTauri()) {
      return await invoke<any>('inspect_binary_file', { relPath });
    }
    return {
      type: "ELF 64-bit LSB pie executable, x86-64",
      size_bytes: 45210,
      symbols_count: 34,
      entry_point: "0x10a0"
    };
  },

  profileBenchmarkCommand: async (command: string): Promise<any> => {
    if (isTauri()) {
      return await invoke<any>('profile_benchmark_command', { command });
    }
    return {
      command,
      exit_code: 0,
      duration_ms: 124,
      peak_memory_mb: 48.2
    };
  },

  analyzeLocalImage: async (relPath: string, prompt?: string): Promise<any> => {
    if (isTauri()) {
      return await invoke<any>('analyze_local_image_file', { relPath, prompt });
    }
    return {
      file: relPath,
      analysis: `Aperçu visuel simulé pour ${relPath}: Image analysée avec succès.`
    };
  },

  // --- GESTION DES PROJETS (Multi-Dossiers & Règles) ---
  getProjects: async (): Promise<ProjectConfig[]> => {
    if (isTauri()) {
      return await invoke<ProjectConfig[]>('get_projects');
    }
    return [
      {
        id: "project-cli",
        name: "CLI Project",
        icon: "cloud",
        folders: [],
        rules: "# Règles CLI Project\n- Outils autonomes sans dépendances lourdes.",
        is_cloud_sync: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "project-proud-volta",
        name: "proud-volta",
        icon: "folder",
        folders: ["/home/fazerdino1/Documents/antigravity/proud-volta"],
        rules: "# Règles Proud Volta\n- Tauri 2 + Rust + React + Monaco.\n- Respecter Conventional Commits.",
        is_cloud_sync: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "project-splendid-davinci",
        name: "splendid-davinci",
        icon: "folder",
        folders: [],
        rules: "# Règles de prototypage artistique et génératif.",
        is_cloud_sync: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "project-lively-darwin",
        name: "lively-darwin",
        icon: "folder",
        folders: [],
        rules: "# Règles Lively Darwin\n- Moteur d'évolution et algorithmes génétiques.",
        is_cloud_sync: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "project-antigravity-x64",
        name: "Antigravity-x64",
        icon: "folder",
        folders: [],
        rules: "# Règles Linux Antigravity\n- Cible x86_64, Wayland/X11 et isolation LSM.",
        is_cloud_sync: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "project-zealous-shannon",
        name: "zealous-shannon",
        icon: "folder",
        folders: [],
        rules: "# Moteur Sonic Boost 3D\n- 60 FPS, zéro allocation dans la boucle critique.",
        is_cloud_sync: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "project-radiant-bose",
        name: "radiant-bose",
        icon: "folder",
        folders: [],
        rules: "# Audio DSP & Synthèse modulaire.",
        is_cloud_sync: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "project-calm-noether",
        name: "calm-noether",
        icon: "folder",
        folders: [],
        rules: "# Connexion Game Engine & Physique.",
        is_cloud_sync: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "project-crossplay",
        name: "site web CrossPla...",
        icon: "folder",
        folders: [],
        rules: "# Amélioration Interface & CrossPlay Web.",
        is_cloud_sync: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ];
  },

  saveProject: async (project: ProjectConfig): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('save_project', { project });
    }
  },

  deleteProject: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_project', { id });
    }
  },

  getProjectRules: async (id: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('get_project_rules', { id });
    }
    return "# Règles du projet simulé";
  },

  setProjectRules: async (id: string, rules: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('set_project_rules', { id, rules });
    }
  },

  addFolderToProject: async (id: string, folderPath: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('add_folder_to_project', { id, folderPath });
    }
  },

  removeFolderFromProject: async (id: string, folderPath: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('remove_folder_from_project', { id, folderPath });
    }
  },

  // --- SYMBOLES AST & RECHERCHE HYBRIDE (Items 18 & 20) ---
  getWorkspaceSymbols: async (): Promise<SymbolItem[]> => {
    if (isTauri()) {
      return await invoke<SymbolItem[]>('get_workspace_symbols');
    }
    return [
      { name: "AgentEngine", kind: "struct", file_path: "src-tauri/src/agent/mod.rs", line_number: 100, signature: "pub struct AgentEngine" },
      { name: "ToolRegistry", kind: "struct", file_path: "src-tauri/src/tools/mod.rs", line_number: 60, signature: "pub struct ToolRegistry" },
      { name: "ArchitectureCanvas", kind: "component", file_path: "src/components/ArchitectureCanvas.tsx", line_number: 28, signature: "export const ArchitectureCanvas: React.FC" },
      { name: "CommandPalette", kind: "component", file_path: "src/components/CommandPalette.tsx", line_number: 8, signature: "export const CommandPalette: React.FC" },
      { name: "AgentChat", kind: "component", file_path: "src/components/AgentChat.tsx", line_number: 30, signature: "export const AgentChat: React.FC" },
      { name: "run_agent_loop", kind: "function", file_path: "src-tauri/src/lib.rs", line_number: 593, signature: "async fn run_agent_loop" },
    ];
  },

  hybridSearchWorkspace: async (query: string, limit?: number): Promise<HybridSearchResult[]> => {
    if (isTauri()) {
      return await invoke<HybridSearchResult[]>('hybrid_search_workspace', { query, limit });
    }
    return [
      {
        title: `${query} (Symbole)`,
        file_path: "src/components/AgentChat.tsx",
        line_number: 45,
        snippet: `Recherche hybride pour "${query}"`,
        score: 95,
        match_type: "symbol"
      }
    ];
  },

  // --- MÉMOIRE LONG-TERME & APPRENTISSAGES (.localagent/learnings.json) (Item 3) ---
  getProjectLearnings: async (): Promise<LearningItem[]> => {
    if (isTauri()) {
      return await invoke<LearningItem[]>('get_project_learnings');
    }
    return [
      {
        id: "learn-1",
        category: "architecture",
        title: "Tauri 2 IPC Confinement",
        content: "Toujours passer par PathConfinement et sandbox avant tout accès fichier.",
        timestamp: new Date().toISOString()
      },
      {
        id: "learn-2",
        category: "convention",
        title: "Conventional Commits",
        content: "Formater tous les commits avec feat:, fix:, refactor: ou docs:.",
        timestamp: new Date().toISOString()
      }
    ];
  },

  saveProjectLearning: async (category: string, title: string, content: string): Promise<LearningItem> => {
    if (isTauri()) {
      return await invoke<LearningItem>('save_project_learning', { category, title, content });
    }
    return {
      id: `learn-${Date.now()}`,
      category,
      title,
      content,
      timestamp: new Date().toISOString()
    };
  },

  deleteProjectLearning: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_project_learning', { id });
    }
  },

  // --- ROLLBACK DE TRANSACTION MULTI-FICHIERS (Item 2) ---
  rollbackTransaction: async (checkpointId: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('rollback_transaction', { checkpointId });
    }
  },

  listenAgentTransactions: async (callback: (tx: TransactionEvent) => void): Promise<() => void> => {
    if (isTauri()) {
      return await listen('agent:transaction', (e) => callback(e.payload as TransactionEvent));
    }
    return () => {};
  },

  // --- TDD AUTO-REPAIR LOOP (Item 1) ---
  runTestSuiteAndAutoRepair: async (): Promise<any> => {
    if (isTauri()) {
      return await invoke<any>('run_test_suite_and_auto_repair');
    }
    return {
      command: "cargo test",
      passed: true,
      exit_code: 0,
      duration_ms: 120,
      stdout: "21 passed; 0 failed",
      stderr: ""
    };
  },

  // --- INSPECTEUR DE BASE DE DONNÉES SQLITE (Item 11) ---
  inspectSqliteDatabase: async (dbPath: string): Promise<SqliteTableDesc[]> => {
    if (isTauri()) {
      return await invoke<SqliteTableDesc[]>('inspect_sqlite_database', { dbPath });
    }
    return [
      {
        table: "users",
        columns: [
          { cid: 0, name: "id", type: "INTEGER", notnull: true, pk: true },
          { cid: 1, name: "username", type: "TEXT", notnull: true, pk: false },
          { cid: 2, name: "role", type: "TEXT", notnull: false, pk: false },
          { cid: 3, name: "created_at", type: "DATETIME", notnull: false, pk: false }
        ],
        row_count: 142
      },
      {
        table: "sessions",
        columns: [
          { cid: 0, name: "session_id", type: "TEXT", notnull: true, pk: true },
          { cid: 1, name: "user_id", type: "INTEGER", notnull: true, pk: false },
          { cid: 2, name: "token", type: "TEXT", notnull: true, pk: false }
        ],
        row_count: 38
      }
    ];
  },

  querySqliteDatabase: async (dbPath: string, sql: string): Promise<SqliteQueryOutput> => {
    if (isTauri()) {
      return await invoke<SqliteQueryOutput>('query_sqlite_database', { dbPath, sql });
    }
    return {
      columns: ["id", "username", "role", "created_at"],
      rows: [
        [1, "admin", "superadmin", "2026-10-10 14:22:00"],
        [2, "dev_local", "developer", "2026-10-10 15:30:12"],
        [3, "auditor", "security_officer", "2026-10-11 09:12:44"]
      ],
      row_count: 3,
      duration_ms: 2,
      error: null
    };
  },

  grepWorkspaceFiles: async (query: string, caseSensitive: boolean = false): Promise<Array<{ file: string; line_number: number; line_content: string }>> => {
    if (isTauri()) {
      return await invoke<any[]>('grep_workspace_files', { query, caseSensitive });
    }
    return [];
  },

  // --- SUITE BUREAUTIQUE LIBREOFFICE (WRITER, CALC, IMPRESS, DRAW, MATH, BASE) ---
  exportLibreofficeDoc: async (sourcePath: string, targetFormat: string, outdir?: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('export_libreoffice_doc', { sourcePath, targetFormat, outdir });
    }
    return `[Simulation] Export de ${sourcePath} vers le format .${targetFormat} effectué.`;
  },

  generateLibreofficeTemplate: async (appType: string, path: string, title: string, content: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('generate_libreoffice_template', { appType, path, title, content });
    }
    return `[Simulation] Document LibreOffice ${appType} (${path}) généré avec succès.`;
  },

  readLibreofficeDoc: async (path: string): Promise<any> => {
    if (isTauri()) {
      return await invoke<any>('read_libreoffice_doc', { path });
    }
    return {
      status: "success",
      path,
      content: `[Simulation] Contenu extrait de ${path}`
    };
  }
};

export interface SqliteColumnDesc {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

export interface SqliteTableDesc {
  table: string;
  columns: SqliteColumnDesc[];
  row_count: number;
}

export interface SqliteQueryOutput {
  columns: string[];
  rows: any[][];
  row_count: number;
  duration_ms: number;
  error?: string | null;
}

export interface SymbolItem {
  name: String;
  kind: String;
  file_path: String;
  line_number: number;
  signature?: String;
}

export interface HybridSearchResult {
  title: String;
  file_path: String;
  line_number: number;
  snippet: String;
  score: number;
  match_type: 'symbol' | 'path' | 'content';
}

export interface LearningItem {
  id: String;
  category: String;
  title: String;
  content: String;
  timestamp: String;
}

export interface TransactionEvent {
  transaction_id: String;
  modified_files: String[];
  timestamp: String;
}

export interface GitFileStatus {
  path: string;
  status: string;
}

export interface GitStatus {
  is_git_repo: boolean;
  current_branch?: string;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  files?: GitFileStatus[];
}

export interface GitCommitInfo {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitBranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  commit_hash: string;
}

export interface LandlockStatus {
  available: boolean;
  active: boolean;
  enforced: boolean;
  reason?: string | null;
}

export interface ProjectConfig {
  id: string;
  name: string;
  icon?: string;
  folders: string[];
  rules: string;
  is_cloud_sync?: boolean;
  created_at: string;
  updated_at: string;
}


