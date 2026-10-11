import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/ipc';
import { Shield, X, RefreshCw, CheckCircle2, AlertCircle, FileCode, Terminal } from 'lucide-react';

export const AuditLogModal: React.FC = () => {
  const { isAuditModalOpen, setAuditModalOpen } = useAppStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs(150);
      setLogs(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuditModalOpen) {
      fetchLogs();
    }
  }, [isAuditModalOpen]);

  if (!isAuditModalOpen) return null;

  const filtered = logs.filter((item) => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl h-[75vh] flex flex-col rounded-2xl bg-[#0e111a] border border-[#21283b] shadow-2xl text-xs overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21283b] bg-[#131722]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Journal d'Audit Immuable</h2>
              <p className="text-[11px] text-gray-400">
                Traçabilité complète des actions de l'agent et du bac à sable (.local_agent/audit.jsonl)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c2234] hover:bg-[#252d45] text-gray-300 hover:text-white transition"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <button
              onClick={() => setAuditModalOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#1c2234] bg-[#10141f]">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Filtrer par statut :</span>
            {(['all', 'success', 'error'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  filter === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#181d2c] text-gray-400 hover:text-gray-200'
                }`}
              >
                {mode === 'all' ? `Tous (${logs.length})` : mode === 'success' ? 'Succès' : 'Erreurs / Bloqués'}
              </button>
            ))}
          </div>
          <span className="text-gray-500 text-[11px]">Dernières 150 entrées enregistrées</span>
        </div>

        {/* Tableau */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <Shield className="w-8 h-8 mb-2 opacity-30" />
              <span>Aucune entrée dans le journal d'audit pour le moment.</span>
            </div>
          ) : (
            filtered.map((item, index) => (
              <div
                key={index}
                className="flex items-start justify-between p-3 rounded-xl bg-[#141824] border border-[#1f2639] hover:border-indigo-500/30 transition text-[11px]"
              >
                <div className="flex items-start gap-3">
                  {item.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-sans font-semibold text-[10px] uppercase">
                        {item.actor}
                      </span>
                      <span className="text-gray-200 font-semibold">{item.target}</span>
                      <span className="text-gray-500 text-[10px] font-sans">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {item.details && (
                      <pre className="text-gray-400 text-[10px] bg-[#0c0e16] p-1.5 rounded max-w-2xl overflow-x-auto">
                        {typeof item.details === 'object' ? JSON.stringify(item.details) : item.details}
                      </pre>
                    )}
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] uppercase font-sans font-medium ${
                    item.status === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
