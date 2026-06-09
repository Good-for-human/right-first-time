/**
 * AI-generated image persistence — Firebase Storage.
 *
 * Generated images come back from GPT-5.5 as base64. Storing them inline in a
 * Firestore task document blows past the hard 1 MB per-document limit (a single
 * 1024×1024 PNG is already ~1.5 MB after base64), which silently rejects every
 * subsequent task write. We instead upload the bytes to Storage and only keep
 * the resulting download URL on the task.
 *
 * Path layout:
 *   users/{uid}/tasks/{taskId}/ai-images/{timestamp}-{rand}.{ext}
 */
import {
  ref,
  uploadString,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import type { FirebaseError } from 'firebase/app';
import { storage } from '@/lib/firebase';

export interface UploadedImage {
  /** Full https download URL — safe to store on the task document. */
  url:        string;
  /** Storage object path — used later for deletion. */
  storagePath: string;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/webp': 'webp',
};

function shortRand(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Upload a base64-encoded image (data URL or raw base64) to Firebase Storage
 * under the user's task folder, returning a public download URL.
 *
 * Throws if the upload or URL fetch fails — caller decides what to do (we
 * intentionally don't fall back to inline base64 since that would re-introduce
 * the 1 MB Firestore limit problem).
 */
export async function uploadAiImage(params: {
  uid:      string;
  taskId:   string;
  /** Either a `data:image/...;base64,...` URL or a raw base64 string. */
  base64:   string;
  /** Required when `base64` is a raw string; ignored otherwise. */
  mimeType?: string;
}): Promise<UploadedImage> {
  const { uid, taskId, base64 } = params;

  // Normalize to a full data URL — uploadString('data_url') needs the prefix.
  const dataUrl = base64.startsWith('data:')
    ? base64
    : `data:${params.mimeType ?? 'image/png'};base64,${base64}`;

  // Extract mime so we can pick a clean filename extension.
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/i);
  const mime = mimeMatch?.[1] ?? params.mimeType ?? 'image/png';
  const ext  = EXT_BY_MIME[mime] ?? 'png';

  const storagePath = `users/${uid}/tasks/${taskId}/ai-images/${Date.now()}-${shortRand()}.${ext}`;
  const objectRef   = ref(storage, storagePath);

  try {
    await uploadString(objectRef, dataUrl, 'data_url');
    const url = await getDownloadURL(objectRef);
    return { url, storagePath };
  } catch (err) {
    throw new Error(translateStorageError(err));
  }
}

/**
 * Upload an arbitrary user attachment (any file type) to Firebase Storage under
 * the user's task folder, returning a public download URL. Used by the task
 * attachment area where users drop / paste reference material.
 *
 * Path layout:
 *   users/{uid}/tasks/{taskId}/attachments/{timestamp}-{rand}-{name}
 */
export async function uploadTaskAttachment(params: {
  uid:      string;
  taskId:   string;
  file:     File | Blob;
  fileName: string;
}): Promise<UploadedImage> {
  const { uid, taskId, file, fileName } = params;
  // Sanitize the original name so it is safe inside a Storage object path.
  const cleanName = (fileName || 'file').replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
  const storagePath = `users/${uid}/tasks/${taskId}/attachments/${Date.now()}-${shortRand()}-${cleanName}`;
  const objectRef   = ref(storage, storagePath);

  try {
    await uploadBytes(objectRef, file, {
      contentType: (file as File).type || 'application/octet-stream',
    });
    const url = await getDownloadURL(objectRef);
    return { url, storagePath };
  } catch (err) {
    throw new Error(translateStorageError(err));
  }
}

/**
 * Delete a previously-uploaded image. We accept either a download URL or the
 * raw storage path so callers don't have to remember which one they kept.
 *
 * Failures are logged but never thrown — orphaned blobs are tolerable, but
 * blocking UI on a delete-storage call is not.
 */
export async function deleteAiImage(urlOrPath: string): Promise<void> {
  try {
    const objectRef = isHttpUrl(urlOrPath)
      ? ref(storage, decodeStoragePathFromUrl(urlOrPath))
      : ref(storage, urlOrPath);
    await deleteObject(objectRef);
  } catch (err) {
    console.warn('[imageStorageService] deleteAiImage failed:', err);
  }
}

/** Detect whether a string is one of the AI-image Storage URLs we created. */
export function isAiImageStorageUrl(url: string): boolean {
  return /firebasestorage\.googleapis\.com\/.+\/ai-images%2F/i.test(url);
}

// ── Helpers ─────────────────────────────────────────────────────

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/**
 * Firebase Storage download URLs look like:
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/users%2F<uid>%2F...?alt=media&token=...
 * The path lives in the `o/` segment, URL-encoded. We decode and return it so
 * callers can recreate a `ref()` for deletion.
 */
function decodeStoragePathFromUrl(url: string): string {
  const m = url.match(/\/o\/([^?]+)/);
  if (!m) throw new Error('not a Firebase Storage download URL');
  return decodeURIComponent(m[1]);
}

/**
 * Map raw Firebase Storage errors to actionable Chinese messages so users
 * don't have to read CORS-tinted browser errors.
 */
function translateStorageError(err: unknown): string {
  const fb = err as Partial<FirebaseError> | undefined;
  const code = fb?.code ?? '';
  const raw  = err instanceof Error ? err.message : String(err);

  if (code === 'storage/unauthorized' || /unauthorized/i.test(raw)) {
    return [
      'Firebase Storage 拒绝写入（403 unauthorized / 安全规则未放行）。',
      '请在 Firebase Console → Storage → Rules 部署允许已登录用户读写自己路径的规则：',
      '',
      'rules_version = \'2\';',
      'service firebase.storage {',
      '  match /b/{bucket}/o {',
      '    match /users/{uid}/{allPaths=**} {',
      '      allow read, write: if request.auth != null && request.auth.uid == uid;',
      '    }',
      '  }',
      '}',
    ].join('\n');
  }
  if (code === 'storage/unauthenticated') {
    return 'Firebase Storage 未登录（401）。请重新登录账号后再生成图片。';
  }
  if (code === 'storage/quota-exceeded') {
    return 'Firebase Storage 配额已耗尽。请在 Firebase Console 查看 Storage 配额或升级套餐。';
  }
  if (code === 'storage/retry-limit-exceeded' || /CORS|preflight|ERR_FAILED/i.test(raw)) {
    return [
      'Firebase Storage 上传超时或被 CORS 拦截。常见原因：',
      '• Storage 安全规则未放行写入 → 控制台返回 403，浏览器报 CORS。请按上面的规则模板部署。',
      '• 当前项目尚未在 Firebase Console 启用 Storage（首次需要点击「开始使用」初始化）。',
      '修复后刷新页面再试。',
    ].join('\n');
  }
  return `Firebase Storage 写入失败：${raw.slice(0, 200)}`;
}
