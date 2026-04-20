/**
 * Helpers for embedding third-party product images (Amazon, etc.).
 * Many CDNs reject <img> when Referer is another site; opening the URL in a
 * new tab still works — use no-referrer for subresource requests.
 */
export function normalizeProductImageUrl(url: string): string {
  let u = url.trim().replace(/^\uFEFF/, '');
  if (u.startsWith('//')) u = `https:${u}`;
  return u;
}

/** Props to spread onto <img> for remote product / gallery URLs. */
export const remoteProductImgProps = {
  referrerPolicy: 'no-referrer' as const,
  decoding: 'async' as const,
};
