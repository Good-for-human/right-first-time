import { getStore } from '@netlify/blobs';
import { resolveServerKey, normalizeKey } from '../lib/resolveKey.js';

// Netlify Functions v2 background function. The `-background` filename suffix makes
// Netlify return 202 immediately and run this for up to 15 minutes — long enough
// for gpt-image generation, which exceeds the 10/26s synchronous limit. v2 also
// auto-configures Netlify Blobs (v1 handler style did not), where we store the
// result for the openai-image-status poller to read.

const STORE_NAME = 'image-jobs';

async function writeResult(jobId, value) {
  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(jobId, value);
  } catch {
    // Nothing else we can do from a background function (no client connection);
    // the client poller will eventually time out.
  }
}

function extractImageBase64(json) {
  const calls = Array.isArray(json?.output) ? json.output : [];
  const imgCall = calls.find((o) => o?.type === 'image_generation_call');
  const b64 = imgCall?.result;
  return typeof b64 === 'string' && b64 ? b64 : '';
}

export default async (req) => {
  let parsed;
  try {
    parsed = await req.json();
  } catch {
    return new Response(null, { status: 202 });
  }

  const jobId = typeof parsed.jobId === 'string' ? parsed.jobId.trim() : '';
  const country = typeof parsed.country === 'string' ? parsed.country : '';
  const clientKey = normalizeKey(parsed.apiKey);
  const payload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null;

  if (!jobId) return new Response(null, { status: 202 });

  if (!payload) {
    await writeResult(jobId, { status: 'error', error: 'Missing payload' });
    return new Response(null, { status: 202 });
  }

  const apiKey = clientKey || resolveServerKey(country).key;
  if (!apiKey) {
    await writeResult(jobId, {
      status: 'error',
      error: 'No OpenAI API key configured on the server. Set RFT_DE (and per-country RFT_<COUNTRY>) env vars in Netlify.',
    });
    return new Response(null, { status: 202 });
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const raw = await upstream.text();

    if (!upstream.ok) {
      await writeResult(jobId, {
        status: 'error',
        error: `OpenAI Responses API ${upstream.status}: ${raw.slice(0, 400)}`,
      });
      return new Response(null, { status: 202 });
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      await writeResult(jobId, { status: 'error', error: 'OpenAI returned a non-JSON response.' });
      return new Response(null, { status: 202 });
    }

    const imageBase64 = extractImageBase64(json);
    if (!imageBase64) {
      await writeResult(jobId, {
        status: 'error',
        error: 'OpenAI 未返回图片数据。可能原因：参考图被内容审核拦截，或当前账号无 Image 2 可用权限。',
      });
      return new Response(null, { status: 202 });
    }

    await writeResult(jobId, { status: 'done', imageBase64, mimeType: 'image/png' });
    return new Response(null, { status: 202 });
  } catch (err) {
    await writeResult(jobId, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(null, { status: 202 });
  }
};
