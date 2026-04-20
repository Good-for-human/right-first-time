import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Edit3, Trash2, ShieldAlert, List, Archive, X } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { Rule, Task } from '@/types';

interface CategoryRulesLibraryProps {
  categories: string[];
  rules: Rule[];
  archivedTasks: Task[];
  onAddCategory: () => void;
  onDeleteCategory: (name: string) => void;
  /** `category` is the tab the user is on when they click Add (must match Firestore rule.category). */
  onAddRule: (type: Rule['type'], category: string) => void;
  onEditRule: (rule: Rule) => void;
  onDeleteRule: (rule: Rule) => void;
}

export function CategoryRulesLibrary({
  categories,
  rules,
  onAddCategory,
  onDeleteCategory,
  onAddRule,
  onEditRule,
  onDeleteRule,
}: CategoryRulesLibraryProps) {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? '通用');

  const filteredRules = rules.filter((r) => r.category === activeCategory);
  const instructionRules = filteredRules.filter((r) => r.type === 'instruction');
  const negativeRules = filteredRules.filter((r) => r.type === 'negative');

  const getSectionLabel = (section: Rule['targetSection']) => {
    switch (section) {
      case 'title': return t('section.title');
      case 'bullets': return t('section.bullets');
      case 'description': return t('section.desc');
      default: return t('modal.scopeAll');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/80">
        <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
          <FileText size={18} className="text-[#0052D9]" /> {t('set.categoryRules')}
        </h3>
        <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">{t('set.categoryRulesDesc')}</p>
      </div>

      <div className="p-6">
        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-px items-center">
          {categories.map((cat) => (
            <div key={cat} className="relative group flex items-center">
              <button
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeCategory === cat
                    ? 'border-[#0052D9] text-[#0052D9]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {cat}
              </button>
              {cat !== '通用' && activeCategory === cat && (
                <button
                  onClick={() => onDeleteCategory(cat)}
                  className="absolute right-0 top-1.5 p-1 text-slate-300 hover:text-red-500 bg-white rounded-full shadow-sm border border-slate-100"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={onAddCategory}
            className="px-3 py-2 text-sm font-medium text-slate-400 hover:text-[#0052D9] flex items-center gap-1.5 transition-colors ml-2"
          >
            <Plus size={14} /> {t('set.addCategory')}
          </button>
        </div>

        <div className="space-y-10">
          {/* Instruction rules */}
          <div>
            <div className="flex justify-between items-end mb-4">
              <h4 className="text-[14px] font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                <Edit3 size={16} className="text-[#0052D9]" /> {t('set.genRules')}
              </h4>
              <button
                onClick={() => onAddRule('instruction', activeCategory)}
                className="text-[#0052D9] text-xs font-semibold hover:bg-blue-100 transition flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-md"
              >
                <Plus size={14} /> {t('modal.add')}
              </button>
            </div>
            <div className="space-y-3">
              {instructionRules.length === 0 && (
                <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  {t('set.noGenRules')}
                </div>
              )}
              {instructionRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-4 border border-slate-200 rounded-xl bg-white hover:border-[#0052D9] hover:shadow-sm transition-all group cursor-default"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-2 h-2 rounded-full bg-[#0052D9] mt-1.5 shrink-0" />
                      <div className="space-y-1.5 w-full">
                        <span className="text-sm font-medium text-slate-800 block">{rule.name}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color="gray" className="flex items-center gap-1">
                            <List size={10} /> {getSectionLabel(rule.targetSection)}
                          </Badge>
                          {rule.priority && (
                            <Badge color={rule.priority === 'Required' ? 'red' : 'blue'}>
                              {rule.priority === 'Required' ? t('modal.req') : t('modal.sug')}
                            </Badge>
                          )}
                          {rule.referenceAsins && rule.referenceAsins.length > 0 && (
                            <Badge color="gray" className="flex items-center gap-1">
                              <Archive size={10} /> {rule.referenceAsins.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4 shrink-0">
                      <button onClick={() => onEditRule(rule)} className="p-1.5 text-slate-400 hover:text-[#0052D9] hover:bg-blue-50 rounded transition">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => onDeleteRule(rule)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Negative rules */}
          <div>
            <div className="flex justify-between items-end mb-4">
              <h4 className="text-[14px] font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                <ShieldAlert size={16} className="text-red-500" /> {t('set.negRules')}
              </h4>
              <button
                onClick={() => onAddRule('negative', activeCategory)}
                className="text-red-600 text-xs font-semibold hover:bg-red-100 transition flex items-center gap-1 bg-red-50 px-2.5 py-1.5 rounded-md"
              >
                <Plus size={14} /> {t('modal.add')}
              </button>
            </div>
            <div className="space-y-3">
              {negativeRules.length === 0 && (
                <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  {t('set.noNegRules')}
                </div>
              )}
              {negativeRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-4 border border-red-100 rounded-xl bg-red-50/30 hover:border-red-300 hover:shadow-sm transition-all group cursor-default"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                      <div className="space-y-1.5 w-full">
                        <span className="text-sm font-medium text-slate-800 block">{rule.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge color="gray" className="flex items-center gap-1">
                            <List size={10} /> {getSectionLabel(rule.targetSection)}
                          </Badge>
                          <Badge color={rule.severity === 'Critical' ? 'red' : 'orange'}>
                            {rule.severity}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4 shrink-0">
                      <button onClick={() => onEditRule(rule)} className="p-1.5 text-slate-400 hover:text-[#0052D9] bg-white hover:bg-blue-50 rounded shadow-sm border border-slate-100">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => onDeleteRule(rule)} className="p-1.5 text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 rounded shadow-sm border border-slate-100">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
