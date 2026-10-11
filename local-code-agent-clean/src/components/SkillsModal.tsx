import React, { useState } from 'react';
import { useAppStore, Skill } from '../store/useAppStore';
import {
  X, Sparkles, Shield, Code, GitBranch, Terminal, Globe, Plus, Check, Power, FileText
} from 'lucide-react';

export const SkillsModal: React.FC = () => {
  const {
    skills,
    toggleSkill,
    addSkill,
    isSkillsOpen,
    setSkillsOpen,
    addLog,
  } = useAppStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('Tous');
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillCat, setNewSkillCat] = useState<'Code' | 'Sécurité' | 'DevOps' | 'Système' | 'Web'>('Code');
  const [newSkillPrompt, setNewSkillPrompt] = useState('');

  if (!isSkillsOpen) return null;

  const categories = ['Tous', 'Bureautique', 'Code', 'GameDev', 'Sécurité', 'DevOps', 'Database', 'Système', 'Web', 'Qualité', 'Performance', 'Doc'];

  const filteredSkills = skills.filter((s) => {
    if (selectedCategory === 'Tous') return true;
    return s.category === selectedCategory;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Bureautique':
        return <FileText className="w-4 h-4 text-sky-400" />;
      case 'Sécurité':
        return <Shield className="w-4 h-4 text-amber-400" />;
      case 'Code':
        return <Code className="w-4 h-4 text-sky-400" />;
      case 'GameDev':
        return <Sparkles className="w-4 h-4 text-rose-400" />;
      case 'Database':
        return <Terminal className="w-4 h-4 text-cyan-400" />;
      case 'DevOps':
        return <GitBranch className="w-4 h-4 text-indigo-400" />;
      case 'Système':
        return <Terminal className="w-4 h-4 text-purple-400" />;
      case 'Web':
        return <Globe className="w-4 h-4 text-emerald-400" />;
      case 'Qualité':
        return <Check className="w-4 h-4 text-teal-400" />;
      case 'Performance':
        return <Sparkles className="w-4 h-4 text-yellow-400" />;
      case 'Doc':
        return <Code className="w-4 h-4 text-blue-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleCreateSkillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newSkillPrompt.trim()) return;

    const id = newSkillName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const skill: Skill = {
      id,
      name: newSkillName.trim(),
      description: newSkillDesc.trim() || 'Compétence personnalisée pour l\'agent.',
      category: newSkillCat,
      enabled: true,
      systemPrompt: newSkillPrompt.trim(),
      slashCommand: `/skill ${id}`,
    };

    addSkill(skill);
    addLog('info', `Nouveau Skill créé et activé : ${skill.name}`);
    setIsCreatingSkill(false);
    setNewSkillName('');
    setNewSkillDesc('');
    setNewSkillPrompt('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#1a1d24] border border-[#2e3440] rounded-2xl shadow-2xl max-w-2xl w-full h-[580px] flex flex-col overflow-hidden text-gray-200">
        {/* Entête */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202430] border-b border-[#2e3440]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Système de Compétences (Skills)</h2>
              <p className="text-xs text-gray-400">
                Activez les compétences expertes injectées dynamiquement dans l'agent.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSkillsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[#2b303d] text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barre de filtres et création */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#24283b] bg-[#16161e] text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg transition ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-[#1f2335] text-gray-400 hover:text-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsCreatingSkill(!isCreatingSkill)}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#24283b] hover:bg-indigo-600 text-white transition font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouveau Skill</span>
          </button>
        </div>

        {/* Corps principal */}
        <div className="flex-1 p-6 overflow-y-auto space-y-3">
          {/* Formulaire de création de skill */}
          {isCreatingSkill && (
            <form onSubmit={handleCreateSkillSubmit} className="p-4 bg-[#14161d] rounded-xl border border-indigo-500/40 space-y-3 text-xs mb-4">
              <span className="font-semibold text-white block">Créer un nouveau Skill personnalisé</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 block mb-1">Nom du Skill</label>
                  <input
                    type="text"
                    required
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="Ex: Optimisation Algorithmique"
                    className="w-full px-3 py-1.5 bg-[#1a1d24] border border-[#2e3440] rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-gray-400 block mb-1">Catégorie</label>
                  <select
                    value={newSkillCat}
                    onChange={(e) => setNewSkillCat(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-[#1a1d24] border border-[#2e3440] rounded text-white"
                  >
                    <option value="Code">Code</option>
                    <option value="Sécurité">Sécurité</option>
                    <option value="DevOps">DevOps</option>
                    <option value="Système">Système</option>
                    <option value="Web">Web</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Description courte</label>
                <input
                  type="text"
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  placeholder="En quoi ce skill aide-t-il l'agent ?"
                  className="w-full px-3 py-1.5 bg-[#1a1d24] border border-[#2e3440] rounded text-white"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Instructions / Règles expertes (System Prompt)</label>
                <textarea
                  rows={3}
                  required
                  value={newSkillPrompt}
                  onChange={(e) => setNewSkillPrompt(e.target.value)}
                  placeholder="Règles strictes, patterns à appliquer, checklist à respecter..."
                  className="w-full px-3 py-1.5 bg-[#1a1d24] border border-[#2e3440] rounded text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingSkill(false)}
                  className="px-3 py-1.5 rounded text-gray-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Ajouter le Skill
                </button>
              </div>
            </form>
          )}

          {/* Liste des Skills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredSkills.map((skill) => (
              <div
                key={skill.id}
                className={`p-3.5 rounded-xl border transition flex flex-col justify-between ${
                  skill.enabled
                    ? 'bg-[#1b1e28] border-indigo-500/40 shadow-sm'
                    : 'bg-[#14161d] border-[#2e3440] opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-[#252836]">
                        {getCategoryIcon(skill.category)}
                      </div>
                      <span className="font-semibold text-white text-xs">{skill.name}</span>
                    </div>

                    {/* Switch On/Off */}
                    <button
                      onClick={() => toggleSkill(skill.id)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
                        skill.enabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-gray-800 text-gray-400 border border-gray-700'
                      }`}
                    >
                      <Power className="w-2.5 h-2.5" />
                      <span>{skill.enabled ? 'Actif' : 'Inactif'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                    {skill.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-[#2e3440]/60 flex items-center justify-between text-[10px] text-gray-500">
                  <span className="bg-[#12141a] px-1.5 py-0.5 rounded font-mono text-gray-400">
                    {skill.slashCommand || `/skill ${skill.id}`}
                  </span>
                  <span className="font-medium text-gray-400">{skill.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
