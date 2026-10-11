# Local AI Code Agent - Guide & Architecture du Projet

Application Linux desktop native ultra-sécurisée construite avec **Tauri 2**, **Rust**, **React 18**, **TypeScript**, **Tailwind CSS**, **Monaco Editor** et **xterm.js**.
Inspirée des interfaces de **Google Antigravity 2.0**, **Claude Code Desktop (GUI)** et **Codex Desktop**.

---

## 🏗️ Architecture Globale

```
.
├── src/                          # Frontend React & TypeScript
│   ├── components/               # Composants d'interface utilisateur
│   │   ├── ActivityBar.tsx       # Barre d'activité verticale 52px (Antigravity 2.0)
│   │   ├── ProjectsSidebar.tsx   # Volet Projets & Conversations (Claude GUI)
│   │   ├── ProjectRulesModal.tsx # Configuration multi-dossiers & règles IA du projet
│   │   ├── FileExplorer.tsx      # Explorateur de fichiers avec détection IA
│   │   ├── GitSourceControl.tsx  # Contrôle de source Git complet (branches, staging, commit IA)
│   │   ├── ArchitectureCanvas.tsx# Canvas d'architecture interactif et zoomable
│   │   ├── HardwareMonitorModal.tsx # Télémétrie GPU/VRAM RTX 4060 & Landlock LSM
│   │   ├── MonacoPanel.tsx       # Éditeur de code Monaco & Diff Editor side-by-side
│   │   ├── AgentChat.tsx         # Chat IA ReAct (Mode Plan & Review, vision locale)
│   │   ├── BottomTerminal.tsx    # Terminal interactif xterm.js & journaux système
│   │   ├── Header.tsx            # Barre supérieure, sélecteur de modèle et connexion
│   │   ├── StatusBar.tsx         # Barre d'état inférieure (sandbox, réseau, modèle)
│   │   ├── SkillsModal.tsx       # Gestionnaire de compétences expertes
│   │   ├── CheckpointModal.tsx   # Snapshots atomiques et restauration
│   │   ├── AuditLogModal.tsx     # Journal d'audit des appels d'outils et commandes
│   │   └── SettingsModal.tsx     # Paramètres LLM (Ollama, LM Studio) et sandbox
│   ├── store/
│   │   └── useAppStore.ts        # Store global Zustand réactif (projets, git, état)
│   ├── lib/
│   │   ├── ipc.ts                # Couche d'abstraction Tauri IPC & types
│   │   └── sound.ts              # Retours sonores Web Audio API
│   ├── App.tsx                   # Disposition principale des volets
│   └── main.tsx                  # Point d'entrée React
│
├── src-tauri/                    # Backend natif Rust (Tauri 2)
│   ├── src/
│   │   ├── agent/                # Moteur d'agent ReAct, boucle de pensée, parsing d'outils
│   │   ├── git/                  # Moteur Git natif (status, diff, branch, stage, commit)
│   │   ├── security/             # Confinement Bubblewrap, Landlock LSM ABI v3, audit
│   │   ├── tools/                # Registre d'outils (fichiers, terminal, vision, benchmark)
│   │   ├── projects/             # Gestionnaire de projets multi-dossiers et règles
│   │   ├── checkpoints/          # Gestionnaire de snapshots atomiques
│   │   ├── lib.rs                # Handlers IPC Tauri et orchestrateur d'état
│   │   └── main.rs               # Point d'entrée binaire
│   ├── tests/                    # Tests unitaires et d'intégration sécurité
│   ├── Cargo.toml                # Dépendances Rust
│   └── tauri.conf.json           # Configuration Tauri 2
│
├── scripts/
│   └── package_linux.py          # Script de génération AppImage, .deb et .rpm
├── package.json                  # Dépendances frontend npm
└── vite.config.ts                # Configuration Vite
```

---

## 🚀 Commandes de Démarrage et Build

1. **Installer les dépendances :**
   ```bash
   npm install
   ```

2. **Lancer en développement (Vite dev server) :**
   ```bash
   npm run dev
   # ou avec Tauri complet :
   cargo tauri dev
   ```

3. **Compiler le frontend :**
   ```bash
   npm run build
   ```

4. **Lancer la suite de tests unitaires Rust :**
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

5. **Compiler la version release et générer les paquets Linux (.AppImage, .deb, .rpm) :**
   ```bash
   cargo build --release --manifest-path src-tauri/Cargo.toml
   python3 scripts/package_linux.py
   ```

---

## 🔒 Sécurité et Confinement Linux
* **Bubblewrap (`bwrap`)** : Exécution des commandes shell dans un conteneur temporaire sans accès aux répertoires sensibles du système (`/etc`, `/root`, `/home`).
* **Landlock LSM ABI v3** : Confinement au niveau noyau Linux des accès aux descripteurs de fichiers.
* **Validation syntaxique pré-écriture** : Analyse AST Python, JSON et Rust pour éviter la corruption de fichiers par les modèles locaux.
* **Blocklist stricte** : Blocage immédiat de `rm -rf /`, `dd`, `sudo`, fork bombs et exécutions via pipe distant.
