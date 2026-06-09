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

async function fetchRemoteImageBlob(remoteUrl: string): Promise<Blob> {
  const proxied = imageProxyUrl(remoteUrl);
  const res = await fetch(proxied, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.blob();
}

/**
 * Fetch image bytes via Netlify proxy, then trigger a file download.
 */
export async function downloadRemoteImageAsFile(remoteUrl: string, filename: string): Promise<void> {
  const blob = await fetchRemoteImageBlob(remoteUrl);
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

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

interface ZipEntry {
  name: string;
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  localHeaderOffset: number;
}

function buildZipBlob(entriesInput: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = entriesInput.map((entry) => ({
    name: entry.name,
    nameBytes: encoder.encode(entry.name),
    data: entry.data,
    crc: crc32(entry.data),
    localHeaderOffset: 0,
  }));

  const chunks: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    entry.localHeaderOffset = offset;
    const localHeader = new Uint8Array(30 + entry.nameBytes.length);
    const view = new DataView(localHeader.buffer);
    writeUint32(view, 0, 0x04034b50);
    writeUint16(view, 4, 20); // version needed
    writeUint16(view, 6, 0);  // flags
    writeUint16(view, 8, 0);  // compression: store
    writeUint16(view, 10, 0); // mod time
    writeUint16(view, 12, 0); // mod date
    writeUint32(view, 14, entry.crc);
    writeUint32(view, 18, entry.data.length);
    writeUint32(view, 22, entry.data.length);
    writeUint16(view, 26, entry.nameBytes.length);
    writeUint16(view, 28, 0); // extra length
    localHeader.set(entry.nameBytes, 30);
    chunks.push(localHeader, entry.data);
    offset += localHeader.length + entry.data.length;
  });

  const centralStart = offset;
  entries.forEach((entry) => {
    const central = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(central.buffer);
    writeUint32(view, 0, 0x02014b50);
    writeUint16(view, 4, 20); // made by
    writeUint16(view, 6, 20); // version needed
    writeUint16(view, 8, 0);  // flags
    writeUint16(view, 10, 0); // compression: store
    writeUint16(view, 12, 0); // mod time
    writeUint16(view, 14, 0); // mod date
    writeUint32(view, 16, entry.crc);
    writeUint32(view, 20, entry.data.length);
    writeUint32(view, 24, entry.data.length);
    writeUint16(view, 28, entry.nameBytes.length);
    writeUint16(view, 30, 0); // extra length
    writeUint16(view, 32, 0); // comment length
    writeUint16(view, 34, 0); // disk start
    writeUint16(view, 36, 0); // internal attrs
    writeUint32(view, 38, 0); // external attrs
    writeUint32(view, 42, entry.localHeaderOffset);
    central.set(entry.nameBytes, 46);
    chunks.push(central);
    offset += central.length;
  });

  const centralSize = offset - centralStart;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, centralStart);
  writeUint16(endView, 20, 0); // comment length
  chunks.push(end);

  return new Blob(chunks, { type: 'application/zip' });
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

export async function downloadProductImageSeriesZip(
  urls: string[],
  asin: string,
  onProgress?: (p: BulkDownloadProgress) => void,
): Promise<void> {
  const base = sanitizeAsinForFilename(asin);
  if (!base) throw new Error('Invalid ASIN');
  if (urls.length === 0) throw new Error('No images to export');

  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for (let i = 0; i < urls.length; i += 1) {
    onProgress?.({ current: i + 1, total: urls.length });
    const slot = imageSlotSuffix(i);
    const ext = inferImageExtension(urls[i]);
    const filename = `${base}.${slot}${ext}`;
    const blob = await fetchRemoteImageBlob(urls[i]);
    const buf = new Uint8Array(await blob.arrayBuffer());
    entries.push({ name: filename, data: buf });
  }

  const zipBlob = buildZipBlob(entries);
  const zipUrl = URL.createObjectURL(zipBlob);
  try {
    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `${base}.images.zip`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(zipUrl);
  }
}
