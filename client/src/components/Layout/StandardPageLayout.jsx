import React, { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '../Navbar/Navbar';
import Breadcrumb from '../Breadcrumb/Breadcrumb';
import Notification from '../Notification/Notification';
import { motion } from 'framer-motion';
import { useBreadcrumb } from '../Breadcrumb/BreadcrumbContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUserFromStorage, clearCurrentUserFromStorage } from '../../utils/userSession';
import { apiLogout } from '../../utils/api';
import SideMenu from '../SideMenu/SideMenu';
import { getNavItemsByUrole } from '../../config/navigation';
import './StandardPageLayout.css';

const MotionDiv = motion.div;

/**
 * StandardPageLayout — 标准页面布局
 *
 * 布局结构（从上到下）:
 * 1. 导航栏 (Navbar): 64px
 * 2. 路径栏 (Breadcrumb): 48px
 * 3. 主体栏 (Content Body): 占据剩余垂直空间
 */
const StandardPageLayout = ({
  systemRole,
  onLogout,
  path: propPath,
  onNavigate,
  children,
  disableContentAnimation = false
}) => {
  const { path: contextPath } = useBreadcrumb();
  const navigate = useNavigate();

  // 优先使用 propPath（向后兼容），否则使用 contextPath
  const path = propPath || contextPath;

  const resolvedSystemRole = systemRole || (getCurrentUserFromStorage()?.Urole || '通用');

  // 使用 URL 路径作为动画的 key。URL 是导航的第一驱动力，
  // 组件挂载时立即可用，避免面包屑上下文更新时序影响
  const location = useLocation();
  const pageKey = location.pathname + location.search;

  // 侧边菜单状态
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = useCallback(() => setMenuOpen((prev) => !prev), []);

  const currentUser = getCurrentUserFromStorage();
  const uRole = currentUser?.Urole || '';
  const navItems = getNavItemsByUrole(uRole);
  const currentUsername = currentUser?.Uname || currentUser?.name || '';

  // 页面导航时自动关闭侧边菜单
  useEffect(() => {
    setMenuOpen(false);
  }, [pageKey]);

  const handleDefaultNavigate = (item) => {
    if (onNavigate) {
      onNavigate(item);
    } else if (item.url) {
      navigate(item.url);
    }
  };

  // --- 消息通知逻辑 ---
  const [activeNotification, setActiveNotification] = useState(null);
  const [kickOverlay, setKickOverlay] = useState(false); // 被踢蒙版
  const notificationQueue = useRef([]);
  const isProcessingQueue = useRef(false);
  const processedMsgIds = useRef(new Set());
  const kickRedirectTimer = useRef(null);

  // 被踢后跳转登录页
  const redirectToLogin = useCallback(() => {
    setKickOverlay(false);
    clearCurrentUserFromStorage();
    navigate('/login');
  }, [navigate]);

  // 清除被踢定时器
  const clearKickTimer = useCallback(() => {
    if (kickRedirectTimer.current) {
      clearTimeout(kickRedirectTimer.current);
      kickRedirectTimer.current = null;
    }
  }, []);

  // 轮询新消息逻辑
  useEffect(() => {
    const user = getCurrentUserFromStorage();
    if (!user || !user.Uno) return;

    // 轮询间隔 2 秒
    const POLL_INTERVAL = 2000;
    let pollingStopped = false;

    const fetchNewMessages = async () => {
      if (pollingStopped) return;
      try {
        const response = await fetch('/api/academy/messages/new');
        const data = await response.json();

        if (response.status === 401) {
          pollingStopped = true;
          clearInterval(intervalId);

          if (data.code === 'ACCOUNT_KICKED') {
            // 被踢下线：显示通知，20秒后自动跳转
            notificationQueue.current.push({
              Msg_no: 'kick_notification_' + Date.now(),
              Msg_content: '您的账号已在另一处登录，当前会话已断开。请重新登录。',
              Msg_category: '系统',
              Msg_priority: '重要',
              _isKickNotification: true,
            });
            if (!activeNotification && !isProcessingQueue.current) {
              processNextMessage();
            }
          } else {
            // 会话过期
            notificationQueue.current.push({
              Msg_no: 'session_expired_' + Date.now(),
              Msg_content: '会话已过期，请重新登录。',
              Msg_category: '系统',
              Msg_priority: '重要',
              _isSessionExpired: true,
            });
            if (!activeNotification && !isProcessingQueue.current) {
              processNextMessage();
            }
          }
          return;
        }

        if (data.success && data.messages && data.messages.length > 0) {
          // 将新消息分发到队列
          data.messages.forEach(msg => {
            // 前端去重检查
            if (processedMsgIds.current.has(msg.Msg_no)) {
              return; // 已处理过，跳过
            }
            processedMsgIds.current.add(msg.Msg_no);

            window.dispatchEvent(new CustomEvent('app-message', { detail: msg }));

            // 标记已读
            fetch('/api/academy/messages/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ msg_no: msg.Msg_no })
            }).catch(err => console.error('Failed to mark read:', err));
          });
        }
      } catch (error) {
        console.error('Message polling error:', error);
      }
    };

    // 立即执行一次
    fetchNewMessages();

    // 设置定时器
    const intervalId = setInterval(fetchNewMessages, POLL_INTERVAL);

    return () => {
      pollingStopped = true;
      clearInterval(intervalId);
    };
  }, []);

  // 处理队列中的下一条消息
  const processNextMessage = () => {
    if (notificationQueue.current.length === 0) {
      isProcessingQueue.current = false;
      return;
    }

    isProcessingQueue.current = true;
    const nextMsg = notificationQueue.current.shift(); // 取出队首

    // 如果是被踢通知，设置3秒自动跳转并显示蒙版
    if (nextMsg._isKickNotification) {
      clearKickTimer();
      setKickOverlay(true);
      kickRedirectTimer.current = setTimeout(() => {
        redirectToLogin();
      }, 3000);
    }

    setActiveNotification(nextMsg);
  };

  // 处理接收到的新消息
  const handleNewMessage = useCallback((event) => {
    const message = event.detail;
    notificationQueue.current.push(message); // 入队

    // 如果当前没有正在显示的消息，且没有正在处理队列，则立即开始处理
    if (!activeNotification && !isProcessingQueue.current) {
      processNextMessage();
    }
  }, [activeNotification]);

  useEffect(() => {
    // 监听自定义事件 'app-message'
    window.addEventListener('app-message', handleNewMessage);
    return () => {
      window.removeEventListener('app-message', handleNewMessage);
    };
  }, [handleNewMessage]); // 依赖 handleNewMessage

  const handleDismissNotification = () => {
    // 如果是被踢通知且用户点击关闭，取消自动跳转并关闭蒙版
    if (activeNotification?._isKickNotification) {
      clearKickTimer();
      setKickOverlay(false);
    }
    setActiveNotification(null);
    // 等待当前 Notification 的关闭动画（约 300ms）完成后，再显示下一条
    // 这里设置稍微长一点，确保视觉上的间隔
    setTimeout(() => {
      processNextMessage();
    }, 400);
  };

  // 全局 Enter 键监听，用于输入框导航
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // 只有按下 Enter 且当前聚焦的是 input 元素时才处理
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        const inputs = Array.from(document.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])'));
        const index = inputs.indexOf(e.target);

        // 如果找到了当前元素且不是最后一个，则尝试聚焦下一个
        if (index > -1 && index < inputs.length - 1) {
          e.preventDefault(); // 阻止默认提交行为（如果有）
          const nextInput = inputs[index + 1];
          nextInput.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  const handleLogoutWrapper = async () => {
    clearKickTimer();
    // 调用后端 /api/academy/logout 通过 X-Session-Id 头撤销当前标签页的会话，
    // 不依赖共享 cookie，因此不会影响其他标签页。
    try {
      await apiLogout();
    } catch {
      // 即使 API 调用失败也清理本地状态
    }
    // 清理当前标签页的用户信息（sessionStorage 隔离）
    clearCurrentUserFromStorage();
    if (onLogout) onLogout();
    navigate('/login');
  };

  return (
    <div className="standard-page-root">
      {/* 导航栏 */}
      <div className="nav-container">
        <Navbar title={`教学管理系统 - ${resolvedSystemRole}端`} onLogout={handleLogoutWrapper} onToggleMenu={toggleMenu} />
      </div>

      {/* 路径栏 */}
      <div className="path-container">
        <Breadcrumb path={path} onNavigate={handleDefaultNavigate} />
      </div>

      {/* 主体栏 */}
      <div className="page-content-bar">
          {disableContentAnimation ? (
            <div key={pageKey} className="content-motion-wrapper">
              {children}
            </div>
          ) : (
            <MotionDiv
              key={pageKey}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
              className="content-motion-wrapper"
            >
              {children}
            </MotionDiv>
          )}
      </div>

      {activeNotification && (
        <Notification
          key={activeNotification.Msg_no} // 确保每次新消息都重新挂载组件以重置状态
          message={activeNotification}
          onDismiss={handleDismissNotification}
          onAction={redirectToLogin}
        />
      )}

      {/* 侧边导航菜单 */}
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navItems={navItems}
        username={currentUsername}
      />

      {/* 被踢蒙版：覆盖全屏，禁止所有操作 */}
      {kickOverlay && (
        <div className="kick-overlay">
          <div className="kick-overlay-content">
            <div className="kick-overlay-icon">!</div>
            <div className="kick-overlay-text">账号已在异地登录，当前界面操作无效</div>
            <div className="kick-overlay-sub">正在跳转至登录页面...</div>
          </div>
        </div>
      )}
    </div>
  );
};

// 注册 Table 组件，方便通过 StandardPageLayout.Table 访问
// StandardPageLayout.Table = Table;

export default StandardPageLayout;
