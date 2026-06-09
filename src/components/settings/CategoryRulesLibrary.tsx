import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Edit3, Trash2, ShieldAlert, List, Archive, X, KeyRound, Tag, Bookmark } from 'lucide-react';
import { Badge } from '@/components/ui';
import type {
  Rule,
  Task,
  KeywordSet,
  SystemLanguage,
  CategoryLabelMap,
  BusinessCountryCode,
  CountryCode,
  SharedKeywordLibraryItem,
} from '@/types';
import { isGlobalCategory, localizeSystemText } from '@/lib/systemTextI18n';
import { DEFAULT_CATEGORY } from '@/lib/categoryTaxonomy';

interface CategoryRulesLibraryProps {
  systemLanguage: SystemLanguage;
  categories: string[];
  categoryLabels: CategoryLabelMap;
  rules: Rule[];
  archivedTasks: Task[];
  onAddCategory: () => void;
  onDeleteCategory: (name: string) => void;
  /** `category` is the tab the user is on when they click Add (must match Firestore rule.category). */
  onAddRule: (type: Rule['type'], category: string) => void;
  onEditRule: (rule: Rule) => void;
  onDeleteRule: (rule: Rule) => void;
  /** Current keyword map (all categories) */
  keywords?: Record<string, KeywordSet>;
  sharedKeywordLibrary?: Partial<Record<CountryCode, SharedKeywordLibraryItem>>;
  /** Persist updated keyword set for a category */
  onSetKeywords?: (category: string, set: KeywordSet) => void;
  /** Category-level reference ASINs map */
  categoryRefAsins?: Record<string, string[]>;
  /** Add a reference ASIN to a category (max 3) */
  onAddCategoryRefAsin?: (category: string, asin: string) => void;
  /** Remove a reference ASIN from a category */
  onRemoveCategoryRefAsin?: (category: string, asin: string) => void;
  localCountryCode?: BusinessCountryCode | null;
}

