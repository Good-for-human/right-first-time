/** Slot suffix: first image MAIN, then PT01, PT02, … */
export function imageSlotSuffix(index: number): string {
  if (index === 0) return 'MAIN';
  return `PT${String(index).padStart(2, '0')}`;
}

export function inferImageExtension(url: string): string {
  const path = url.split('?')[0];
  const m = path.match(/\.(jpe?g|png|webp|gif)$/i);
  if (!m) return '.jpg';
  const ext = m[1].toLowerCase();
  return ext === 'jpeg' ? '.jpg' : `.${ext}`;
}

export function sanitizeAsinForFilename(asin: string): string {
  return asin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function imageProxyUrl(remoteUrl: string): string {
  const path = `/.netlify/functions/image-proxy?url=${encodeURIComponent(remoteUrl)}`;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/**
 * Fetch image bytes via Netlify proxy, then trigger a file download.
 */
export async function downloadRemoteImageAsFile(remoteUrl: string, filename: string): Promise<void> {
  const proxied = imageProxyUrl(remoteUrl);
  const res = await fetch(proxied, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface BulkDownloadProgress {
  current: number;
  total: number;
}

/**
 * Sequentially download each URL with ASIN.MAIN / ASIN.PT01 / … filenames.
 */
export async function downloadProductImageSeries(
  urls: string[],
  asin: string,
  onProgress?: (p: BulkDownloadProgress) => void,
  delayMs = 220,
): Promise<void> {
  const base = sanitizeAsinForFilename(asin);
  if (!base) throw new Error('Invalid ASIN');

  for (let i = 0; i < urls.length; i++) {
    onProgress?.({ current: i + 1, total: urls.length });
    const slot = imageSlotSuffix(i);
    const ext = inferImageExtension(urls[i]);
    const filename = `${base}.${slot}${ext}`;
    await downloadRemoteImageAsFile(urls[i], filename);
    if (i < urls.length - 1) await sleep(delayMs);
  }
}
