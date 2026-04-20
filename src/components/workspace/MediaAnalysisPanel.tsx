/**
 * MediaAnalysisPanel — specs / images / A+ content analysis
 * with Gemini Vision image understanding.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers, Image, LayoutTemplate,
  ChevronDown, ChevronUp, ExternalLink,
  Sparkles, Loader2, AlertTriangle,
  Download, X,
} from 'lucide-react';
import type { Task, AppSettings, Rule } from '@/types';
import { analyzeProductImages, parseLLMError } from '@/services/llm';
import { normalizeProductImageUrl, remoteProductImgProps } from '@/lib/remoteImage';
import { downloadProductImageSeries, sanitizeAsinForFilename } from '@/lib/downloadProductImages';

interface MediaAnalysisPanelProps {
  task: Task;
  appSettings: AppSettings;
  rules: Rule[];
}

function SectionHeader({
  icon, title, count, open, onToggle, actions,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 flex-1 text-left"
      >
        {icon}
        {title}
        {count !== undefined && (
          <span className="ml-1 px-1.5 py-0.5 bg-blue-50 text-[#0052D9] rounded text-[10px] font-bold">
            {count}
          </span>
        )}
        {open
          ? <ChevronUp size={14} className="text-slate-400 ml-auto" />
          : <ChevronDown size={14} className="text-slate-400 ml-auto" />
        }
      </button>
      {actions && <div className="ml-3 shrink-0">{actions}</div>}
    </div>
  );
}

export function MediaAnalysisPanel({ task, appSettings, rules }: MediaAnalysisPanelProps) {
  const { t } = useTranslation();

  const [specsOpen,  setSpecsOpen]  = useState(true);
  const [imagesOpen, setImagesOpen] = useState(true);
  const [aplusOpen,  setAplusOpen]  = useState(true);

  const [imgAnalysis,     setImgAnalysis]     = useState<string | null>(null);
  const [imgAnalysisLoading, setImgAnalysisLoading] = useState(false);
  const [imgAnalysisError,   setImgAnalysisError]   = useState<string | null>(null);

  const [asinDownloadOpen, setAsinDownloadOpen] = useState(false);
  const [asinInput, setAsinInput] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);

  const specs  = task.specs  ?? {};
  const images = (task.images ?? [])
    .map((u) => normalizeProductImageUrl(u))
    .filter((u) => u.startsWith('http'));
  const aplus  = task.aplus  ?? [];

  const hasSpecs  = Object.keys(specs).length > 0;
  const hasImages = images.length > 0;
  const hasAplus  = aplus.length > 0;

  if (!hasSpecs && !hasImages && !hasAplus) return null;

  // Collect rule names for image analysis context
  const activeRuleTexts = rules
    .filter((r) => r.active && (r.targetSection === 'all' || r.targetSection === 'title'))
    .map((r) => r.name)
    .slice(0, 10);

  const handleAnalyzeImages = async () => {
    if (!appSettings.apiKey) {
      setImgAnalysisError('请先在设置中配置 Google API 密钥。');
      return;
    }
    setImgAnalysisLoading(true);
    setImgAnalysisError(null);
    setImgAnalysis(null);
    try {
      const result = await analyzeProductImages(
        images,
        activeRuleTexts,
        appSettings.model,
        appSettings.apiKey,
      );
      setImgAnalysis(result);
    } catch (err) {
      setImgAnalysisError(parseLLMError(err));
    } finally {
      setImgAnalysisLoading(false);
    }
  };

  const openAsinDownload = () => {
    const pre = sanitizeAsinForFilename(task.asin) || task.asin.trim().toUpperCase();
    setAsinInput(pre);
    setDownloadError(null);
    setDownloadProgress(null);
    setAsinDownloadOpen(true);
  };

  const closeAsinDownload = () => {
    if (downloadBusy) return;
    setAsinDownloadOpen(false);
    setDownloadError(null);
  };

  const runBulkDownload = async () => {
    const cleaned = sanitizeAsinForFilename(asinInput);
    if (cleaned.length < 8) {
      setDownloadError(t('ws.imageDownloadInvalidAsin'));
      return;
    }
    setDownloadBusy(true);
    setDownloadError(null);
    setDownloadProgress({ current: 0, total: images.length });
    try {
      await downloadProductImageSeries(images, cleaned, (p) => setDownloadProgress(p));
      setAsinDownloadOpen(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setDownloadError(`${t('ws.imageDownloadFailed')}: ${detail} ${t('ws.imageDownloadProxyHint')}`);
    } finally {
      setDownloadBusy(false);
      setDownloadProgress(null);
    }
  };

  return (
    <>
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-[#0052D9]/5 border-b border-slate-200">
        <h3 className="text-[13px] font-semibold text-[#0052D9]">媒体与参数分析</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">TinyFish 抓取的产品多媒体与结构化数据</p>
      </div>

      {/* ── Specs ── */}
      {hasSpecs && (
        <div className="border-b border-slate-100">
          <SectionHeader
            icon={<Layers size={14} className="text-slate-500" />}
            title="技术参数"
            count={Object.keys(specs).length}
            open={specsOpen}
            onToggle={() => setSpecsOpen((v) => !v)}
          />
          {specsOpen && (
            <div className="p-4">
              <div className="rounded-lg overflow-hidden border border-slate-100">
                {Object.entries(specs).map(([k, v], i) => (
                  <div
                    key={k}
                    className={`grid grid-cols-5 gap-2 px-3 py-2 text-[12px] ${
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    }`}
                  >
                    <span className="col-span-2 text-slate-500 font-medium truncate" title={k}>{k}</span>
                    <span className="col-span-3 text-slate-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Images + AI Vision ── */}
      {hasImages && (
        <div className="border-b border-slate-100">
          <SectionHeader
            icon={<Image size={14} className="text-slate-500" />}
            title="产品图片"
            count={images.length}
            open={imagesOpen}
            onToggle={() => setImagesOpen((v) => !v)}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={openAsinDownload}
                  disabled={downloadBusy || imgAnalysisLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded text-[11px] font-medium transition disabled:opacity-50"
                >
                  <Download size={11} />
                  {t('ws.imageBulkDownload')}
                </button>
                <button
                  type="button"
                  onClick={handleAnalyzeImages}
                  disabled={imgAnalysisLoading || downloadBusy}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 rounded text-[11px] font-medium transition disabled:opacity-50"
                >
                  {imgAnalysisLoading
                    ? <><Loader2 size={11} className="animate-spin" /> 分析中...</>
                    : <><Sparkles size={11} /> AI 图片理解</>
                  }
                </button>
              </div>
            }
          />
          {imagesOpen && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {images.map((src, i) => (
                  <a
                    key={i}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square rounded-lg overflow-hidden border border-slate-100 bg-slate-50 block hover:border-[#0052D9] transition"
                  >
                    <img
                      {...remoteProductImgProps}
                      src={src}
                      alt={`product-${i + 1}`}
                      className="h-full w-full min-h-0 min-w-0 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
                      <ExternalLink size={14} className="text-white opacity-0 group-hover:opacity-100 transition drop-shadow" />
                    </div>
                    <span className="absolute bottom-1 right-1 text-[9px] text-slate-400 bg-white/80 px-1 rounded">
                      {i + 1}
                    </span>
                  </a>
                ))}
              </div>

              {/* Analysis error */}
              {imgAnalysisError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{imgAnalysisError}</span>
                </div>
              )}

              {/* Analysis result */}
              {imgAnalysis && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles size={13} className="text-violet-600" />
                    <span className="text-[12px] font-semibold text-violet-700">AI 图片分析报告</span>
                  </div>
                  <div className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {imgAnalysis}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── A+ Content ── */}
      {hasAplus && (
        <div>
          <SectionHeader
            icon={<LayoutTemplate size={14} className="text-slate-500" />}
            title="A+ 内容模块"
            count={aplus.length}
            open={aplusOpen}
            onToggle={() => setAplusOpen((v) => !v)}
          />
          {aplusOpen && (
            <div className="p-4 space-y-3">
              {aplus.map((mod, i) => (
                <div
                  key={i}
                  className="flex gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <div className="shrink-0 w-6 h-6 bg-[#0052D9]/10 text-[#0052D9] rounded-full flex items-center justify-center text-[11px] font-bold">
                    {i + 1}
                  </div>
                  {mod.imageUrl && normalizeProductImageUrl(mod.imageUrl).startsWith('http') && (
                    <a
                      href={normalizeProductImageUrl(mod.imageUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-20 h-20 border border-slate-100 rounded-lg bg-white overflow-hidden block hover:border-[#0052D9] transition"
                    >
                      <img
                        {...remoteProductImgProps}
                        src={normalizeProductImageUrl(mod.imageUrl)}
                        alt=""
                        className="h-full w-full min-h-0 min-w-0 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </a>
                  )}
                  <div className="flex-1 min-w-0">
                    {mod.headline && (
                      <p className="text-[13px] font-semibold text-slate-800 mb-1 leading-snug">{mod.headline}</p>
                    )}
                    {mod.body && (
                      <p className="text-[12px] text-slate-600 leading-relaxed line-clamp-4">{mod.body}</p>
                    )}
                    {!mod.headline && !mod.body && (
                      <p className="text-[12px] text-slate-400 italic">（无文字内容）</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    {asinDownloadOpen && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <h4 className="text-sm font-semibold text-slate-800">{t('ws.imageDownloadTitle')}</h4>
            <button
              type="button"
              onClick={closeAsinDownload}
              disabled={downloadBusy}
              className="p-1 text-slate-400 hover:text-slate-600 rounded disabled:opacity-40"
              aria-label={t('ws.imageDownloadCancel')}
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">{t('ws.imageDownloadAsinLabel')}</label>
              <input
                type="text"
                value={asinInput}
                onChange={(e) => setAsinInput(e.target.value.toUpperCase())}
                placeholder={t('ws.imageDownloadAsinPlaceholder')}
                disabled={downloadBusy}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono tracking-wide focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none disabled:bg-slate-50"
                autoComplete="off"
              />
            </div>
            {downloadError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{downloadError}</p>
            )}
            {downloadBusy && downloadProgress && (
              <p className="text-[12px] text-slate-500 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin shrink-0" />
                {t('ws.imageDownloadProgress', {
                  current: downloadProgress.current,
                  total: downloadProgress.total,
                })}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeAsinDownload}
                disabled={downloadBusy}
                className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                {t('ws.imageDownloadCancel')}
              </button>
              <button
                type="button"
                onClick={() => void runBulkDownload()}
                disabled={downloadBusy}
                className="px-3 py-2 text-xs font-medium text-white bg-[#0052D9] rounded-lg hover:bg-blue-800 disabled:opacity-40 flex items-center gap-1.5"
              >
                {downloadBusy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {t('ws.imageDownloadStart')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