export function CategoryRulesLibrary({
  systemLanguage,
  categories,
  categoryLabels,
  rules,
  onAddCategory,
  onDeleteCategory,
  onAddRule,
  onEditRule,
  onDeleteRule,
  keywords = {},
  onSetKeywords,
  categoryRefAsins = {},
  onAddCategoryRefAsin,
  onRemoveCategoryRefAsin,
  localCountryCode,
}: CategoryRulesLibraryProps) {
  const { t } = useTranslation();
  const GLOBAL_CATEGORY_TAB = 'general';
  const categoryTabs = categories.reduce<string[]>((acc, category) => {
    const normalized = isGlobalCategory(category) ? GLOBAL_CATEGORY_TAB : category;
    if (!acc.includes(normalized)) acc.push(normalized);
    return acc;
  }, []);
  if (!categoryTabs.some((category) => isGlobalCategory(category))) {
    categoryTabs.unshift(GLOBAL_CATEGORY_TAB);
  }
  const [activeCategory, setActiveCategory] = useState(
    categoryTabs[0] ?? DEFAULT_CATEGORY,
  );

  useEffect(() => {
    if (categoryTabs.length === 0) return;
    if (!categoryTabs.includes(activeCategory)) {
      setActiveCategory(categoryTabs[0]);
    }
  }, [activeCategory, categoryTabs]);

  const getRuleCountry = (rule: Rule): string => rule.createdByCountry ?? localCountryCode ?? 'GLOBAL';
  // Local-only library: a country workspace manages only its own rules / keywords / reference
  // ASINs. GLOBAL and other countries' items are browsed and imported via the Shared Library,
  // at which point they become local (editable) copies.
  const activeSourceCountry: CountryCode = (localCountryCode ?? 'GLOBAL') as CountryCode;
  const effectiveKeywords = keywords;
  const effectiveCategoryRefAsins = categoryRefAsins;
  const canEditSourceContent = true;

  // reference ASIN local state
  const refAsinInputRef = useRef<HTMLInputElement>(null);
  const activeRefAsins = effectiveCategoryRefAsins[activeCategory] ?? [];

  const handleAddRefAsin = () => {
    if (!canEditSourceContent) return;
    const val = (refAsinInputRef.current?.value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val && activeRefAsins.length < 3 && !activeRefAsins.includes(val)) {
      onAddCategoryRefAsin?.(activeCategory, val);
    }
    if (refAsinInputRef.current) refAsinInputRef.current.value = '';
  };

  // keyword library local state
  const kwSet = effectiveKeywords[activeCategory] ?? { primary: '', secondary: [] };
  const [kwPrimary, setKwPrimary] = useState('');
  const [kwSecInput, setKwSecInput] = useState('');

  const handleActiveCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setKwPrimary('');
    setKwSecInput('');
  };

  const saveKeywords = (updated: KeywordSet) => {
    if (!canEditSourceContent) return;
    onSetKeywords?.(activeCategory, updated);
  };

  const handlePrimaryBlur = () => {
    const trimmed = kwPrimary.trim();
    if (trimmed !== kwSet.primary) {
      saveKeywords({ ...kwSet, primary: trimmed });
    }
  };

  const handleAddSecondary = () => {
    if (!canEditSourceContent) return;
    const trimmed = kwSecInput.trim();
    if (!trimmed || kwSet.secondary.includes(trimmed)) { setKwSecInput(''); return; }
    const updated = { ...kwSet, secondary: [...kwSet.secondary, trimmed] };
    saveKeywords(updated);
    setKwSecInput('');
  };

  const handleRemoveSecondary = (kw: string) => {
    if (!canEditSourceContent) return;
    saveKeywords({ ...kwSet, secondary: kwSet.secondary.filter((k) => k !== kw) });
  };

  // sync local primary input when active category changes
  // (we do this via key on the input so it re-mounts)

  const isLocalRule = (rule: Rule): boolean => {
    if (!localCountryCode) return true;
    return getRuleCountry(rule) === localCountryCode;
  };
  const canEditRule = (rule: Rule): boolean => {
    if (!localCountryCode) return true;
    return getRuleCountry(rule) === localCountryCode;
  };
  const countryPriority = (rule: Rule): number => {
    const country = getRuleCountry(rule);
    if (!localCountryCode) return 0;
    if (country === localCountryCode) return 0;
    if (country === 'GLOBAL') return 1;
    return 2;
  };

  const filteredRules = rules
    .filter((r) => isLocalRule(r))
    .filter((r) =>
    isGlobalCategory(activeCategory)
      ? isGlobalCategory(r.category)
      : r.category === activeCategory,
    )
    .sort((a, b) => {
      const pa = countryPriority(a);
      const pb = countryPriority(b);
      if (pa !== pb) return pa - pb;
      const ta = a.updatedAt ?? a.createdAt ?? '';
      const tb = b.updatedAt ?? b.createdAt ?? '';
      return tb.localeCompare(ta);
    });
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

  const displayCategoryName = (category: string): string => {
    if (isGlobalCategory(category)) {
      return systemLanguage === 'cn' ? '通用' : 'general';
    }
    if (systemLanguage === 'cn' && category === 'smart home IoT') {
      return '智能电子';
    }
    return categoryLabels[category]?.[systemLanguage] || category;
  };

  const renderCreator = (createdByEmail?: string, createdByCountry?: string) => {
    if (!createdByEmail && !createdByCountry) return null;
    const isDefault = createdByEmail === 'system@rightfirsttime.local' && createdByCountry === 'GLOBAL';
    return (
      <p className="text-[11px] text-slate-400">
        {isDefault
          ? t('meta.default')
          : t('meta.createdBy', {
              email: createdByEmail ?? '-',
              country: createdByCountry ?? '-',
            })}
      </p>
    );
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
          {categoryTabs.map((cat) => (
            <div key={cat} className="relative group flex items-center">
              <button
                onClick={() => handleActiveCategoryChange(cat)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeCategory === cat
                    ? 'border-[#0052D9] text-[#0052D9]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {displayCategoryName(cat)}
              </button>
              {!isGlobalCategory(cat) && activeCategory === cat && (
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
                className="text-[#0052D9] text-xs font-semibold hover:bg-blue-100 transition flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <span className="text-sm font-medium text-slate-800 block">
                          {localizeSystemText(rule.name, rule.nameI18n, systemLanguage)}
                        </span>
                        {renderCreator(rule.createdByEmail, rule.createdByCountry)}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color={getRuleCountry(rule) === localCountryCode ? 'blue' : getRuleCountry(rule) === 'GLOBAL' ? 'gray' : 'purple'}>
                            {getRuleCountry(rule)}
                          </Badge>
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
                    {canEditRule(rule) ? (
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4 shrink-0">
                        <button onClick={() => onEditRule(rule)} className="p-1.5 text-slate-400 hover:text-[#0052D9] hover:bg-blue-50 rounded transition">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => onDeleteRule(rule)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="ml-4 text-[11px] text-slate-400 shrink-0">{t('set.readonlyOtherRule')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reference ASINs (category-level, highest AI priority) */}
          <div>
            <div className="flex items-end mb-4">
              <h4 className="text-[14px] font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                <Bookmark size={16} className="text-amber-500" /> {t('set.refAsin')}
              </h4>
              {localCountryCode && (
                <span className="ml-2 text-[11px] text-slate-500">{activeSourceCountry}</span>
              )}
            </div>
            <div className="border border-amber-100 rounded-xl bg-amber-50/30 p-4 space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed">{t('set.refAsinDesc')}</p>
              <div className="flex flex-wrap gap-2 items-center">
                {activeRefAsins.map((asin) => (
                  <span
                    key={asin}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-200 text-amber-900 text-xs font-mono rounded-full shadow-sm"
                  >
                    {asin}
                    {canEditSourceContent && (
                      <button
                        onClick={() => onRemoveCategoryRefAsin?.(activeCategory, asin)}
                        className="text-amber-400 hover:text-red-500 transition ml-0.5"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ))}
                {canEditSourceContent && activeRefAsins.length < 3 && (
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={refAsinInputRef}
                      type="text"
                      placeholder={t('ws.refAsinAdd')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddRefAsin(); }
                      }}
                      className="border border-dashed border-amber-300 rounded-full px-2.5 py-1 bg-amber-50/50 text-amber-900 placeholder-amber-400 outline-none focus:border-amber-500 text-xs font-mono w-36"
                      autoComplete="off"
                    />
                    <button
                      onClick={handleAddRefAsin}
                      className="p-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-full transition"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
                <span className="text-[10px] text-amber-600 ml-auto">{activeRefAsins.length}/3</span>
              </div>
            </div>
          </div>

          {/* Keyword library */}
          <div>
            <div className="flex items-end mb-4">
              <h4 className="text-[14px] font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                <KeyRound size={16} className="text-violet-500" /> {t('set.keywordLib')}
              </h4>
              {localCountryCode && (
                <span className="ml-2 text-[11px] text-slate-500">{activeSourceCountry}</span>
              )}
            </div>
            <div className="border border-violet-100 rounded-xl bg-violet-50/30 p-4 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">{t('set.keywordLibDesc')}</p>
              {!canEditSourceContent && (
                <p className="text-[11px] text-slate-400">{t('set.readonlyOtherRule')}</p>
              )}

              {/* Primary keyword */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Tag size={12} className="text-violet-500" /> {t('set.kwPrimary')}
                </label>
                <input
                  key={`primary-${activeCategory}-${activeSourceCountry}`}
                  type="text"
                  defaultValue={kwSet.primary}
                  onChange={(e) => setKwPrimary(e.target.value)}
                  onBlur={handlePrimaryBlur}
                  disabled={!canEditSourceContent}
                  placeholder={t('set.kwPrimaryPlaceholder')}
                  className="w-full text-sm px-3 py-2 border border-violet-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                />
              </div>

              {/* Secondary keywords */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Tag size={12} className="text-slate-400" /> {t('set.kwSecondary')}
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={kwSecInput}
                    onChange={(e) => setKwSecInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddSecondary(); } }}
                    disabled={!canEditSourceContent}
                    placeholder={t('set.kwSecPlaceholder')}
                    className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
                  />
                  <button
                    onClick={handleAddSecondary}
                    disabled={!canEditSourceContent}
                    className="px-3 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={12} /> {t('modal.add')}
                  </button>
                </div>
                {kwSet.secondary.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {kwSet.secondary.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-violet-200 text-violet-700 text-xs rounded-full shadow-sm"
                      >
                        {kw}
                        {canEditSourceContent && (
                          <button
                            onClick={() => handleRemoveSecondary(kw)}
                            className="text-violet-400 hover:text-red-500 transition ml-0.5"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-2">{t('set.kwSecEmpty')}</p>
                )}
              </div>
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
                className="text-red-600 text-xs font-semibold hover:bg-red-100 transition flex items-center gap-1 bg-red-50 px-2.5 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <span className="text-sm font-medium text-slate-800 block">
                          {localizeSystemText(rule.name, rule.nameI18n, systemLanguage)}
                        </span>
                        {renderCreator(rule.createdByEmail, rule.createdByCountry)}
                        <div className="flex items-center gap-2">
                          <Badge color={getRuleCountry(rule) === localCountryCode ? 'blue' : getRuleCountry(rule) === 'GLOBAL' ? 'gray' : 'purple'}>
                            {getRuleCountry(rule)}
                          </Badge>
                          <Badge color="gray" className="flex items-center gap-1">
                            <List size={10} /> {getSectionLabel(rule.targetSection)}
                          </Badge>
                          <Badge color={rule.severity === 'Critical' ? 'red' : 'orange'}>
                            {rule.severity === 'Critical' ? t('modal.crit') : t('modal.high')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {canEditRule(rule) ? (
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4 shrink-0">
                        <button onClick={() => onEditRule(rule)} className="p-1.5 text-slate-400 hover:text-[#0052D9] bg-white hover:bg-blue-50 rounded shadow-sm border border-slate-100">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => onDeleteRule(rule)} className="p-1.5 text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 rounded shadow-sm border border-slate-100">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="ml-4 text-[11px] text-slate-400 shrink-0">{t('set.readonlyOtherRule')}</span>
                    )}
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
