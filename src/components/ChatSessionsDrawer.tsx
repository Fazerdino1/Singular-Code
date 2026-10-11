import React, { useState } from 'react';
import {
  MessagesSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  Clock,
  MessageCircle,
  Sparkles,
  Bot,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const ChatSessionsDrawer: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    createNewSession,
    switchSession,
    deleteSession,
    renameSession,
    profiles,
    activeProfileIndex,
  } = useAppStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      renameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const activeProfile = profiles[activeProfileIndex] || profiles[0];

  return (
    <div className="flex flex-col h-full bg-[#0e1017] border-r border-[#1e2029] select-none text-zinc-300">
      {/* Header */}
      <div className="p-3 border-b border-[#1e2029] flex items-center justify-between bg-[#12141d]">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase">
            Sessions Multi-Chat
          </span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          Claude GUI
        </span>
      </div>

      {/* Bouton Nouvelle Session */}
      <div className="p-3 border-b border-[#1e2029] bg-[#10121a]">
        <button
          onClick={() => createNewSession()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all duration-200 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle Session de Code</span>
        </button>

        {/* Info Modèle Actif */}
        <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-[#151722] border border-[#222534] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span className="truncate max-w-[140px]">{activeProfile?.model_id || 'qwen2.5-coder'}</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-medium">Prêt</span>
        </div>
      </div>

      {/* Liste des sessions */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sessions.map((sess) => {
          const isActive = sess.id === activeSessionId;
          const isEditing = editingId === sess.id;

          return (
            <div
              key={sess.id}
              onClick={() => !isEditing && switchSession(sess.id)}
              className={`group relative p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-[#181a26] border-indigo-500/50 shadow-md shadow-indigo-500/10 text-zinc-100'
                  : 'bg-[#12141c] border-[#1e202c] hover:bg-[#161822] hover:border-[#2a2e40] text-zinc-400'
              }`}
            >
              {/* Titre ou Input de renommage */}
              <div className="flex items-center justify-between gap-1 mb-1.5">
                {isEditing ? (
                  <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 bg-[#0b0c10] border border-indigo-500 rounded px-2 py-0.5 text-xs text-zinc-100 outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(sess.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button
                      onClick={() => handleSaveRename(sess.id)}
                      className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-xs truncate flex-1 text-zinc-200 group-hover:text-zinc-100">
                      {sess.title}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(sess.id, sess.title);
                        }}
                        className="p-1 text-zinc-400 hover:text-indigo-400 hover:bg-[#202330] rounded"
                        title="Renommer la session"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {sessions.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(sess.id);
                          }}
                          className="p-1 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded"
                          title="Supprimer la session"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Métadonnées : Nombre de messages & horodatage */}
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="w-3 h-3 text-zinc-400" />
                  <span>{sess.messages?.length || 0} messages</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>
                    {sess.updatedAt
                      ? new Date(sess.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'récent'}
                  </span>
                </div>
              </div>

              {/* Pastille active */}
              {isActive && (
                <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-indigo-500 rounded-r shadow-lg shadow-indigo-500" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
