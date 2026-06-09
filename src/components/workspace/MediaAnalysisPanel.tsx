/**
 * MediaAnalysisPanel — specs / images / A+ content analysis
 * with Gemini Vision image understanding + Image 2 generation.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers, Image, LayoutTemplate,
  ChevronDown, ChevronUp, ExternalLink,
  Loader2, AlertTriangle, RefreshCw,
  Download, X, Wand2, Images, Trash2,
  Paperclip, FileText, File as FileIcon,
} from 'lucide-react';
import type { Task, AppSettings, Rule, LanguageCode, AplusModule, TaskAttachment } from '@/types';
import { generateProductImage, parseLLMError } from '@/services/llm';
import type { ImageGenMode } from '@/services/llm';
import { normalizeProductImageUrl, remoteProductImgProps } from '@/lib/remoteImage';
import { downloadProductImageSeriesZip, sanitizeAsinForFilename } from '@/lib/downloadProductImages';
import { uploadAiImage, deleteAiImage, isAiImageStorageUrl, uploadTaskAttachment } from '@/services/imageStorageService';
import { fetchListingSSE, type FetchField } from '@/services/tinyfish';
import { useTaskStore } from '@/store/taskStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { resolveWorkspaceApiKey, isCountryRouteToken } from '@/lib/apiKeyResolver';
import { isGlobalCategory, localizeSystemText } from '@/lib/systemTextI18n';
import { inferCountryFromLanguage } from '@/lib/countryLanguage';
import { LANGUAGES } from '@/constants';

interface MediaAnalysisPanelProps {
  task: Task;
  appSettings: AppSettings;
  rules: Rule[];
}

type ImageQueueStatus = 'pending' | 'running' | 'success' | 'failed';

interface ImageQueueJob {
  id: string;
  taskId: string;
  groupId: string;
  groupLabel: string;
  primaryUrl: string;
  secondaryUrls: string[];
  variantIndex: number;
  totalVariants: number;
  status: ImageQueueStatus;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  dataUrl?: string;
  mode: ImageGenMode;
  customPrompt: string;
  ruleIds: string[];
}

interface OptimizeGroup {
  id: string;
  primaryUrl: string | null;
  secondaryUrls: string[];
  customPrompt: string;
  generationCount: number;
}

interface TaskImageGenState {
  genLoading: boolean;
  genError: string | null;
  genProgress: { current: number; total: number } | null;
  genQueue: ImageQueueJob[];
}

const SCENE_PROMPT_RE = /(场景|环境|客厅|厨房|卧室|办公|办公室|生活化|人手|人物|户外|室内|lifestyle|in[-\s]?context|room|kitchen|living|office|desk|hand model|people)/i;
const WHITE_BG_PROMPT_RE = /(白底|纯白|纯色背景|white\s*background|#?ffffff|isolated\s+on\s+white|no\s+props|无场景)/i;

type RefetchTarget = 'images' | 'aplus';

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

function imageRefetchMergeKey(url: string): string {
  const normalized = normalizeProductImageUrl(url).split('?')[0].trim();
  if (!normalized) return '';
  return normalized.replace(/\._[^.]+_\./g, '.').toLowerCase();
}

function mergeImageUrls(current: string[], incoming: string[]): { merged: string[]; added: number } {
  const merged = [...current];
  const existing = new Set(current.map(imageRefetchMergeKey).filter(Boolean));
  let added = 0;
  incoming.forEach((url) => {
    const normalized = normalizeProductImageUrl(url);
    if (!normalized.startsWith('http')) return;
    const key = imageRefetchMergeKey(normalized);
    if (!key || existing.has(key)) return;
    existing.add(key);
    merged.push(normalized);
    added += 1;
  });
  return { merged, added };
}

function aplusRefetchMergeKey(module: AplusModule): string {
  const headline = (module.headline ?? '').trim().toLowerCase();
  const body = (module.body ?? '').trim().toLowerCase();
  const imageUrl = normalizeProductImageUrl(module.imageUrl ?? '').split('?')[0].trim().toLowerCase();
  return `${headline}||${body}||${imageUrl}`;
}

function mergeAplusModules(current: AplusModule[], incoming: AplusModule[]): { merged: AplusModule[]; added: number } {
  const merged = [...current];
  const existing = new Set(current.map(aplusRefetchMergeKey));
  let added = 0;
  incoming.forEach((module) => {
    const key = aplusRefetchMergeKey(module);
    if (!key || existing.has(key)) return;
    existing.add(key);
    merged.push(module);
    added += 1;
  });
  return { merged, added };
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function createOptimizeGroup(primaryUrl: string | null): OptimizeGroup {
  return {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    primaryUrl,
    secondaryUrls: [],
    customPrompt: '',
    generationCount: 1,
  };
}

function detectPromptModeConflict(mode: ImageGenMode, prompt: string): 'scene_in_main' | 'white_in_lifestyle' | null {
  const text = prompt.trim();
  if (!text) return null;
  if (mode === 'main' && SCENE_PROMPT_RE.test(text)) return 'scene_in_main';
  if (mode === 'lifestyle' && WHITE_BG_PROMPT_RE.test(text)) return 'white_in_lifestyle';
  return null;
}

function createTaskImageGenState(): TaskImageGenState {
  return {
    genLoading: false,
    genError: null,
    genProgress: null,
    genQueue: [],
  };
}

export function MediaAnalysisPanel({ task, appSettings, rules }: MediaAnalysisPanelProps) {
  const { t } = useTranslation();
  const txt = (cn: string, en: string) => (appSettings.systemLanguage === 'cn' ? cn : en);

  const [specsOpen,  setSpecsOpen]  = useState(true);
  const [imagesOpen, setImagesOpen] = useState(true);
  const [aplusOpen,  setAplusOpen]  = useState(true);

  // ── Attachment area (drag / paste reference material) ───────
  const [attachmentsOpen, setAttachmentsOpen] = useState(true);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isAttachDragging, setIsAttachDragging] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const [asinDownloadOpen, setAsinDownloadOpen] = useState(false);
  const [asinInput, setAsinInput] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);

  // ── Image 2 generation state ────────────────────────────────
  const [genMode, setGenMode] = useState<ImageGenMode>('main');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [draggingImage, setDraggingImage] = useState<{ url: string; zone: 'export' | 'material' } | null>(null);
  const [dragOverZone, setDragOverZone] = useState<'export' | 'material' | null>(null);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [showOtherCountryRules, setShowOtherCountryRules] = useState(false);
  const [optimizeGroups, setOptimizeGroups] = useState<OptimizeGroup[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [workspaceImages, setWorkspaceImages] = useState<Array<{
    id: string;
    primaryUrl: string;
    secondaryUrls: string[];
    /** Persisted Firebase Storage download URL (https) — what we render. */
    imageUrl: string;
    /** Storage object path — kept so we can delete the blob later. */
    storagePath: string;
    debug: {
      model: 'image-2';
      mode: ImageGenMode;
      ruleCount: number;
      secondaryCount: number;
      customPrompt: string;
      groupLabel?: string;
    };
  }>>([]);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [genQueue, setGenQueue] = useState<ImageQueueJob[]>([]);
  const activeTaskIdRef = useRef(task.id);
  const imageGenStateByTaskRef = useRef<Record<string, TaskImageGenState>>({});
  const [refetchTarget, setRefetchTarget] = useState<RefetchTarget | null>(null);
  const [refetchLang, setRefetchLang] = useState<LanguageCode>(task.language);
  const [refetchHint, setRefetchHint] = useState('');
  const [refetchBusy, setRefetchBusy] = useState(false);
  const [refetchError, setRefetchError] = useState<string | null>(null);
  const [refetchResult, setRefetchResult] = useState<string | null>(null);
  const [refetchLogs, setRefetchLogs] = useState<string[]>([]);
  const [refetchElapsedSec, setRefetchElapsedSec] = useState(0);
  // Drives a once-per-second re-render so the "执行中 N s" elapsed counter
  // ticks while a job is running. Cheap; only enabled while jobs exist.
  const [, setNowTick] = useState(0);

  const updateTaskStore = useTaskStore((s) => s.updateTask);
  const allTasks        = useTaskStore((s) => s.tasks);
  const currentUser     = useAuthStore((s) => s.user);
  const profile         = useAuthStore((s) => s.profile);
  const persistSettings = useSettingsStore((s) => s.setAppSettings);
  const inferredCountryFromTaskLanguage = inferCountryFromLanguage(task.language);
  const imageApiKey = resolveWorkspaceApiKey({
    manualKey: appSettings.apiKey,
    countryCode: task.countryCode ?? profile?.countryCode,
    fallbackCountryCodes: [
      task.countryCode,
      inferredCountryFromTaskLanguage,
      profile?.countryCode,
    ],
  }).trim();
  const localCountryCode =
    profile && profile.role !== 'admin' && profile.countryCode !== 'GLOBAL'
      ? profile.countryCode
      : null;

  const specs  = task.specs  ?? {};
  // Filter to http(s) only. AI-generated images now live in Firebase Storage and
  // come back as full https URLs, so we no longer need to render data: URLs.
  // Stale data: URLs from earlier runs are intentionally hidden because they
  // never persisted (and were the root cause of the 1 MB Firestore bug).
  const exportImages = (task.images ?? [])
    .map((u) => normalizeProductImageUrl(u))
    .filter((u) => u.startsWith('http'));
  const materialImages = (task.materialImages ?? [])
    .map((u) => normalizeProductImageUrl(u))
    .filter((u) => u.startsWith('http') && !exportImages.includes(u));
  const allTaskImages = [...exportImages, ...materialImages];
  const aplus  = task.aplus  ?? [];
  const attachments = task.attachments ?? [];

  const hasSpecs  = Object.keys(specs).length > 0;
  const hasImages = allTaskImages.length > 0;
  const hasAplus  = aplus.length > 0;
  const hasAttachments = attachments.length > 0;
  const canRefetchMedia = Boolean(task.url?.trim());

  // Tick once a second only while at least one job is running, so elapsed-time
  // labels in the queue update without burning CPU when idle.
  useEffect(() => {
    const hasRunning = genQueue.some((q) => q.status === 'running');
    if (!hasRunning) return;
    const id = setInterval(() => setNowTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [genQueue]);

  useEffect(() => {
    setRefetchLang(task.language);
    setRefetchHint('');
    setRefetchError(null);
    setRefetchResult(null);
    setRefetchTarget(null);
    setRefetchLogs([]);
    setRefetchElapsedSec(0);
  }, [task.id, task.language]);

  useEffect(() => {
    if (!refetchBusy) return;
    const timer = setInterval(() => setRefetchElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [refetchBusy]);

  useEffect(() => {
    activeTaskIdRef.current = task.id;
    const state = getTaskImageGenState(task.id);
    setGenLoading(state.genLoading);
    setGenError(state.genError);
    setGenProgress(state.genProgress);
    setGenQueue(state.genQueue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  // ── Hydrate the workspace from persisted Storage URLs on mount / task switch.
  // Also strip any legacy `data:` base64 entries from task.images, since those
  // are what historically blew past Firestore's 1 MB doc limit and silently
  // killed all subsequent task writes (incl. AI listing edits). Must run
  // before any conditional return to keep hook order stable.
  useEffect(() => {
    const exportRaw = task.images ?? [];
    const materialRaw = task.materialImages ?? [];
    const hasLegacyDataUrls = [...exportRaw, ...materialRaw].some((u) => typeof u === 'string' && u.startsWith('data:'));
    if (hasLegacyDataUrls) {
      const cleanedExport = exportRaw.filter((u) => typeof u === 'string' && !u.startsWith('data:'));
      const cleanedMaterial = materialRaw.filter((u) => typeof u === 'string' && !u.startsWith('data:'));
      updateTaskStore(task.id, { images: cleanedExport, materialImages: cleanedMaterial });
    }
    const storageUrls = [...exportRaw, ...materialRaw]
      .map((u) => normalizeProductImageUrl(u))
      .filter((u) => u.startsWith('http') && isAiImageStorageUrl(u));

    setWorkspaceImages((prev) => {
      const known = new Map(prev.map((w) => [w.imageUrl, w]));
      return storageUrls.map((url) => {
        const existing = known.get(url);
        if (existing) return existing;
        return {
          id: `restore-${url.slice(-16)}`,
          primaryUrl: '',
          secondaryUrls: [],
          imageUrl: url,
          storagePath: '',
          debug: {
            model: 'image-2' as const,
            mode: 'main' as ImageGenMode,
            ruleCount: 0,
            secondaryCount: 0,
            customPrompt: '',
          },
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  if (!hasSpecs && !hasImages && !hasAplus && !canRefetchMedia && !hasAttachments) return null;

  // Source images for the optimisation dialog must exclude AI-generated outputs
  // (otherwise users would optimise their own outputs in a feedback loop).
  const sourceImages = allTaskImages.filter((u) => u.startsWith('http') && !isAiImageStorageUrl(u));

  const candidateRules = rules
    .filter((r) => r.active && (isGlobalCategory(r.category) || r.category === task.category))
    .filter((r) => {
      if (!localCountryCode) return true;
      const country = r.createdByCountry ?? localCountryCode;
      if (country === localCountryCode || country === 'GLOBAL') return true;
      return showOtherCountryRules;
    })
    .sort((a, b) => {
      const priority = (country?: string): number => {
        if (!localCountryCode) return 0;
        if (country === localCountryCode) return 0;
        if (country === 'GLOBAL') return 1;
        return 2;
      };
      const pa = priority(a.createdByCountry ?? localCountryCode ?? undefined);
      const pb = priority(b.createdByCountry ?? localCountryCode ?? undefined);
      if (pa !== pb) return pa - pb;
      const ta = a.updatedAt ?? a.createdAt ?? '';
      const tb = b.updatedAt ?? b.createdAt ?? '';
      return tb.localeCompare(ta);
    });
  const instructionRuleCount = candidateRules.filter((r) => r.type === 'instruction').length;
  const negativeRuleCount = candidateRules.filter((r) => r.type === 'negative').length;
  const rulePickKey = (rule: Rule): string => `${rule.createdByCountry ?? localCountryCode ?? 'GLOBAL'}:${rule.id}`;

  const getTaskImageGenState = (taskId: string): TaskImageGenState =>
    imageGenStateByTaskRef.current[taskId] ?? createTaskImageGenState();

  const patchTaskImageGenState = (taskId: string, patch: Partial<TaskImageGenState>) => {
    const next = { ...getTaskImageGenState(taskId), ...patch };
    imageGenStateByTaskRef.current[taskId] = next;
    if (activeTaskIdRef.current === taskId) {
      setGenLoading(next.genLoading);
      setGenError(next.genError);
      setGenProgress(next.genProgress);
      setGenQueue(next.genQueue);
    }
  };

  const updateTaskGenQueue = (taskId: string, updater: (prev: ImageQueueJob[]) => ImageQueueJob[]) => {
    const prev = getTaskImageGenState(taskId);
    patchTaskImageGenState(taskId, { genQueue: updater(prev.genQueue) });
  };

  const openOptimizeDialog = () => {
    setOptimizeOpen(true);
    setShowOtherCountryRules(false);
    patchTaskImageGenState(task.id, {
      genError: null,
      genProgress: null,
      // New round starts from a clean queue snapshot to avoid mixing old retries.
      genQueue: [],
    });
    setOptimizeGroups([createOptimizeGroup(sourceImages[0] ?? null)]);
    // Default: nothing checked. Restore the user's last selection (persisted in
    // settings), keeping only keys that still exist for the current category.
    const candidateKeys = new Set(candidateRules.map((r) => rulePickKey(r)));
    const restored = (appSettings.selectedImageRuleKeys ?? []).filter((k) => candidateKeys.has(k));
    setSelectedRuleIds(restored);
  };

  const closeOptimizeDialog = () => {
    setOptimizeOpen(false);
  };

  const addOptimizeGroup = () => {
    setOptimizeGroups((prev) => [...prev, createOptimizeGroup(sourceImages[0] ?? null)]);
  };

  const removeOptimizeGroup = (groupId: string) => {
    setOptimizeGroups((prev) => (prev.length <= 1 ? prev : prev.filter((g) => g.id !== groupId)));
  };

  const pickPrimaryImage = (groupId: string, url: string) => {
    setOptimizeGroups((prev) => prev.map((group) => (
      group.id === groupId
        ? {
            ...group,
            primaryUrl: url,
            secondaryUrls: group.secondaryUrls.filter((v) => v !== url),
          }
        : group
    )));
  };

  const toggleSecondaryImage = (groupId: string, url: string) => {
    setOptimizeGroups((prev) => prev.map((group) => {
      if (group.id !== groupId) return group;
      if (url === group.primaryUrl) return group;
      return {
        ...group,
        secondaryUrls: group.secondaryUrls.includes(url)
          ? group.secondaryUrls.filter((v) => v !== url)
          : [...group.secondaryUrls, url],
      };
    }));
  };

  const updateGroupPrompt = (groupId: string, prompt: string) => {
    setOptimizeGroups((prev) => prev.map((group) => (
      group.id === groupId ? { ...group, customPrompt: prompt } : group
    )));
  };

  const updateGroupCount = (groupId: string, count: number) => {
    setOptimizeGroups((prev) => prev.map((group) => (
      group.id === groupId ? { ...group, generationCount: count } : group
    )));
  };

  const toggleRulePick = (pickKey: string) => {
    setSelectedRuleIds((prev) => {
      const next = prev.includes(pickKey) ? prev.filter((v) => v !== pickKey) : [...prev, pickKey];
      // Persist the user's latest choice so it is restored next time the dialog opens.
      persistSettings({ selectedImageRuleKeys: next });
      return next;
    });
  };

  const removeWorkspaceImage = (id: string) => {
    const found = workspaceImages.find((w) => w.id === id);
    if (!found) return;
    const { latestExport, latestMaterial } = getLatestImageZones();
    persistImageZones(
      latestExport.filter((u) => u !== found.imageUrl),
      latestMaterial.filter((u) => u !== found.imageUrl),
    );
    setWorkspaceImages((prev) => prev.filter((w) => w.id !== id));
    // Best-effort cleanup of the underlying Storage blob; safe to ignore failures.
    void deleteAiImage(found.storagePath || found.imageUrl);
  };

  const getLatestImageZones = (taskId = task.id) => {
    const latestTask = allTasks.find((t) => t.id === taskId);
    const latestExport = (latestTask?.images ?? (taskId === task.id ? task.images : []) ?? [])
      .map((u) => normalizeProductImageUrl(u))
      .filter((u) => u.startsWith('http'));
    const latestMaterial = (latestTask?.materialImages ?? (taskId === task.id ? task.materialImages : []) ?? [])
      .map((u) => normalizeProductImageUrl(u))
      .filter((u) => u.startsWith('http') && !latestExport.includes(u));
    return { latestExport, latestMaterial };
  };

  const persistImageZones = (nextExport: string[], nextMaterial: string[], taskId = task.id) => {
    updateTaskStore(taskId, {
      images: nextExport,
      materialImages: nextMaterial,
    });
  };

  const removeTaskImage = (url: string) => {
    const { latestExport, latestMaterial } = getLatestImageZones();
    const normalized = normalizeProductImageUrl(url);
    const nextExport = latestExport.filter((u) => u !== normalized);
    const nextMaterial = latestMaterial.filter((u) => u !== normalized);
    persistImageZones(nextExport, nextMaterial);

    // AI outputs live in our Storage bucket, so deleting them should remove both
    // task references and the underlying blob.
    if (isAiImageStorageUrl(normalized)) {
      setWorkspaceImages((prev) => prev.filter((w) => w.imageUrl !== normalized));
      void deleteAiImage(normalized);
    }
  };

  const moveImageBetweenZones = (url: string, targetZone: 'export' | 'material') => {
    const { latestExport, latestMaterial } = getLatestImageZones();
    const normalized = normalizeProductImageUrl(url);
    const exportWithout = latestExport.filter((u) => u !== normalized);
    const materialWithout = latestMaterial.filter((u) => u !== normalized);
    if (targetZone === 'export') {
      persistImageZones([...exportWithout, normalized], materialWithout);
    } else {
      persistImageZones(exportWithout, [...materialWithout, normalized]);
    }
  };

  // ── Attachment handlers ─────────────────────────────────────
  const makeAttachmentId = (): string => `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const addAttachments = (next: TaskAttachment[]) => {
    if (next.length === 0) return;
    const latestTask = allTasks.find((t) => t.id === task.id);
    const current = latestTask?.attachments ?? task.attachments ?? [];
    updateTaskStore(task.id, { attachments: [...current, ...next] });
  };

  const addTextAttachment = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    addAttachments([{ id: makeAttachmentId(), kind: 'text', text, createdAt: new Date().toISOString() }]);
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (!currentUser?.uid) {
      setAttachError(txt('未登录账号，无法上传附件。请重新登录后再试。', 'You are not signed in. Please sign in again to upload attachments.'));
      return;
    }
    setAttachBusy(true);
    setAttachError(null);
    try {
      const uploaded: TaskAttachment[] = [];
      for (const file of files) {
        const { url, storagePath } = await uploadTaskAttachment({
          uid: currentUser.uid,
          taskId: task.id,
          file,
          fileName: file.name,
        });
        uploaded.push({
          id: makeAttachmentId(),
          kind: file.type.startsWith('image/') ? 'image' : 'file',
          url,
          storagePath,
          name: file.name,
          mimeType: file.type || undefined,
          size: file.size,
          createdAt: new Date().toISOString(),
        });
      }
      addAttachments(uploaded);
    } catch (err) {
      setAttachError(parseLLMError(err));
    } finally {
      setAttachBusy(false);
    }
  };

  const handleAttachDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsAttachDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) {
      void uploadFiles(files);
      return;
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text) addTextAttachment(text);
  };

  const handleAttachPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void uploadFiles(files);
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      e.preventDefault();
      addTextAttachment(text);
    }
  };

  const removeAttachment = (id: string) => {
    const latestTask = allTasks.find((t) => t.id === task.id);
    const current = latestTask?.attachments ?? task.attachments ?? [];
    const found = current.find((a) => a.id === id);
    updateTaskStore(task.id, { attachments: current.filter((a) => a.id !== id) });
    // Best-effort cleanup of the underlying Storage blob (text has none).
    if (found?.storagePath) void deleteAiImage(found.storagePath);
  };

  const runOneQueueJob = async (job: ImageQueueJob): Promise<{ url: string; storagePath: string }> => {
    if (!currentUser?.uid) {
      throw new Error(txt(
        '未登录账号，无法保存生成的图片。请重新登录后再试。',
        'You are not signed in. Please sign in again before saving generated images.',
      ));
    }
    const selectedRules = candidateRules.filter((r) => job.ruleIds.includes(rulePickKey(r)));
    const instructionRules = selectedRules
      .filter((r) => r.type === 'instruction')
      .map((r) => ({
        id: r.id,
        category: r.category,
        name: localizeSystemText(r.name, r.nameI18n, appSettings.systemLanguage),
        priority: r.priority,
        targetSection: r.targetSection,
      }));
    const negativeRules = selectedRules
      .filter((r) => r.type === 'negative')
      .map((r) => ({
        id: r.id,
        category: r.category,
        name: localizeSystemText(r.name, r.nameI18n, appSettings.systemLanguage),
        severity: r.severity,
        targetSection: r.targetSection,
      }));
    const result = await generateProductImage(
      {
        referenceImageUrls: [job.primaryUrl, ...job.secondaryUrls],
        instructionRules,
        negativeRules,
        customPrompt: job.customPrompt,
      },
      imageApiKey,
      { mode: job.mode, size: '1024x1024', quality: 'medium' },
    );

    // Push the bytes to Storage so the task document stays small (Firestore's
    // 1 MB per-doc cap would silently reject inline base64).
    const uploaded = await uploadAiImage({
      uid:      currentUser.uid,
      taskId:   job.taskId,
      base64:   result.imageBase64,
      mimeType: result.mimeType,
    });
    return { url: uploaded.url, storagePath: uploaded.storagePath };
  };

  const retryQueueJob = async (jobId: string) => {
    const job = genQueue.find((q) => q.id === jobId);
    if (!job || job.status !== 'failed') return;
    const taskId = job.taskId;
    patchTaskImageGenState(taskId, { genLoading: true });
    updateTaskGenQueue(taskId, (prev) => prev.map((q) => (q.id === jobId ? {
      ...q, status: 'running', error: undefined, startedAt: new Date().toISOString(), endedAt: undefined,
    } : q)));
    try {
      const { url, storagePath } = await runOneQueueJob(job);
      const { latestExport, latestMaterial } = getLatestImageZones(taskId);
      const nextExport = [...latestExport.filter((u) => u !== job.primaryUrl), url];
      const nextMaterial = latestMaterial.includes(job.primaryUrl)
        ? latestMaterial
        : [...latestMaterial, job.primaryUrl];
      persistImageZones(nextExport, nextMaterial, taskId);
      if (activeTaskIdRef.current === taskId) {
        setWorkspaceImages((prev) => [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        primaryUrl: job.primaryUrl,
        secondaryUrls: job.secondaryUrls,
        imageUrl: url,
        storagePath,
        debug: {
          model: 'image-2',
          mode: job.mode,
          ruleCount: job.ruleIds.length,
          secondaryCount: job.secondaryUrls.length,
          customPrompt: job.customPrompt.trim(),
          groupLabel: job.groupLabel,
        },
      }, ...prev]);
      }
      updateTaskGenQueue(taskId, (prev) => prev.map((q) => (q.id === jobId ? {
        ...q, status: 'success', dataUrl: url, endedAt: new Date().toISOString(),
      } : q)));
    } catch (err) {
      updateTaskGenQueue(taskId, (prev) => prev.map((q) => (q.id === jobId ? {
        ...q, status: 'failed', error: parseLLMError(err), endedAt: new Date().toISOString(),
      } : q)));
    } finally {
      patchTaskImageGenState(taskId, { genLoading: false });
    }
  };

  const retryAllFailed = async () => {
    const failed = genQueue.filter((q) => q.status === 'failed');
    for (const item of failed) {
      // eslint-disable-next-line no-await-in-loop
      await retryQueueJob(item.id);
    }
  };

  const downloadWorkspaceImage = (id: string) => {
    const found = workspaceImages.find((w) => w.id === id);
    if (!found) return;
    const asin = sanitizeAsinForFilename(task.asin) || 'PRODUCT';
    const slot = found.debug.mode === 'main' ? 'AIMAIN' : 'AILIFESTYLE';
    const filename = `${asin}.${slot}.${workspaceImages.findIndex((w) => w.id === id) + 1}.png`;
    const a = document.createElement('a');
    a.href = found.imageUrl;
    a.download = filename;
    a.rel = 'noopener';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const runSelectedOptimization = async () => {
    const taskId = task.id;
    if (!imageApiKey || (!imageApiKey.startsWith('sk-') && !isCountryRouteToken(imageApiKey))) {
      patchTaskImageGenState(taskId, { genError: txt(
        'Image 2 生图需要当前国家工作台配置的 OpenAI API 密钥（sk- 开头）。请在系统设置中更新该国家 API。',
        'Image 2 requires an OpenAI API key (starting with sk-) configured for the current country workspace.',
      ) });
      return;
    }
    if (optimizeGroups.length === 0) {
      patchTaskImageGenState(taskId, { genError: txt('请先至少配置 1 个生成分组。', 'Please configure at least one generation group.') });
      return;
    }
    const missingPrimaryIndex = optimizeGroups.findIndex((group) => !group.primaryUrl);
    if (missingPrimaryIndex >= 0) {
      patchTaskImageGenState(taskId, { genError: txt(
        `请先为分组 ${missingPrimaryIndex + 1} 选择 1 张主图参考。`,
        `Please select one primary reference image for group ${missingPrimaryIndex + 1}.`,
      ) });
      return;
    }
    const validSourceSet = new Set(sourceImages);
    const invalidRefIndex = optimizeGroups.findIndex((group) =>
      !group.primaryUrl ||
      !validSourceSet.has(group.primaryUrl) ||
      group.secondaryUrls.some((u) => !validSourceSet.has(u)),
    );
    if (invalidRefIndex >= 0) {
      patchTaskImageGenState(taskId, { genError: txt(
        `分组 ${invalidRefIndex + 1} 的主图/副图引用已失效，请重新选择后再生成。`,
        `Group ${invalidRefIndex + 1} has invalid primary/secondary references. Please reselect and try again.`,
      ) });
      return;
    }
    const conflictIndex = optimizeGroups.findIndex((group) =>
      detectPromptModeConflict(genMode, group.customPrompt) !== null,
    );
    if (conflictIndex >= 0) {
      const conflict = detectPromptModeConflict(genMode, optimizeGroups[conflictIndex].customPrompt);
      patchTaskImageGenState(taskId, { genError:
        conflict === 'scene_in_main'
          ? txt(
              `分组 ${conflictIndex + 1} 的提示词包含场景化需求，但当前模式是「主图（白底）」。请切换到「场景图」模式，或删除场景描述后重试。`,
              `Group ${conflictIndex + 1} prompt asks for lifestyle context, but mode is Main (white background). Switch to Lifestyle mode or remove scene requirements.`,
            )
          : txt(
              `分组 ${conflictIndex + 1} 的提示词包含白底/无场景要求，但当前模式是「场景图」。请切换到「主图（白底）」模式，或调整提示词后重试。`,
              `Group ${conflictIndex + 1} prompt asks for white-background/no-scene output, but mode is Lifestyle. Switch to Main mode or adjust the prompt.`,
            ),
      });
      return;
    }

    patchTaskImageGenState(taskId, {
      genLoading: true,
      genError: null,
      genProgress: null,
    });

    try {
      const jobs: ImageQueueJob[] = optimizeGroups.flatMap((group, groupIdx) => {
        const primary = group.primaryUrl!;
        const secondaries = group.secondaryUrls.filter((u) => u !== primary);
        const groupLabel = txt(`分组 ${groupIdx + 1}`, `Group ${groupIdx + 1}`);
        return Array.from({ length: group.generationCount }).map((_, idx) => ({
          id: `${Date.now()}-${groupIdx + 1}-${idx + 1}-${Math.random().toString(36).slice(2, 8)}`,
          taskId,
          groupId: group.id,
          groupLabel,
          primaryUrl: primary,
          secondaryUrls: secondaries,
          variantIndex: idx + 1,
          totalVariants: group.generationCount,
          status: 'pending' as const,
          mode: genMode,
          customPrompt: group.customPrompt,
          ruleIds: [...selectedRuleIds],
        }));
      });
      patchTaskImageGenState(taskId, { genQueue: jobs });

      const produced: Array<{
        id: string;
        primaryUrl: string;
        secondaryUrls: string[];
        imageUrl: string;
        storagePath: string;
        debug: {
          model: 'image-2';
          mode: ImageGenMode;
          ruleCount: number;
          secondaryCount: number;
          customPrompt: string;
          groupLabel?: string;
        };
      }> = [];
      const total = jobs.length;
      let done = 0;
      let firstError: string | null = null;

      await Promise.all(jobs.map(async (job) => {
        updateTaskGenQueue(taskId, (prev) => prev.map((q) => (q.id === job.id ? {
          ...q,
          status: 'running',
          startedAt: new Date().toISOString(),
          error: undefined,
        } : q)));
        try {
          const { url, storagePath } = await runOneQueueJob(job);
          produced.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            primaryUrl: job.primaryUrl,
            secondaryUrls: job.secondaryUrls,
            imageUrl: url,
            storagePath,
            debug: {
              model: 'image-2',
              mode: job.mode,
              ruleCount: job.ruleIds.length,
              secondaryCount: job.secondaryUrls.length,
              customPrompt: job.customPrompt.trim(),
              groupLabel: job.groupLabel,
            },
          });
          updateTaskGenQueue(taskId, (prev) => prev.map((q) => (q.id === job.id ? {
            ...q,
            status: 'success',
            dataUrl: url,
            endedAt: new Date().toISOString(),
          } : q)));
        } catch (err) {
          const parsed = parseLLMError(err);
          updateTaskGenQueue(taskId, (prev) => prev.map((q) => (q.id === job.id ? {
            ...q,
            status: 'failed',
            error: parsed,
            endedAt: new Date().toISOString(),
          } : q)));
          if (!firstError) firstError = parsed;
        } finally {
          done += 1;
          patchTaskImageGenState(taskId, { genProgress: { current: done, total } });
        }
      }));

      if (firstError) patchTaskImageGenState(taskId, { genError: firstError });
      if (produced.length > 0) {
        const { latestExport, latestMaterial } = getLatestImageZones(taskId);
        const movedPrimaries = Array.from(new Set(produced.map((item) => item.primaryUrl)));
        const generatedUrls = produced.map((item) => item.imageUrl);
        const nextExport = [
          ...latestExport.filter((u) => !movedPrimaries.includes(u)),
          ...generatedUrls,
        ];
        const nextMaterial = Array.from(new Set([...latestMaterial, ...movedPrimaries]));
        persistImageZones(nextExport, nextMaterial, taskId);
      }
      if (activeTaskIdRef.current === taskId) {
        setWorkspaceImages((prev) => [...produced, ...prev]);
        setOptimizeOpen(false);
      }
    } catch (err) {
      patchTaskImageGenState(taskId, { genError: parseLLMError(err) });
    } finally {
      patchTaskImageGenState(taskId, { genLoading: false, genProgress: null });
    }
  };

  const openAsinDownload = () => {
    const pre = sanitizeAsinForFilename(task.asin) || task.asin.trim().toUpperCase();
    setAsinInput(pre);
    setDownloadError(null);
    setDownloadProgress(null);
    if (exportImages.length === 0) {
      setDownloadError(txt('导出区暂无图片可打包下载。', 'No images in export zone to download.'));
      return;
    }
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
    setDownloadProgress({ current: 0, total: exportImages.length });
    try {
      await downloadProductImageSeriesZip(exportImages, cleaned, (p) => setDownloadProgress(p));
      setAsinDownloadOpen(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setDownloadError(`${t('ws.imageDownloadFailed')}: ${detail} ${t('ws.imageDownloadProxyHint')}`);
    } finally {
      setDownloadBusy(false);
      setDownloadProgress(null);
    }
  };

  const handleDropToZone = (targetZone: 'export' | 'material') => {
    if (!draggingImage) return;
    moveImageBetweenZones(draggingImage.url, targetZone);
    setDraggingImage(null);
    setDragOverZone(null);
  };

  const openRefetchDialog = (target: RefetchTarget) => {
    setRefetchTarget(target);
    setRefetchLang(task.language);
    setRefetchHint('');
    setRefetchError(null);
    setRefetchResult(null);
    setRefetchLogs([]);
    setRefetchElapsedSec(0);
  };

  const closeRefetchDialog = () => {
    if (refetchBusy) return;
    setRefetchTarget(null);
  };

  const runPartialRefetch = async () => {
    if (!refetchTarget) return;
    const sourceUrl = task.url?.trim();
    if (!sourceUrl) {
      setRefetchError(txt('当前任务没有来源 URL，无法补抓。', 'This task has no source URL. Unable to refetch.'));
      return;
    }
    const tinyfishApiKey = appSettings.tinyfishApiKey.trim();
    if (!tinyfishApiKey) {
      setRefetchError(t('modal.tinyfishApiRequired'));
      return;
    }

    setRefetchBusy(true);
    setRefetchError(null);
    setRefetchResult(null);
    setRefetchLogs([]);
    setRefetchElapsedSec(0);
    try {
      const fields = new Set<FetchField>([refetchTarget]);
      const fetched = await fetchListingSSE(
        sourceUrl,
        tinyfishApiKey,
        fields,
        (msg) => {
          setRefetchLogs((prev) => {
            if (prev[prev.length - 1] === msg) return prev;
            const next = [...prev, msg];
            return next.slice(-8);
          });
        },
        refetchLang,
        refetchHint.trim() || undefined,
        true,
      );

      const latestTask = allTasks.find((it) => it.id === task.id) ?? task;
      if (refetchTarget === 'images') {
        const currentImages = latestTask.images ?? [];
        const { merged, added } = mergeImageUrls(currentImages, fetched.images ?? []);
        if (added > 0) {
          updateTaskStore(task.id, { images: merged });
        }
        setRefetchResult(
          added > 0
            ? txt(`补抓完成，新增 ${added} 张图片。`, `Refetch done. Added ${added} images.`)
            : txt('补抓完成，未发现新增图片。', 'Refetch done. No new images found.'),
        );
        return;
      }

      const currentAplus = latestTask.aplus ?? [];
      const { merged, added } = mergeAplusModules(currentAplus, fetched.aplus ?? []);
      if (added > 0) {
        updateTaskStore(task.id, { aplus: merged });
      }
      setRefetchResult(
        added > 0
          ? txt(`补抓完成，新增 ${added} 个 A+ 模块。`, `Refetch done. Added ${added} A+ modules.`)
          : txt('补抓完成，未发现新增 A+ 模块。', 'Refetch done. No new A+ modules found.'),
      );
    } catch (err) {
      setRefetchError(parseLLMError(err));
    } finally {
      setRefetchBusy(false);
    }
  };

  return (
    <>
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-[#0052D9]/5 border-b border-slate-200">
        <h3 className="text-[13px] font-semibold text-[#0052D9]">{txt('媒体与参数分析', 'Media & Specs Analysis')}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">{txt('TinyFish 抓取的产品多媒体与结构化数据', 'Product media and structured data fetched by TinyFish')}</p>
      </div>

      {/* ── Specs ── */}
      {hasSpecs && (
        <div className="border-b border-slate-100">
          <SectionHeader
            icon={<Layers size={14} className="text-slate-500" />}
            title={txt('技术参数', 'Technical Specs')}
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
      {(hasImages || canRefetchMedia) && (
        <div className="border-b border-slate-100">
          <SectionHeader
            icon={<Image size={14} className="text-slate-500" />}
            title={txt('产品图片', 'Product Images')}
            count={allTaskImages.length}
            open={imagesOpen}
            onToggle={() => setImagesOpen((v) => !v)}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => openRefetchDialog('images')}
                  disabled={refetchBusy || !canRefetchMedia}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded text-[11px] font-medium transition disabled:opacity-50"
                  title={canRefetchMedia
                    ? txt('局部补抓图片，可附加语言与描述约束', 'Refetch images with optional language and instruction hint')
                    : txt('任务缺少来源 URL，无法补抓', 'No source URL on task, unable to refetch')}
                >
                  <RefreshCw size={11} />
                  {txt('补抓图片', 'Refetch Images')}
                </button>
                <button
                  type="button"
                  onClick={openAsinDownload}
                  disabled={downloadBusy || genLoading || exportImages.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded text-[11px] font-medium transition disabled:opacity-50"
                >
                  <Download size={11} />
                  {t('ws.imageBulkDownload')}
                </button>
                <button
                  type="button"
                  onClick={openOptimizeDialog}
                  disabled={genLoading || downloadBusy || sourceImages.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 border border-fuchsia-200 rounded text-[11px] font-medium transition disabled:opacity-50"
                  title={txt('勾选图片与规则后，用 Image 2 生成优化图', 'Generate optimized image with selected references and rules')}
                >
                  {genLoading
                    ? <><Loader2 size={11} className="animate-spin" /> {txt('生成中...', 'Generating...')}</>
                    : <><Wand2 size={11} /> {txt('AI 优化主图', 'AI Optimize Main Image')}</>
                  }
                </button>
                {genLoading && genProgress ? (
                  <span className="text-[10px] text-fuchsia-600 font-medium">
                    {txt('后台生成中', 'Generating in background')} {genProgress.current}/{genProgress.total}
                  </span>
                ) : null}
              </div>
            }
          />
          {imagesOpen && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverZone('export');
                  }}
                  onDragLeave={() => setDragOverZone((z) => (z === 'export' ? null : z))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropToZone('export');
                  }}
                  className={`rounded-xl border p-3 space-y-2 transition ${
                    dragOverZone === 'export' ? 'border-emerald-400 bg-emerald-50/40' : 'border-emerald-200 bg-emerald-50/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-emerald-800">
                      {txt('导出区', 'Export Zone')} ({exportImages.length})
                    </p>
                    <span className="text-[10px] text-emerald-600">{txt('支持打包下载', 'ZIP enabled')}</span>
                  </div>
                  {exportImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {exportImages.map((src, i) => (
                        <div
                          key={`export-${src}`}
                          draggable
                          onDragStart={() => setDraggingImage({ url: src, zone: 'export' })}
                          onDragEnd={() => {
                            setDraggingImage(null);
                            setDragOverZone(null);
                          }}
                          className={`group relative aspect-square rounded-lg overflow-hidden border bg-white transition ${
                            draggingImage?.url === src ? 'opacity-60 border-emerald-400' : 'border-emerald-100 hover:border-emerald-300'
                          }`}
                          title={txt('拖拽到素材区', 'Drag to material zone')}
                        >
                          <img
                            {...remoteProductImgProps}
                            src={src}
                            alt={`export-${i + 1}`}
                            className="h-full w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
                            <a
                              href={src}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition rounded-full bg-white/90 text-slate-700 p-1.5 shadow hover:bg-white"
                              title={txt('打开原图', 'Open original image')}
                            >
                              <ExternalLink size={14} />
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTaskImage(src)}
                            className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition rounded-full bg-rose-50/95 text-rose-700 border border-rose-200 p-1 shadow hover:bg-rose-100"
                            title={txt('移除图片', 'Remove image')}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-emerald-300 bg-white/70 px-3 py-5 text-center text-[11px] text-slate-500">
                      {txt('导出区暂无图片。可从素材区拖入。', 'No images in export zone. Drag from material zone.')}
                    </div>
                  )}
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverZone('material');
                  }}
                  onDragLeave={() => setDragOverZone((z) => (z === 'material' ? null : z))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropToZone('material');
                  }}
                  className={`rounded-xl border p-3 space-y-2 transition ${
                    dragOverZone === 'material' ? 'border-violet-400 bg-violet-50/40' : 'border-violet-200 bg-violet-50/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-violet-800">
                      {txt('素材区', 'Material Zone')} ({materialImages.length})
                    </p>
                    <span className="text-[10px] text-violet-600">{txt('不参与打包下载', 'No ZIP export')}</span>
                  </div>
                  {materialImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {materialImages.map((src, i) => (
                        <div
                          key={`material-${src}`}
                          draggable
                          onDragStart={() => setDraggingImage({ url: src, zone: 'material' })}
                          onDragEnd={() => {
                            setDraggingImage(null);
                            setDragOverZone(null);
                          }}
                          className={`group relative aspect-square rounded-lg overflow-hidden border bg-white transition ${
                            draggingImage?.url === src ? 'opacity-60 border-violet-400' : 'border-violet-100 hover:border-violet-300'
                          }`}
                          title={txt('拖拽到导出区', 'Drag to export zone')}
                        >
                          <img
                            {...remoteProductImgProps}
                            src={src}
                            alt={`material-${i + 1}`}
                            className="h-full w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <button
                            type="button"
                            onClick={() => removeTaskImage(src)}
                            className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition rounded-full bg-rose-50/95 text-rose-700 border border-rose-200 p-1 shadow hover:bg-rose-100"
                            title={txt('移除图片', 'Remove image')}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-violet-300 bg-white/70 px-3 py-5 text-center text-[11px] text-slate-500">
                      {txt('素材区暂无图片。可从导出区拖入。', 'No images in material zone. Drag from export zone.')}
                    </div>
                  )}
                </div>
              </div>

              {allTaskImages.length === 0 && (
                <div className="rounded-lg border border-dashed border-sky-300 bg-sky-50/50 px-3 py-5 text-center text-[12px] text-slate-600">
                  {txt('当前没有产品图，可点击上方「补抓图片」补全。', 'No product images yet. Click "Refetch Images" above to recover missing items.')}
                </div>
              )}

              {allTaskImages.length > 0 && (
                <p className="text-[11px] text-slate-400 -mt-1">
                  {txt('提示：在导出区与素材区之间可自由拖拽；抓取图默认进入导出区。', 'Tip: drag freely between export and material zones. Refetched images go to export by default.')}
                </p>
              )}

              {/* Image 2 workspace */}
              <div className="bg-fuchsia-50/60 border border-fuchsia-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <Images size={13} className="text-fuchsia-600" />
                    <span className="text-[12px] font-semibold text-fuchsia-700">
                      {txt('新图片工作区（AI 优化结果）', 'New Image Workspace (AI Outputs)')}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {txt(
                    '点击上方「AI 优化主图」后可勾选要优化的原图、选择规则并批量生成。新生成图片会放到这里并自动持久化到数据库，支持下载与删除。',
                    'Click "AI Optimize Main Image" above, select source images and rules, then generate in batch. New images appear here and are persisted automatically for download and deletion.',
                  )}
                </p>

                {genQueue.length > 0 && (
                  <div className="rounded-lg border border-fuchsia-200 bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-fuchsia-700">{txt('生成任务队列', 'Generation Queue')}</p>
                      {genQueue.some((q) => q.status === 'failed') ? (
                        <button
                          type="button"
                          onClick={() => void retryAllFailed()}
                          className="text-[10px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        >
                          {txt('重试全部失败', 'Retry All Failed')}
                        </button>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {txt('开始时间', 'Started at')}: {new Date(genQueue[genQueue.length - 1]?.startedAt ?? Date.now()).toLocaleTimeString()} ·
                      {txt('剩余', 'Remaining')}: {genQueue.filter((q) => q.status === 'pending' || q.status === 'running').length} ·
                      {txt('失败', 'Failed')}: {genQueue.filter((q) => q.status === 'failed').length}
                    </p>
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {genQueue.slice(0, 8).map((job) => (
                        <div key={job.id} className="flex items-center justify-between gap-2 text-[10px] border border-slate-100 rounded px-2 py-1">
                          <span className="truncate text-slate-600" title={job.primaryUrl}>
                            {job.groupLabel} · {txt('主图', 'Primary')}#{sourceImages.findIndex((u) => u === job.primaryUrl) + 1}
                            {job.secondaryUrls.length > 0 ? ` · ${txt('参考', 'Ref')} ${job.secondaryUrls.length}` : ''}
                            {' · '}{txt('变体', 'Variant')} {job.variantIndex}/{job.totalVariants}
                          </span>
                          <div className="flex items-center gap-1">
                            {job.status === 'running' && job.startedAt ? (
                              <span className="text-slate-400">
                                {Math.max(0, Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000))}s
                              </span>
                            ) : null}
                            {(job.status === 'success' || job.status === 'failed') && job.startedAt && job.endedAt ? (
                              <span className="text-slate-400">
                                {Math.max(0, Math.round((new Date(job.endedAt).getTime() - new Date(job.startedAt).getTime()) / 1000))}s
                              </span>
                            ) : null}
                            <span className={`px-1.5 py-0.5 rounded ${
                              job.status === 'success' ? 'bg-emerald-50 text-emerald-700'
                                : job.status === 'failed' ? 'bg-rose-50 text-rose-700'
                                : job.status === 'running' ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {job.status === 'pending' ? txt('待执行', 'Pending')
                                : job.status === 'running' ? txt('执行中', 'Running')
                                : job.status === 'success' ? txt('成功', 'Success')
                                : txt('失败', 'Failed')}
                            </span>
                            {job.status === 'failed' ? (
                              <button
                                type="button"
                                onClick={() => void retryQueueJob(job.id)}
                                className="px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                              >
                                {txt('重试', 'Retry')}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {genError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span className="whitespace-pre-line">{genError}</span>
                  </div>
                )}

                {workspaceImages.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {workspaceImages.map((item, idx) => (
                      <div key={item.id} className="rounded-lg border border-fuchsia-200 bg-white p-2 space-y-2">
                        <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-white rounded overflow-hidden border border-slate-100">
                          <img src={item.imageUrl} alt={`ai-workspace-${idx + 1}`} className="h-full w-full object-contain" />
                        </a>
                        <p className="text-[10px] text-slate-500 truncate" title={item.primaryUrl}>
                          {item.debug.groupLabel ? `${item.debug.groupLabel} · ` : ''}
                          {txt('主图参考', 'Primary Ref')} #{sourceImages.findIndex((u) => u === item.primaryUrl) + 1}
                          {item.debug.secondaryCount > 0 ? ` · ${txt('辅助参考', 'Secondary Ref')} ${item.debug.secondaryCount}` : ''}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {txt('模型', 'Model')} {item.debug.model} · {txt('模式', 'Mode')} {item.debug.mode === 'main' ? txt('主图', 'Main') : txt('场景', 'Lifestyle')} ·
                          {txt('规则', 'Rules')} {item.debug.ruleCount}
                        </p>
                        {item.debug.customPrompt ? (
                          <p className="text-[10px] text-slate-400 truncate" title={item.debug.customPrompt}>
                            {txt('额外提示词', 'Extra Prompt')}: {item.debug.customPrompt}
                          </p>
                        ) : null}
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => downloadWorkspaceImage(item.id)}
                            className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded text-[10px] font-medium transition"
                          >
                            <Download size={10} /> {txt('下载', 'Download')}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeWorkspaceImage(item.id)}
                            className="flex items-center gap-1 px-2 py-1 border rounded text-[10px] font-medium transition bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                          >
                            <Trash2 size={10} /> {txt('删除', 'Delete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-fuchsia-300 bg-white/70 px-3 py-6 text-center text-[12px] text-slate-500">
                    {txt('暂无优化结果。点击上方「AI 优化主图」开始生成。', 'No optimized images yet. Click "AI Optimize Main Image" above to generate.')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── A+ Content ── */}
      {(hasAplus || canRefetchMedia) && (
        <div>
          <SectionHeader
            icon={<LayoutTemplate size={14} className="text-slate-500" />}
            title={txt('A+ 内容模块', 'A+ Content Modules')}
            count={aplus.length}
            open={aplusOpen}
            onToggle={() => setAplusOpen((v) => !v)}
            actions={(
              <button
                type="button"
                onClick={() => openRefetchDialog('aplus')}
                disabled={refetchBusy || !canRefetchMedia}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded text-[11px] font-medium transition disabled:opacity-50"
                title={canRefetchMedia
                  ? txt('局部补抓 A+ 模块，可附加语言与描述约束', 'Refetch A+ modules with optional language and instruction hint')
                  : txt('任务缺少来源 URL，无法补抓', 'No source URL on task, unable to refetch')}
              >
                <RefreshCw size={11} />
                {txt('补抓 A+', 'Refetch A+')}
              </button>
            )}
          />
          {aplusOpen && (
            <div className="p-4 space-y-3">
              {aplus.length > 0 ? (
                aplus.map((mod, i) => (
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
                        <p className="text-[12px] text-slate-400 italic">{txt('（无文字内容）', '(No text content)')}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-sky-300 bg-sky-50/50 px-3 py-5 text-center text-[12px] text-slate-600">
                  {txt('当前没有 A+ 模块，可点击上方「补抓 A+」补全。', 'No A+ modules yet. Click "Refetch A+" above to recover missing modules.')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Attachments (drag / paste any content) ── */}
      <div className="border-t border-slate-100">
        <SectionHeader
          icon={<Paperclip size={14} className="text-slate-500" />}
          title={txt('附件区', 'Attachments')}
          count={attachments.length}
          open={attachmentsOpen}
          onToggle={() => setAttachmentsOpen((v) => !v)}
        />
        {attachmentsOpen && (
          <div className="p-4 space-y-3">
            <div
              tabIndex={0}
              onDragOver={(e) => { e.preventDefault(); setIsAttachDragging(true); }}
              onDragLeave={() => setIsAttachDragging(false)}
              onDrop={handleAttachDrop}
              onPaste={handleAttachPaste}
              onClick={() => attachInputRef.current?.click()}
              className={`relative rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer outline-none transition ${
                isAttachDragging
                  ? 'border-[#0052D9] bg-blue-50/60'
                  : 'border-slate-300 bg-slate-50/60 hover:border-[#0052D9]/60 focus:border-[#0052D9]'
              }`}
            >
              <input
                ref={attachInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) void uploadFiles(files);
                  e.target.value = '';
                }}
              />
              <Paperclip size={18} className="mx-auto text-slate-400 mb-1.5" />
              <p className="text-[12px] text-slate-600">
                {txt('拖拽文件到此处，或点击选择文件', 'Drag files here, or click to choose files')}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {txt('聚焦此区域后可 Ctrl / ⌘ + V 粘贴图片或文本', 'Focus here, then Ctrl / ⌘ + V to paste images or text')}
              </p>
              {attachBusy && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[#0052D9]">
                  <Loader2 size={12} className="animate-spin" />
                  {txt('上传中…', 'Uploading…')}
                </div>
              )}
            </div>

            {attachError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <p className="flex-1 whitespace-pre-line leading-relaxed">{attachError}</p>
                <button type="button" onClick={() => setAttachError(null)} className="shrink-0 text-rose-400 hover:text-rose-600">
                  <X size={13} />
                </button>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="group relative rounded-lg border border-slate-200 bg-white overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="absolute top-1 right-1 z-10 p-1 rounded bg-white/90 border border-slate-200 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition"
                      title={txt('删除', 'Delete')}
                    >
                      <Trash2 size={12} />
                    </button>

                    {att.kind === 'image' && att.url ? (
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                        <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                          <img
                            src={att.url}
                            alt={att.name ?? ''}
                            className="h-full w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                        {att.name && (
                          <p className="px-2 py-1 text-[10px] text-slate-500 truncate" title={att.name}>{att.name}</p>
                        )}
                      </a>
                    ) : att.kind === 'file' && att.url ? (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={att.name}
                        className="flex flex-col items-center justify-center gap-1.5 p-3 min-h-[120px] hover:bg-slate-50"
                      >
                        <FileIcon size={26} className="text-slate-400" />
                        <p className="text-[11px] text-slate-700 text-center break-all line-clamp-2" title={att.name}>
                          {att.name}
                        </p>
                        {att.size ? <span className="text-[10px] text-slate-400">{formatBytes(att.size)}</span> : null}
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#0052D9]">
                          <Download size={10} />{txt('下载', 'Download')}
                        </span>
                      </a>
                    ) : (
                      <div className="p-2.5 min-h-[120px] flex flex-col">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1">
                          <FileText size={11} />{txt('文本', 'Text')}
                        </div>
                        <p className="text-[11px] text-slate-700 whitespace-pre-wrap break-words line-clamp-6 flex-1">
                          {att.text}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {refetchTarget && (
      <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4">
        <div role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <h4 className="text-sm font-semibold text-slate-800">
              {refetchTarget === 'images'
                ? txt('局部补抓：产品图片', 'Partial Refetch: Product Images')
                : txt('局部补抓：A+ 模块', 'Partial Refetch: A+ Modules')}
            </h4>
            <button
              type="button"
              onClick={closeRefetchDialog}
              disabled={refetchBusy}
              className="p-1 text-slate-400 hover:text-slate-600 rounded disabled:opacity-40"
              aria-label={txt('关闭', 'Close')}
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-[12px] text-slate-500 leading-relaxed">
              {txt(
                '基于当前任务 URL 重新抓取该板块，只做增量合并，不覆盖已有内容。',
                'Refetch this section from current task URL and merge incrementally without overwriting existing content.',
              )}
            </p>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">{txt('语言优先级', 'Language priority')}</label>
              <select
                value={refetchLang}
                onChange={(e) => setRefetchLang(e.target.value as LanguageCode)}
                disabled={refetchBusy}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none disabled:bg-slate-50"
              >
                {LANGUAGES.map((lang) => (
                  <option key={`refetch-lang-${lang.code}`} value={lang.code}>
                    {appSettings.systemLanguage === 'cn' ? lang.zhLabel : lang.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">{txt('补抓说明（可选）', 'Instruction hint (optional)')}</label>
              <textarea
                rows={3}
                value={refetchHint}
                onChange={(e) => setRefetchHint(e.target.value)}
                disabled={refetchBusy}
                placeholder={refetchTarget === 'images'
                  ? txt('示例：只抓 overview 主图，不要评论图、视频缩略图。', 'Example: only overview gallery images, exclude review images and video thumbnails.')
                  : txt('示例：优先抓取带标题和正文的 A+ 模块，保持页面自然顺序。', 'Example: prioritize A+ modules with headline/body and keep natural page order.')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs leading-relaxed focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none resize-y disabled:bg-slate-50"
              />
            </div>
            {refetchBusy && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500 mb-1.5">
                  {txt('TinyFish 正在后台解析页面', 'TinyFish is parsing page in background')} · {refetchElapsedSec}s
                </p>
                {refetchLogs.length > 0 ? (
                  <div className="max-h-24 overflow-y-auto font-mono text-[11px] text-slate-600 space-y-1">
                    {refetchLogs.map((log, idx) => (
                      <p key={`refetch-log-${idx}`} className="truncate">
                        {'>'} {log}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">{txt('等待 TinyFish 返回进度…', 'Waiting for TinyFish progress…')}</p>
                )}
              </div>
            )}
            {refetchError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">{refetchError}</span>
              </div>
            )}
            {refetchResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
                {refetchResult}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeRefetchDialog}
                disabled={refetchBusy}
                className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                {t('modal.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void runPartialRefetch()}
                disabled={refetchBusy}
                className="px-3 py-2 text-xs font-medium text-white bg-[#0052D9] rounded-lg hover:bg-blue-800 disabled:opacity-40 flex items-center gap-1.5"
              >
                {refetchBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {refetchBusy ? txt('补抓中…', 'Refetching…') : txt('开始补抓', 'Start Refetch')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {optimizeOpen && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4">
        <div role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-xl w-full max-w-4xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <h4 className="text-sm font-semibold text-slate-800">{txt('AI 优化主图（选择图片与规则）', 'AI Optimize Main Image (Select Images and Rules)')}</h4>
            <button
              type="button"
              onClick={closeOptimizeDialog}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
              aria-label={txt('关闭', 'Close')}
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-slate-600">{txt('输出模式：', 'Output mode:')}</span>
              <button
                type="button"
                onClick={() => setGenMode('main')}
                disabled={genLoading}
                className={`px-2 py-0.5 rounded border transition ${
                  genMode === 'main'
                    ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                    : 'bg-white text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-50'
                } disabled:opacity-50`}
              >
                {txt('主图（白底）', 'Main (white background)')}
              </button>
              <button
                type="button"
                onClick={() => setGenMode('lifestyle')}
                disabled={genLoading}
                className={`px-2 py-0.5 rounded border transition ${
                  genMode === 'lifestyle'
                    ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                    : 'bg-white text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-50'
                } disabled:opacity-50`}
              >
                {txt('场景图', 'Lifestyle')}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 -mt-2">
              {txt(
                '每一轮请求都独立执行，不继承历史记忆。主图模式仅适配白底电商图；若提示词含场景化需求请切换到场景图模式。',
                'Each round runs as an isolated request with no prior memory. Main mode is for white-background ecommerce images; switch to Lifestyle mode for scene-based prompts.',
              )}
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-700">
                  {txt('1) 配置生成分组（可多组同时执行）', '1) Configure generation groups (run all groups together)')}
                </p>
                <button
                  type="button"
                  onClick={addOptimizeGroup}
                  disabled={genLoading}
                  className="text-[11px] px-2.5 py-1 rounded border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 disabled:opacity-50"
                >
                  + {txt('新增分组', 'Add Group')}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                {txt(
                  '每个分组可独立设置：主图、辅助图、提示词、生成数量；点击「开始优化」后会统一加入队列并并发执行。',
                  'Each group has its own primary image, secondary images, prompt and count. Clicking "Start Optimization" runs all groups in one concurrent queue.',
                )}
              </p>

              {optimizeGroups.map((group, groupIdx) => (
                <div key={group.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-slate-700">
                      {txt('分组', 'Group')} {groupIdx + 1}
                    </p>
                    {optimizeGroups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOptimizeGroup(group.id)}
                        disabled={genLoading}
                        className="text-[10px] px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {txt('删除分组', 'Delete Group')}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div>
                      <p className="text-[12px] font-semibold text-slate-700 mb-1.5">{txt('额外提示词（简短）', 'Extra prompt (short)')}</p>
                      <input
                        type="text"
                        value={group.customPrompt}
                        onChange={(e) => updateGroupPrompt(group.id, e.target.value)}
                        placeholder={txt('例如：更强产品质感、45度角展示、保留包装字体细节', 'e.g. stronger product texture, 45-degree angle, preserve package font details')}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-fuchsia-400 focus:ring-1 focus:ring-fuchsia-300 outline-none"
                      />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-slate-700 mb-1.5">{txt('生成数量', 'Generation count')}</p>
                      <select
                        value={group.generationCount}
                        onChange={(e) => updateGroupCount(group.id, Number(e.target.value))}
                        className="w-32 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:border-fuchsia-400 focus:ring-1 focus:ring-fuchsia-300 outline-none"
                      >
                        <option value={1}>{txt('1 张', '1 image')}</option>
                        <option value={2}>{txt('2 张', '2 images')}</option>
                        <option value={3}>{txt('3 张', '3 images')}</option>
                        <option value={4}>{txt('4 张', '4 images')}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <p className="text-[12px] font-semibold text-slate-700 mb-2">
                      {txt('主图参考（必选，单选）', 'Primary reference (required, single select)')}
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      {sourceImages.map((src, i) => {
                        const picked = group.primaryUrl === src;
                        return (
                          <label
                            key={`primary-${group.id}-${src}`}
                            className={`relative rounded-lg border bg-white p-1 cursor-pointer transition ${
                              picked
                                ? 'border-fuchsia-500 ring-2 ring-fuchsia-200'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`primary-image-${group.id}`}
                              checked={picked}
                              onChange={() => pickPrimaryImage(group.id, src)}
                              className="absolute left-2 top-2 h-4 w-4 accent-fuchsia-600"
                            />
                            {picked ? (
                              <span className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-fuchsia-600 text-white text-[9px] font-semibold">
                                {txt('主图', 'Primary')}
                              </span>
                            ) : null}
                            <img src={src} alt={`primary-${groupIdx + 1}-${i + 1}`} className="h-24 w-full object-contain rounded bg-slate-50" />
                            <p className="text-[10px] text-slate-500 mt-1 text-right">{txt('原图', 'Source')} #{i + 1}</p>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[12px] font-semibold text-slate-700 mb-2">
                      {txt('辅助参考图（可选，多选）', 'Secondary references (optional, multi-select)')}
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      {sourceImages.map((src, i) => {
                        if (src === group.primaryUrl) return null;
                        const picked = group.secondaryUrls.includes(src);
                        return (
                          <label
                            key={`secondary-${group.id}-${src}`}
                            className={`relative rounded-lg border bg-white p-1 cursor-pointer transition ${
                              picked
                                ? 'border-indigo-400 ring-2 ring-indigo-100'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={picked}
                              onChange={() => toggleSecondaryImage(group.id, src)}
                              className="absolute left-2 top-2 h-4 w-4 accent-indigo-600"
                            />
                            {picked ? (
                              <span className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-semibold">
                                {txt('参考', 'Ref')}
                              </span>
                            ) : null}
                            <img src={src} alt={`secondary-${groupIdx + 1}-${i + 1}`} className="h-24 w-full object-contain rounded bg-slate-50" />
                            <p className="text-[10px] text-slate-500 mt-1 text-right">{txt('原图', 'Source')} #{i + 1}</p>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {sourceImages.length <= 1 ? (
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {txt('当前任务只有 1 张原图，无可选辅助参考。可仅基于主图参考进行优化。', 'This task has only one source image. You can optimize using only the primary reference.')}
                </p>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold text-slate-700">
                  {txt('3) 选择应用规则（指令', '3) Select rules (Instruction')} {instructionRuleCount} {txt('条 / 风控', '/ Risk')} {negativeRuleCount} {txt('条）', ')')}
                </p>
                {localCountryCode && (
                  <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={showOtherCountryRules}
                      onChange={(e) => setShowOtherCountryRules(e.target.checked)}
                      className="h-3.5 w-3.5 accent-fuchsia-600"
                    />
                    {txt('显示 Others', 'Show Others')}
                  </label>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 max-h-52 overflow-y-auto space-y-1.5">
                {candidateRules.map((r) => {
                  const checked = selectedRuleIds.includes(rulePickKey(r));
                  const ruleCountry = r.createdByCountry ?? localCountryCode ?? 'GLOBAL';
                  return (
                    <label key={r.id} className="flex items-start gap-2 text-[12px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRulePick(rulePickKey(r))}
                        className="mt-0.5 h-4 w-4 accent-fuchsia-600"
                      />
                      <span>
                        <span className={`mr-1.5 inline-flex px-1.5 py-0.5 rounded text-[10px] ${
                          r.type === 'instruction'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {r.type === 'instruction' ? txt('指令', 'Instruction') : txt('风控', 'Risk')}
                        </span>
                        <span className={`mr-1.5 inline-flex px-1.5 py-0.5 rounded text-[10px] ${
                          ruleCountry === localCountryCode
                            ? 'bg-fuchsia-100 text-fuchsia-700'
                            : ruleCountry === 'GLOBAL'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-violet-100 text-violet-700'
                        }`}>
                          {ruleCountry}
                        </span>
                        {localizeSystemText(r.name, r.nameI18n, appSettings.systemLanguage)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {genError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">{genError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeOptimizeDialog}
                className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                {genLoading ? txt('后台继续', 'Run in background') : t('modal.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void runSelectedOptimization()}
                disabled={genLoading}
                className="px-3 py-2 text-xs font-medium text-white bg-fuchsia-600 rounded-lg hover:bg-fuchsia-700 disabled:opacity-40 flex items-center gap-1.5"
              >
                {genLoading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                {txt('开始优化', 'Start Optimization')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

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
