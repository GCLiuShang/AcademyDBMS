const https = require('https');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEnvString(key, fallbackKeys = []) {
  const keys = [key, ...fallbackKeys];
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function getEnvInt(key, defaultValue) {
  const v = Number(getEnvString(key));
  if (!Number.isFinite(v)) return defaultValue;
  return Math.floor(v);
}

function parseJsonSafe(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isRetryableError(err) {
  const code = err && err.code ? String(err.code) : '';
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN') return true;
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') return true;
  const message = err && err.message ? String(err.message) : '';
  if (/timeout/i.test(message)) return true;
  return false;
}

function postJson(urlString, headers, jsonBody, { timeoutMs, insecureTls } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const payload = JSON.stringify(jsonBody);

    const options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(payload),
      },
      rejectUnauthorized: !insecureTls,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode || 0,
          headers: res.headers || {},
          text,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs || 20000, () => {
      const err = new Error(`Request timeout after ${timeoutMs || 20000}ms`);
      err.code = 'ETIMEDOUT';
      req.destroy(err);
    });
    req.write(payload);
    req.end();
  });
}

async function chatCompletions({
  messages,
  model,
  timeoutMs,
  retries,
} = {}) {
  const api = getEnvString('API', ['AI_API', 'MAAS_API']);
  const apiKey = getEnvString('API_KEY', ['AI_API_KEY', 'MAAS_API_KEY']);
  const resolvedModel = model || getEnvString('MODEL', ['AI_MODEL']);
  const resolvedTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.max(1000, Math.floor(Number(timeoutMs)))
    : getEnvInt('AI_TIMEOUT_MS', 20000);
  const resolvedRetries = Number.isFinite(Number(retries))
    ? Math.max(0, Math.floor(Number(retries)))
    : getEnvInt('AI_RETRIES', 2);
  const insecureTls = getEnvString('AI_INSECURE_TLS') === '1';

  if (!api || !apiKey || !resolvedModel) {
    const err = new Error('Missing AI env config');
    err.code = 'AI_MISSING_ENV';
    err.details = {
      hasAPI: Boolean(api),
      hasAPIKey: Boolean(apiKey),
      hasModel: Boolean(resolvedModel),
    };
    throw err;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('Invalid messages');
    err.code = 'AI_INVALID_MESSAGES';
    throw err;
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const payload = {
    model: resolvedModel,
    messages,
  };

  let lastErr = null;
  const maxAttempts = resolvedRetries + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await postJson(api, headers, payload, {
        timeoutMs: resolvedTimeoutMs,
        insecureTls,
      });
      const json = parseJsonSafe(res.text);
      if (res.status >= 200 && res.status < 300) {
        return {
          status: res.status,
          json,
          text: res.text,
          model: resolvedModel,
        };
      }

      const err = new Error(`Upstream error: HTTP ${res.status}`);
      err.code = 'AI_UPSTREAM_ERROR';
      err.status = res.status;
      err.upstream = { status: res.status, json, text: res.text };
      if (!isRetryableStatus(res.status) || attempt >= maxAttempts) throw err;

      const backoffMs = Math.min(
        3000,
        300 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100)
      );
      await sleep(backoffMs);
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt >= maxAttempts) throw err;

      const backoffMs = Math.min(
        3000,
        300 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100)
      );
      await sleep(backoffMs);
    }
  }

  throw lastErr || new Error('Unknown AI error');
}

module.exports = {
  chatCompletions,
};

