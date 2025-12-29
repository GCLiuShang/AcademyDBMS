import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import { useAIChatFeatureList } from './AIChatContext';
import './AIChat.css';

const PHASE = {
  CLOSED: 'closed',
  OPEN_MASK: 'open_mask',
  OPEN_FILLED: 'open_filled',
  OPEN_EXPAND: 'open_expand',
  OPEN: 'open',
  CLOSE_CONTENT: 'close_content',
  CLOSE_SHRINK: 'close_shrink',
  CLOSE_UNFILL: 'close_unfill',
  CLOSE_MASK: 'close_mask',
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function safeJsonParse(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function makeId() {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessageList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      id: typeof m.id === 'string' ? m.id : makeId(),
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : String(m.content || ''),
      ts: Number.isFinite(Number(m.ts)) ? Number(m.ts) : Date.now(),
    }))
    .filter((m) => m.content.trim());
}

function getUserKey() {
  const user = getCurrentUserFromStorage();
  const uno = user?.Uno || sessionStorage.getItem('currentUno') || 'anonymous';
  return String(uno);
}

function getStorageKeyForHistory(uno) {
  return `aichat_history:${uno}`;
}

function getStorageKeyForBallPos() {
  return 'aichat_ball_pos:v1';
}

function getDefaultBallPos() {
  const size = 56;
  const margin = 16;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return { left: Math.max(margin, w - size - margin), top: Math.max(margin, h - size - margin) };
}

