import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import { useAIChatFeatureList } from './AIChatContext';
import './AIChat.css';

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function safeJsonParse(text) { try { return JSON.parse(text); } catch { return null; } }
function makeId() { return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`; }
function getUserKey() { const u = getCurrentUserFromStorage(); return u?.Uno || sessionStorage.getItem('currentUno') || 'anonymous'; }

function normalizeMessageList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(m => m && typeof m === 'object').map(m => ({
    id: typeof m.id === 'string' ? m.id : makeId(),
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : String(m.content || ''),
    ts: Number.isFinite(Number(m.ts)) ? Number(m.ts) : Date.now(),
  })).filter(m => m.content.trim());
}

const BALL_SIZE = 52;
const MARGIN = 16;
const PANEL_W = 520;
const PANEL_H = 640;

function defaultBallPos() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { left: Math.max(MARGIN, w - BALL_SIZE - MARGIN), top: Math.max(MARGIN, h - BALL_SIZE - MARGIN) };
}

export default function AIChat() {
  const features = useAIChatFeatureList();
  const [open, setOpen] = useState(false);
  const timers = useRef([]);
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const [uno, setUno] = useState(getUserKey);
  useEffect(() => {
    const id = setInterval(() => { const n = getUserKey(); setUno(p => p === n ? p : n); }, 800);
    return () => clearInterval(id);
  }, []);

  const histKey = useMemo(() => `aichat_history:${uno}`, [uno]);
  const [messages, setMessages] = useState(() => {
    const raw = localStorage.getItem(histKey);
    return normalizeMessageList(safeJsonParse(raw));
  });
  useEffect(() => {
    const raw = localStorage.getItem(histKey);
    setMessages(normalizeMessageList(safeJsonParse(raw)));
  }, [histKey]);
  useEffect(() => { try { localStorage.setItem(histKey, JSON.stringify(messages)); } catch {} }, [histKey, messages]);

  const [ballPos, setBallPos] = useState(() => {
    const raw = localStorage.getItem('aichat_ball_pos:v1');
    const p = safeJsonParse(raw);
    if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) return { left: p.left, top: p.top };
    return defaultBallPos();
  });
  useEffect(() => { try { localStorage.setItem('aichat_ball_pos:v1', JSON.stringify(ballPos)); } catch {} }, [ballPos]);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const dragging = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const clampPos = useCallback((pos) => ({
    left: clamp(pos.left, MARGIN, window.innerWidth - BALL_SIZE - MARGIN),
    top: clamp(pos.top, MARGIN, window.innerHeight - BALL_SIZE - MARGIN),
  }), []);

  useEffect(() => {
    const onResize = () => setBallPos(p => clampPos(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPos]);

  const openPanel = useCallback(() => { clearTimers(); setOpen(true); }, [clearTimers]);
  const closePanel = useCallback(() => { clearTimers(); setOpen(false); }, [clearTimers]);

  // Drag handlers
  const onPointerDown = useCallback(e => {
    if (open) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragging.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: ballPos.left - e.clientX, oy: ballPos.top - e.clientY, moved: false };
    setDragActive(true);
    e.preventDefault();
  }, [open, ballPos]);

  const onPointerMove = useCallback(e => {
    const d = dragging.current;
    if (!d || d.id !== e.pointerId) return;
    if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    setBallPos(clampPos({ left: e.clientX + d.ox, top: e.clientY + d.oy }));
  }, [clampPos]);

  const onPointerUp = useCallback(e => {
    const d = dragging.current;
    if (!d || d.id !== e.pointerId) return;
    dragging.current = null;
    setDragActive(false);
    setBallPos(p => clampPos(p));
    if (!d.moved) openPanel();
    e.preventDefault();
  }, [clampPos, openPanel]);

  const onPointerCancel = useCallback(() => { dragging.current = null; setDragActive(false); setBallPos(p => clampPos(p)); }, [clampPos]);
  const onContextMenu = useCallback(e => { if (!open) e.preventDefault(); }, [open]);

  // Chat scroll
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // AI send
  const sendToAi = useCallback(async ({ text, showInChat, displayText }) => {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return;
    if (showInChat) {
      const shown = typeof displayText === 'string' && displayText.trim() ? displayText.trim() : clean;
      setMessages(prev => [...prev, { id: makeId(), role: 'user', content: shown, ts: Date.now() }]);
    }
    setSending(true);
    try {
      const body = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: clean },
        ],
        userRole: getCurrentUserFromStorage()?.Urole || '',
      };
      const res = await fetch('/api/academy/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      const content = json?.data?.content;
      if (!res.ok || !json?.success || typeof content !== 'string') {
        if (showInChat) setMessages(prev => [...prev, { id: makeId(), role: 'assistant', content: '请求失败，请稍后重试。', ts: Date.now() }]);
        return;
      }
      if (showInChat) setMessages(prev => [...prev, { id: makeId(), role: 'assistant', content: content.trim(), ts: Date.now() }]);
    } catch {
      if (showInChat) setMessages(prev => [...prev, { id: makeId(), role: 'assistant', content: '请求失败，请稍后重试。', ts: Date.now() }]);
    } finally { setSending(false); }
  }, [messages]);

  const onSend = useCallback(async () => {
    if (sending) return;
    const text = draft;
    setDraft('');
    await sendToAi({ text, showInChat: true });
  }, [draft, sendToAi, sending]);

  const onDraftKeyDown = useCallback(e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  }, [onSend]);

  const onFeatureClick = useCallback(async (f) => {
    if (sending) return;
    const text = typeof f?.prompt === 'string' ? f.prompt : '';
    const label = typeof f?.label === 'string' ? f.label.trim() : '';
    await sendToAi({ text, showInChat: true, displayText: label ? `功能：${label}` : '功能：快捷指令' });
  }, [sendToAi, sending]);

  return (
    <>
      {/* 遮罩 */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="ai-mask"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={closePanel}
          />
        )}
      </AnimatePresence>

      {/* 浮动球或面板 */}
      {open ? (
        <motion.div
          className="ai-panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {/* 头部 */}
          <div className="ai-panel-header">
            <span className="ai-panel-title">AI 助手</span>
            <button className="ai-panel-close" onClick={closePanel}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="5" y1="5" x2="15" y2="15" /><line x1="15" y1="5" x2="5" y2="15" />
              </svg>
            </button>
          </div>

          {/* 聊天区 */}
          <div className="ai-chat" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="ai-empty">开始和 AI 聊天吧</div>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`ai-msg ${m.role === 'user' ? 'ai-msg-user' : 'ai-msg-ai'}`}>
                  <div className="ai-bubble">{m.content}</div>
                </div>
              ))
            )}
          </div>

          {/* 功能区 */}
          <div className="ai-features">
            <div className="ai-features-scroll">
              {Array.isArray(features) && features.length > 0 ? features.map(f => (
                <button key={String(f.id || f.label || f.prompt)} type="button" className="ai-feat-btn" onClick={() => onFeatureClick(f)} disabled={sending}>
                  {String(f.label || '')}
                </button>
              )) : (
                <span className="ai-feat-empty">当前页面没有特殊功能</span>
              )}
            </div>
          </div>

          {/* 输入区 */}
          <div className="ai-input">
            <textarea className="ai-textarea" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onDraftKeyDown} placeholder="输入消息..." disabled={sending} rows={2} />
            <button type="button" className="ai-send-btn" onClick={onSend} disabled={sending || !draft.trim()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </motion.div>
      ) : (
        <div
          className={`ai-ball ${dragActive ? 'ai-ball-dragging' : ''}`}
          style={{ left: ballPos.left, top: ballPos.top }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={onContextMenu}
        >
          <svg className="ai-ball-icon" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 0 1 10 10c0 2.2-.7 4.2-1.9 5.9l1.9 4.1-4.1-1.9A10 10 0 1 1 12 2z" />
            <line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="14" y2="14" />
          </svg>
        </div>
      )}
    </>
  );
}
