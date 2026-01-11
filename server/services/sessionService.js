const crypto = require('crypto');
const db = require('../db');

function parseCookieHeader(cookieHeader) {
  const header = typeof cookieHeader === 'string' ? cookieHeader : '';
  const out = {};
  header.split(';').forEach((part) => {
    const s = String(part || '').trim();
    if (!s) return;
    const eq = s.indexOf('=');
    if (eq <= 0) return;
    const k = s.slice(0, eq).trim();
    const v = s.slice(eq + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function buildSetCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value))}`];
  if (options.maxAgeSeconds !== undefined && options.maxAgeSeconds !== null) {
    const n = Number(options.maxAgeSeconds);
    if (Number.isFinite(n)) parts.push(`Max-Age=${Math.max(0, Math.floor(n))}`);
  }
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function getCookieName() {
  const v = process.env.SESSION_COOKIE_NAME;
  return typeof v === 'string' && v.trim() ? v.trim() : 'sid';
}

function getSessionTtlMs() {
  const daysRaw = Number(process.env.SESSION_TTL_DAYS);
  const days = Number.isFinite(daysRaw) ? Math.min(30, Math.max(1, Math.floor(daysRaw))) : 7;
  return days * 24 * 60 * 60 * 1000;
}

function getCookieOptions(req) {
  const sameSiteRaw = typeof process.env.SESSION_COOKIE_SAMESITE === 'string' ? process.env.SESSION_COOKIE_SAMESITE : '';
  const sameSite =
    sameSiteRaw === 'Strict' || sameSiteRaw === 'Lax' || sameSiteRaw === 'None' ? sameSiteRaw : 'Lax';

  const secureRaw = process.env.SESSION_COOKIE_SECURE;
  const secure =
    secureRaw === '1' ? true : secureRaw === '0' ? false : process.env.NODE_ENV === 'production';

  const domainRaw = process.env.SESSION_COOKIE_DOMAIN;
  const domain = typeof domainRaw === 'string' && domainRaw.trim() ? domainRaw.trim() : undefined;

  const pathRaw = process.env.SESSION_COOKIE_PATH;
  const path = typeof pathRaw === 'string' && pathRaw.trim() ? pathRaw.trim() : '/';

  return {
    sameSite,
    secure,
    domain,
    path,
    httpOnly: true,
  };
}

function makeSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession({ uno, ua, ip, ttlMs } = {}) {
  const normalizedUno = String(uno || '').trim();
  if (!normalizedUno) throw new Error('Uno is required for session');

  const sid = makeSessionId();
  const ttl = Number.isFinite(Number(ttlMs)) ? Math.max(60 * 1000, Math.floor(Number(ttlMs))) : getSessionTtlMs();
  const expiresAt = new Date(Date.now() + ttl);

  await db.execute(
    `INSERT INTO User_Session
      (Sid, Uno, CreatedAt, LastSeenAt, ExpiresAt, Ip, Ua, Revoked)
     VALUES (?, ?, NOW(), NOW(), ?, ?, ?, 0)`,
    [sid, normalizedUno, expiresAt, ip || null, ua || null]
  );

  return { sid, expiresAt };
}

async function revokeSession(sid) {
  const normalizedSid = String(sid || '').trim();
  if (!normalizedSid) return;
  await db.execute(`UPDATE User_Session SET Revoked = 1 WHERE Sid = ?`, [normalizedSid]);
}

async function getUserBySessionId(sid) {
  const normalizedSid = String(sid || '').trim();
  if (!normalizedSid) return null;

  const [rows] = await db.execute(
    `SELECT u.Uno AS Uno, u.Urole AS Urole
     FROM User_Session s
     JOIN User u ON u.Uno = s.Uno
     WHERE s.Sid = ?
       AND s.Revoked = 0
       AND s.ExpiresAt > NOW()
     LIMIT 1`,
    [normalizedSid]
  );
  if (rows.length === 0) return null;

  await db.execute(`UPDATE User_Session SET LastSeenAt = NOW() WHERE Sid = ?`, [normalizedSid]);
  return rows[0];
}

async function attachSessionUser(req, res, next) {
  try {
    const cookieName = getCookieName();
    const cookies = parseCookieHeader(req.headers.cookie);
    const sid = cookies[cookieName];
    if (!sid) {
      req.user = null;
      req.sessionSid = null;
      return next();
    }

    const user = await getUserBySessionId(sid);
    if (!user) {
      req.user = null;
      req.sessionSid = null;
      return next();
    }

    req.user = user;
    req.sessionSid = sid;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user || !req.user.Uno) {
    return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Unauthenticated' });
  }
  return next();
}

function enforceUnoConsistency(options = {}) {
  const ignorePaths = Array.isArray(options.ignorePaths) ? options.ignorePaths.filter(Boolean).map(String) : [];

  const normalizeUnoValue = (value) => {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
      const normalized = value
        .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
        .filter(Boolean);
      return normalized.length > 0 ? normalized : null;
    }
    const s = String(value).trim();
    return s ? [s] : null;
  };

  return (req, res, next) => {
    const path = typeof req.path === 'string' ? req.path : '';
    if (ignorePaths.includes(path)) return next();

    const fromQuery = normalizeUnoValue(req?.query?.uno);
    const fromBody = normalizeUnoValue(req?.body?.uno);
    const fromParams = normalizeUnoValue(req?.params?.uno);

    const all = []
      .concat(fromQuery || [])
      .concat(fromBody || [])
      .concat(fromParams || []);
    if (all.length === 0) return next();

    const currentUno = req?.user?.Uno ? String(req.user.Uno).trim() : '';
    if (!currentUno) {
      return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Unauthenticated' });
    }

    for (const u of all) {
      if (u !== currentUno) {
        return res.status(403).json({ success: false, code: 'UNO_MISMATCH', message: 'Uno mismatch' });
      }
    }

    return next();
  };
}

function setSessionCookie(res, sid, req) {
  const cookieName = getCookieName();
  const opts = getCookieOptions(req);
  const ttlMs = getSessionTtlMs();
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  const cookie = buildSetCookie(cookieName, sid, {
    ...opts,
    maxAgeSeconds,
  });
  res.setHeader('Set-Cookie', cookie);
}

function clearSessionCookie(res, req) {
  const cookieName = getCookieName();
  const opts = getCookieOptions(req);
  const cookie = buildSetCookie(cookieName, '', {
    ...opts,
    maxAgeSeconds: 0,
  });
  res.setHeader('Set-Cookie', cookie);
}

module.exports = {
  attachSessionUser,
  requireAuth,
  enforceUnoConsistency,
  createSession,
  revokeSession,
  setSessionCookie,
  clearSessionCookie,
};
