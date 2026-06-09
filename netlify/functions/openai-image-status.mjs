import { getStore } from '@netlify/blobs';

// Netlify Functions v2 synchronous poller for the async image job started by
// openai-image-background. Returns the job's terminal result from Netlify Blobs.
// On a terminal state (done/error) the blob is deleted so results don't pile up.
// v2 auto-configures Netlify Blobs (the v1 handler style did not).

const STORE_NAME = 'image-jobs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: CORS });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  let jobId = '';
  try {
    jobId = new URL(req.url).searchParams.get('jobId')?.trim() || '';
  } catch {
    jobId = '';
  }
  if (!jobId && req.method === 'POST') {
    try {
      const body = await req.json();
      jobId = (body?.jobId || '').toString().trim();
    } catch {
      jobId = '';
    }
  }

  if (!jobId) return json(400, { error: 'Missing jobId' });

  try {
    const store = getStore(STORE_NAME);
    const result = await store.get(jobId, { type: 'json' });

    if (!result) {
      // Not written yet → still running.
      return json(200, { status: 'pending' });
    }

    // Terminal state reached — clean up so storage doesn't accumulate.
    try {
      await store.delete(jobId);
    } catch {
      // best-effort cleanup
    }

    return json(200, result);
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : String(err) });
  }
};
