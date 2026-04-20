import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sparkles } from 'lucide-react';
import type { Persona } from '@/types';

interface PersonaModalProps {
  existing?: Persona;
  onClose: () => void;
  onSave: (data: Pick<Persona, 'name' | 'description'>) => void;
}

export function PersonaModal({ existing, onClose, onSave }: PersonaModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimize = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      setDescription((prev) =>
        prev
          ? `${prev} (已进行 COSMO 意图增强：强调具体的搜索偏好、场景特征，避免宽泛的人口统计学标签。)`
          : '基于 COSMO 标准：重点突出用户在实际场景中的使用需求，语言风格偏向专业、直接，拒绝冗余修饰词。'
      );
      setIsOptimizing(false);
    }, 1500);
  };

  const handleSave = () => {
    if (!name.trim() || !description.trim()) return;
    onSave({ name: name.trim(), description: description.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in overflow-y-auto py-10">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 my-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800">
            {existing ? t('modal.edit') : t('modal.add')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('modal.name')}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none shadow-inner"
            />
          </div>
          <div>
            <div className="flex justify-between items-end mb-1.5">
              <label className="block text-[13px] font-medium text-slate-700">{t('modal.personaDesc')}</label>
              <button
                onClick={handleOptimize}
                disabled={isOptimizing}
                className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1 transition-opacity disabled:opacity-50"
              >
                <Sparkles size={12} className={isOptimizing ? 'animate-pulse' : ''} />
                {isOptimizing ? t('ai.optimizing') : t('ai.optimize')}
              </button>
            </div>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none resize-none shadow-inner transition-all"
            />
          </div>
          <div className="pt-4 pb-2 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition"
            >
              {t('modal.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || !description.trim() || isOptimizing}
              className="px-5 py-2 text-sm font-medium text-white bg-[#0052D9] hover:bg-blue-800 rounded-md shadow-sm disabled:opacity-50 transition"
            >
              {t('modal.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
