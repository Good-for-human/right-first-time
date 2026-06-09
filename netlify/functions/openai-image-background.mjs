import { getStore } from '@netlify/blobs';
import { resolveServerKey, normalizeKey } from '../lib/resolveKey.js';

// Background function (filename ends with `-background`): Netlify returns 202
// immediately and lets this run up to 15 minutes — long enough for gpt-image
// generation, which exceeds the 10/26s synchronous function limit. The result is
// written to a Netlify Blobs store, polled by the openai-image-status function.

const STORE_NAME = 'image-jobs';

async function writeResult(jobId, value) {
  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(jobId, value);
  } catch {
    // If the store write fails there is nothing else we can do from a background
    // function (no client connection). The poller will time out client-side.
  }
}

function extractImageBase64(json) {
  const calls = Array.isArray(json?.output) ? json.output : [];
  const imgCall = calls.find((o) => o?.type === 'image_generation_call');
  const b64 = imgCall?.result;
  return typeof b64 === 'string' && b64 ? b64 : '';
}

export const handler = async (event) => {
  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 202 };
  }

  const jobId = typeof parsed.jobId === 'string' ? parsed.jobId.trim() : '';
  const country = typeof parsed.country === 'string' ? parsed.country : '';
  const clientKey = normalizeKey(parsed.apiKey);
  const payload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null;

  if (!jobId) return { statusCode: 202 };

  if (!payload) {
    await writeResult(jobId, { status: 'error', error: 'Missing payload' });
    return { statusCode: 202 };
  }

  const apiKey = clientKey || resolveServerKey(country).key;
  if (!apiKey) {
    await writeResult(jobId, {
      status: 'error',
      error: 'No OpenAI API key configured on the server. Set RFT_DE (and per-country RFT_<COUNTRY>) env vars in Netlify.',
    });
    return { statusCode: 202 };
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
      return { statusCode: 202 };
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      await writeResult(jobId, { status: 'error', error: 'OpenAI returned a non-JSON response.' });
      return { statusCode: 202 };
    }

    const imageBase64 = extractImageBase64(json);
    if (!imageBase64) {
      await writeResult(jobId, {
        status: 'error',
        error: 'OpenAI 未返回图片数据。可能原因：参考图被内容审核拦截，或当前账号无 Image 2 可用权限。',
      });
      return { statusCode: 202 };
    }

    await writeResult(jobId, { status: 'done', imageBase64, mimeType: 'image/png' });
    return { statusCode: 202 };
  } catch (err) {
    await writeResult(jobId, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    return { statusCode: 202 };
  }
};
