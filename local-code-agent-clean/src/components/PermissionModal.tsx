import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ShieldAlert, Check, X, MessageSquare, Terminal, FileCode } from 'lucide-react';

export const PermissionModal: React.FC = () => {
  const { currentPermissionRequest, setPermissionRequest, addLog } = useAppStore();
  const [feedback, setFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  if (!currentPermissionRequest) return null;

  const handleDecision = (
    decision: 'allow_once' | 'always_allow' | 'deny' | 'deny_with_feedback'
  ) => {
    currentPermissionRequest.resolve(decision, feedback);
    addLog('security', `Décision utilisateur pour '${currentPermissionRequest.tool_name}' : ${decision}`);
    setPermissionRequest(null);
    setFeedback('');
    setShowFeedbackInput(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-gray-200">
        {/* Entête */}
        <div className="flex items-center gap-3 px-5 py-4 bg-[#202430] border-b border-[#2e3440]">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Demande d'autorisation de l'Agent</h2>
            <p className="text-xs text-gray-400">Une action sensible nécessite votre validation.</p>
          </div>
        </div>

        {/* Détails de l'action */}
        <div className="p-5 space-y-4 text-xs">
          <div>
            <span className="text-gray-400 font-medium block mb-1">Outil demandé :</span>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#12141a] text-indigo-300 font-mono">
              {currentPermissionRequest.tool_name === 'run_command' ? (
                <Terminal className="w-4 h-4 text-sky-400" />
              ) : (
                <FileCode className="w-4 h-4 text-amber-400" />
              )}
              <span>{currentPermissionRequest.tool_name}</span>
            </div>
          </div>

          <div>
            <span className="text-gray-400 font-medium block mb-1">Paramètres :</span>
            <pre className="bg-[#12141a] p-3 rounded-lg overflow-x-auto text-[11px] font-mono text-gray-300 max-h-40 border border-[#2e3440]">
              {JSON.stringify(currentPermissionRequest.tool_args, null, 2)}
            </pre>
          </div>

          {/* Champ d'explication si refus argumenté */}
          {showFeedbackInput && (
            <div className="space-y-1.5">
              <span className="text-gray-400 font-medium block">
                Explication transmise à l'IA pour corriger sa stratégie :
              </span>
              <textarea
                rows={2}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ex: Ne modifie pas ce fichier directement, utilise plutôt la fonction X..."
                className="w-full px-3 py-2 bg-[#12141a] border border-[#2e3440] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 bg-[#14161d] border-t border-[#2e3440] text-xs">
          {!showFeedbackInput ? (
            <>
              <button
                onClick={() => setShowFeedbackInput(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#222631] hover:bg-[#2b303d] text-gray-300 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Refuser en expliquant
              </button>
              <button
                onClick={() => handleDecision('deny')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition"
              >
                <X className="w-3.5 h-3.5" /> Refuser
              </button>
              <button
                onClick={() => handleDecision('always_allow')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#222631] hover:bg-[#2b303d] text-gray-200 transition"
              >
                Toujours autoriser
              </button>
              <button
                onClick={() => handleDecision('allow_once')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md shadow-indigo-600/20 transition"
              >
                <Check className="w-3.5 h-3.5" /> Autoriser une fois
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowFeedbackInput(false)}
                className="px-3 py-2 rounded-lg text-gray-400 hover:text-white"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDecision('deny_with_feedback')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium transition"
              >
                Envoyer le refus à l'IA
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
