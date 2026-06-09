import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sparkles, Archive } from 'lucide-react';
import type { Rule, Task, SystemLanguage, AppSettings } from '@/types';
import { localizeSystemText } from '@/lib/systemTextI18n';
import { callLLM, parseLLMError } from '@/services/llm';
import { useAuthStore } from '@/store/authStore';
import { resolveWorkspaceApiKey } from '@/lib/apiKeyResolver';

interface RuleModalProps {
  type: Rule['type'];
  existing?: Rule;
  archivedTasks: Task[];
  category: string;
  appSettings?: AppSettings;
  systemLanguage: SystemLanguage;
  onClose: () => void;
  onSave: (data: Omit<Rule, 'id' | 'active'>) => Promise<void> | void;
}

const RULE_OPTIMIZE_SYSTEM_PROMPT = `You are an expert Amazon listing rule optimizer.
Your task: rewrite one rule instruction so it becomes precise, enforceable, and high-signal for LLM generation.

Requirements:
1. Keep the original intent and compliance boundary.
2. Use explicit action language and measurable constraints when possible.
3. Avoid vague wording like "good", "better", "appropriate", "etc.".
4. Keep it concise: 1-3 sentences, no bullet list.
5. Output only the optimized rule text, with no explanation or prefix.`;

export function RuleModal({
  type,
  existing,
  archivedTasks,
  category,
  appSettings,
  systemLanguage,
  onClose,
  onSave,
}: RuleModalProps) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const effectiveApiKey = resolveWorkspaceApiKey({
    manualKey: appSettings?.apiKey,
    countryCode: profile?.countryCode,
  });
  const [name, setName] = useState(
    existing
      ? localizeSystemText(existing.name, existing.nameI18n, systemLanguage)
      : '',
  );
  const [targetSection, setTargetSection] = useState<Rule['targetSection']>(existing?.targetSection ?? 'all');
  const [priority, setPriority] = useState<Rule['priority']>(existing?.priority ?? 'Required');
  const [severity, setSeverity] = useState<Rule['severity']>(existing?.severity ?? 'High');
  const [referenceAsins, setReferenceAsins] = useState<string[]>(existing?.referenceAsins ?? []);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleOptimize = async () => {
    if (!effectiveApiKey) {
      setOptimizeError(t('ws.apiKeyRequired'));
      return;
    }
    setIsOptimizing(true);
    setOptimizeError('');
    try {
      const userPrompt = [
        `Rule type: ${type}`,
        `Category: ${category}`,
        `Target section: ${targetSection}`,
        type === 'instruction' ? `Priority: ${priority}` : `Severity: ${severity}`,
        type === 'instruction'
          ? `Reference ASINs: ${referenceAsins.length > 0 ? referenceAsins.join(', ') : 'None'}`
          : null,
        '',
        'Current rule text:',
        name.trim() || t('modal.ruleOptimizeTemplate'),
        '',
        'Rewrite this rule following the requirements. Output only optimized rule text.',
      ]
        .filter(Boolean)
        .join('\n');

      const result = await callLLM(
        [
          { role: 'system', content: RULE_OPTIMIZE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        appSettings?.model ?? 'gpt-5.5',
        effectiveApiKey,
        { temperature: 0.4, maxTokens: 320 },
      );
      const optimized = result.content.trim();
      if (optimized) {
        setName(optimized);
      }
    } catch (err) {
      setOptimizeError(parseLLMError(err));
    } finally {
      setIsOptimizing(false);
    }
  };

  const addAsin = (asin: string) => {
    if (asin && referenceAsins.length < 3 && !referenceAsins.includes(asin)) {
      setReferenceAsins([...referenceAsins, asin]);
    }
  };

  const removeAsin = (asin: string) => setReferenceAsins(referenceAsins.filter((a) => a !== asin));

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    const base = {
      category,
      type,
      name: name.trim(),
      targetSection,
    } as Omit<Rule, 'id' | 'active'>;

    if (type === 'instruction') {
      base.priority = priority;
      base.referenceAsins = referenceAsins;
    } else {
      base.severity = severity;
    }
    try {
      await onSave(base);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in overflow-y-auto py-10">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 my-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800">{existing ? t('modal.edit') : t('modal.add')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Rule prompt */}
          <div>
            <div className="flex justify-between items-end mb-1.5">
              <label className="block text-[13px] font-medium text-slate-700">{t('modal.prompt')}</label>
              <button
                onClick={handleOptimize}
                disabled={isOptimizing}
                className="text-xs text-[#0052D9] hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
              >
                <Sparkles size={12} className={isOptimizing ? 'animate-pulse' : ''} />
                {isOptimizing ? t('ai.optimizing') : t('ai.optimize')}
              </button>
            </div>
            <textarea
              autoFocus
              rows={3}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none resize-none shadow-inner"
            />
            {optimizeError && (
              <p className="mt-1.5 text-xs text-red-500">{optimizeError}</p>
            )}
          </div>

          {/* Scope */}
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('modal.scope')}</label>
            <select
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value as Rule['targetSection'])}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none bg-white"
            >
              <option value="all">{t('modal.scopeAll')}</option>
              <option value="title">{t('section.title')}</option>
              <option value="bullets">{t('section.bullets')}</option>
              <option value="description">{t('section.desc')}</option>
            </select>
          </div>

          {/* Instruction-specific fields */}
          {type === 'instruction' && (
            <div className="space-y-5 border-t border-slate-100 pt-5">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('modal.priority')}</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Rule['priority'])}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                >
                  <option value="Required">{t('modal.req')}</option>
                  <option value="Suggested">{t('modal.sug')}</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('modal.ref')}</label>
                {referenceAsins.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {referenceAsins.map((asin) => (
                      <span key={asin} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                        <Archive size={10} /> {asin}
                        <button onClick={() => removeAsin(asin)} className="ml-1 hover:text-slate-900">✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <select
                  value=""
                  onChange={(e) => addAsin(e.target.value)}
                  disabled={referenceAsins.length >= 3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="" disabled>
                    {referenceAsins.length >= 3 ? t('modal.refMax') : '...'}
                  </option>
                  {archivedTasks
                    .filter((task) => !referenceAsins.includes(task.asin))
                    .map((task) => (
                      <option key={task.id} value={task.asin}>{task.asin} - {task.name || t('modal.notAvailable')}</option>
                    ))}
                </select>
                <p className="text-xs text-slate-500 mt-1.5">{t('modal.refDesc')}</p>
              </div>
            </div>
          )}

          {/* Negative-specific fields */}
          {type === 'negative' && (
            <div className="border-t border-slate-100 pt-5">
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('modal.severity')}</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Rule['severity'])}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none bg-white"
              >
                <option value="Critical">{t('modal.crit')}</option>
                <option value="High">{t('modal.high')}</option>
              </select>
            </div>
          )}

          <div className="pt-4 pb-2 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition">
              {t('modal.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || isOptimizing || isSaving}
              className="px-5 py-2 text-sm font-medium text-white bg-[#0052D9] hover:bg-blue-800 rounded-md shadow-sm disabled:opacity-50 transition"
            >
              {isSaving ? t('global.saving') : t('modal.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
