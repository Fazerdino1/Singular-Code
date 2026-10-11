import React, { useState, useEffect } from 'react';
import {
  Folder,
  Cloud,
  ChevronDown,
  ChevronRight,
  Filter,
  FolderPlus,
  Plus,
  Settings2,
  Trash2,
  Search,
  MessageSquare,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useAppStore, ProjectItem, ProjectConversationItem } from '../store/useAppStore';
import { api } from '../lib/ipc';

export const ProjectsSidebar: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectProject,
    selectProjectConversation,
    createProjectConversation,
    deleteProjectConversation,
    deleteProject,
    setProjectRulesModalOpen,
    createProject,
    loadProjects,
  } = useAppStore();

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({
    'project-cli': true,
    'project-proud-volta': true,
    'project-lively-darwin': true,
    'project-antigravity-x64': true,
    'project-zealous-shannon': true,
    'project-calm-noether': true,
    'project-crossplay': true,
  });

  const [searchFilter, setSearchFilter] = useState('');
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const toggleProjectExpand = (id: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  };

  const handleCreateNewProject = async () => {
    const name = window.prompt("Nom du nouveau projet (ex: my-awesome-app) :");
    if (!name || !name.trim()) return;

    // Proposer de sélectionner un dossier initial
    const folder = await api.selectWorkspaceFolder();
    const folders = folder ? [folder] : [];
    
    await createProject(name.trim(), folders, `# Règles du projet ${name.trim()}\n- Directives de code et architecture.`);
  };

  const filteredProjects = projects.filter((p) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    const matchesProjectName = p.name.toLowerCase().includes(term);
    const matchesConversation = p.conversations.some((c) =>
      c.title.toLowerCase().includes(term)
    );
    return matchesProjectName || matchesConversation;
  });

  return (
    <div className="flex flex-col h-full bg-[#121318] border-r border-[#1e2029] select-none text-zinc-300 w-full overflow-hidden">
      {/* Header : "Projects ⌵" et boutons Filtre / Nouveau projet */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-[#1c1e28] bg-[#101116]">
        <button
          onClick={() => setIsProjectsCollapsed(!isProjectsCollapsed)}
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
        >
          <span>Projects</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
              isProjectsCollapsed ? '-rotate-90' : ''
            }`}
          />
        </button>

        <div className="flex items-center gap-1">
          {/* Bouton Filtre */}
          <button
            onClick={() => setShowFilterBar(!showFilterBar)}
            className={`p-1.5 rounded-lg transition-colors ${
              showFilterBar
                ? 'bg-[#222534] text-indigo-400'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1c26]'
            }`}
            title="Filtrer les projets et conversations"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>

          {/* Bouton Nouveau Projet */}
          <button
            onClick={handleCreateNewProject}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1c26] transition-colors"
            title="Créer un nouveau projet"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barre de Recherche / Filtrage dépliable */}
      {showFilterBar && (
        <div className="p-2 border-b border-[#1c1e28] bg-[#0e0f14] flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filtrer projets ou conversations..."
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
            autoFocus
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1"
            >
              Effacer
            </button>
          )}
        </div>
      )}

      {/* Liste des Projets et Conversations */}
      {!isProjectsCollapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredProjects.map((project) => {
            const isExpanded = expandedProjects[project.id] !== false;
            const isCurrentProject = project.id === activeProjectId;

            return (
              <div key={project.id} className="group/proj flex flex-col mb-1">
                {/* Ligne du Projet (ex: ☁ CLI Project ou 📁 proud-volta) */}
                <div
                  onClick={() => selectProject(project.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isCurrentProject
                      ? 'text-zinc-100 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#181a24]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate flex-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProjectExpand(project.id);
                      }}
                      className="text-zinc-500 hover:text-zinc-300 p-0.5"
                    >
                      {project.icon === 'cloud' ? (
                        <Cloud className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                    </button>
                    <span className="truncate text-xs tracking-tight">{project.name}</span>
                  </div>

                  {/* Actions au survol sur le projet */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/proj:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        createProjectConversation(project.id);
                      }}
                      title="Nouvelle conversation dans ce projet"
                      className="p-1 rounded text-zinc-400 hover:text-indigo-400 hover:bg-[#202332]"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectRulesModalOpen(true, project.id);
                      }}
                      title="Configurer règles et dossiers du projet"
                      className="p-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-[#202332]"
                    >
                      <Settings2 className="w-3 h-3" />
                    </button>
                    {projects.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Supprimer le projet ${project.name} ?`)) {
                            deleteProject(project.id);
                          }
                        }}
                        title="Supprimer le projet"
                        className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-[#202332]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Conversations du projet */}
                {isExpanded && (
                  <div className="ml-3 pl-2 border-l border-[#1f2230] space-y-0.5 my-0.5">
                    {project.conversations.length === 0 ? (
                      /* "No conversations yet" exactement comme sur la capture */
                      <div className="px-3 py-1.5 text-[11px] text-zinc-500 italic select-none">
                        No conversations yet
                      </div>
                    ) : (
                      project.conversations.map((conv) => {
                        const isActiveConv =
                          isCurrentProject && project.activeConversationId === conv.id;

                        return (
                          <div
                            key={conv.id}
                            onClick={() => selectProjectConversation(project.id, conv.id)}
                            className={`group/conv relative flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all duration-150 ${
                              isActiveConv
                                ? 'bg-[#252837] text-zinc-100 font-medium shadow-sm border border-[#32364a]'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#161822]'
                            }`}
                          >
                            <span className="truncate pr-2 text-xs flex-1">
                              {conv.title}
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-zinc-500 font-mono">
                                {conv.relativeTime || 'now'}
                              </span>

                              {/* Bouton suppression conversation au survol */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteProjectConversation(project.id, conv.id);
                                }}
                                title="Supprimer la conversation"
                                className="opacity-0 group-hover/conv:opacity-100 p-0.5 text-zinc-500 hover:text-rose-400 transition-opacity"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pied du volet de projets : Bouton direct Règles du projet actif */}
      <div className="p-2.5 border-t border-[#1c1e28] bg-[#0f1015]">
        <button
          onClick={() => setProjectRulesModalOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#191b26] hover:bg-[#222534] text-zinc-300 hover:text-zinc-100 text-xs font-medium border border-[#26293a] transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5 text-amber-400" />
          <span>Règles & Dossiers du Projet</span>
        </button>
      </div>
    </div>
  );
};
