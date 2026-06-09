/**
 * SourceDataPanel — left panel of the Workspace.
 *
 * Shows TinyFish-scraped product data. Title / bullets / description can be
 * edited locally; changes are NOT written to the task (or Firestore) until
 * the user clicks "Confirm sync to task". Until then, persisted fields stay
 * as the last saved / scraped state.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Tag, ImageOff, LayoutTemplate, Layers } from 'lucide-react';
import type { Task } from '@/types';
import { detectCurrency, detectCurrencyFromPrice, formatPrice } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';

interface SourceDataPanelProps {
  task: Task;
  onUpdate: (updates: Partial<Task>) => void;
  readonly?: boolean;
}

function bulletsFromRaw(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseAsinList(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[\s,;，；]+/)
    .map((v) => v.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean)
    .filter((v) => {
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
}

function parseEanList(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[\s,;，；]+/)
    .map((v) => v.trim().replace(/\D/g, ''))
    .filter(Boolean)
    .filter((v) => {
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

// Auto-grow textarea helper
function AutoTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows = 2,
  className = '',
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      className={`w-full resize-none bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] text-slate-700 leading-relaxed focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none transition ${className}`}
    />
  );
}

export function SourceDataPanel({ task, onUpdate, readonly = false }: SourceDataPanelProps) {
  const { t } = useTranslation();
  const currency = detectCurrencyFromPrice(task.price) ?? detectCurrency(task.url);
  const profile = useAuthStore((s) => s.profile);
  const editorCountry = (profile?.countryCode ?? task.countryCode ?? 'GLOBAL').toUpperCase();

  const extraAsinsByCountry = task.extraAsinsByCountry ?? {};
  const eansByCountry = task.eansByCountry ?? {};
  const currentCountryExtraAsins = extraAsinsByCountry[editorCountry] ?? task.extraAsins ?? [];
  const currentCountryEans = eansByCountry[editorCountry] ?? task.eans ?? [];

  const [title, setTitle] = useState(task.name ?? '');
  const [bulletsRaw, setBulletsRaw] = useState((task.bullets ?? []).join('\n\n'));
  const [description, setDescription] = useState(task.description ?? '');
  const [extraAsinsRaw, setExtraAsinsRaw] = useState(currentCountryExtraAsins.join('\n'));
  const [eansRaw, setEansRaw] = useState(currentCountryEans.join('\n'));

  useEffect(() => {
    setTitle(task.name ?? '');
    setBulletsRaw((task.bullets ?? []).join('\n\n'));
    setDescription(task.description ?? '');
    setExtraAsinsRaw((task.extraAsinsByCountry?.[editorCountry] ?? task.extraAsins ?? []).join('\n'));
    setEansRaw((task.eansByCountry?.[editorCountry] ?? task.eans ?? []).join('\n'));
  }, [task.id, editorCountry]);

  const draftBullets = useMemo(() => bulletsFromRaw(bulletsRaw), [bulletsRaw]);
  const draftExtraAsins = useMemo(() => parseAsinList(extraAsinsRaw), [extraAsinsRaw]);
  const draftEans = useMemo(() => parseEanList(eansRaw), [eansRaw]);
  const taskBullets = task.bullets ?? [];
  const taskExtraAsins = currentCountryExtraAsins;
  const taskEans = currentCountryEans;
  const allCountryExtraAsins = useMemo(
    () => Object.entries(extraAsinsByCountry).flatMap(([country, values]) => values.map((value) => ({ country, value }))),
    [extraAsinsByCountry],
  );
  const allCountryEans = useMemo(
    () => Object.entries(eansByCountry).flatMap(([country, values]) => values.map((value) => ({ country, value }))),
    [eansByCountry],
  );

  const isDirty =
    title !== (task.name ?? '') ||
    JSON.stringify(draftBullets) !== JSON.stringify(taskBullets) ||
    description !== (task.description ?? '') ||
    JSON.stringify(draftExtraAsins) !== JSON.stringify(taskExtraAsins) ||
    JSON.stringify(draftEans) !== JSON.stringify(taskEans);

  const handleConfirmSync = () => {
    const patch: Partial<Task> = {};
    if (title !== (task.name ?? '')) patch.name = title;
    if (JSON.stringify(draftBullets) !== JSON.stringify(taskBullets)) patch.bullets = draftBullets;
    if (description !== (task.description ?? '')) patch.description = description;
    if (JSON.stringify(draftExtraAsins) !== JSON.stringify(taskExtraAsins)) {
      const nextByCountry = { ...extraAsinsByCountry, [editorCountry]: draftExtraAsins };
      if (draftExtraAsins.length === 0) delete nextByCountry[editorCountry];
      patch.extraAsinsByCountry = nextByCountry;
      patch.extraAsins = unique(Object.values(nextByCountry).flat());
    }
    if (JSON.stringify(draftEans) !== JSON.stringify(taskEans)) {
      const nextByCountry = { ...eansByCountry, [editorCountry]: draftEans };
      if (draftEans.length === 0) delete nextByCountry[editorCountry];
      patch.eansByCountry = nextByCountry;
      patch.eans = unique(Object.values(nextByCountry).flat());
    }
    if (Object.keys(patch).length > 0) onUpdate(patch);
  };

  const handleDiscard = () => {
    setTitle(task.name ?? '');
    setBulletsRaw((task.bullets ?? []).join('\n\n'));
    setDescription(task.description ?? '');
    setExtraAsinsRaw(currentCountryExtraAsins.join('\n'));
    setEansRaw(currentCountryEans.join('\n'));
  };

  const hasSpecs = task.specs && Object.keys(task.specs).length > 0;
  const hasImages = task.images && task.images.length > 0;
  const hasAplus = task.aplus && task.aplus.length > 0;

  return (
    <div className="w-[30%] bg-white border-r border-slate-200 flex flex-col h-full z-0 shadow-sm relative min-h-0">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0">
        <FileText size={16} className="text-slate-500" />
        <h2 className="font-semibold text-slate-700 text-sm">{t('ws.source')}</h2>
        <span className="ml-auto text-[11px] text-slate-400 font-medium uppercase tracking-wide">
          {currency.code}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <div className="space-y-5 animate-in fade-in duration-500">
          {(task.brand || task.price) && (
            <div className="flex items-center gap-3 flex-wrap">
              {task.brand && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1">
                  <Tag size={11} />
                  {task.brand}
                </span>
              )}
              {task.price && (
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                  {formatPrice(task.price, currency)}
                </span>
              )}
            </div>
          )}

          <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-3">
            <p className="text-[10px] text-slate-400">
              {t('sourcePanel.identifierCountryScope', { country: editorCountry })}
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                {t('sourcePanel.extraAsins')}
                {task.asin && (
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-400 text-[10px]">
                    {t('sourcePanel.primaryAsin', { asin: task.asin })}
                  </span>
                )}
              </label>
              <AutoTextarea
                value={extraAsinsRaw}
                onChange={setExtraAsinsRaw}
                placeholder={t('sourcePanel.extraAsinsPlaceholder')}
                minRows={2}
                disabled={readonly}
                className="bg-white"
              />
            </div>

            {allCountryExtraAsins.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allCountryExtraAsins.map((item) => (
                  <span
                    key={`asin-${item.country}-${item.value}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[10px] text-slate-600"
                  >
                    <span className="text-slate-400">{item.country}</span>
                    <span className="font-mono">{item.value}</span>
                  </span>
                ))}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                {t('sourcePanel.eans')}
              </label>
              <AutoTextarea
                value={eansRaw}
                onChange={setEansRaw}
                placeholder={t('sourcePanel.eansPlaceholder')}
                minRows={2}
                disabled={readonly}
                className="bg-white"
              />
            </div>

            {allCountryEans.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allCountryEans.map((item) => (
                  <span
                    key={`ean-${item.country}-${item.value}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[10px] text-slate-600"
                  >
                    <span className="text-slate-400">{item.country}</span>
                    <span className="font-mono">{item.value}</span>
                  </span>
                ))}
              </div>
            )}

            <p className="text-[10px] text-slate-400 leading-relaxed">
              {t('sourcePanel.identifierHint')}
            </p>
          </section>

          <section>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('section.title')}
            </label>
            <AutoTextarea
              value={title}
              onChange={setTitle}
              placeholder={t('sourcePanel.titlePlaceholder')}
              minRows={2}
              disabled={readonly}
            />
          </section>

          <section>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('section.bullets')}
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 text-[10px]">
                {t('sourcePanel.bulletsPerLine')}
              </span>
            </label>
            <AutoTextarea
              value={bulletsRaw}
              onChange={setBulletsRaw}
              placeholder={t('sourcePanel.bulletsPlaceholder')}
              minRows={4}
              disabled={readonly}
            />
          </section>

          <section>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('section.desc')}
            </label>
            <AutoTextarea
              value={description}
              onChange={setDescription}
              placeholder={t('sourcePanel.descPlaceholder')}
              minRows={3}
              disabled={readonly}
            />
          </section>

          {hasSpecs && (
            <section>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Layers size={11} /> {t('sourcePanel.specs')}
                <span className="text-slate-300 font-normal">{t('sourcePanel.itemsCount', { count: Object.keys(task.specs!).length })}</span>
              </h4>
              <div className="bg-slate-50 border border-slate-100 rounded-lg overflow-hidden">
                {Object.entries(task.specs!).map(([k, v], i) => (
                  <div
                    key={k}
                    className={`flex gap-2 px-3 py-1.5 text-[12px] ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    <span className="text-slate-400 font-medium shrink-0 w-36 truncate" title={k}>
                      {k}
                    </span>
                    <span className="text-slate-700 flex-1">{v}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasImages && (
            <div className="flex items-center gap-2 text-[12px] text-slate-500">
              <ImageOff size={13} className="text-slate-400" />
              {t('sourcePanel.imagesFetched', { count: task.images!.length })}
            </div>
          )}

          {hasAplus && (
            <div className="flex items-center gap-2 text-[12px] text-slate-500">
              <LayoutTemplate size={13} className="text-slate-400" />
              {t('sourcePanel.aplusModules', { count: task.aplus!.length })}
            </div>
          )}

          {!task.bullets?.length && !task.description && !hasSpecs && (
            <div className="text-center py-8 text-slate-400">
              <FileText size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('sourcePanel.emptyTitle')}</p>
              <p className="text-xs mt-1">{t('sourcePanel.emptyDesc')}</p>
            </div>
          )}
        </div>
      </div>

      {!readonly && (
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              type="button"
              disabled={!isDirty}
              onClick={handleDiscard}
              className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition"
            >
              {t('ws.sourceDiscard')}
            </button>
            <button
              type="button"
              disabled={!isDirty}
              onClick={handleConfirmSync}
              className="px-3 py-2 text-xs font-medium text-white bg-[#0052D9] rounded-lg hover:bg-blue-800 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
            >
              {t('ws.sourceConfirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
