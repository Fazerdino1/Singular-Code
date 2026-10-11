import React, { useState } from 'react';
import { useAppStore, PluginItem } from '../store/useAppStore';
import {
  X, Blocks, Search, Check, Power, Download, Trash2, Zap, Gamepad2,
  ShieldCheck, Database, Layers, GitBranch, Palette, Cpu, Code2, Lock,
  ExternalLink, Sparkles, Filter, FileText, FileSpreadsheet, Presentation
} from 'lucide-react';

export const PluginsModal: React.FC = () => {
  const {
    plugins,
    isPluginsModalOpen,
    setPluginsModalOpen,
    togglePlugin,
    installPlugin,
    uninstallPlugin,
    addLog,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!isPluginsModalOpen) return null;

  const categories = [
    { id: 'all', label: 'Tous les Plugins' },
    { id: 'office', label: 'Bureautique & LibreOffice' },
    { id: 'llm', label: 'LLM & Inférence' },
    { id: 'devtools', label: 'DevTools & Linter' },
    { id: 'security', label: 'Sécurité & Sandbox' },
    { id: 'gamedev', label: 'GameDev & Godot' },
    { id: 'database', label: 'Bases de Données' },
    { id: 'ui', label: 'UI & Design' },
  ];

  const getPluginIcon = (iconName: string) => {
    switch (iconName) {
      case 'FileText':
        return <FileText className="w-5 h-5 text-blue-400" />;
      case 'FileSpreadsheet':
        return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
      case 'Presentation':
        return <Presentation className="w-5 h-5 text-amber-400" />;
      case 'Zap':
        return <Zap className="w-5 h-5 text-amber-400" />;
      case 'Gamepad2':
        return <Gamepad2 className="w-5 h-5 text-rose-400" />;
      case 'ShieldCheck':
        return <ShieldCheck className="w-5 h-5 text-emerald-400" />;
      case 'Database':
        return <Database className="w-5 h-5 text-cyan-400" />;
      case 'Layers':
        return <Layers className="w-5 h-5 text-sky-400" />;
      case 'GitBranch':
        return <GitBranch className="w-5 h-5 text-indigo-400" />;
      case 'Palette':
        return <Palette className="w-5 h-5 text-purple-400" />;
      case 'Cpu':
        return <Cpu className="w-5 h-5 text-amber-300" />;
      case 'Code2':
        return <Code2 className="w-5 h-5 text-blue-400" />;
      case 'Lock':
        return <Lock className="w-5 h-5 text-red-400" />;
      default:
        return <Blocks className="w-5 h-5 text-indigo-400" />;
    }
  };

  const filteredPlugins = plugins.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const activeCount = plugins.filter((p) => p.installed && p.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="bg-[#12141c] border border-[#272b3c] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] max-w-4xl w-full h-[620px] flex flex-col overflow-hidden text-gray-200 ring-1 ring-white/5">
        
        {/* Entête */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#171a25] border-b border-[#24293a]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Blocks className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Gestionnaire de Plugins Singular Code</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {activeCount} / {plugins.length} Actifs
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Étendez les capacités de l'agent avec des modules d'inférence, outillages spécialisés et intégrations
              </p>
            </div>
          </div>
          <button
            onClick={() => setPluginsModalOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[#252a3a] text-gray-400 hover:text-white transition"
            title="Fermer (Échap)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barre de Recherche et Catégories */}
        <div className="px-6 py-3 bg-[#141620] border-b border-[#222636] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Champ de recherche */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un plugin, un tag ou un auteur..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#0f1118] border border-[#272b3c] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Filtres de Catégories */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-[#181a24] text-gray-400 hover:text-gray-200 hover:bg-[#202434]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grille des Plugins */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#12141c]">
          {filteredPlugins.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-gray-500">
              <Blocks className="w-12 h-12 stroke-[1.2] opacity-40" />
              <p className="text-sm font-medium text-gray-400">Aucun plugin trouvé</p>
              <p className="text-xs">Essayez un autre terme de recherche ou changez de catégorie.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPlugins.map((plugin) => {
                const isInstalled = plugin.installed;
                const isEnabled = plugin.enabled && isInstalled;

                return (
                  <div
                    key={plugin.id}
                    className={`flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 ${
                      isEnabled
                        ? 'bg-[#161925] border-indigo-500/30 shadow-md shadow-indigo-950/20'
                        : isInstalled
                        ? 'bg-[#141620] border-[#25293a]'
                        : 'bg-[#11131a] border-[#1e2230] opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div>
                      {/* Haut de la carte : Icône, Nom, Version & Switch */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2.5 rounded-xl bg-[#1d2130] border border-[#2b3145] shrink-0">
                            {getPluginIcon(plugin.icon)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-bold text-white text-xs truncate" title={plugin.name}>
                                {plugin.name}
                              </h3>
                              <span className="text-[10px] font-mono text-indigo-300 px-1.5 py-0.2 rounded bg-indigo-950/60 border border-indigo-800/40">
                                v{plugin.version}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400 block mt-0.5">
                              par {plugin.author}
                            </span>
                          </div>
                        </div>

                        {/* Switch d'activation si installé */}
                        {isInstalled ? (
                          <button
                            type="button"
                            onClick={() => {
                              togglePlugin(plugin.id);
                              addLog('info', `Plugin ${plugin.name} : ${!plugin.enabled ? 'Activé' : 'Désactivé'}`);
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                              isEnabled
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-[#202434] text-gray-400 hover:text-white'
                            }`}
                            title={isEnabled ? "Désactiver ce plugin" : "Activer ce plugin"}
                          >
                            <Power className={`w-3 h-3 ${isEnabled ? 'text-emerald-400' : 'text-gray-500'}`} />
                            <span>{isEnabled ? 'ON' : 'OFF'}</span>
                          </button>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#1a1d28] text-gray-400 border border-[#272b3c]">
                            Disponible
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-[11px] text-gray-300 leading-relaxed mb-3">
                        {plugin.description}
                      </p>
                    </div>

                    {/* Bas de la carte : Tags & Bouton Install/Uninstall */}
                    <div className="pt-2 border-t border-[#202434] flex items-center justify-between gap-2">
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1">
                        {plugin.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#1a1e2b] text-gray-400 border border-[#262c3e]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>

                      {/* Action Installation / Désinstallation */}
                      <div>
                        {isInstalled ? (
                          <button
                            onClick={() => {
                              uninstallPlugin(plugin.id);
                              addLog('info', `Plugin ${plugin.name} désinstallé.`);
                            }}
                            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-rose-400 transition"
                            title="Désinstaller ce plugin"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Désinstaller</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              installPlugin(plugin.id);
                              addLog('info', `Plugin ${plugin.name} installé et activé avec succès.`);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] transition shadow"
                          >
                            <Download className="w-3 h-3" />
                            <span>Installer</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pied de page informatif */}
        <div className="px-6 py-3 bg-[#141620] border-t border-[#222636] flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-1.5 text-indigo-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Écosystème modulaire 100% autonome et sécurisé</span>
          </div>
          <span className="text-gray-500 text-[10px]">
            Confinement LSM Bubblewrap actif sur tous les plugins
          </span>
        </div>

      </div>
    </div>
  );
};
