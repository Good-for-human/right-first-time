import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sparkles, Loader2 } from 'lucide-react';
import type { Persona, AppSettings } from '@/types';
import { callLLM } from '@/services/llm';

interface PersonaModalProps {
  existing?: Persona;
  appSettings?: AppSettings;
  onClose: () => void;
  onSave: (data: Pick<Persona, 'name' | 'description'>) => void;
}

const COSMO_SYSTEM_PROMPT = `You are a world-class Amazon listing strategist and prompt engineer.
Your task: rewrite a buyer persona description so it gives the AI maximum signal for generating high-converting product listings.

Apply these principles:
1. COSMO framework — make the persona Customer-centric, Objective-aligned, Scenario-specific, Motivation-driven and Outcome-focused.
2. Replace vague demographic labels (e.g. "middle-aged male") with concrete usage scenarios, goals and pain points.
3. Specify search intent: what does this person type into Amazon? What outcome do they need?
4. Include decision triggers: price sensitivity, brand trust, reviews, speed of delivery, etc.
5. Specify language register: technical / casual / professional / budget-conscious, etc.
6. Keep it concise (3-6 sentences). No bullet lists. No preamble. Return ONLY the rewritten description.`;

export function PersonaModal({ existing, appSettings, onClose, onSave }: PersonaModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState('');

  const handleOptimize = async () => {
    if (!description.trim()) return;
    if (!appSettings?.apiKey) {
      setOptimizeError('请先在「系统设置 → 大模型配置」中填写 API 密钥。');
      return;
    }
    setIsOptimizing(true);
    setOptimizeError('');
    try {
      const personaName = name.trim() || '用户';
      const userPrompt =
        `Persona name: ${personaName}\n\nCurrent description:\n${description.trim()}\n\n` +
        `Rewrite this description following the COSMO principles. Output only the improved description, nothing else.`;

      const result = await callLLM(
        [
          { role: 'system', content: COSMO_SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
        appSettings.model,
        appSettings.apiKey,
        { temperature: 0.5, maxTokens: 300 },
      );
      const optimized = result.content.trim();
      if (optimized) setDescription(optimized);
    } catch {
      setOptimizeError('AI 优化失败，请稍后重试。');
    } finally {
      setIsOptimizing(false);
    }
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
                disabled={isOptimizing || !description.trim()}
                className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1 transition-opacity disabled:opacity-40"
              >
                {isOptimizing
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Sparkles size={12} />}
                {isOptimizing ? t('ai.optimizing') : t('ai.optimize')}
              </button>
            </div>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这个买家的使用场景、购买动机和搜索偏好…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none resize-none shadow-inner transition-all"
            />
            {optimizeError && (
              <p className="mt-1.5 text-xs text-red-500">{optimizeError}</p>
            )}
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
