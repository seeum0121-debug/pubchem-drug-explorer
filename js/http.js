const cache = new Map();
const pending = new Map();
let queue = Promise.resolve();
let lastStart = 0;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function abortError() {
  return new DOMException('Request cancelled.', 'AbortError');
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function apiError(message, status, url) {
  const error = new Error(message);
  error.name = 'APIError';
  error.status = status;
  error.url = url;
  return error;
}

async function fetchData(url, signal, format) {
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    await wait(Math.max(0, 1000 - (Date.now() - lastStart)), signal);
    lastStart = Date.now();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    let response;
    let body;
    try {
      if (signal.aborted) throw abortError();
      response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      body = response.ok && format === 'blob' ? await response.blob() : await response.text();
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (timedOut) throw apiError('API request timed out after 20 seconds.', 0, url);
      throw apiError(`Network request failed: ${error.message}`, 0, url);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
    if (!response.ok) {
      if (RETRYABLE.has(response.status) && attempt < 2) {
        const retryAfter = response.headers.get('Retry-After');
        let delay = 1000 * (2 ** attempt);
        if (retryAfter !== null) {
          const seconds = Number(retryAfter);
          const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
          if (Number.isFinite(parsed)) delay = Math.max(delay, parsed);
        }
        if (delay > 30000) throw apiError('API requested a long wait. Please try again later.', response.status, url);
        await wait(delay, signal);
        continue;
      }
      let detail = response.statusText;
      let code;
      try {
        const payload = JSON.parse(body);
        detail = payload.error?.message || payload.Fault?.Message || detail;
        code = payload.error?.code || payload.Fault?.Code;
      } catch { /* Non-JSON error responses remain explicit HTTP errors. */ }
      const error = apiError(`API HTTP ${response.status}: ${detail}`, response.status, url);
      error.code = code;
      throw error;
    }
    if (format === 'blob') return body;
    let data;
    try { data = JSON.parse(body); } catch { throw apiError('API returned invalid JSON.', response.status, url); }
    if (!data || typeof data !== 'object' || data.error || data.Fault) {
      throw apiError('API returned an error or invalid response.', response.status, url);
    }
    Object.defineProperty(data, '_retrievedAt', { value: new Date().toISOString() });
    return data;
  }
}

function request(url, format, { signal } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  let parsed;
  try { parsed = new URL(url); } catch { return Promise.reject(new Error('Invalid API URL.')); }
  if (parsed.protocol !== 'https:' || !['pubchem.ncbi.nlm.nih.gov', 'api.fda.gov'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port) {
    return Promise.reject(new Error('API URL is not an approved HTTPS endpoint.'));
  }
  const key = `${format}:${parsed.href}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  let entry = pending.get(key);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, users: 0, promise: null };
    const work = queue.then(() => fetchData(parsed.href, controller.signal, format));
    queue = work.catch(() => {});
    entry.promise = work.then(data => {
      if (controller.signal.aborted) throw abortError();
      cache.set(key, data);
      return data;
    }).finally(() => { if (pending.get(key) === entry) pending.delete(key); });
    pending.set(key, entry);
  }
  entry.users += 1;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      entry.users -= 1;
      callback(value);
    };
    const onAbort = () => {
      finish(reject, abortError());
      if (entry.users === 0) {
        entry.controller.abort();
        if (pending.get(key) === entry) pending.delete(key);
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    entry.promise.then(data => finish(resolve, data), error => finish(reject, error));
    if (signal?.aborted) onAbort();
  });
}

export function requestJSON(url, options = {}) {
  return request(url, 'json', options);
}

export function requestBlob(url, { signal } = {}) {
  return request(url, 'blob', { signal });
}
