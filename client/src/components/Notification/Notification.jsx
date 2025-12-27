import React, { useState, useEffect } from 'react';
import './Notification.css';

const Notification = ({ message, onDismiss }) => {
  // message: { Msg_no, Msg_content, Msg_category, Msg_priority, SenderName, ... }
  
  const [stage, setStage] = useState('hidden'); // hidden -> sliding-in -> visible -> expanding -> expanded -> closing
  const [contentVisible, setContentVisible] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  };
  
  // Parse Priority and Category for styles
  const isImportant = message.Msg_priority === '重要';
  const duration = isImportant ? 6000 : 3000;
  
  const categoryClass = {
    '通知': 'text-category-notice',
    '待办': 'text-category-todo', // Use '待办' as per prompt, map DB '代办' if needed
    '代办': 'text-category-todo', // Mapping DB typo just in case
    '系统': 'text-category-system',
    '撤回': 'text-category-recall'
  }[message.Msg_category] || 'text-category-system';

  const priorityClass = isImportant ? 'priority-important' : 'priority-normal';

  // Truncated content
  const truncatedContent = message.Msg_content.length > 30 
    ? message.Msg_content.substring(0, 30) + '...' 
    : message.Msg_content;

  const handleClose = () => {
    // Slide out to RIGHT
    setStage('closing');
    setTimeout(() => {
      onDismiss();
    }, 300); // 0.3s animation
  };

  const handleExpandedClose = () => {
    // Fade out everything
    setStage('closing-expanded'); // Custom stage for fade out
    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  // Effects for lifecycle
  useEffect(() => {
    // 1. Slide in
    const t1 = setTimeout(() => {
      setStage('visible');
    }, 100); // Small delay to allow render then animate

    return () => clearTimeout(t1);
  }, []);

  // Countdown Logic
  useEffect(() => {
    if (stage === 'visible' && !isExpanded) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, isExpanded, duration]);

  const handleClick = (e) => {
    // If clicking close button, don't expand
    if (e.target.closest('.close-btn')) return;
    
    if (isExpanded) return;

    // Expand Sequence
    // 1. Content fades out (0.2s)
    setContentVisible(false);
    
    setTimeout(() => {
      // 2. Box moves to center and expands (now 0.5s in CSS) + Overlay fades in
      setIsExpanded(true);
      setStage('expanded');
      
      // 3. Content fades back in (AFTER expansion finishes, i.e., 0.5s later)
      setTimeout(() => {
        setContentVisible(true);
      }, 500);
    }, 200);
  };

  // Render logic based on stage
  let boxClass = 'notification-box ' + priorityClass;
  boxClass += ` ${categoryClass}`;
  if (!contentVisible) boxClass += ' notification-content-fading';
  if (stage === 'hidden') {
    // Initial state, off-screen right
  } else if (stage === 'visible' || stage === 'sliding-in') {
    boxClass += ' slide-in';
  } else if (stage === 'closing') {
    boxClass += ' slide-out'; // Slide left
  } else if (stage === 'expanded') {
    boxClass += ' expanded';
  } else if (stage === 'closing-expanded') {
    boxClass += ' expanded'; // Keep shape but opacity will be handled
  }

  // Overlay logic
  const showOverlay = stage === 'expanded' || stage === 'closing-expanded';
  const overlayClass = `notification-overlay ${showOverlay && stage !== 'closing-expanded' ? 'visible' : ''}`;

  // Content Logic
  const displayContent = isExpanded ? message.Msg_content : truncatedContent;
  const sendTimeText = formatDateTime(
    message.Send_time ??
      message.SendTime ??
      message.sendTime ??
      message.Msg_Send?.Send_time ??
      message.Msg_date
  );
  
  // Inline styles for closing expanded (fade out)
  const boxStyle = stage === 'closing-expanded' ? { opacity: 0 } : {};

  return (
    <>
      <div className={overlayClass}></div>
      
      <div 
        className={boxClass} 
        style={boxStyle}
        onClick={handleClick}
      >
        <button 
          className="close-btn" 
          onClick={(e) => {
            e.stopPropagation();
            if (isExpanded) handleExpandedClose();
            else handleClose();
          }}
        >
          X
        </button>
        
        <div className={`notification-header${isExpanded ? ' notification-header--expanded' : ''}`}>
          {isExpanded ? (
            <>
              <h2 className="expanded-title">
                <span className="expanded-sender">{message.SenderName}</span>
                <span className="notification-meta notification-role">({message.SenderRole || ''})</span>
                <span className="notification-meta notification-priority">{message.Msg_priority || ''}</span>
                <span className="notification-meta notification-time">{sendTimeText}</span>
              </h2>
            </>
          ) : (
            <>
              {message.SenderName} <span style={{ fontSize: '0.8em', opacity: 0.8 }}>({message.SenderRole})</span>
            </>
          )}
        </div>
        
        <div className="notification-body">
          {displayContent}
          {isExpanded && message.Msg_category === '撤回' && message.RecalledContent && (
            <div className="recalled-section">
              <div className="recalled-label">以下是被撤回的消息内容：</div>
              <div>{message.RecalledContent}</div>
            </div>
          )}
        </div>
        
        {!isExpanded && stage === 'visible' && (
          <div 
            className={`countdown-line ${priorityClass} countdown-active`}
            style={{ animationDuration: `${duration}ms` }}
          ></div>
        )}
      </div>
    </>
  );
};

export default Notification;
