/**
 * SourceDataPanel — left panel of the Workspace.
 *
 * Displays the raw product data fetched by TinyFish and lets the user
 * correct any extraction errors in-place. Edits are persisted back to
 * the Task (and therefore Firestore) on blur.
 *
 * Fields:
 *   Editable  — 商品标题, 五点描述, 产品描述
 *   Read-only — Brand, Price (currency auto-detected from URL), Specs,
 *               Images count, A+ count
 */
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Tag, ImageOff, LayoutTemplate, Layers } from 'lucide-react';
import type { Task } from '@/types';
import { detectCurrency, detectCurrencyFromPrice, formatPrice } from '@/lib/currency';

interface SourceDataPanelProps {
  task: Task;
  onUpdate: (updates: Partial<Task>) => void;
}

// Auto-grow textarea helper
function AutoTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows = 2,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
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
      className={`w-full resize-none bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] text-slate-700 leading-relaxed focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none transition ${className}`}
    />
  );
}

export function SourceDataPanel({ task, onUpdate }: SourceDataPanelProps) {
  const { t } = useTranslation();
  // Price symbol takes priority over URL domain for currency detection
  const currency = detectCurrencyFromPrice(task.price) ?? detectCurrency(task.url);

  // ── Local editable state ────────────────────────────────────
  // Initialised from task; reset when task.id changes (different task selected)
  const [title, setTitle]         = useState(task.name ?? '');
  const [bulletsRaw, setBulletsRaw] = useState((task.bullets ?? []).join('\n\n'));
  const [description, setDescription] = useState(task.description ?? '');

  useEffect(() => {
    setTitle(task.name ?? '');
    setBulletsRaw((task.bullets ?? []).join('\n\n'));
    setDescription(task.description ?? '');
  }, [task.id]);

  // ── Persist on blur ─────────────────────────────────────────
  const saveTitle = () => {
    if (title !== task.name) onUpdate({ name: title });
  };

  const saveBullets = () => {
    const lines = bulletsRaw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const current = task.bullets ?? [];
    if (JSON.stringify(lines) !== JSON.stringify(current)) {
      onUpdate({ bullets: lines });
    }
  };

  const saveDescription = () => {
    if (description !== task.description) onUpdate({ description });
  };

  const hasSpecs  = task.specs  && Object.keys(task.specs).length  > 0;
  const hasImages = task.images && task.images.length > 0;
  const hasAplus  = task.aplus  && task.aplus.length  > 0;

  return (
    <div className="w-[30%] bg-white border-r border-slate-200 flex flex-col h-full z-0 shadow-sm relative">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0">
        <FileText size={16} className="text-slate-500" />
        <h2 className="font-semibold text-slate-700 text-sm">{t('ws.source')}</h2>
        <span className="ml-auto text-[11px] text-slate-400 font-medium uppercase tracking-wide">
          {currency.code}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-5 animate-in fade-in duration-500">

          {/* Brand + Price row */}
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

          {/* 商品标题 — editable */}
          <section>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('section.title')}
            </label>
            <AutoTextarea
              value={title}
              onChange={setTitle}
              onBlur={saveTitle}
              placeholder="产品标题…"
              minRows={2}
            />
          </section>

          {/* 五点描述 — editable (one bullet per line) */}
          <section>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('section.bullets')}
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 text-[10px]">
                每行一条
              </span>
            </label>
            <AutoTextarea
              value={bulletsRaw}
              onChange={setBulletsRaw}
              onBlur={saveBullets}
              placeholder="• Bullet 1&#10;• Bullet 2"
              minRows={4}
            />
          </section>

          {/* 产品描述 — editable */}
          <section>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('section.desc')}
            </label>
            <AutoTextarea
              value={description}
              onChange={setDescription}
              onBlur={saveDescription}
              placeholder="产品描述…"
              minRows={3}
            />
          </section>

          {/* Specs — read-only table */}
          {hasSpecs && (
            <section>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Layers size={11} /> Specs
                <span className="text-slate-300 font-normal">
                  {Object.keys(task.specs!).length} 项
                </span>
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

          {/* Images count badge */}
          {hasImages && (
            <div className="flex items-center gap-2 text-[12px] text-slate-500">
              <ImageOff size={13} className="text-slate-400" />
              已抓取 {task.images!.length} 张产品图片
            </div>
          )}

          {/* A+ count badge */}
          {hasAplus && (
            <div className="flex items-center gap-2 text-[12px] text-slate-500">
              <LayoutTemplate size={13} className="text-slate-400" />
              A+ 内容 {task.aplus!.length} 个模块
            </div>
          )}

          {/* Empty state */}
          {!task.bullets?.length && !task.description && !hasSpecs && (
            <div className="text-center py-8 text-slate-400">
              <FileText size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">暂无原始数据</p>
              <p className="text-xs mt-1">通过 TinyFish 抓取产品页面后自动填充</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
