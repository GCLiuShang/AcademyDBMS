import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Notification.css';

const Notification = ({ message, onDismiss, onAction }) => {
  const [expanded, setExpanded] = useState(false);
  const [fading, setFading] = useState(false);

  const isImportant = message.Msg_priority === '重要';
  const isKick = message._isKickNotification;
  const isExpired = message._isSessionExpired;
  const duration = (isKick || isExpired) ? 3000 : (isImportant ? 6000 : 3000);

  const formatDateTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${min}`;
  };

  const handleDismiss = useCallback(() => {
    setFading(true);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  // 自动关闭倒计时
  useEffect(() => {
    if (expanded) return;
    const t = setTimeout(handleDismiss, duration);
    return () => clearTimeout(t);
  }, [expanded, duration, handleDismiss]);

  const handleToggleExpand = (e) => {
    if (e.target.closest('.ntf-close')) return;
    setExpanded((p) => !p);
  };

  const displayContent = expanded
    ? message.Msg_content
    : message.Msg_content?.length > 28
      ? message.Msg_content.substring(0, 28) + '...'
      : message.Msg_content;

  return (
    <AnimatePresence>
      {!fading && (
        <>
          {/* 展开时显示遮罩 */}
          {expanded && (
            <motion.div
              className="ntf-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          )}

          <motion.div
            className={`ntf-box ${isImportant ? 'ntf-important' : 'ntf-normal'} ${expanded ? 'ntf-expanded' : ''}`}
            initial={{ x: 400, opacity: 0 }}
            animate={expanded ? { x: 0, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={expanded ? { scale: 0.92, opacity: 0 } : { x: 400, opacity: 0 }}
            transition={expanded ? { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] } : { duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            onClick={handleToggleExpand}
            layout
          >
            {/* 关闭按钮 */}
            <button className="ntf-close" onClick={(e) => { e.stopPropagation(); handleDismiss(); }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>

            {/* 头部 */}
            <div className="ntf-header">
              <span className="ntf-sender">{message.SenderName}</span>
              {message.SenderRole && <span className="ntf-role">{message.SenderRole}</span>}
              <span className="ntf-time">{formatDateTime(message.Send_time)}</span>
            </div>

            {/* 标签行 */}
            <div className="ntf-tags">
              <span className={`ntf-tag ntf-tag-priority ${isImportant ? 'important' : 'normal'}`}>
                {message.Msg_priority || '普通'}
              </span>
              {message.Msg_category && (
                <span className="ntf-tag ntf-tag-category">{message.Msg_category}</span>
              )}
            </div>

            {/* 内容 */}
            <div className={`ntf-body ${expanded ? 'ntf-body-scroll' : ''}`}>
              {displayContent}
            </div>

            {/* 被踢/过期通知的操作按钮 */}
            {(isKick || isExpired) && (
              <div className="ntf-actions">
                <button
                  className="ntf-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction && onAction('login');
                  }}
                >
                  重新登录
                </button>
              </div>
            )}

            {/* 进度条 */}
            {!expanded && (
              <div
                className={`ntf-progress ${isImportant ? 'ntf-progress-important' : 'ntf-progress-normal'}`}
                style={{ animationDuration: `${duration}ms` }}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default Notification;
