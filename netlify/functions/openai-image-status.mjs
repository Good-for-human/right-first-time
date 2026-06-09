import { getStore } from '@netlify/blobs';

// Fast synchronous poller for the async image job started by
// openai-image-background. Returns the job's terminal result from Netlify Blobs.
// On a terminal state (done/error) the blob is deleted so results don't pile up.

const STORE_NAME = 'image-jobs';

function buildHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    ...extra,
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: buildHeaders(), body: '' };
  }

  const jobId =
    event.queryStringParameters?.jobId?.trim() ||
    (() => {
      try {
        return (JSON.parse(event.body || '{}').jobId || '').trim();
      } catch {
        return '';
      }
    })();

  if (!jobId) {
    return { statusCode: 400, headers: buildHeaders(), body: JSON.stringify({ error: 'Missing jobId' }) };
  }

  try {
    const store = getStore(STORE_NAME);
    const result = await store.get(jobId, { type: 'json' });

    if (!result) {
      // Not written yet → still running.
      return { statusCode: 200, headers: buildHeaders(), body: JSON.stringify({ status: 'pending' }) };
    }

    // Terminal state reached — clean up the blob so storage doesn't accumulate.
    try {
      await store.delete(jobId);
    } catch {
      // best-effort cleanup
    }

    return { statusCode: 200, headers: buildHeaders(), body: JSON.stringify(result) };
  } catch (err) {
    return {
      statusCode: 502,
      headers: buildHeaders(),
      body: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    };
  }
};
