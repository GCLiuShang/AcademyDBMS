import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

/**
 * 重写 window.fetch，自动注入 X-Session-Id 请求头用于标签页隔离的会话管理。
 *
 * 浏览器所有标签页共享 cookie store，多标签页独立登录时，
 * 后登录的 Set-Cookie 会覆盖之前的 cookie，导致旧标签页的 sid 失效。
 * 解决方案：登录时将 sid 存入 sessionStorage（标签页隔离），
 * 每次 fetch 自动附加 X-Session-Id 头，后端优先从此头识别会话。
 */
(function patchFetch() {
  const SID_KEY = 'sid';
  const HEADER_NAME = 'X-Session-Id';
  const originalFetch = window.fetch;

  window.fetch = function patchedFetch(input, init) {
    init = init || {};
    init.headers = init.headers || {};

    // 只有没有显式设置 X-Session-Id 头时才自动注入
    const existingHeaders = init.headers;
    const hasCustomSessionId =
      existingHeaders instanceof Headers
        ? existingHeaders.has(HEADER_NAME)
        : HEADER_NAME in existingHeaders;

    if (!hasCustomSessionId) {
      try {
        const sid = sessionStorage.getItem(SID_KEY);
        if (sid) {
          if (existingHeaders instanceof Headers) {
            existingHeaders.set(HEADER_NAME, sid);
          } else {
            existingHeaders[HEADER_NAME] = sid;
          }
        }
      } catch {
        // sessionStorage 不可用时静默回退
      }
    }

    return originalFetch.call(window, input, init);
  };
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
