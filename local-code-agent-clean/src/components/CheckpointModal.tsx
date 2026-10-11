import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/ipc';
import { RotateCcw, X, History, FileText, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { soundManager } from '../lib/sound';

export const CheckpointModal: React.FC = () => {
  const { isCheckpointModalOpen, setCheckpointModalOpen, addLog, setFiles, soundEnabled } = useAppStore();
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCp, setSelectedCp] = useState<any | null>(null);
  const [selectedFileToRestore, setSelectedFileToRestore] = useState('');

  const fetchCheckpoints = async () => {
    setLoading(true);
    try {
      const data = await api.listCheckpoints();
      setCheckpoints(data || []);
      if (data && data.length > 0 && !selectedCp) {
        setSelectedCp(data[data.length - 1]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isCheckpointModalOpen) {
      fetchCheckpoints();
    }
  }, [isCheckpointModalOpen]);

  if (!isCheckpointModalOpen) return null;

  const handleRestoreFull = async (cpId: string) => {
    if (!window.confirm("Confirmer la restauration intégrale de ce snapshot de sécurité ?")) return;
    try {
      await api.restoreCheckpoint(cpId);
      if (soundEnabled) soundManager.playSuccess();
      addLog('info', `Snapshot restauré : ${cpId}`);
      const list = await api.listFiles();
      setFiles(list);
      setCheckpointModalOpen(false);
    } catch (e: any) {
      if (soundEnabled) soundManager.playError();
      addLog('error', `Erreur restauration : ${e}`);
    }
  };

  const handleRestoreSingleFile = async () => {
    if (!selectedCp || !selectedFileToRestore.trim()) return;
    try {
      await api.restoreFileCheckpoint(selectedCp.id, selectedFileToRestore.trim());
      if (soundEnabled) soundManager.playSuccess();
      addLog('info', `Fichier ${selectedFileToRestore} restauré depuis le snapshot ${selectedCp.id}`);
      const list = await api.listFiles();
      setFiles(list);
      setSelectedFileToRestore('');
      alert(`Fichier '${selectedFileToRestore}' restauré avec succès !`);
    } catch (e: any) {
      if (soundEnabled) soundManager.playError();
      addLog('error', `Erreur restauration sélective : ${e}`);
      alert(`Erreur : ${e}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-3xl h-[70vh] flex flex-col rounded-2xl bg-[#0e111a] border border-[#21283b] shadow-2xl text-xs overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21283b] bg-[#131722]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Gestionnaire de Snapshots & Restauration Granulaire</h2>
              <p className="text-[11px] text-gray-400">
                Restaurer l'intégralité du projet ou un fichier spécifique sans écraser le reste
              </p>
            </div>
          </div>

          <button
            onClick={() => setCheckpointModalOpen(false)}
            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrubber Timeline Visuelle (Time Machine - Item 4) */}
        {checkpoints.length > 0 && (
          <div className="px-5 py-3 border-b border-[#21283b] bg-[#0b0e16]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <History className="w-3.5 h-3.5" /> Scrubber Temporel & "Time Machine"
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                Snapshot actif : {selectedCp ? new Date(selectedCp.timestamp).toLocaleTimeString() : ''}
              </span>
            </div>

            {/* Rail de timeline avec nœuds interactifs */}
            <div className="relative flex items-center justify-between w-full h-7 px-2">
              <div className="absolute left-2 right-2 h-1 bg-[#1e2538] rounded-full" />
              {checkpoints.map((cp, idx) => {
                const isSelected = selectedCp?.id === cp.id;
                return (
                  <button
                    key={cp.id}
                    onClick={() => setSelectedCp(cp)}
                    className={`relative z-10 group flex flex-col items-center transition-all ${
                      isSelected ? 'scale-125' : 'hover:scale-110 opacity-70 hover:opacity-100'
                    }`}
                    title={`${cp.description || cp.id} (${new Date(cp.timestamp).toLocaleTimeString()})`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${
                        isSelected
                          ? 'bg-amber-400 border-white shadow-lg shadow-amber-400/50 ring-2 ring-amber-400/40'
                          : 'bg-[#1e2538] border-gray-500 hover:border-amber-400'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-black' : 'bg-gray-400'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Corps 2 colonnes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Liste des checkpoints */}
          <div className="w-1/2 border-r border-[#1c2234] p-3 overflow-y-auto space-y-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
              Snapshots Disponibles ({checkpoints.length})
            </span>

            {checkpoints.length === 0 ? (
              <div className="text-gray-500 py-8 text-center">Aucun checkpoint enregistré.</div>
            ) : (
              checkpoints.map((cp) => {
                const isSelected = selectedCp?.id === cp.id;
                return (
                  <div
                    key={cp.id}
                    onClick={() => setSelectedCp(cp)}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#181e30] border-indigo-500/60 shadow'
                        : 'bg-[#131722] border-[#1f2639] hover:bg-[#161a29]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-200">{cp.description || cp.id}</span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {new Date(cp.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>{cp.files_count || 0} fichiers capturés</span>
                      <span className="text-indigo-400 font-mono text-[10px]">{cp.id}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Action sur le checkpoint sélectionné */}
          <div className="w-1/2 p-4 flex flex-col justify-between overflow-y-auto bg-[#10141f]">
            {selectedCp ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-1">
                    {selectedCp.description || selectedCp.id}
                  </h3>
                  <p className="text-gray-400 text-[11px]">
                    Créé le {new Date(selectedCp.timestamp).toLocaleString()}
                  </p>
                </div>

                {/* Restauration granulaire */}
                <div className="p-3.5 rounded-xl bg-[#141824] border border-[#21283b] space-y-2.5">
                  <div className="flex items-center gap-1.5 font-medium text-amber-300">
                    <FileText className="w-4 h-4" />
                    <span>Restauration Sélective d'un Fichier (Item 20)</span>
                  </div>
                  <p className="text-gray-400 text-[11px]">
                    Saisissez le chemin relatif du fichier que vous souhaitez restaurer depuis ce snapshot :
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="ex: src/App.tsx"
                      value={selectedFileToRestore}
                      onChange={(e) => setSelectedFileToRestore(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0e111a] border border-[#28314a] text-gray-200 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      onClick={handleRestoreSingleFile}
                      disabled={!selectedFileToRestore.trim()}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-medium transition"
                    >
                      Restaurer
                    </button>
                  </div>
                </div>

                {/* Restauration intégrale */}
                <div className="p-3.5 rounded-xl bg-[#141824] border border-[#21283b] space-y-2.5">
                  <div className="flex items-center gap-1.5 font-medium text-rose-300">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Restauration Complète du Workspace</span>
                  </div>
                  <p className="text-gray-400 text-[11px]">
                    Remet l'intégralité du projet dans l'état exact où il se trouvait lors de cette capture.
                  </p>
                  <button
                    onClick={() => handleRestoreFull(selectedCp.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-medium transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurer l'état global du snapshot
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <span>Sélectionnez un snapshot pour afficher ses options.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
