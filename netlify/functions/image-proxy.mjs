/**
 * Proxies a remote product image so the SPA can fetch bytes with CORS
 * and trigger downloads with custom filenames (Amazon CDN blocks direct use).
 */
export const handler = async (event) => {
  const raw = event.queryStringParameters?.url;
  if (!raw || typeof raw !== 'string') {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Missing url' };
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Invalid url' };
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Invalid protocol' };
  }

  const host = target.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Host not allowed' };
  }

  try {
    const res = await fetch(target.toString(), {
      redirect: 'follow',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'RightFirstTime-image-proxy/1.0',
      },
    });

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'text/plain' },
        body: `Upstream ${res.status}`,
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    const ct = res.headers.get('content-type') || 'application/octet-stream';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': ct,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body: Buffer.from(arrayBuffer).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('[image-proxy]', err);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Fetch failed',
    };
  }
};
