const path = require('path');
const https = require('https');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function getEnv(name, fallbacks = []) {
  const candidates = [name, ...fallbacks];
  for (const key of candidates) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function truncate(text, maxLen = 4000) {
  if (typeof text !== 'string') return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n... (truncated, total ${text.length} chars)`;
}

function postJsonWithHttps(urlString, headers, jsonBody, { timeoutMs, insecureTls } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = JSON.stringify(jsonBody);
    const options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      rejectUnauthorized: !insecureTls,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode || 0, text, headers: res.headers });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs || 20000, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs || 20000}ms`));
    });
    req.write(body);
    req.end();
  });
}

async function postJson(urlString, headers, jsonBody, { timeoutMs, insecureTls } = {}) {
  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || 20000);
    try {
      const res = await fetch(urlString, {
        method: 'POST',
        headers,
        body: JSON.stringify(jsonBody),
        signal: controller.signal,
      });
      const text = await res.text();
      return { status: res.status, text, headers: Object.fromEntries(res.headers.entries()) };
    } finally {
      clearTimeout(timeout);
    }
  }

  return postJsonWithHttps(urlString, headers, jsonBody, { timeoutMs, insecureTls });
}

async function main() {
  const api = getEnv('API', ['AI_API', 'MAAS_API']);
  const model = getEnv('MODEL', ['AI_MODEL']);
  const apiKey = getEnv('API_KEY', ['AI_API_KEY', 'MAAS_API_KEY']);

  const prompt = (process.argv.slice(2).join(' ') || '你好').trim();
  const timeoutMs = Number(getEnv('AI_TIMEOUT_MS')) || 20000;
  const insecureTls = getEnv('AI_INSECURE_TLS') === '1';

  if (!api || !model || !apiKey) {
    const missing = [
      !api ? 'API' : null,
      !model ? 'MODEL' : null,
      !apiKey ? 'API_KEY' : null,
    ].filter(Boolean);
    console.error(`Missing env: ${missing.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const payload = {
    model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt },
    ],
  };

  console.log(`POST ${api}`);
  console.log(`model=${model}`);
  console.log(`timeoutMs=${timeoutMs}`);
  console.log(`insecureTls=${insecureTls ? 'true' : 'false'}`);

  const startedAt = Date.now();
  try {
    const res = await postJson(api, headers, payload, { timeoutMs, insecureTls });
    const elapsedMs = Date.now() - startedAt;
    console.log(`HTTP ${res.status} (${elapsedMs}ms)`);

    let parsed;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      parsed = null;
    }

    if (parsed && parsed.choices?.[0]?.message?.content) {
      console.log('assistant:', parsed.choices[0].message.content);
    } else {
      console.log(truncate(res.text));
    }

    process.exitCode = res.status >= 200 && res.status < 300 ? 0 : 1;
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    console.error(`Request failed (${elapsedMs}ms): ${err && err.message ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

main();

