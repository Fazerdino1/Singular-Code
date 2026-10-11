import React, { useState } from 'react';
import { useAppStore, FileSearchResult, SearchMatchItem } from '../store/useAppStore';
import {
  Search,
  Replace,
  CaseSensitive,
  WholeWord,
  Regex,
  ChevronDown,
  ChevronRight,
  FileCode,
  Check,
  RefreshCw,
  X,
  FileText
} from 'lucide-react';

export const GlobalSearch: React.FC = () => {
  const {
    searchQuery,
    replaceQuery,
    searchCaseSensitive,
    searchWholeWord,
    searchRegex,
    searchResults,
    isSearching,
    setSearchQuery,
    setReplaceQuery,
    setSearchCaseSensitive,
    setSearchWholeWord,
    setSearchRegex,
    runGlobalSearch,
    runGlobalReplace,
    openFile,
  } = useAppStore();

  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [showReplace, setShowReplace] = useState(true);

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [path]: prev[path] === undefined ? false : !prev[path],
    }));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runGlobalSearch();
  };

  const totalMatches = searchResults.reduce((acc, r) => acc + r.matches.length, 0);

  return (
    <div className="flex flex-col h-full bg-[#090b10] border-r border-[#1c2234] select-none text-xs text-gray-300">
      {/* En-tête */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1c2234] bg-[#0e111a]">
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold tracking-wider text-gray-400 text-[11px] uppercase">
            RECHERCHE & REMPLACEMENT
          </span>
        </div>
        <button
          onClick={() => setShowReplace(!showReplace)}
          className={`p-1 rounded-lg transition ${
            showReplace ? 'bg-indigo-600/30 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-[#1a2030]'
          }`}
          title="Basculer le panneau de remplacement"
        >
          <Replace className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Formulaire de recherche */}
      <form onSubmit={handleSearchSubmit} className="p-2.5 border-b border-[#1c2234] bg-[#0c0f16] space-y-2">
        {/* Barre de Recherche */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runGlobalSearch();
              }
            }}
            placeholder="Rechercher dans tout le projet (Ctrl+Shift+F)..."
            className="w-full pl-2.5 pr-20 py-1.5 bg-[#121622] border border-[#1f2638] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition"
          />
          <div className="absolute right-1 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setSearchCaseSensitive(!searchCaseSensitive)}
              className={`p-1 rounded transition text-[10px] font-mono ${
                searchCaseSensitive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-500 hover:text-gray-300'
              }`}
              title="Sensibilité à la casse (Aa)"
            >
              <CaseSensitive className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setSearchWholeWord(!searchWholeWord)}
              className={`p-1 rounded transition text-[10px] font-mono ${
                searchWholeWord ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-500 hover:text-gray-300'
              }`}
              title="Mot entier uniquement (\b)"
            >
              <WholeWord className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setSearchRegex(!searchRegex)}
              className={`p-1 rounded transition text-[10px] font-mono ${
                searchRegex ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-500 hover:text-gray-300'
              }`}
              title="Expression Régulière (.*)"
            >
              <Regex className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Barre de Remplacement */}
        {showReplace && (
          <div className="space-y-1.5 animate-fadeIn">
            <div className="relative flex items-center">
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Remplacer par..."
                className="w-full pl-2.5 pr-8 py-1.5 bg-[#121622] border border-[#1f2638] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {replaceQuery && (
                <button
                  type="button"
                  onClick={() => setReplaceQuery('')}
                  className="absolute right-2 text-gray-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => runGlobalReplace(true)}
                disabled={!searchQuery.trim() || totalMatches === 0}
                className="flex-1 py-1 px-2 bg-indigo-600/30 hover:bg-indigo-600 disabled:opacity-40 text-indigo-200 hover:text-white rounded-lg transition font-medium text-[11px] border border-indigo-500/30 flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Check className="w-3 h-3" /> Remplacer tout ({totalMatches})
              </button>
              <button
                type="submit"
                disabled={isSearching}
                className="py-1 px-3 bg-cyan-600/30 hover:bg-cyan-600 disabled:opacity-40 text-cyan-200 hover:text-white rounded-lg transition font-medium text-[11px] border border-cyan-500/30 flex items-center gap-1 shadow-sm"
              >
                <RefreshCw className={`w-3 h-3 ${isSearching ? 'animate-spin' : ''}`} />
                Chercher
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Résumé des résultats */}
      <div className="px-3 py-1.5 bg-[#0e111a] border-b border-[#1c2234] text-[10px] text-gray-400 flex items-center justify-between">
        <span>
          {isSearching
            ? 'Recherche en cours...'
            : `${totalMatches} résultat${totalMatches > 1 ? 's' : ''} dans ${searchResults.length} fichier${
                searchResults.length > 1 ? 's' : ''
              }`}
        </span>
        {totalMatches > 0 && (
          <button
            onClick={() => {
              const allExpanded: Record<string, boolean> = {};
              searchResults.forEach((r) => (allExpanded[r.filePath] = true));
              setExpandedFiles(allExpanded);
            }}
            className="text-cyan-400 hover:text-cyan-300"
          >
            Déplier tout
          </button>
        )}
      </div>

      {/* Liste des résultats */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {searchResults.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-xs">
            {searchQuery
              ? 'Aucune correspondance trouvée dans le projet.'
              : 'Saisissez un terme ou une regex pour lancer la recherche.'}
          </div>
        ) : (
          searchResults.map((fileRes: FileSearchResult) => {
            const fileName = fileRes.filePath.split('/').pop() || fileRes.filePath;
            const isExpanded = expandedFiles[fileRes.filePath] !== false;

            return (
              <div
                key={fileRes.filePath}
                className="rounded-xl border border-[#1a2032] bg-[#0d1018] overflow-hidden"
              >
                {/* Entête Fichier */}
                <div
                  onClick={() => toggleFile(fileRes.filePath)}
                  className="flex items-center justify-between px-2.5 py-1.5 bg-[#121622] hover:bg-[#161b2b] cursor-pointer transition text-xs font-mono"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                    )}
                    <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="font-semibold text-gray-200 truncate">{fileName}</span>
                    <span className="text-[10px] text-gray-500 truncate max-w-[120px]">
                      {fileRes.filePath}
                    </span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] shrink-0 border border-cyan-500/30">
                    {fileRes.matches.length}
                  </span>
                </div>

                {/* Liste des occurrences */}
                {isExpanded && (
                  <div className="divide-y divide-[#171c2b] bg-[#090b10]">
                    {fileRes.matches.map((m: SearchMatchItem, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => openFile(fileRes.filePath)}
                        className="group flex items-start gap-2 px-3 py-1.5 hover:bg-[#131828] cursor-pointer transition text-[11px] font-mono"
                        title={`Ligne ${m.lineNumber}: ${m.lineContent}`}
                      >
                        <span className="text-gray-500 shrink-0 text-[10px] w-6 text-right">
                          {m.lineNumber}
                        </span>
                        <div className="flex-1 truncate text-gray-300">
                          <span>{m.lineContent.slice(0, m.startIndex)}</span>
                          <span className="bg-amber-400/30 text-amber-200 font-bold px-0.5 rounded">
                            {m.lineContent.slice(m.startIndex, m.startIndex + m.matchLength)}
                          </span>
                          <span>{m.lineContent.slice(m.startIndex + m.matchLength)}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            runGlobalReplace(false, fileRes.filePath, idx);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-indigo-600 rounded text-gray-400 hover:text-white transition shrink-0"
                          title="Remplacer cette occurrence"
                        >
                          <Replace className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
