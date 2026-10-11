import React, { useState, useEffect } from 'react';
import { useAppStore, ModelProfile, SandboxType, ApprovalMode, EditorSettings, GeneralSettings } from '../store/useAppStore';
import { api } from '../lib/ipc';
import {
  X, Cpu, Shield, Bot, Palette, RotateCcw, Check, RefreshCw, Plus, Trash2,
  CheckCircle2, Zap, Sliders, Code2, Download, Upload, Undo2, Lock, Wifi,
  Volume2, Bell, Sparkles, FileText, AlertTriangle, Layers, Save, HelpCircle
} from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    profiles,
    setProfiles,
    activeProfileIndex,
    setActiveProfileIndex,
    sandboxType,
    setSandboxType,
    allowNetwork,
    setAllowNetwork,
    airGappedMode,
    setAirGappedMode,
    theme,
    setTheme,
    soundEnabled,
    toggleSound,
    approvalMode,
    setApprovalMode,
    chatPlacement,
    setChatPlacement,
    editorSettings,
    setEditorSettings,
    generalSettings,
    setGeneralSettings,
    exportBackupJson,
    importBackupJson,
    resetAllSettings,
    addLog,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'models' | 'security' | 'agent' | 'backup'>('general');
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [checkpointsList, setCheckpointsList] = useState<any[]>([]);
  const [importJsonText, setImportJsonText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [newProtectedPath, setNewProtectedPath] = useState('');

  const currentProfile = profiles[activeProfileIndex] || profiles[0];

  useEffect(() => {
    if (activeTab === 'backup') {
      api.listCheckpoints().then(setCheckpointsList).catch(console.error);
    }
  }, [activeTab]);

  if (!isSettingsOpen) return null;

  const handleUpdateCurrentProfile = (updates: Partial<ModelProfile>) => {
    const updated = [...profiles];
    updated[activeProfileIndex] = { ...currentProfile, ...updates };
    setProfiles(updated);
  };

  const handleAddNewProfile = () => {
    const newProf: ModelProfile = {
      name: `Nouveau Profil ${profiles.length + 1}`,
      api_url: 'http://localhost:11434/v1',
      model_id: 'qwen2.5-coder:7b',
      temperature: 0.2,
      max_tokens: 8192,
      num_ctx: 32768,
      supports_native_tools: true,
    };
    setProfiles([...profiles, newProf]);
    setActiveProfileIndex(profiles.length);
  };

  const handleDeleteProfile = (idx: number) => {
    if (profiles.length <= 1) return;
    const filtered = profiles.filter((_, i) => i !== idx);
    setProfiles(filtered);
    setActiveProfileIndex(Math.max(0, activeProfileIndex - 1));
  };

  const handleTestConnection = async () => {
    setTestingModel(true);
    setTestResult(null);
    try {
      const models = await api.testModelConnection(currentProfile);
      setTestResult(`Succès ! ${models.length} modèles détectés : ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`);
      addLog('info', `Connexion testée avec succès pour ${currentProfile.name}`);
    } catch (err: any) {
      setTestResult(`Échec : ${err}`);
      addLog('warn', `Échec du test de connexion : ${err}`);
    } finally {
      setTestingModel(false);
    }
  };

  const handleAutoDetectOllama = () => {
    handleUpdateCurrentProfile({
      api_url: 'http://localhost:11434/v1',
      model_id: 'qwen2.5-coder:7b',
      supports_native_tools: true,
      num_ctx: 32768,
    });
    handleTestConnection();
  };

  const handleAutoDetectLMStudio = () => {
    handleUpdateCurrentProfile({
      api_url: 'http://localhost:1234/v1',
      model_id: 'local-model',
      supports_native_tools: true,
      num_ctx: 16384,
    });
    handleTestConnection();
  };

  const handleAutoDetectVLLM = () => {
    handleUpdateCurrentProfile({
      api_url: 'http://localhost:8000/v1',
      model_id: 'default',
      supports_native_tools: true,
      num_ctx: 32768,
    });
    handleTestConnection();
  };

  const handleRestoreSnapshot = async (id: string) => {
    if (window.confirm("Restaurer ce snapshot écrasera les modifications en cours. Continuer ?")) {
      try {
        await api.restoreCheckpoint(id);
        addLog('info', `Checkpoint ${id} restauré avec succès.`);
        setSettingsOpen(false);
      } catch (err: any) {
        addLog('error', `Erreur restauration checkpoint : ${err}`);
      }
    }
  };

  const handleDownloadBackup = () => {
    const jsonStr = exportBackupJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `singular-code-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('info', 'Sauvegarde complète exportée en fichier JSON.');
  };

  const handleImportBackup = () => {
    if (!importJsonText.trim()) return;
    const ok = importBackupJson(importJsonText);
    if (ok) {
      setImportStatus('Succès : Paramètres et données restaurés !');
      setImportJsonText('');
    } else {
      setImportStatus('Erreur : Format JSON invalide ou corrompu.');
    }
  };

  const handleAddProtectedPath = () => {
    if (!newProtectedPath.trim()) return;
    const current = generalSettings.protectedPaths || [];
    if (!current.includes(newProtectedPath.trim())) {
      setGeneralSettings({ protectedPaths: [...current, newProtectedPath.trim()] });
    }
    setNewProtectedPath('');
  };

  const handleRemoveProtectedPath = (path: string) => {
    const current = generalSettings.protectedPaths || [];
    setGeneralSettings({ protectedPaths: current.filter((p) => p !== path) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#12141c] border border-[#272b3c] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] max-w-4xl w-full h-[640px] flex flex-col overflow-hidden text-gray-200 ring-1 ring-white/5">
        
        {/* Entête de la Modale */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-[#171a25] border-b border-[#25293a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sliders className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Paramètres de Singular Code</h2>
              <p className="text-[11px] text-gray-400">Configuration complète de l'agent, des modèles, de l'éditeur et de la persistance</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[#252a3a] text-gray-400 hover:text-white transition"
            title="Fermer (Échap)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps avec Navigation par Onglets */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Menu Latéral Gauche */}
          <div className="w-56 bg-[#0f1118] border-r border-[#1f2334] p-3 space-y-1 text-xs shrink-0 select-none">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition text-left ${
                activeTab === 'general' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-gray-400 hover:bg-[#1a1d29] hover:text-gray-200'
              }`}
            >
              <Palette className="w-4 h-4 shrink-0 text-cyan-400" />
              <span>Général & Interface</span>
            </button>

            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition text-left ${
                activeTab === 'editor' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-gray-400 hover:bg-[#1a1d29] hover:text-gray-200'
              }`}
            >
              <Code2 className="w-4 h-4 shrink-0 text-sky-400" />
              <span>Éditeur Monaco</span>
            </button>

            <button
              onClick={() => setActiveTab('models')}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition text-left ${
                activeTab === 'models' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-gray-400 hover:bg-[#1a1d29] hover:text-gray-200'
              }`}
            >
              <Cpu className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Modèles LLM & VRAM</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition text-left ${
                activeTab === 'security' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-gray-400 hover:bg-[#1a1d29] hover:text-gray-200'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Sécurité & Sandbox</span>
            </button>

            <button
              onClick={() => setActiveTab('agent')}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition text-left ${
                activeTab === 'agent' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-gray-400 hover:bg-[#1a1d29] hover:text-gray-200'
              }`}
            >
              <Bot className="w-4 h-4 shrink-0 text-purple-400" />
              <span>Moteur Agent</span>
            </button>

            <button
              onClick={() => setActiveTab('backup')}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition text-left ${
                activeTab === 'backup' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-gray-400 hover:bg-[#1a1d29] hover:text-gray-200'
              }`}
            >
              <Save className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Sauvegardes & Données</span>
            </button>

            {/* Note de persistance automatique en bas du menu */}
            <div className="pt-8 px-2">
              <div className="p-2.5 rounded-xl bg-[#141722] border border-[#23283c] text-[10px] text-gray-400 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Persistance Active</span>
                </div>
                <p className="text-[10px] leading-tight text-gray-500">
                  Toutes les modifications, sessions et paramètres sont sauvegardés automatiquement.
                </p>
              </div>
            </div>
          </div>

          {/* Panneau Principal Contenu */}
          <div className="flex-1 p-6 overflow-y-auto text-xs space-y-5 bg-[#12141c]">
            
            {/* 1. ONGLET GÉNÉRAL & INTERFACE */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Général & Interface Utilisateur</h3>
                  <p className="text-gray-400 text-[11px]">Personnalisez l'apparence, les sons et les comportements visuels de Singular Code.</p>
                </div>

                {/* Thème */}
                <div className="p-4 rounded-xl bg-[#161924] border border-[#24293a] space-y-3">
                  <label className="font-semibold text-gray-200 block">Thème de l'interface</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setTheme('dark')}
                      className={`p-3 rounded-xl border text-center transition flex items-center justify-center gap-2 font-medium ${
                        theme === 'dark'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                          : 'bg-[#10121a] border-[#222638] text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <span>🌙 Thème Sombre Singular</span>
                    </button>
                    <button
                      onClick={() => setTheme('light')}
                      className={`p-3 rounded-xl border text-center transition flex items-center justify-center gap-2 font-medium ${
                        theme === 'light'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                          : 'bg-[#10121a] border-[#222638] text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <span>☀️ Thème Clair</span>
                    </button>
                  </div>
                </div>

                {/* Disposition & Placement du Chat */}
                <div className="p-4 rounded-xl bg-[#161924] border border-[#24293a] space-y-3">
                  <label className="font-semibold text-gray-200 block">Emplacement par défaut du panneau de Chat</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setChatPlacement('right')}
                      className={`p-3 rounded-xl border text-center transition flex items-center justify-center gap-2 font-medium ${
                        chatPlacement === 'right'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-[#10121a] border-[#222638] text-gray-400'
                      }`}
                    >
                      <span>Panneau à DROITE (Défaut)</span>
                    </button>
                    <button
                      onClick={() => setChatPlacement('left')}
                      className={`p-3 rounded-xl border text-center transition flex items-center justify-center gap-2 font-medium ${
                        chatPlacement === 'left'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-[#10121a] border-[#222638] text-gray-400'
                      }`}
                    >
                      <span>Panneau à GAUCHE</span>
                    </button>
                  </div>
                </div>

                {/* Sons & Animations */}
                <div className="p-4 rounded-xl bg-[#161924] border border-[#24293a] space-y-3.5">
                  <span className="font-semibold text-gray-200 block">Effets & Retour Utilisateur</span>
                  
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-gray-300 font-medium block">Effets sonores interactifs</span>
                      <span className="text-[11px] text-gray-500">Signaux audio subtils lors des succès, approbations et erreurs.</span>
                    </div>
                    <button
                      onClick={toggleSound}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        soundEnabled ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}
                    >
                      {soundEnabled ? 'Activé (ON)' : 'Silencieux (OFF)'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-t border-[#202434] pt-2.5">
                    <div>
                      <span className="text-gray-300 font-medium block">Animations fluides & Motion Design</span>
                      <span className="text-[11px] text-gray-500">Transitions et fondus doux dans l'interface graphique.</span>
                    </div>
                    <button
                      onClick={() => setGeneralSettings({ motionAnimations: !generalSettings.motionAnimations })}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        generalSettings.motionAnimations ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}
                    >
                      {generalSettings.motionAnimations ? 'Activé (ON)' : 'Réduit (OFF)'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-t border-[#202434] pt-2.5">
                    <div>
                      <span className="text-gray-300 font-medium block">Notifications système OS</span>
                      <span className="text-[11px] text-gray-500">Envoie un avertissement notify-send quand l'agent termine une tâche longue.</span>
                    </div>
                    <button
                      onClick={() => setGeneralSettings({ systemNotifications: !generalSettings.systemNotifications })}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        generalSettings.systemNotifications ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}
                    >
                      {generalSettings.systemNotifications ? 'Activé (ON)' : 'Désactivé (OFF)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. ONGLET ÉDITEUR MONACO */}
            {activeTab === 'editor' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Configuration de l'Éditeur Monaco</h3>
                  <p className="text-gray-400 text-[11px]">Ajustez la typographie, l'indentation, la minicarte et le comportement du code.</p>
                </div>

                <div className="p-4 rounded-xl bg-[#161924] border border-[#24293a] space-y-4">
                  {/* Taille de police */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-gray-300 font-medium block">Taille de police (Font Size)</label>
                      <span className="text-[11px] text-gray-500">Actuellement : {editorSettings.fontSize}px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="10"
                        max="22"
                        step="1"
                        value={editorSettings.fontSize}
                        onChange={(e) => setEditorSettings({ fontSize: parseInt(e.target.value) || 13 })}
                        className="w-32 accent-indigo-500 cursor-pointer"
                      />
                      <span className="font-mono text-indigo-400 font-semibold w-8 text-right">{editorSettings.fontSize}px</span>
                    </div>
                  </div>

                  {/* Famille de police */}
                  <div className="border-t border-[#202434] pt-3">
                    <label className="text-gray-300 font-medium block mb-1.5">Police de caractères (Font Family)</label>
                    <select
                      value={editorSettings.fontFamily}
                      onChange={(e) => setEditorSettings({ fontFamily: e.target.value })}
                      className="w-full px-3 py-2 bg-[#10121a] border border-[#25293a] rounded-lg text-white font-mono text-xs"
                    >
                      <option value="JetBrains Mono, Menlo, monospace">JetBrains Mono (Recommandé)</option>
                      <option value="Fira Code, monospace">Fira Code</option>
                      <option value="Cascadia Code, Consolas, monospace">Cascadia Code</option>
                      <option value="Source Code Pro, monospace">Source Code Pro</option>
                      <option value="monospace">Système Monospace générique</option>
                    </select>
                  </div>

                  {/* Tab Size & Minimap */}
                  <div className="grid grid-cols-2 gap-4 border-t border-[#202434] pt-3">
                    <div>
                      <label className="text-gray-300 font-medium block mb-1">Taille des Tabulations</label>
                      <select
                        value={editorSettings.tabSize}
                        onChange={(e) => setEditorSettings({ tabSize: parseInt(e.target.value) || 2 })}
                        className="w-full px-3 py-1.5 bg-[#10121a] border border-[#25293a] rounded-lg text-white"
                      >
                        <option value="2">2 Espaces</option>
                        <option value="4">4 Espaces</option>
                        <option value="8">8 Espaces</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-gray-300 font-medium block mb-1">Numéros de ligne</label>
                      <select
                        value={editorSettings.lineNumbers}
                        onChange={(e) => setEditorSettings({ lineNumbers: e.target.value as any })}
                        className="w-full px-3 py-1.5 bg-[#10121a] border border-[#25293a] rounded-lg text-white"
                      >
                        <option value="on">Afficher (Standard)</option>
                        <option value="relative">Relatifs (style Vim)</option>
                        <option value="off">Masquer</option>
                      </select>
                    </div>
                  </div>

                  {/* Word Wrap & Clignotement curseur */}
                  <div className="grid grid-cols-2 gap-4 border-t border-[#202434] pt-3">
                    <div>
                      <label className="text-gray-300 font-medium block mb-1">Retour à la ligne (Word Wrap)</label>
                      <select
                        value={editorSettings.wordWrap}
                        onChange={(e) => setEditorSettings({ wordWrap: e.target.value as any })}
                        className="w-full px-3 py-1.5 bg-[#10121a] border border-[#25293a] rounded-lg text-white"
                      >
                        <option value="on">Activé (Envelopper à la bordure)</option>
                        <option value="off">Désactivé (Défilement horizontal)</option>
                        <option value="bounded">Borné (Envelopper à 120 colonnes)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-gray-300 font-medium block mb-1">Curseur</label>
                      <select
                        value={editorSettings.cursorBlinking}
                        onChange={(e) => setEditorSettings({ cursorBlinking: e.target.value as any })}
                        className="w-full px-3 py-1.5 bg-[#10121a] border border-[#25293a] rounded-lg text-white"
                      >
                        <option value="smooth">Clignotement Fluide (Smooth)</option>
                        <option value="blink">Clignotement Standard (Blink)</option>
                        <option value="solid">Fixe sans clignotement (Solid)</option>
                      </select>
                    </div>
                  </div>

                  {/* Toggles : Minimap, Smooth scroll, Format on save */}
                  <div className="space-y-2 border-t border-[#202434] pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300">Minicarte de vue d'ensemble (Minimap)</span>
                      <input
                        type="checkbox"
                        checked={editorSettings.minimap}
                        onChange={(e) => setEditorSettings({ minimap: e.target.checked })}
                        className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-300">Défilement fluide (Smooth Scrolling)</span>
                      <input
                        type="checkbox"
                        checked={editorSettings.smoothScrolling}
                        onChange={(e) => setEditorSettings({ smoothScrolling: e.target.checked })}
                        className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-300">Formatage automatique à la sauvegarde (Format on Save)</span>
                      <input
                        type="checkbox"
                        checked={editorSettings.formatOnSave}
                        onChange={(e) => setEditorSettings({ formatOnSave: e.target.checked })}
                        className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. ONGLET MODÈLES LLM & INFERENCE */}
            {activeTab === 'models' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white mb-0.5">Profils de Modèles LLM & VRAM</h3>
                    <p className="text-gray-400 text-[11px]">Connectez Ollama, LM Studio, vLLM ou n'importe quelle API compatible OpenAI.</p>
                  </div>
                  <button
                    onClick={handleAddNewProfile}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nouveau Profil
                  </button>
                </div>

                {/* Sélecteur de profil actif */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {profiles.map((p, idx) => (
                    <div
                      key={idx}
                      onClick={() => setActiveProfileIndex(idx)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer border transition shrink-0 ${
                        idx === activeProfileIndex
                          ? 'bg-indigo-600/20 border-indigo-500 text-white font-semibold shadow-sm'
                          : 'bg-[#151822] border-[#252a3b] text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{p.name}</span>
                      {profiles.length > 1 && (
                        <Trash2
                          className="w-3 h-3 text-gray-500 hover:text-rose-400 ml-1 transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProfile(idx);
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Boutons de Détection Rapide */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleAutoDetectOllama}
                    className="px-3 py-1.5 rounded-lg bg-[#181c28] hover:bg-[#22283a] text-cyan-300 border border-cyan-500/20 font-medium transition text-[11px] flex items-center gap-1.5"
                  >
                    <span>⚡ Ollama (11434)</span>
                  </button>
                  <button
                    onClick={handleAutoDetectLMStudio}
                    className="px-3 py-1.5 rounded-lg bg-[#181c28] hover:bg-[#22283a] text-purple-300 border border-purple-500/20 font-medium transition text-[11px] flex items-center gap-1.5"
                  >
                    <span>🔮 LM Studio (1234)</span>
                  </button>
                  <button
                    onClick={handleAutoDetectVLLM}
                    className="px-3 py-1.5 rounded-lg bg-[#181c28] hover:bg-[#22283a] text-emerald-300 border border-emerald-500/20 font-medium transition text-[11px] flex items-center gap-1.5"
                  >
                    <span>🚀 vLLM (8000)</span>
                  </button>
                </div>

                {/* Formulaire du profil actif */}
                <div className="space-y-3.5 bg-[#151822] p-4 rounded-xl border border-[#252a3b]">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-400 block mb-1">Nom du profil</label>
                      <input
                        type="text"
                        value={currentProfile.name}
                        onChange={(e) => handleUpdateCurrentProfile({ name: e.target.value })}
                        className="w-full px-3 py-1.5 bg-[#10121a] border border-[#252a3b] rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Identifiant du Modèle (model)</label>
                      <input
                        type="text"
                        value={currentProfile.model_id}
                        onChange={(e) => handleUpdateCurrentProfile({ model_id: e.target.value })}
                        className="w-full px-3 py-1.5 bg-[#10121a] border border-[#252a3b] rounded-lg text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-gray-400 block mb-1">URL de l'API (OpenAI-compatible endpoint)</label>
                    <input
                      type="text"
                      value={currentProfile.api_url}
                      onChange={(e) => handleUpdateCurrentProfile({ api_url: e.target.value })}
                      className="w-full px-3 py-1.5 bg-[#10121a] border border-[#252a3b] rounded-lg text-white font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-gray-400 block mb-1">Température ({currentProfile.temperature})</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={currentProfile.temperature}
                        onChange={(e) => handleUpdateCurrentProfile({ temperature: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Tokens Réponse (max_tokens)</label>
                      <input
                        type="number"
                        value={currentProfile.max_tokens}
                        onChange={(e) => handleUpdateCurrentProfile({ max_tokens: parseInt(e.target.value) || 16384 })}
                        className="w-full px-3 py-1 bg-[#10121a] border border-[#252a3b] rounded-lg text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Contexte (num_ctx)</label>
                      <input
                        type="number"
                        value={currentProfile.num_ctx || 32768}
                        onChange={(e) => handleUpdateCurrentProfile({ num_ctx: parseInt(e.target.value) || 32768 })}
                        className="w-full px-3 py-1 bg-[#10121a] border border-[#252a3b] rounded-lg text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Presets rapides de Contexte */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 pb-1">
                    <span className="text-gray-400 text-[11px] font-medium">Presets Contexte & Séries :</span>
                    <div className="flex flex-wrap gap-1.5 font-mono">
                      {[
                        { label: '8K', ctx: 8192, max: 4096 },
                        { label: '16K', ctx: 16384, max: 8192 },
                        { label: '32K', ctx: 32768, max: 16384 },
                        { label: '64K', ctx: 65536, max: 32768 },
                        { label: '128K', ctx: 131072, max: 32768 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleUpdateCurrentProfile({ num_ctx: preset.ctx, max_tokens: preset.max })}
                          className={`px-2.5 py-0.5 rounded text-[10px] border transition ${
                            currentProfile.num_ctx === preset.ctx
                              ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-sm'
                              : 'bg-[#10121a] text-gray-400 border-gray-700/60 hover:text-white hover:bg-[#1f2434]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bannière explicative Auto-Expansion */}
                  <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-[11px] text-indigo-300 flex items-start gap-2">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block text-white">Auto-Expansion & Séries Continues Actives</span>
                      Dès que le modèle s'approche de la limite (dans les 1000 tokens), l'agent alloue automatiquement +2048 tokens et poursuit la génération sur la série suivante sans coupure.
                    </div>
                  </div>

                  {/* Déchargement automatique VRAM GPU */}
                  <div className="border-t border-[#202538] pt-3">
                    <label className="text-gray-400 block mb-1">Déchargement automatique du modèle de la VRAM (libération GPU)</label>
                    <select
                      value={generalSettings.autoUnloadVramMinutes}
                      onChange={(e) => setGeneralSettings({ autoUnloadVramMinutes: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 bg-[#10121a] border border-[#252a3b] rounded-lg text-white"
                    >
                      <option value="0">Jamais (Conserver le modèle chargé en permanence pour réactivité max)</option>
                      <option value="2">Après 2 minutes d'inactivité</option>
                      <option value="5">Après 5 minutes d'inactivité</option>
                      <option value="15">Après 15 minutes d'inactivité</option>
                      <option value="30">Après 30 minutes d'inactivité</option>
                    </select>
                  </div>

                  {/* Prompt système custom */}
                  <div className="border-t border-[#202538] pt-3">
                    <label className="text-gray-400 block mb-1">Directives système personnalisées additionnelles (Prompt Global)</label>
                    <textarea
                      rows={2}
                      value={generalSettings.customSystemPrompt}
                      onChange={(e) => setGeneralSettings({ customSystemPrompt: e.target.value })}
                      placeholder="Ex: Réponds toujours en français technique. Priorise le code modulaire et concis sans dépendances inutiles."
                      className="w-full px-3 py-2 bg-[#10121a] border border-[#252a3b] rounded-lg text-white placeholder-gray-600 font-mono text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="native_tools"
                      checked={currentProfile.supports_native_tools}
                      onChange={(e) => handleUpdateCurrentProfile({ supports_native_tools: e.target.checked })}
                      className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="native_tools" className="text-gray-300">
                      Support natif du Function Calling (décocher pour activer le repli Markdown XML)
                    </label>
                  </div>
                </div>

                {/* Bouton Tester la Connexion */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={handleTestConnection}
                    disabled={testingModel}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow-md shadow-indigo-600/30"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingModel ? 'animate-spin' : ''}`} />
                    Tester la connexion
                  </button>
                  {testResult && (
                    <span className="text-xs text-indigo-300 font-mono">{testResult}</span>
                  )}
                </div>
              </div>
            )}

            {/* 4. ONGLET SÉCURITÉ & SANDBOX */}
            {activeTab === 'security' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">Bac à Sable & Confinement Linux</h3>
                  <p className="text-gray-400 text-[11px]">Gérez l'isolation des processus, l'accès réseau et la protection des fichiers sensibles.</p>
                </div>

                <div className="space-y-3 bg-[#151822] p-4 rounded-xl border border-[#252a3b]">
                  <div>
                    <label className="text-gray-300 font-medium block mb-1.5">Moteur de Sandbox :</label>
                    <select
                      value={sandboxType}
                      onChange={(e) => setSandboxType(e.target.value as SandboxType)}
                      className="w-full px-3 py-2 bg-[#10121a] border border-[#252a3b] rounded-lg text-white"
                    >
                      <option value="bubblewrap">Bubblewrap (Recommandé, isolation noyau Linux native)</option>
                      <option value="docker">Docker (Conteneur éphémère sans privilèges)</option>
                      <option value="none">Aucun (Avertissement : commandes exécutées directement sur l'hôte)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#10121a] border border-[#202434]">
                      <div>
                        <span className="text-gray-200 font-medium block">Accès réseau sandbox</span>
                        <span className="text-[10px] text-gray-500">Pour npm, cargo, pip</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={allowNetwork}
                        onChange={(e) => setAllowNetwork(e.target.checked)}
                        className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#10121a] border border-[#202434]">
                      <div>
                        <span className="text-purple-300 font-medium block">Mode Air-Gapped</span>
                        <span className="text-[10px] text-gray-500">Isolation absolue sans DNS</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={airGappedMode}
                        onChange={(e) => setAirGappedMode(e.target.checked)}
                        className="rounded accent-purple-500 w-4 h-4 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Chemins protégés */}
                  <div className="border-t border-[#202434] pt-3 space-y-2">
                    <label className="text-gray-300 font-medium block">Chemins protégés en lecture/écriture :</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(generalSettings.protectedPaths || []).map((path) => (
                        <span
                          key={path}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#10121a] border border-[#222738] text-xs font-mono text-gray-300"
                        >
                          <Lock className="w-3 h-3 text-amber-400" />
                          <span>{path}</span>
                          <X
                            className="w-3 h-3 text-gray-500 hover:text-rose-400 cursor-pointer"
                            onClick={() => handleRemoveProtectedPath(path)}
                          />
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={newProtectedPath}
                        onChange={(e) => setNewProtectedPath(e.target.value)}
                        placeholder="Ex: id_rsa, .env.local, config/secrets.yaml"
                        className="flex-1 px-3 py-1.5 bg-[#10121a] border border-[#252a3b] rounded-lg text-white font-mono text-xs"
                      />
                      <button
                        onClick={handleAddProtectedPath}
                        className="px-3 py-1.5 rounded-lg bg-[#22273a] hover:bg-indigo-600 text-white transition text-xs font-medium"
                      >
                        Ajouter
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-[#151822] p-4 rounded-xl border border-[#252a3b] space-y-2 text-[11px] text-gray-400">
                  <span className="text-emerald-400 font-semibold block flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" /> Protections immuables actives :
                  </span>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Confinement strict au dossier du projet actif (canonicalize + résolution symlinks).</li>
                    <li>Interdiction des commandes destructrices (rm -rf /, mkfs, dd, fork bombs).</li>
                    <li>Escalade de privilèges interdite (sudo, su, pkexec systématiquement interceptés).</li>
                    <li>Journal d'audit inviolable consignant chaque écriture de fichier et commande shell.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* 5. ONGLET MOTEUR AGENT */}
            {activeTab === 'agent' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">Moteur Agent & Autonomie</h3>
                  <p className="text-gray-400 text-[11px]">Réglez la boucle de réflexion, le mode d'approbation et l'auto-réparation.</p>
                </div>

                <div className="space-y-4 bg-[#151822] p-4 rounded-xl border border-[#252a3b]">
                  {/* Mode d'approbation par défaut */}
                  <div>
                    <label className="text-gray-300 font-medium block mb-1.5">Mode d'opération de l'agent par défaut :</label>
                    <select
                      value={approvalMode}
                      onChange={(e) => setApprovalMode(e.target.value as ApprovalMode)}
                      className="w-full px-3 py-2 bg-[#10121a] border border-[#252a3b] rounded-lg text-white font-semibold"
                    >
                      <option value="ask">ASK : Confirmation explicite pour chaque commande et fichier</option>
                      <option value="architect">ARCHITECT : Élaboration du plan et décomposition préalable</option>
                      <option value="code">CODE : Édition de code directe avec validation supervisée</option>
                      <option value="debug">DEBUG : Analyse des tests, des logs et investigation des bugs</option>
                      <option value="review">REVIEW : Revue de sécurité, audit et génération de diffs</option>
                      <option value="yolo">YOLO : Autonomie totale dans la sandbox sans interruption</option>
                    </select>
                  </div>

                  {/* Nombre d'itérations max */}
                  <div className="grid grid-cols-2 gap-4 border-t border-[#202538] pt-3">
                    <div>
                      <label className="text-gray-300 font-medium block mb-1">Nombre maximal d'itérations :</label>
                      <select
                        value={generalSettings.maxAgentIterations}
                        onChange={(e) => setGeneralSettings({ maxAgentIterations: parseInt(e.target.value) || 25 })}
                        className="w-full px-3 py-1.5 bg-[#10121a] border border-[#252a3b] rounded-lg text-white"
                      >
                        <option value="10">10 itérations (Court)</option>
                        <option value="25">25 itérations (Standard)</option>
                        <option value="50">50 itérations (Profond)</option>
                        <option value="100">100 itérations (Autonomie maximale)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-gray-300 font-medium block mb-1">Niveau d'explication de l'agent :</label>
                      <select
                        value={generalSettings.explanationLevel}
                        onChange={(e) => setGeneralSettings({ explanationLevel: e.target.value as any })}
                        className="w-full px-3 py-1.5 bg-[#10121a] border border-[#252a3b] rounded-lg text-white"
                      >
                        <option value="concise">Concis & Direct (Code en priorité)</option>
                        <option value="detailed">Détaillé & Pédagogique</option>
                        <option value="code_only">Code pur (Bavardage minimal)</option>
                      </select>
                    </div>
                  </div>

                  {/* Auto-repair des tests */}
                  <div className="flex items-center justify-between border-t border-[#202538] pt-3">
                    <div>
                      <span className="text-gray-200 font-medium block">Boucle d'auto-réparation automatique (/tdd)</span>
                      <span className="text-[11px] text-gray-500">
                        Lance la suite de tests et corrige automatiquement le code jusqu'à ce que tous les tests passent.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={generalSettings.autoRepairTests}
                      onChange={(e) => setGeneralSettings({ autoRepairTests: e.target.checked })}
                      className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 6. ONGLET SAUVEGARDE & DONNÉES */}
            {activeTab === 'backup' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">Sauvegardes, Export & Données</h3>
                  <p className="text-gray-400 text-[11px]">Exportez vos réglages, restaurez un instantané ou réinitialisez l'application.</p>
                </div>

                {/* Export / Import JSON */}
                <div className="p-4 rounded-xl bg-[#151822] border border-[#252a3b] space-y-3.5">
                  <span className="text-gray-200 font-semibold block">Sauvegarde Globale de Singular Code (JSON)</span>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={handleDownloadBackup}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow-md shadow-indigo-600/30 text-xs"
                    >
                      <Download className="w-4 h-4" />
                      Télécharger la sauvegarde complète (.json)
                    </button>

                    <button
                      onClick={resetAllSettings}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#202434] hover:bg-rose-900/40 text-gray-300 hover:text-rose-300 border border-[#2c3248] transition text-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Réinitialiser les paramètres
                    </button>
                  </div>

                  {/* Restauration depuis JSON */}
                  <div className="border-t border-[#202538] pt-3 space-y-2">
                    <label className="text-gray-400 block text-[11px]">Restaurer depuis un fichier ou du texte JSON :</label>
                    <textarea
                      rows={3}
                      value={importJsonText}
                      onChange={(e) => setImportJsonText(e.target.value)}
                      placeholder='Collez ici le contenu JSON de votre sauvegarde...'
                      className="w-full px-3 py-2 bg-[#10121a] border border-[#252a3b] rounded-lg text-white font-mono text-[11px]"
                    />
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleImportBackup}
                        disabled={!importJsonText.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium transition text-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Restaurer cette sauvegarde
                      </button>
                      {importStatus && (
                        <span className={`text-xs font-semibold ${importStatus.startsWith('Succès') ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {importStatus}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Historique des Snapshots de Code */}
                <div className="p-4 rounded-xl bg-[#151822] border border-[#252a3b] space-y-3">
                  <span className="font-semibold text-gray-200 block">Historique des Snapshots de Code</span>
                  {checkpointsList.length === 0 ? (
                    <p className="text-gray-500 text-[11px]">Aucun checkpoint de fichiers enregistré pour le moment.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {checkpointsList.map((cp) => (
                        <div
                          key={cp.id}
                          className="flex items-center justify-between p-2.5 bg-[#10121a] rounded-lg border border-[#222738]"
                        >
                          <div>
                            <span className="font-medium text-gray-200 block text-xs">{cp.description}</span>
                            <span className="text-[10px] text-gray-500 font-mono">
                              {new Date(cp.timestamp).toLocaleString()} ({cp.files_count} fichiers)
                            </span>
                          </div>
                          <button
                            onClick={() => handleRestoreSnapshot(cp.id)}
                            className="px-2.5 py-1 rounded bg-[#1e2334] hover:bg-amber-600 text-white transition text-[11px] font-medium"
                          >
                            Restaurer
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
