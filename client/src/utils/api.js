/**
 * API 请求工具 — 自动附加 X-Session-Id 头用于标签页隔离的会话管理。
 *
 * 浏览器所有标签页共享 cookie store，无法按标签页独立维持会话。
 * 解决方案：登录时将 sid 存入 sessionStorage（标签页隔离），
 * 每次请求通过 X-Session-Id 请求头发送，服务器优先使用此头部识别会话。
 *
 * 注意：此文件当前未被项目全局使用。
 * 现有代码直接使用原生 fetch。跨标签页会话管理的核心修复已在 Login.jsx 中完成，
 * 同时登出流程已通过 /api/academy/logout 撤销当前标签页的 session。
 */
const SESSION_STORAGE_KEY = 'sid';

function getSessionId() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * 带会话标识的 fetch 封装。
 * 自动从 sessionStorage 读取 sid 并附加为 X-Session-Id 请求头。
 */
export async function apiFetch(url, options = {}) {
  const sid = getSessionId();
  const headers = {
    ...(options.headers || {}),
  };
  if (sid) {
    headers['X-Session-Id'] = sid;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
  return res;
}

/**
 * 登出：撤销当前标签页的会话。
 * 调用 /api/academy/logout 时通过 X-Session-Id 头发送当前标签页的会话 ID，
 * 服务器只撤销该特定会话。
 */
export async function apiLogout() {
  const sid = getSessionId();
  if (!sid) return { success: false };

  try {
    const res = await apiFetch('/api/academy/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return data;
  } catch {
    return { success: false };
  }
}
