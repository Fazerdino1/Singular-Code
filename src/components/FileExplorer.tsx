import React, { useState, useEffect } from 'react';
import { useAppStore, FileNode } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../lib/ipc';
import {
  Folder, FolderOpen, File, FileCode, FileText, ChevronRight, ChevronDown,
  Plus, FolderPlus, Trash2, RefreshCw, Search, X, Check, Bot,
  Edit3, Copy, Columns, AtSign, CheckCircle2
} from 'lucide-react';

const areFileTreesEqual = (a: FileNode[], b: FileNode[]): boolean => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].name !== b[i].name ||
      a[i].path !== b[i].path ||
      a[i].is_dir !== b[i].is_dir ||
      a[i].size !== b[i].size ||
      a[i].isModifiedByAi !== b[i].isModifiedByAi
    ) {
      return false;
    }
  }
  return true;
};

export const FileExplorer: React.FC = () => {
  const {
    files,
    setFiles,
    openFile,
    activeTab,
    addLog,
    renameFile,
    openFileInSplit,
  } = useAppStore(
    useShallow((s) => ({
      files: s.files,
      setFiles: s.setFiles,
      openFile: s.openFile,
      activeTab: s.activeTab,
      addLog: s.addLog,
      renameFile: s.renameFile,
      openFileInSplit: s.openFileInSplit,
    }))
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);
  const [createMode, setCreateMode] = useState<'file' | 'folder' | null>(null);
  const [createParentPath, setCreateParentPath] = useState<string>('');
  const [itemName, setItemName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const refreshFiles = async () => {
    try {
      const list = await api.listFiles();
      const filtered = (list || []).filter((node: FileNode) =>
        !node.name.startsWith('.local_agent') &&
        node.name !== 'checkpoints' &&
        !node.path.startsWith('.local_agent') &&
        !node.path.startsWith('checkpoints')
      );
      const currentFiles = useAppStore.getState().files;
      if (!areFileTreesEqual(currentFiles, filtered)) {
        setFiles(filtered);
      }
    } catch (err: any) {
      addLog('error', `Erreur rafraîchissement explorateur : ${err}`);
    }
  };

  useEffect(() => {
    refreshFiles();
    const interval = setInterval(() => {
      if (!document.hidden) {
        refreshFiles();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleFileClick = async (node: FileNode) => {
    if (node.is_dir) {
      toggleFolder(node.path);
    } else {
      try {
        const content = await api.readFile(node.path);
        openFile(node.path, content);
      } catch (err: any) {
        addLog('error', `Impossible de lire ${node.path} : ${err}`);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const handleDelete = async (node: FileNode) => {
    if (window.confirm(`Voulez-vous supprimer définitivement ${node.name} ?`)) {
      try {
        await api.deleteFile(node.path);
        addLog('info', `Élément supprimé : ${node.path}`);
        await refreshFiles();
      } catch (err: any) {
        addLog('error', `Erreur suppression : ${err}`);
      }
    }
    setContextMenu(null);
  };

  const handleStartRename = (node: FileNode) => {
    setRenameTarget(node);
    setRenameValue(node.name);
    setContextMenu(null);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    const parentDir = renameTarget.path.includes('/')
      ? renameTarget.path.slice(0, renameTarget.path.lastIndexOf('/'))
      : '';
    const newPath = parentDir ? `${parentDir}/${renameValue.trim()}` : renameValue.trim();
    try {
      await renameFile(renameTarget.path, newPath);
      setRenameTarget(null);
      setRenameValue('');
      await refreshFiles();
    } catch (err: any) {
      addLog('error', `Échec du renommage : ${err}`);
    }
  };

  const handleCopyRelativePath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopyFeedback(`Chemin copié : ${path}`);
    setTimeout(() => setCopyFeedback(null), 2000);
    setContextMenu(null);
  };

  const handleAddToChatContext = (path: string) => {
    window.dispatchEvent(new CustomEvent('insert-chat-mention', { detail: path }));
    addLog('info', `Fichier inséré au prompt agent : @${path}`);
    setContextMenu(null);
  };

  const handleOpenSplit = (path: string) => {
    openFileInSplit(path);
    setContextMenu(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = itemName.trim();
    if (!trimmed) return;

    const targetPath = createParentPath ? `${createParentPath}/${trimmed}` : trimmed;

    try {
      if (createMode === 'file') {
        await api.writeFile(targetPath, '');
        addLog('info', `Fichier créé avec succès : ${targetPath}`);
        setCreateMode(null);
        setItemName('');
        setCreateParentPath('');
        await refreshFiles();
        openFile(targetPath, '');
      } else if (createMode === 'folder') {
        await api.createDir(targetPath);
        addLog('info', `Dossier créé avec succès : ${targetPath}`);
        setCreateMode(null);
        setItemName('');
        setCreateParentPath('');
        await refreshFiles();
      }
    } catch (err: any) {
      addLog('error', `Erreur création ${createMode} : ${err}`);
    }
  };

  const cancelCreate = () => {
    setCreateMode(null);
    setItemName('');
    setCreateParentPath('');
  };

  const getFileIcon = (node: FileNode) => {
    if (node.is_dir) {
      return expandedFolders[node.path] ? (
        <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      ) : (
        <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      );
    }

    const ext = node.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'rs':
      case 'py':
      case 'c':
      case 'cpp':
        return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      case 'md':
      case 'txt':
      case 'json':
        return <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      default:
        return <File className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
    }
  };

  // Déterminer si un fichier ou sous-dossier se trouve à l'intérieur d'un dossier replié
  const isInsideCollapsedFolder = (path: string): boolean => {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join('/');
      if (!expandedFolders[parentPath]) {
        return true;
      }
    }
    return false;
  };

  // Filtrage instantané (Item 3) et masquage réel des enfants de dossiers repliés dans le DOM
  const filteredFiles = files.filter((node) => {
    if (searchQuery.trim()) {
      return (
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.path.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return !isInsideCollapsedFolder(node.path);
  });

  return (
    <div
      className="flex flex-col h-full bg-[#090b10] border-r border-[#1c2234] select-none text-xs text-gray-300"
      onClick={() => setContextMenu(null)}
    >
      {/* Entête Explorateur */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1c2234] bg-[#0e111a]">
        <span className="font-semibold tracking-wider text-gray-400 text-[11px] uppercase truncate">
          EXPLORATEUR
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setCreateMode('file');
              setCreateParentPath('');
              setItemName('');
            }}
            className="p-1 hover:bg-[#1a2030] rounded-lg text-gray-400 hover:text-white transition"
            title="Nouveau fichier à la racine"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setCreateMode('folder');
              setCreateParentPath('');
              setItemName('');
            }}
            className="p-1 hover:bg-[#1a2030] rounded-lg text-gray-400 hover:text-white transition"
            title="Nouveau dossier à la racine"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refreshFiles}
            className="p-1 hover:bg-[#1a2030] rounded-lg text-gray-400 hover:text-white transition"
            title="Rafraîchir les fichiers"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Barre de recherche instantanée (Item 3) */}
      <div className="px-2.5 py-1.5 border-b border-[#1c2234] bg-[#0c0f16]">
        <div className="relative flex items-center">
          <Search className="w-3 h-3 text-gray-500 absolute left-2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer les fichiers..."
            className="w-full pl-7 pr-6 py-1 bg-[#121622] border border-[#1f2638] rounded-lg text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-gray-500 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Formulaire de création inline */}
      {createMode && (
        <form onSubmit={handleCreateSubmit} className="p-2 border-b border-[#1c2234] bg-[#121622] flex items-center gap-1.5">
          <input
            type="text"
            autoFocus
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelCreate();
            }}
            placeholder={
              createMode === 'file'
                ? createParentPath ? `fichier dans ${createParentPath}/...` : 'nouveau-fichier.ext'
                : createParentPath ? `dossier dans ${createParentPath}/...` : 'nouveau-dossier'
            }
            className="flex-1 px-2 py-1 bg-[#090b10] border border-indigo-500 rounded-lg text-xs text-white focus:outline-none placeholder-gray-500"
          />
          <button
            type="submit"
            className="p-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shrink-0"
            title="Confirmer la création"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={cancelCreate}
            className="p-1 rounded-lg hover:bg-[#1a2030] text-gray-400 hover:text-white transition shrink-0"
            title="Annuler"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Arborescence des fichiers */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, node: null });
          }
        }}
      >
        {filteredFiles.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-xs">
            {searchQuery ? 'Aucun fichier ne correspond au filtre.' : 'Aucun fichier dans le workspace.'}
          </div>
        ) : (
          filteredFiles.map((node) => {
            const isSelected = activeTab === node.path;
            const depth = node.path.split('/').length - 1;
            return (
              <div
                key={node.path}
                onClick={() => handleFileClick(node)}
                onContextMenu={(e) => handleContextMenu(e, node)}
                style={{ paddingLeft: `${12 + depth * 12}px` }}
                className={`flex items-center justify-between pr-3 py-1.5 cursor-pointer transition ${
                  isSelected
                    ? 'bg-indigo-600/20 text-white font-medium border-l-2 border-indigo-500'
                    : 'hover:bg-[#121622] hover:text-gray-100'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {node.is_dir && (
                    <span className="text-gray-500">
                      {expandedFolders[node.path] ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </span>
                  )}
                  {getFileIcon(node)}
                  <span className="truncate font-mono text-[11px]">{node.name}</span>
                </div>

                {/* Badge IA si modifié */}
                {node.isModifiedByAi && (
                  <span
                    className="flex items-center gap-0.5 px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-mono border border-purple-500/30 shrink-0"
                    title="Modifié par Singular Code"
                  >
                    <Bot className="w-2.5 h-2.5" /> Singular
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Notification Toast de Copie */}
      {copyFeedback && (
        <div className="fixed bottom-10 left-16 z-50 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-600/90 text-white text-xs font-mono shadow-2xl backdrop-blur border border-emerald-400/40 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{copyFeedback}</span>
        </div>
      )}

      {/* Modal / Dialog de Renommage */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="w-full max-w-sm rounded-2xl bg-[#121622] border border-[#23293d] p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#23293d] pb-2">
              <span className="font-semibold text-white text-xs">
                Renommer {renameTarget.is_dir ? 'le dossier' : 'le fichier'}
              </span>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-mono">
                Chemin : {renameTarget.path}
              </label>
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#090b10] border border-cyan-500 rounded-xl text-xs text-white focus:outline-none font-mono"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="px-3 py-1.5 rounded-lg hover:bg-[#1a2032] text-gray-400 hover:text-white text-xs transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!renameValue.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition shadow"
              >
                Renommer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Menu contextuel clic droit complet (Item 5) */}
      {contextMenu && (
        <div
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 260), left: contextMenu.x }}
          className="fixed z-50 bg-[#121622] border border-[#21283c] rounded-xl shadow-2xl p-1 w-52 text-xs select-none backdrop-blur animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node ? (
            <>
              <div className="px-2.5 py-1 text-[10px] text-gray-400 font-mono border-b border-[#21283c] truncate">
                {contextMenu.node.name}
              </div>

              {/* Si c'est un fichier */}
              {!contextMenu.node.is_dir && (
                <>
                  <button
                    onClick={() => {
                      if (contextMenu.node) {
                        openFile(contextMenu.node.path);
                        setContextMenu(null);
                      }
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
                  >
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" /> Ouvrir dans l'éditeur
                  </button>
                  <button
                    onClick={() => contextMenu.node && handleOpenSplit(contextMenu.node.path)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
                  >
                    <Columns className="w-3.5 h-3.5 text-indigo-400" /> Ouvrir à droite (Split)
                  </button>
                  <button
                    onClick={() => contextMenu.node && handleAddToChatContext(contextMenu.node.path)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-purple-300 font-medium"
                  >
                    <AtSign className="w-3.5 h-3.5 text-purple-400" /> Ajouter au Chat (@file)
                  </button>
                  <div className="my-1 border-t border-[#1c2234]" />
                </>
              )}

              {/* Si c'est un dossier */}
              {contextMenu.node.is_dir && (
                <>
                  <button
                    onClick={() => {
                      setCreateMode('file');
                      setCreateParentPath(contextMenu.node!.path);
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" /> Nouveau fichier ici
                  </button>
                  <button
                    onClick={() => {
                      setCreateMode('folder');
                      setCreateParentPath(contextMenu.node!.path);
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-indigo-400" /> Nouveau dossier ici
                  </button>
                  <div className="my-1 border-t border-[#1c2234]" />
                </>
              )}

              {/* Actions communes fichier / dossier */}
              <button
                onClick={() => contextMenu.node && handleCopyRelativePath(contextMenu.node.path)}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
              >
                <Copy className="w-3.5 h-3.5 text-amber-400" /> Copier chemin relatif
              </button>

              <button
                onClick={() => contextMenu.node && handleStartRename(contextMenu.node)}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
              >
                <Edit3 className="w-3.5 h-3.5 text-sky-400" /> Renommer...
              </button>

              <div className="my-1 border-t border-[#1c2234]" />

              <button
                onClick={() => contextMenu.node && handleDelete(contextMenu.node)}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-rose-600 hover:text-white rounded-lg text-left text-rose-400 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Supprimer définitivement
              </button>
            </>
          ) : (
            <>
              <div className="px-2.5 py-1 text-[10px] text-gray-400 font-mono border-b border-[#21283c]">
                Espace de Travail Racine
              </div>
              <button
                onClick={() => {
                  setCreateMode('file');
                  setCreateParentPath('');
                  setContextMenu(null);
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" /> Nouveau fichier à la racine
              </button>
              <button
                onClick={() => {
                  setCreateMode('folder');
                  setCreateParentPath('');
                  setContextMenu(null);
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
              >
                <FolderPlus className="w-3.5 h-3.5 text-indigo-400" /> Nouveau dossier à la racine
              </button>
              <button
                onClick={() => {
                  refreshFiles();
                  setContextMenu(null);
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#1c2234] hover:text-white rounded-lg text-left text-gray-200"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" /> Rafraîchir les fichiers
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
