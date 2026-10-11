import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Database,
  Table,
  Columns,
  Play,
  Search,
  Download,
  X,
  RefreshCw,
  FolderOpen,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Key,
  ShieldAlert,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { SqliteTableDesc, SqliteColumnDesc } from '../lib/ipc';

export const DatabaseViewerModal: React.FC = () => {
  const {
    isDbModalOpen,
    setDbModalOpen,
    activeDbPath,
    dbTables,
    selectedDbTable,
    dbQueryResults,
    loadDatabase,
    selectDbTable,
    runDbQuery,
    files,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'data' | 'schema' | 'sql'>('data');
  const [customSql, setCustomSql] = useState('SELECT * FROM users LIMIT 50;');
  const [tableSearch, setTableSearch] = useState('');
  const [dataSearch, setDataSearch] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [schemaSortKey, setSchemaSortKey] = useState<keyof SqliteColumnDesc | null>(null);
  const [schemaSortDir, setSchemaSortDir] = useState<'asc' | 'desc'>('asc');

  // Trouver tous les fichiers SQLite dans le workspace
  const dbFiles = files.filter(
    (f) =>
      !f.is_dir &&
      (f.name.endsWith('.sqlite') ||
        f.name.endsWith('.sqlite3') ||
        f.name.endsWith('.db') ||
        f.name.endsWith('.sqlitedb'))
  );

  useEffect(() => {
    if (isDbModalOpen) {
      if (!activeDbPath && dbFiles.length > 0) {
        loadDatabase(dbFiles[0].path);
      } else if (!activeDbPath) {
        // Définir un chemin simulé / démo
        loadDatabase('database.sqlite');
      }
    }
  }, [isDbModalOpen]);

  useEffect(() => {
    if (selectedDbTable) {
      setCustomSql(`SELECT * FROM "${selectedDbTable}" LIMIT 50;`);
      setSortColumn(null);
    }
  }, [selectedDbTable]);

  if (!isDbModalOpen) return null;

  const currentTableDesc = dbTables.find((t) => t.table === selectedDbTable);

  const filteredTables = dbTables.filter((t) =>
    t.table.toLowerCase().includes(tableSearch.toLowerCase())
  );

  // Filtrage des lignes pour la recherche
  const rows = dbQueryResults?.rows || [];
  const columns = dbQueryResults?.columns || [];

  const filteredRows = rows.filter((row) => {
    if (!dataSearch.trim()) return true;
    return row.some((cell) =>
      String(cell).toLowerCase().includes(dataSearch.toLowerCase())
    );
  });

  const handleSort = (colName: string) => {
    if (sortColumn === colName) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(colName);
      setSortDirection('asc');
    }
  };

  const handleSchemaSort = (key: keyof SqliteColumnDesc) => {
    if (schemaSortKey === key) {
      if (schemaSortDir === 'asc') {
        setSchemaSortDir('desc');
      } else {
        setSchemaSortKey(null);
        setSchemaSortDir('asc');
      }
    } else {
      setSchemaSortKey(key);
      setSchemaSortDir('asc');
    }
  };

  const sortRowList = (sourceRows: any[][]) => {
    if (!sortColumn) return sourceRows;
    const colIdx = columns.indexOf(sortColumn);
    if (colIdx === -1) return sourceRows;

    return [...sourceRows].sort((a, b) => {
      const valA = a[colIdx];
      const valB = b[colIdx];

      // Cleanly sort NULL / undefined to bottom
      if (valA === null || valA === undefined) {
        if (valB === null || valB === undefined) return 0;
        return 1;
      }
      if (valB === null || valB === undefined) return -1;

      let cmp = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        cmp = valA - valB;
      } else if (typeof valA === 'boolean' && typeof valB === 'boolean') {
        cmp = (valA ? 1 : 0) - (valB ? 1 : 0);
      } else {
        cmp = String(valA).localeCompare(String(valB), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  };

  const sortedFilteredRows = sortRowList(filteredRows);
  const sortedSqlRows = sortRowList(rows);

  const sortedSchemaColumns = React.useMemo(() => {
    const cols = currentTableDesc?.columns || [];
    if (!schemaSortKey) return cols;
    return [...cols].sort((a, b) => {
      const valA = a[schemaSortKey];
      const valB = b[schemaSortKey];
      let cmp = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        cmp = valA - valB;
      } else if (typeof valA === 'boolean' && typeof valB === 'boolean') {
        cmp = (valA ? 1 : 0) - (valB ? 1 : 0);
      } else {
        cmp = String(valA).localeCompare(String(valB));
      }
      return schemaSortDir === 'asc' ? cmp : -cmp;
    });
  }, [currentTableDesc?.columns, schemaSortKey, schemaSortDir]);

  const renderCellValue = (cell: any) => {
    if (cell === null || cell === undefined) {
      return (
        <span className="px-1.5 py-0.5 rounded bg-[#161a28] text-gray-500 font-mono text-[10px] italic border border-[#21283c] select-none">
          NULL
        </span>
      );
    }
    if (typeof cell === 'boolean') {
      return (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
            cell
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
          }`}
        >
          {cell ? 'TRUE' : 'FALSE'}
        </span>
      );
    }
    return <span>{String(cell)}</span>;
  };

  const handleExportCsv = () => {
    if (columns.length === 0 || rows.length === 0) return;
    const header = columns.join(',');
    const csvRows = rows.map((r) =>
      r
        .map((c) =>
          c === null || c === undefined ? '' : `"${String(c).replace(/"/g, '""')}"`
        )
        .join(',')
    );
    const content = [header, ...csvRows].join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDbTable || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    if (columns.length === 0 || rows.length === 0) return;
    const data = rows.map((r) => {
      const obj: Record<string, any> = {};
      columns.forEach((c, idx) => {
        obj[c] = r[idx];
      });
      return obj;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDbTable || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-5xl h-[82vh] flex flex-col rounded-2xl bg-[#0c0e15] border border-[#21283c] shadow-2xl text-xs overflow-hidden">
        {/* Entête */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#21283c] bg-[#101420]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">
                  Inspecteur de Base de Données SQLite
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] border border-cyan-500/30">
                  SQLite 3
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-mono truncate max-w-md">
                {activeDbPath || 'Aucune base sélectionnée'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sélecteur de fichiers de base de données trouvés */}
            {dbFiles.length > 0 && (
              <select
                value={activeDbPath || ''}
                onChange={(e) => loadDatabase(e.target.value)}
                className="px-2.5 py-1 bg-[#161a28] border border-[#262e44] rounded-lg text-gray-200 text-xs font-mono focus:outline-none focus:border-cyan-500"
              >
                {dbFiles.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => activeDbPath && loadDatabase(activeDbPath)}
              className="p-1.5 rounded-lg hover:bg-[#1a2032] text-gray-400 hover:text-white transition"
              title="Rafraîchir les tables et le schéma"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setDbModalOpen(false)}
              className="p-1.5 rounded-lg hover:bg-[#1a2032] text-gray-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corps 2 colonnes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Colonne gauche : Liste des Tables */}
          <div className="w-64 border-r border-[#1c2234] bg-[#090b10] flex flex-col">
            <div className="p-2.5 border-b border-[#1c2234]">
              <div className="relative flex items-center">
                <Search className="w-3 h-3 text-gray-500 absolute left-2 pointer-events-none" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Filtrer les tables..."
                  className="w-full pl-7 pr-2 py-1 bg-[#121622] border border-[#1f2638] rounded-lg text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              <span className="px-2 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">
                Tables & Vues ({filteredTables.length})
              </span>

              {filteredTables.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-xs">
                  Aucune table trouvée.
                </div>
              ) : (
                filteredTables.map((t) => {
                  const isSelected = selectedDbTable === t.table;
                  return (
                    <div
                      key={t.table}
                      onClick={() => selectDbTable(t.table)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer transition ${
                        isSelected
                          ? 'bg-cyan-600/20 text-cyan-300 font-medium border border-cyan-500/30'
                          : 'hover:bg-[#141824] text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Table className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="font-mono text-xs truncate">
                          {t.table}
                        </span>
                      </div>
                      <span className="px-1.5 py-0.2 rounded-full bg-[#181d2a] text-gray-400 text-[10px] font-mono shrink-0">
                        {t.row_count}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Colonne droite : Onglets & Contenu */}
          <div className="flex-1 flex flex-col bg-[#0e111a] overflow-hidden">
            {/* Barre d'onglets */}
            <div className="flex items-center justify-between px-4 border-b border-[#1c2234] bg-[#121624]">
              <div className="flex items-center gap-1 py-1.5">
                <button
                  onClick={() => setActiveTab('data')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition font-medium text-xs ${
                    activeTab === 'data'
                      ? 'bg-cyan-600 text-white shadow'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#181e30]'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" /> Données de la table
                </button>
                <button
                  onClick={() => setActiveTab('schema')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition font-medium text-xs ${
                    activeTab === 'schema'
                      ? 'bg-cyan-600 text-white shadow'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#181e30]'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" /> Structure & Schéma
                </button>
                <button
                  onClick={() => setActiveTab('sql')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition font-medium text-xs ${
                    activeTab === 'sql'
                      ? 'bg-cyan-600 text-white shadow'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#181e30]'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" /> Console SQL
                </button>
              </div>

              {activeTab === 'data' && (
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-gray-500 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={dataSearch}
                      onChange={(e) => setDataSearch(e.target.value)}
                      placeholder="Filtrer les lignes..."
                      className="pl-7 pr-2 py-0.5 bg-[#181e30] border border-[#252f48] rounded-md text-[11px] text-gray-200 focus:outline-none focus:border-cyan-500 w-36"
                    />
                  </div>
                  <button
                    onClick={handleExportCsv}
                    className="p-1 hover:bg-[#181e30] rounded-lg text-gray-400 hover:text-white transition"
                    title="Exporter en CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Vue Données Table */}
            {activeTab === 'data' && (
              <div className="flex-1 overflow-auto p-3">
                {columns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <Table className="w-8 h-8 text-gray-600 mb-2" />
                    <span>Sélectionnez une table à gauche pour afficher ses données.</span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#1f2638] overflow-hidden bg-[#0a0c12]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#141824] border-b border-[#1f2638] text-[11px] text-gray-300 font-mono">
                          {columns.map((col) => (
                            <th
                              key={col}
                              onClick={() => handleSort(col)}
                              className="px-3 py-2 font-semibold cursor-pointer select-none hover:bg-[#1a2032] hover:text-white transition group"
                              title={`Trier par ${col}`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span>{col}</span>
                                {sortColumn === col ? (
                                  sortDirection === 'asc' ? (
                                    <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3 text-cyan-400 shrink-0" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition" />
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#171c2b] text-[11px] font-mono">
                        {sortedFilteredRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={columns.length}
                              className="px-3 py-6 text-center text-gray-500"
                            >
                              Aucun enregistrement ne correspond.
                            </td>
                          </tr>
                        ) : (
                          sortedFilteredRows.map((r, rowIdx) => (
                            <tr
                              key={rowIdx}
                              className="hover:bg-[#121624] transition text-gray-300"
                            >
                              {r.map((cell, colIdx) => (
                                <td
                                  key={colIdx}
                                  className="px-3 py-1.5 truncate max-w-xs"
                                >
                                  {renderCellValue(cell)}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Vue Schéma & Structure */}
            {activeTab === 'schema' && (
              <div className="flex-1 overflow-auto p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200 font-mono">
                    Table : {selectedDbTable}
                  </h3>
                  <span className="text-gray-400 text-xs font-mono">
                    {currentTableDesc?.columns.length || 0} colonnes
                  </span>
                </div>

                <div className="rounded-xl border border-[#1f2638] overflow-hidden bg-[#0a0c12]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#141824] border-b border-[#1f2638] text-[11px] text-gray-300 font-mono">
                        <th
                          onClick={() => handleSchemaSort('cid')}
                          className="px-3 py-2 font-semibold cursor-pointer select-none hover:bg-[#1a2032] hover:text-white transition group"
                          title="Trier par #"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>#</span>
                            {schemaSortKey === 'cid' ? (
                              schemaSortDir === 'asc' ? (
                                <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-cyan-400 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSchemaSort('name')}
                          className="px-3 py-2 font-semibold cursor-pointer select-none hover:bg-[#1a2032] hover:text-white transition group"
                          title="Trier par nom"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Nom de la colonne</span>
                            {schemaSortKey === 'name' ? (
                              schemaSortDir === 'asc' ? (
                                <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-cyan-400 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSchemaSort('type')}
                          className="px-3 py-2 font-semibold cursor-pointer select-none hover:bg-[#1a2032] hover:text-white transition group"
                          title="Trier par type"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Type de données</span>
                            {schemaSortKey === 'type' ? (
                              schemaSortDir === 'asc' ? (
                                <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-cyan-400 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSchemaSort('pk')}
                          className="px-3 py-2 font-semibold cursor-pointer select-none hover:bg-[#1a2032] hover:text-white transition group"
                          title="Trier par clé primaire"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Clé Primaire</span>
                            {schemaSortKey === 'pk' ? (
                              schemaSortDir === 'asc' ? (
                                <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-cyan-400 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSchemaSort('notnull')}
                          className="px-3 py-2 font-semibold cursor-pointer select-none hover:bg-[#1a2032] hover:text-white transition group"
                          title="Trier par NOT NULL"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>NOT NULL</span>
                            {schemaSortKey === 'notnull' ? (
                              schemaSortDir === 'asc' ? (
                                <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-cyan-400 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition" />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#171c2b] text-[11px] font-mono">
                      {sortedSchemaColumns.map((col: SqliteColumnDesc) => (
                        <tr
                          key={col.cid}
                          className="hover:bg-[#121624] transition text-gray-300"
                        >
                          <td className="px-3 py-2 text-gray-500">{col.cid}</td>
                          <td className="px-3 py-2 font-semibold text-white">
                            {col.name}
                          </td>
                          <td className="px-3 py-2 text-cyan-400">
                            {col.type || 'BLOB'}
                          </td>
                          <td className="px-3 py-2">
                            {col.pk ? (
                              <span className="flex items-center gap-1 text-amber-400">
                                <Key className="w-3 h-3" /> PK
                              </span>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {col.notnull ? (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-medium">
                                OUI
                              </span>
                            ) : (
                              <span className="text-gray-500">NON</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Vue Console SQL */}
            {activeTab === 'sql' && (
              <div className="flex-1 flex flex-col p-4 space-y-3 overflow-hidden">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="font-semibold text-gray-300">
                      Éditeur de Requête SQL :
                    </span>
                    <span className="text-[11px] font-mono text-gray-500">
                      Ctrl+Enter pour exécuter
                    </span>
                  </div>
                  <div className="relative">
                    <textarea
                      value={customSql}
                      onChange={(e) => setCustomSql(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          runDbQuery(customSql);
                        }
                      }}
                      rows={3}
                      className="w-full p-2.5 bg-[#090b10] border border-[#21283c] rounded-xl text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500 resize-none shadow-inner"
                      placeholder="Tapez votre requête SQL..."
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-gray-500">
                      {dbQueryResults && (
                        <span>
                          Durée : {dbQueryResults.duration_ms}ms | Lignes :{' '}
                          {dbQueryResults.row_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleExportJson}
                        className="px-2.5 py-1 rounded-lg bg-[#181e30] hover:bg-[#202740] text-gray-300 text-xs transition"
                      >
                        Export JSON
                      </button>
                      <button
                        onClick={() => runDbQuery(customSql)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition shadow"
                      >
                        <Play className="w-3.5 h-3.5" /> Exécuter
                      </button>
                    </div>
                  </div>
                </div>

                {/* Résultats de la requête */}
                <div className="flex-1 overflow-auto rounded-xl border border-[#1f2638] bg-[#0a0c12]">
                  {dbQueryResults?.error ? (
                    <div className="p-4 text-rose-400 font-mono text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Erreur SQL : {dbQueryResults.error}</span>
                    </div>
                  ) : columns.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#141824] border-b border-[#1f2638] text-[11px] text-gray-300 font-mono">
                          {columns.map((col) => (
                            <th
                              key={col}
                              onClick={() => handleSort(col)}
                              className="px-3 py-2 font-semibold cursor-pointer select-none hover:bg-[#1a2032] hover:text-white transition group"
                              title={`Trier par ${col}`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span>{col}</span>
                                {sortColumn === col ? (
                                  sortDirection === 'asc' ? (
                                    <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3 text-cyan-400 shrink-0" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition" />
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#171c2b] text-[11px] font-mono">
                        {sortedSqlRows.map((r, rowIdx) => (
                          <tr
                            key={rowIdx}
                            className="hover:bg-[#121624] transition text-gray-300"
                          >
                            {r.map((cell, colIdx) => (
                              <td
                                key={colIdx}
                                className="px-3 py-1.5 truncate max-w-xs"
                              >
                                {renderCellValue(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-center text-gray-500 text-xs">
                      Exécutez une requête pour afficher les données ici.
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
