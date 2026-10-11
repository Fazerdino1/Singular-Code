import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderPlus,
  Trash2,
  Save,
  Sparkles,
  FileText,
  Shield,
  Layers,
  Check,
  Plus,
  Cloud,
  Code2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/ipc';

export const ProjectRulesModal: React.FC = () => {
  const {
    isProjectRulesModalOpen,
    setProjectRulesModalOpen,
    projects,
    editingProjectId,
    activeProjectId,
    updateProjectRules,
    addFolderToProject,
    removeFolderFromProject,
    renameProject,
    addLog,
  } = useAppStore();

  const targetProjectId = editingProjectId || activeProjectId;
  const project = projects.find((p) => p.id === targetProjectId);

  const [projectName, setProjectName] = useState('');
  const [projectRules, setProjectRules] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      setProjectRules(project.rules || '');
    }
  }, [project, isProjectRulesModalOpen]);

  if (!isProjectRulesModalOpen || !project) return null;

  const handleAddFolder = async () => {
    try {
      const selected = await api.selectWorkspaceFolder();
      if (selected && targetProjectId) {
        await addFolderToProject(targetProjectId, selected);
        addLog('info', `Dossier ajouté au projet ${project.name} : ${selected}`);
      }
    } catch (e: any) {
      addLog('error', `Erreur sélection dossier : ${e.message}`);
    }
  };

  const handleSave = async () => {
    if (!targetProjectId) return;
    setIsSaving(true);
    try {
      if (projectName.trim() && projectName !== project.name) {
        await renameProject(targetProjectId, projectName.trim());
      }
      await updateProjectRules(targetProjectId, projectRules);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: any) {
      addLog('error', `Erreur sauvegarde règles projet : ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const applyTemplate = (templateContent: string) => {
    setProjectRules((prev) => (prev ? `${prev}\n\n${templateContent}` : templateContent));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-[#11131a] border border-[#272a3a] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#212435] bg-[#141622]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-100">
                Configuration du Projet & Règles IA
              </h3>
              <p className="text-xs text-zinc-400">
                Dossiers associés et directives d'architecture pour l'Agent
              </p>
            </div>
          </div>

          <button
            onClick={() => setProjectRulesModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#202334] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps de la modale */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Nom du projet */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Nom du Projet</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-[#161824] border border-[#262a3d] rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Dossiers associés (Support Multi-Dossiers) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-zinc-300">
                  Dossiers Associés au Projet
                </label>
                <p className="text-[11px] text-zinc-500">
                  Le projet peut englober un ou plusieurs dossiers du système de fichiers
                </p>
              </div>

              <button
                onClick={handleAddFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>+ Ajouter un dossier</span>
              </button>
            </div>

            {project.folders.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[#262a3d] bg-[#141620] text-center text-xs text-zinc-500">
                Aucun dossier lié. Cliquez sur "+ Ajouter un dossier" pour rattacher un répertoire local.
              </div>
            ) : (
              <div className="space-y-1.5">
                {project.folders.map((folderPath) => (
                  <div
                    key={folderPath}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#161824] border border-[#262a3d] text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 truncate text-zinc-300">
                      <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="truncate">{folderPath}</span>
                    </div>

                    <button
                      onClick={() => targetProjectId && removeFolderFromProject(targetProjectId, folderPath)}
                      title="Retirer ce dossier du projet"
                      className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors ml-2 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Règles & Directives du projet (rules.md) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-zinc-300">
                  Directives du Projet Singular Code (.localagent/rules.md)
                </label>
                <p className="text-[11px] text-zinc-500">
                  Ces règles sont injectées dans le prompt système de l'agent pour ce projet
                </p>
              </div>

              {/* Modèles de règles rapides */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    applyTemplate(
                      "### Conventions de Code\n- Architecture modulaire et découplée.\n- Pas de `any` ou d'allocation superflue.\n- Tests unitaires systématiques."
                    )
                  }
                  className="text-[10px] bg-[#1c1f2e] hover:bg-[#25293d] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded border border-[#2b3046] transition-colors"
                >
                  + Règle Code
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyTemplate(
                      "### Sécurité & Sandbox\n- Idempotence stricte des commandes.\n- Pas de modification hors du workspace."
                    )
                  }
                  className="text-[10px] bg-[#1c1f2e] hover:bg-[#25293d] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded border border-[#2b3046] transition-colors"
                >
                  + Règle Sécurité
                </button>
              </div>
            </div>

            <textarea
              value={projectRules}
              onChange={(e) => setProjectRules(e.target.value)}
              rows={8}
              placeholder="# Directives du projet...&#10;- Suivre les conventions du codebase.&#10;- Valider les changements avec des tests unitaires."
              className="w-full bg-[#141622] border border-[#262a3d] rounded-xl p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 resize-none outline-none focus:border-indigo-500 leading-relaxed transition-colors"
            />
          </div>
        </div>

        {/* Pied de modale */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#212435] bg-[#141622]">
          <span className="text-[11px] text-zinc-500 font-mono">
            ID: {project.id}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setProjectRulesModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-[#202334] transition-colors"
            >
              Fermer
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all active:scale-98"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Enregistré !</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Enregistrement...' : 'Enregistrer le Projet'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
