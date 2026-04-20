import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Search, RefreshCw, CheckCircle, AlertCircle, Loader2,
  ChevronDown, ChevronUp, ImageOff,
} from 'lucide-react';
import type { Task, AppSettings } from '@/types';
import {
  fetchListingSSE, extractAsinFromUrl,
  ALL_FETCH_FIELDS, FETCH_FIELD_LABELS,
  type FetchedListing, type FetchField,
} from '@/services/tinyfish';
import { normalizeProductImageUrl, remoteProductImgProps } from '@/lib/remoteImage';

type Step = 'input' | 'fetching' | 'preview' | 'error';

interface CreateTaskModalProps {
  categories: string[];
  appSettings: AppSettings;
  onClose: () => void;
  onCreate: (task: Omit<Task, 'id' | 'createdAt'>) => void;
}

// ── Small collapsible section used in the preview ────────────
function PreviewSection({
  title, count, children, defaultOpen = true,
}: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition text-left"
      >
        <span className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
          {title}
          {count !== undefined && (
            <span className="px-1.5 py-0.5 bg-blue-50 text-[#0052D9] rounded text-[10px] font-bold">{count}</span>
          )}
        </span>
        {open ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export function CreateTaskModal({ categories, appSettings, onClose, onCreate }: CreateTaskModalProps) {
  const { t } = useTranslation();
  const [step, setStep]           = useState<Step>('input');
  const [url, setUrl]             = useState('');
  const [category, setCategory]   = useState(categories[0] ?? '通用');
  const [logs, setLogs]           = useState<string[]>([]);
  const [errorMsg, setErrorMsg]   = useState('');
  const [fetched, setFetched]     = useState<FetchedListing | null>(null);
  const [editName, setEditName]   = useState('');
  const [editAsin, setEditAsin]   = useState('');
  const [imgIdx, setImgIdx]       = useState(0);
  // Content fields to fetch — default to all
  const [selectedFields, setSelectedFields] = useState<Set<FetchField>>(
    new Set(ALL_FETCH_FIELDS)
  );

  const toggleField = (field: FetchField) =>
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field); else next.add(field);
      return next;
    });

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const urlAsin = extractAsinFromUrl(url);

  const handleFetch = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    const apiKey = appSettings.tinyfishApiKey;
    if (!apiKey) {
      setErrorMsg('请先在设置中配置 TinyFish API Key');
      setStep('error');
      return;
    }
    setStep('fetching');
    setLogs(['正在连接 TinyFish Agent…']);
    setErrorMsg('');
    setImgIdx(0);
    try {
      const data = await fetchListingSSE(
        trimmedUrl,
        apiKey,
        selectedFields,
        (msg) => setLogs((prev) => [...prev, msg]),
      );
      setFetched(data);
      setEditName(data.title);
      setEditAsin(data.asin || urlAsin);
      setStep('preview');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  const handleCreate = () => {
    if (!editAsin.trim() && !editName.trim()) return;
    onCreate({
      asin:     editAsin.trim().toUpperCase() || `MANUAL-${Date.now()}`,
      name:     editName.trim(),
      category,
      language: appSettings.targetLanguage,
      personaIds: [],
      url:      url.trim() || undefined,
      status:   'review',
      // ── Persist TinyFish content to Firestore ──────────────
      brand:       fetched?.brand,
      price:       fetched?.price,
      bullets:     fetched?.bullets,
      description: fetched?.description,
      specs:       fetched?.specs,
      images:      fetched?.images,
      aplus:       fetched?.aplus,
    });
    onClose();
  };

  const resetToInput = () => {
    setStep('input');
    setLogs([]);
    setFetched(null);
    setErrorMsg('');
  };

  const images =
    fetched?.images?.map((u) => normalizeProductImageUrl(u)).filter((u) => u.startsWith('http')) ?? [];
  const hasSpecs = fetched?.specs && Object.keys(fetched.specs).length > 0;
  const hasAplus = fetched?.aplus && fetched.aplus.length > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center animate-in fade-in overflow-y-auto py-8 px-4">
      <div
        className={`bg-white rounded-2xl shadow-xl w-full overflow-hidden animate-in zoom-in-95 my-auto transition-all duration-300 ${
          step === 'preview' ? 'max-w-4xl' : 'max-w-md'
        }`}
      >
        {/* ── Header ──────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            {step === 'fetching' && <Loader2 size={15} className="animate-spin text-[#0052D9]" />}
            {step === 'preview'  && <CheckCircle size={15} className="text-green-500" />}
            {step === 'error'    && <AlertCircle size={15} className="text-red-500" />}
            {step === 'input'    && t('modal.createTask')}
            {step === 'fetching' && '正在获取产品数据…'}
            {step === 'preview'  && '数据预览 — 确认后创建任务'}
            {step === 'error'    && '获取失败'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={20} />
          </button>
        </div>

        {/* ── STEP: Input ────────────────────────────────── */}
        {step === 'input' && (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                产品页面 URL
                <span className="text-slate-400 font-normal ml-1">(Amazon / TP-Link 官网)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  autoFocus
                  placeholder="https://www.amazon.de/dp/B0BWS5WBQ7  or  https://www.tp-link.com/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none shadow-inner"
                />
                <button
                  onClick={handleFetch}
                  disabled={!url.trim()}
                  className="px-4 py-2 bg-[#0052D9] text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                >
                  <Search size={14} />
                  获取数据
                </button>
              </div>
              {urlAsin && (
                <p className="text-xs text-slate-400 mt-1.5">
                  检测到 ASIN：<span className="font-mono text-[#0052D9]">{urlAsin}</span>
                </p>
              )}
            </div>

            {/* Content field selection */}
            <div>
              <p className="text-[13px] font-medium text-slate-700 mb-2">
                需要提取的内容
                <span className="text-slate-400 font-normal ml-1 text-xs">（标题/品牌/ASIN 默认提取）</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ALL_FETCH_FIELDS.map((field) => {
                  const checked = selectedFields.has(field);
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => toggleField(field)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        checked
                          ? 'bg-blue-50 border-[#0052D9] text-[#0052D9]'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                        checked ? 'border-[#0052D9] bg-[#0052D9]' : 'border-slate-300'
                      }`}>
                        {checked && (
                          <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-white">
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      {FETCH_FIELD_LABELS[field]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('modal.category')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] outline-none bg-white shadow-inner"
              >
                {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="pt-2 flex justify-end border-t border-slate-100">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition">
                {t('modal.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: Fetching ──────────────────────────────── */}
        {step === 'fetching' && (
          <div className="p-6 space-y-4">
            <div className="bg-slate-900 rounded-xl p-4 h-56 overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-500 shrink-0">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 size={12} className="animate-spin" />
              正在通过 TinyFish Agent 解析页面，提取标题/BP/描述/参数/图片/A+…
            </p>
            <div className="flex justify-end">
              <button
                onClick={resetToInput}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: Preview ────────────────────────────────── */}
        {step === 'preview' && fetched && (
          <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Row 1 — image gallery + editable meta */}
            <div className="grid grid-cols-5 gap-5">
              {/* Image gallery */}
              <div className="col-span-2 space-y-2">
                {images.length > 0 ? (
                  <>
                    <div className="aspect-square rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                      <img
                        {...remoteProductImgProps}
                        src={images[imgIdx]}
                        alt="product"
                        className="h-full w-full min-h-0 min-w-0 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    {images.length > 1 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {images.slice(0, 8).map((src, i) => (
                          <button
                            key={i}
                            onClick={() => setImgIdx(i)}
                            className={`w-10 h-10 rounded-md border overflow-hidden flex items-center justify-center bg-slate-50 transition ${
                              i === imgIdx ? 'border-[#0052D9] ring-1 ring-[#0052D9]' : 'border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            <img
                              {...remoteProductImgProps}
                              src={src}
                              alt=""
                              className="h-full w-full min-h-0 min-w-0 object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400">{images.length} 张图片已提取</p>
                  </>
                ) : (
                  <div className="aspect-square rounded-xl border border-slate-100 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <ImageOff size={28} className="opacity-40" />
                    <p className="text-xs">未获取到图片 URL</p>
                    <p className="text-[10px] text-slate-300 text-center px-3">图片通常需要浏览器会话或 CDN 鉴权</p>
                  </div>
                )}
              </div>

              {/* Editable metadata */}
              <div className="col-span-3 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">产品名称</label>
                  <textarea
                    rows={3}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none resize-none shadow-inner"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">ASIN</label>
                    <input type="text" value={editAsin} onChange={(e) => setEditAsin(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#0052D9] outline-none shadow-inner" />
                  </div>
                  {fetched.brand && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">品牌</label>
                      <input type="text" readOnly value={fetched.brand}
                        className="w-full border border-slate-100 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600 cursor-default shadow-inner" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">产品分类</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] outline-none bg-white shadow-inner">
                      {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  {fetched.price && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">价格</label>
                      <p className="text-sm font-semibold text-green-600 mt-2">{fetched.price}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2 — Bullet Points */}
            {fetched.bullets.length > 0 && (
              <PreviewSection title="Bullet Points" count={fetched.bullets.length}>
                <ul className="space-y-2">
                  {fetched.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2.5 items-start text-sm text-slate-700">
                      <span className="mt-0.5 w-5 h-5 bg-blue-50 text-[#0052D9] rounded text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </PreviewSection>
            )}

            {/* Row 3 — Description */}
            {fetched.description && (
              <PreviewSection title="产品描述" defaultOpen={false}>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{fetched.description}</p>
              </PreviewSection>
            )}

            {/* Row 4 — Specs */}
            {hasSpecs && (
              <PreviewSection title="技术参数" count={Object.keys(fetched.specs!).length} defaultOpen={false}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {Object.entries(fetched.specs!).map(([k, v]) => (
                    <div key={k} className="flex gap-2 py-1 border-b border-slate-50 last:border-0">
                      <span className="text-[12px] font-medium text-slate-500 shrink-0 w-36 truncate" title={k}>{k}</span>
                      <span className="text-[12px] text-slate-700 flex-1">{v}</span>
                    </div>
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* Row 5 — A+ Content */}
            {hasAplus && (
              <PreviewSection title="A+ 内容" count={fetched.aplus!.length} defaultOpen={false}>
                <div className="space-y-4">
                  {fetched.aplus!.map((mod, i) => (
                    <div key={i} className="flex gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      {mod.imageUrl && normalizeProductImageUrl(mod.imageUrl).startsWith('http') && (
                        <img
                          {...remoteProductImgProps}
                          src={normalizeProductImageUrl(mod.imageUrl)}
                          alt=""
                          className="w-20 h-20 min-h-0 min-w-0 object-contain rounded-md border border-slate-100 bg-white shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        {mod.headline && <p className="text-[13px] font-semibold text-slate-700 mb-1">{mod.headline}</p>}
                        {mod.body && <p className="text-xs text-slate-600 leading-relaxed">{mod.body}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* Footer */}
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center sticky bottom-0 bg-white pb-1">
              <button onClick={resetToInput} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition">
                <RefreshCw size={13} />重新获取
              </button>
              <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition">
                  {t('modal.cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!editAsin.trim() && !editName.trim()}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#0052D9] hover:bg-blue-800 rounded-md transition shadow-sm flex items-center gap-1.5 disabled:opacity-40"
                >
                  <CheckCircle size={14} />确认创建任务
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Error ──────────────────────────────────── */}
        {step === 'error' && (
          <div className="p-6 space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700 font-mono break-all">
              {errorMsg}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition">
                {t('modal.cancel')}
              </button>
              <button onClick={resetToInput} className="px-4 py-2 text-sm font-medium text-white bg-[#0052D9] hover:bg-blue-800 rounded-md transition shadow-sm flex items-center gap-1.5">
                <RefreshCw size={13} />重试
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