export default function AIChat() {
  const features = useAIChatFeatureList();
  const [phase, setPhase] = useState(PHASE.CLOSED);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const timersRef = useRef([]);
  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  const restoreBodyOverflowRef = useRef(null);

  const [uno, setUno] = useState(() => getUserKey());
  useEffect(() => {
    const id = setInterval(() => {
      const next = getUserKey();
      setUno((prev) => (prev === next ? prev : next));
    }, 800);
    return () => clearInterval(id);
  }, []);

  const historyStorageKey = useMemo(() => getStorageKeyForHistory(uno), [uno]);

  const [messages, setMessages] = useState(() => {
    const raw = localStorage.getItem(historyStorageKey);
    const parsed = safeJsonParse(raw);
    return normalizeMessageList(parsed);
  });

  useEffect(() => {
    const raw = localStorage.getItem(historyStorageKey);
    const parsed = safeJsonParse(raw);
    setMessages(normalizeMessageList(parsed));
  }, [historyStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(messages));
    } catch {
      void 0;
    }
  }, [historyStorageKey, messages]);

  const [ballPos, setBallPos] = useState(() => {
    const raw = localStorage.getItem(getStorageKeyForBallPos());
    const parsed = safeJsonParse(raw);
    if (parsed && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
      return { left: parsed.left, top: parsed.top };
    }
    return getDefaultBallPos();
  });

  useEffect(() => {
    try {
      localStorage.setItem(getStorageKeyForBallPos(), JSON.stringify(ballPos));
    } catch {
      void 0;
    }
  }, [ballPos]);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [panelSize] = useState({ width: 560, height: 720 });
  const [isDragging, setIsDragging] = useState(false);

  const clampBallPos = useCallback(
    (pos) => {
      const size = 56;
      const margin = 10;
      const maxLeft = Math.max(margin, window.innerWidth - size - margin);
      const maxTop = Math.max(margin, window.innerHeight - size - margin);
      return { left: clamp(pos.left, margin, maxLeft), top: clamp(pos.top, margin, maxTop) };
    },
    []
  );

  useEffect(() => {
    const onResize = () => {
      setBallPos((p) => clampBallPos(p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampBallPos]);

  const open = useCallback(() => {
    if (phaseRef.current !== PHASE.CLOSED) return;
    clearTimers();
    setPhase(PHASE.OPEN_MASK);
    timersRef.current.push(
      setTimeout(() => {
        setPhase(PHASE.OPEN_FILLED);
      }, 300)
    );
    timersRef.current.push(
      setTimeout(() => {
        setPhase(PHASE.OPEN_EXPAND);
      }, 600)
    );
    timersRef.current.push(
      setTimeout(() => {
        setPhase(PHASE.OPEN);
      }, 900)
    );
  }, [clearTimers]);

  const close = useCallback(() => {
    if (phaseRef.current === PHASE.CLOSED) return;
    clearTimers();
    setPhase(PHASE.CLOSE_CONTENT);
    timersRef.current.push(
      setTimeout(() => {
        setPhase(PHASE.CLOSE_SHRINK);
      }, 300)
    );
    timersRef.current.push(
      setTimeout(() => {
        setPhase(PHASE.CLOSE_UNFILL);
      }, 600)
    );
    timersRef.current.push(
      setTimeout(() => {
        setPhase(PHASE.CLOSE_MASK);
      }, 900)
    );
    timersRef.current.push(
      setTimeout(() => {
        setPhase(PHASE.CLOSED);
      }, 1200)
    );
  }, [clearTimers]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const isMaskVisible = phase !== PHASE.CLOSED;
  const isFilled =
    phase === PHASE.OPEN_FILLED ||
    phase === PHASE.OPEN_EXPAND ||
    phase === PHASE.OPEN ||
    phase === PHASE.CLOSE_CONTENT ||
    phase === PHASE.CLOSE_SHRINK;
  const isExpanded = phase === PHASE.OPEN_EXPAND || phase === PHASE.OPEN || phase === PHASE.CLOSE_CONTENT;
  const isContentVisible = phase === PHASE.OPEN;

  useEffect(() => {
    if (isMaskVisible) {
      if (!restoreBodyOverflowRef.current) {
        const prev = document.body.style.overflow;
        restoreBodyOverflowRef.current = () => {
          document.body.style.overflow = prev;
        };
        document.body.style.overflow = 'hidden';
      }
      return;
    }
    if (restoreBodyOverflowRef.current) {
      restoreBodyOverflowRef.current();
      restoreBodyOverflowRef.current = null;
    }
  }, [isMaskVisible]);

  useEffect(() => {
    return () => {
      if (restoreBodyOverflowRef.current) {
        restoreBodyOverflowRef.current();
        restoreBodyOverflowRef.current = null;
      }
    };
  }, []);

  const shellStyle = useMemo(() => {
    if (isExpanded) {
      const left = Math.round((window.innerWidth - panelSize.width) / 2);
      const top = Math.round((window.innerHeight - panelSize.height) / 2);
      return {
        left: `${Math.max(0, left)}px`,
        top: `${Math.max(0, top)}px`,
        width: `${panelSize.width}px`,
        height: `${panelSize.height}px`,
        borderRadius: '22px',
        backgroundColor: '#00489B',
      };
    }
    return {
      left: `${ballPos.left}px`,
      top: `${ballPos.top}px`,
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      backgroundColor: isFilled ? '#00489B' : 'transparent',
    };
  }, [ballPos.left, ballPos.top, isExpanded, isFilled, panelSize.height, panelSize.width]);

  const draggingRef = useRef(null);

  const onBallPointerDown = useCallback(
    (e) => {
      if (phaseRef.current !== PHASE.CLOSED) return;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      draggingRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: ballPos.left - e.clientX,
        offsetY: ballPos.top - e.clientY,
        moved: false,
      };
      setIsDragging(true);
      e.preventDefault();
    },
    [ballPos.left, ballPos.top]
  );

  const onBallPointerMove = useCallback(
    (e) => {
      const d = draggingRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      setBallPos(
        clampBallPos({
          left: e.clientX + d.offsetX,
          top: e.clientY + d.offsetY,
        })
      );
    },
    [clampBallPos]
  );

  const onBallPointerUp = useCallback(
    (e) => {
      const d = draggingRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      draggingRef.current = null;
      setIsDragging(false);
      setBallPos((p) => clampBallPos(p));
      if (!d.moved) open();
      e.preventDefault();
    },
    [clampBallPos, open]
  );

  const onBallPointerCancel = useCallback(() => {
    draggingRef.current = null;
    setIsDragging(false);
    setBallPos((p) => clampBallPos(p));
  }, [clampBallPos]);

  const onBallContextMenu = useCallback((e) => {
    if (phaseRef.current === PHASE.CLOSED) e.preventDefault();
  }, []);

  const chatScrollRef = useRef(null);
  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, isContentVisible]);

  const buildUpstreamMessages = useCallback(
    (extraUserText) => {
      const base = [
        { role: 'system', content: 'You are a helpful assistant.' },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];
      if (extraUserText) base.push({ role: 'user', content: extraUserText });
      return base;
    },
    [messages]
  );

  const sendToAi = useCallback(
    async ({ text, showInChat, displayText }) => {
      const clean = typeof text === 'string' ? text.trim() : '';
      if (!clean) return;

      if (showInChat) {
        const shown = typeof displayText === 'string' && displayText.trim() ? displayText.trim() : clean;
        const userMsg = { id: makeId(), role: 'user', content: shown, ts: Date.now() };
        setMessages((prev) => [...prev, userMsg]);
      }

      setSending(true);
      try {
        const body = { messages: buildUpstreamMessages(clean) };
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            userRole: getCurrentUserFromStorage()?.Urole || '',
          }),
        });
        const json = await res.json().catch(() => null);
        const content = json?.data?.content;
        if (!res.ok || !json?.success || typeof content !== 'string') {
          if (showInChat) {
            setMessages((prev) => [
              ...prev,
              { id: makeId(), role: 'assistant', content: '请求失败，请稍后重试。', ts: Date.now() },
            ]);
          }
          return;
        }
        if (showInChat) {
          setMessages((prev) => [
            ...prev,
            { id: makeId(), role: 'assistant', content: content.trim(), ts: Date.now() },
          ]);
        }
      } catch {
        if (showInChat) {
          setMessages((prev) => [
            ...prev,
            { id: makeId(), role: 'assistant', content: '请求失败，请稍后重试。', ts: Date.now() },
          ]);
        }
      } finally {
        setSending(false);
      }
    },
    [buildUpstreamMessages]
  );

  const onSend = useCallback(async () => {
    if (sending) return;
    const text = draft;
    setDraft('');
    await sendToAi({ text, showInChat: true });
  }, [draft, sendToAi, sending]);

  const onDraftKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );

  const onFeatureClick = useCallback(
    async (feature) => {
      if (sending) return;
      const text = typeof feature?.prompt === 'string' ? feature.prompt : '';
      const label = typeof feature?.label === 'string' ? feature.label.trim() : '';
      const displayText = label ? `功能：${label}` : '功能：快捷指令';
      await sendToAi({ text, showInChat: true, displayText });
    },
    [sendToAi, sending]
  );

  return (
    <>
      <div
        className={`aichat-mask ${isMaskVisible && phase !== PHASE.CLOSE_MASK ? 'visible' : ''}`}
        onClick={close}
      />

      <div
        className={`aichat-shell ${isExpanded ? 'expanded' : ''} ${isFilled ? 'filled' : ''} ${isDragging && !isExpanded ? 'dragging' : ''}`}
        style={shellStyle}
        onPointerDown={onBallPointerDown}
        onPointerMove={onBallPointerMove}
        onPointerUp={onBallPointerUp}
        onPointerCancel={onBallPointerCancel}
        onContextMenu={onBallContextMenu}
      >
        {!isExpanded && (
          <img className="aichat-icon" src="/images/aichat/aichat.svg" alt="AI Chat" draggable={false} />
        )}

        {isExpanded && (
          <div className={`aichat-panel ${isContentVisible ? 'visible' : ''}`}>
            <div className="aichat-block aichat-chat">
              <div className="aichat-chat-scroll" ref={chatScrollRef}>
                {messages.length === 0 ? (
                  <div className="aichat-empty">开始和 AI 聊天吧</div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`aichat-msg-row ${m.role === 'user' ? 'right' : 'left'}`}
                    >
                      <div className="aichat-msg-bubble">{m.content}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="aichat-block aichat-input">
              <textarea
                className="aichat-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onDraftKeyDown}
                placeholder="请输入..."
                disabled={sending}
              />
              <button type="button" className="aichat-send" onClick={onSend} disabled={sending || !draft.trim()}>
                发送
              </button>
            </div>

            <div className="aichat-block aichat-features">
              <div className="aichat-features-scroll">
                {Array.isArray(features) && features.length > 0 ? (
                  features.map((f) => (
                    <button
                      key={String(f.id || f.label || f.prompt || makeId())}
                      type="button"
                      className="aichat-feature-btn"
                      onClick={() => onFeatureClick(f)}
                      disabled={sending}
                    >
                      {String(f.label || '')}
                    </button>
                  ))
                ) : (
                  <div className="aichat-feature-empty">当前页面没有特殊功能哦~</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
