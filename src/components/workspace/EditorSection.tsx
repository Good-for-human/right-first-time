import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useMemo, useState } from 'react';
import { diffCurrentAgainstBaseline } from '@/lib/textDiff';
import { Check, AlertTriangle, RefreshCw, Globe, Languages, Info, Loader2, Wand2, Eye, Pencil, Copy } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { ContentKey, SectionMetadata, TranslationMap, LanguageCode } from '@/types';
import { LANGUAGES } from '@/constants';

/** Returns true if the string contains any HTML element tags. */
function isHtmlContent(text: string): boolean {
  return /<[a-zA-Z][^>]*>/.test(text);
}

/** Render HTML-like text as plain readable content. */
function htmlToPlainText(text: string): string {
  return text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|h1|h2|h3|h4|h5|h6|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface EditorSectionProps {
  title: string;
  dataKey: ContentKey;
  metadata: SectionMetadata;
  value: string;
  translationMap: TranslationMap;
  targetLanguage: LanguageCode;
  translationLang: LanguageCode;
  systemLanguage: 'cn' | 'en';
  isArchived: boolean;
  isRegenerating: boolean;
  translationLoading?: boolean;
  /** true when this section's translation is being generated */
  sectionTranslateLoading?: boolean;
  /** true when the current value differs from the original fetched content */
  isModified?: boolean;
  /** Scraped / saved baseline (task snapshot) — used for diff highlight vs `value` */
  baselineValue: string;
  onChange: (value: string) => void;
  onRegenerate: (key: ContentKey) => void;
  /** Trigger translation for this section only */
  onTranslate?: () => void;
  onCopySection?: (key: ContentKey) => void;
  isCopyingSection?: boolean;
}

export function EditorSection({
  title,
  dataKey,
  metadata,
  value,
  translationMap,
  targetLanguage,
  translationLang,
  systemLanguage,
  isArchived,
  isRegenerating,
  translationLoading = false,
  sectionTranslateLoading = false,
  isModified = false,
  baselineValue,
  onChange,
  onRegenerate,
  onTranslate,
  onCopySection,
  isCopyingSection = false,
}: EditorSectionProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const hasHtml = isHtmlContent(value);
  const isDescription = dataKey === 'description';
  const supportsPreview = hasHtml && !isDescription;
  const displayValue = isDescription ? htmlToPlainText(value) : value;

  // Auto-grow textarea to fit content, capped at 360px
  useEffect(() => {
    if (previewMode) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, [value, previewMode]);

  const targetLangObj = LANGUAGES.find((l) => l.code === targetLanguage);
  const targetLangLabel = systemLanguage === 'cn' ? targetLangObj?.zhLabel : targetLangObj?.label;

  const translationLangObj = LANGUAGES.find((l) => l.code === translationLang);
  const translationLangLabel = systemLanguage === 'cn' ? translationLangObj?.zhLabel : translationLangObj?.label;

  // Show the translation for the exact selected language only. Falling back to another
  // language would mislabel content (e.g. show English under a "German" header).
  const translationContent = translationMap[dataKey]?.[translationLang] ?? null;

  const diffParts = useMemo(
    () => diffCurrentAgainstBaseline(
      isDescription ? htmlToPlainText(baselineValue) : baselineValue,
      displayValue,
    ),
    [baselineValue, displayValue, isDescription],
  );
  const showBaselineDiff = (isDescription ? htmlToPlainText(baselineValue) : baselineValue).trim() !== displayValue.trim();

  return (
    <div className="mb-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden group flex flex-col">
      <div className={`px-4 py-3 border-b flex justify-between items-center shrink-0 transition-colors ${
        isModified ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50/80 border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-slate-800 text-[13px]">{title}</h3>
          {metadata.negativeCheck.passed ? (
            <Badge color="green"><Check size={10} className="mr-1 inline" />{t('editor.pass')}</Badge>
          ) : (
            <Badge color="orange"><AlertTriangle size={10} className="mr-1 inline" />{t('editor.flagged')}</Badge>
          )}
          {isModified && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
              {t('editor.modified')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isArchived && (
            <button
              onClick={() => onRegenerate(dataKey)}
              disabled={isRegenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-[#0052D9] hover:border-blue-200 rounded-md text-xs font-medium transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={12} className={isRegenerating ? 'animate-spin text-[#0052D9]' : ''} />
              {isRegenerating ? t('btn.regenerating') : t('btn.regenerate')}
            </button>
          )}
          {onCopySection && (
            <button
              onClick={() => onCopySection(dataKey)}
              disabled={isCopyingSection}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-md text-xs font-medium transition shadow-sm disabled:opacity-50"
            >
              {isCopyingSection ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
              {t('ws.copySection')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-100 flex-1">
        {/* AI Output (editable) */}
        <div className="p-4 flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-semibold text-[#0052D9] flex items-center gap-1.5 tracking-wider">
              <Globe size={12} /> {targetLangLabel}
            </span>
            {supportsPreview && (
              <button
                onClick={() => setPreviewMode((p) => !p)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded transition"
              >
                {previewMode ? <><Pencil size={10} /> {t('ws.editMode')}</> : <><Eye size={10} /> {t('ws.previewMode')}</>}
              </button>
            )}
          </div>
          {previewMode ? (
            <div
              className={`rendered-html w-full text-sm p-3 border rounded-lg min-h-[80px] max-h-[360px] overflow-y-auto leading-relaxed transition-all ${
                isRegenerating ? 'opacity-40' : 'opacity-100'
              } ${
                isModified
                  ? 'border-2 border-emerald-400 bg-emerald-50/30'
                  : 'border border-slate-200 bg-slate-50/30'
              }`}
              dangerouslySetInnerHTML={{ __html: value }}
            />
          ) : (
          <div className="relative">
            <textarea
              ref={textareaRef}
              className={`w-full text-sm p-3 rounded-lg outline-none resize-none min-h-[80px] max-h-[360px] overflow-y-auto leading-relaxed shadow-inner transition-all ${
                isRegenerating ? 'opacity-40' : 'opacity-100'
              } ${
                isModified
                  ? 'border-2 border-emerald-400 bg-emerald-50/30 text-slate-800 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500'
                  : 'border border-slate-200 bg-slate-50/30 text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-[#0052D9]'
              }`}
              value={displayValue}
              onChange={(e) => onChange(e.target.value)}
              disabled={isArchived || isRegenerating}
            />
          </div>
          )}
          {showBaselineDiff && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-[10px] font-semibold text-slate-700 tracking-wide">
                  {t('ws.diffFromBaseline')}
                </p>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="inline-block w-2 h-2 rounded-sm bg-emerald-300" /> {t('editor.diffAdded')}
                  <span className="inline-block w-2 h-2 rounded-sm bg-rose-200 ml-1.5" /> {t('editor.diffRemoved')}
                </span>
              </div>
              <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto">
                {diffParts.map((seg, i) => {
                  if (seg.op === 'insert') {
                    return (
                      <mark
                        key={i}
                        className="bg-emerald-100 text-emerald-900 rounded-sm px-0.5 underline decoration-emerald-400 decoration-1 underline-offset-2"
                      >
                        {seg.text}
                      </mark>
                    );
                  }
                  if (seg.op === 'delete') {
                    return (
                      <span
                        key={i}
                        className="bg-rose-50 text-rose-700/80 line-through decoration-rose-400 rounded-sm px-0.5"
                      >
                        {seg.text}
                      </span>
                    );
                  }
                  return <span key={i}>{seg.text}</span>;
                })}
              </div>
            </div>
          )}
          <div className="mt-3 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 flex items-start gap-2">
            <Info size={14} className="text-[#0052D9] mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] text-slate-600 mb-1.5 leading-relaxed">{metadata.explanation}</p>
              <div className="flex flex-wrap gap-1">
                {metadata.rulesApplied.map((rule, idx) => {
                  const isPersona = rule.includes('[Persona]');
                  return (
                    <span
                      key={idx}
                      className={`border text-[9px] px-1.5 py-0.5 rounded shadow-sm ${
                        isPersona
                          ? 'bg-purple-50 border-purple-100 text-purple-700'
                          : 'bg-white border-blue-100 text-slate-500'
                      }`}
                    >
                      {rule}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Translation (read-only) */}
        <div className="p-4 flex flex-col bg-slate-50/30">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 tracking-wider">
              <Languages size={12} /> {translationLangLabel}
            </span>
            {onTranslate && !isArchived && (
              <button
                onClick={onTranslate}
                disabled={sectionTranslateLoading || translationLoading}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded transition disabled:opacity-50"
              >
                {sectionTranslateLoading
                  ? <Loader2 size={10} className="animate-spin" />
                  : <Wand2 size={10} />
                }
                {t('ws.translateSection')}
              </button>
            )}
          </div>
          {translationContent ? (
            (isHtmlContent(translationContent) && !isDescription) ? (
              <div
                className="rendered-html w-full text-sm p-3 border border-slate-100 rounded-lg bg-white text-slate-600 min-h-[100px] leading-relaxed shadow-sm break-words"
                dangerouslySetInnerHTML={{ __html: translationContent }}
              />
            ) : (
              <div className="w-full text-sm p-3 border border-slate-100 rounded-lg bg-white text-slate-600 min-h-[100px] leading-relaxed shadow-sm break-words whitespace-pre-wrap">
                {isDescription ? htmlToPlainText(translationContent) : translationContent}
              </div>
            )
          ) : (sectionTranslateLoading || translationLoading) ? (
            <div className="flex flex-col items-center justify-center min-h-[100px] border border-dashed border-indigo-200 rounded-lg bg-indigo-50/30 text-indigo-400 gap-2">
              <Loader2 size={18} className="animate-spin" />
              <p className="text-xs">{t('editor.translating')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[100px] border border-dashed border-slate-200 rounded-lg bg-slate-50/50 text-slate-400 gap-2 text-center px-4">
              <Languages size={18} className="opacity-40" />
              <p className="text-xs">{t('editor.translateHint', { lang: translationLangLabel })}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
