import React, { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '../Navbar/Navbar';
import Breadcrumb from '../Breadcrumb/Breadcrumb';
import Notification from '../Notification/Notification';
import { motion, AnimatePresence } from 'framer-motion';
import { useBreadcrumb } from '../Breadcrumb/BreadcrumbContext';
import { useNavigate } from 'react-router-dom';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './StandardPageLayout.css';

const MotionDiv = motion.div;

/**
 * StandardPageLayout Component
 * 
 * 定义了系统的标准页面布局。
 * 
 * 布局结构 (从上到下):
 * 1. 导航栏 (Navbar): 高度固定 (64px)。
 * 2. 路径栏 (Breadcrumb): 高度固定 (48px)。
 * 3. 主体栏 (Content Body): 占据剩余的所有垂直空间。
 *    高度计算: 页面总高度 (100vh) - 导航栏高度 - 路径栏高度。
 * 
 * 全局功能:
 * - 消息通知 (Notification): 集成了全局消息通知显示逻辑。
 *   - 通过 `window.postMessage` 或自定义事件 (CustomEvent) 接收消息指令。
 *   - 支持显示、倒计时关闭、点击展开等交互。
 * 
 * 动画逻辑:
 * 本布局仅支持两种页面切换动画: "前进" 和 "后退"。
 * 
 * 1. 前进动画 (Forward):
 *    - 触发场景: 点击 "more.svg" 等进入新页面。
 *    - 导航栏: 保持静止。
 *    - 主体栏: 旧内容渐变消失 (0.4s) -> 新内容渐变显示 (0.4s)。
 *    - 路径栏: 新标签从左侧滑入指定位置 (在 Breadcrumb 组件内部实现)。
 * 
 * 2. 后退动画 (Backward):
 *    - 触发场景: 点击路径栏上的非最底层标签。
 *    - 导航栏: 保持静止。
 *    - 主体栏: 旧内容渐变消失 (0.4s) -> 新内容渐变显示 (0.4s)。
 *    - 路径栏: 被点击标签右侧的所有标签依次从右往左渐变消失 (在 Breadcrumb 组件内部实现)。
 * 
 * @param {string} systemRole - 系统角色，用于导航栏标题显示 (例如 "学生" -> "教学管理系统 - 学生端")。
 * @param {function} onLogout - 注销回调函数。
 * @param {Array} path - [Deprecated] 路径数组，建议使用 BreadcrumbContext。如果提供，将覆盖 Context。
 * @param {function} onNavigate - 路径跳转回调函数。
 * @param {React.ReactNode} children - 页面主体内容。
 * @param {boolean} disableContentAnimation - 是否禁用默认的内容动画 (默认 false)。
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
  
  // Prioritize propPath if provided (for backward compatibility), otherwise use contextPath
  const path = propPath || contextPath;

  const resolvedSystemRole = systemRole || (getCurrentUserFromStorage()?.Urole || '通用');

  // Default navigation handler if not provided
  const handleDefaultNavigate = (item) => {
    if (onNavigate) {
      onNavigate(item);
    } else if (item.url) {
      navigate(item.url);
    }
  };

  // 使用当前路径的最后一个节点的 ID 作为动画的 key。
  // 当路径改变时，key 改变，触发 AnimatePresence 的 exit/enter 动画。
  const pageKey = path && path.length > 0 ? path[path.length - 1].id : 'root';

  // --- 消息通知逻辑 ---
  const [activeNotification, setActiveNotification] = useState(null);
  const notificationQueue = useRef([]); // 使用 useRef 维护队列，避免闭包问题
  const isProcessingQueue = useRef(false); // 锁，防止并发处理
  const processedMsgIds = useRef(new Set()); // 去重集合，防止因网络延迟导致的重复处理

  /**
   * 轮询新消息逻辑
   */
  useEffect(() => {
    const user = getCurrentUserFromStorage();
    if (!user || !user.Uno) return;

    // 轮询间隔 (例如 1秒) - 改为2秒以避免竞态条件
    const POLL_INTERVAL = 2000;

    const fetchNewMessages = async () => {
      try {
        // 动态导入 axios，避免顶部 import 可能的问题，或者假设顶部已经 import axios from 'axios'
        // 为了保险，建议在文件顶部添加 import axios from 'axios';
        // 这里暂时使用 fetch
        const response = await fetch(`http://localhost:3001/api/messages/new?uno=${user.Uno}`);
        const data = await response.json();

        if (response.status === 401) {
          console.warn('Session expired or kicked:', data.message);
          const currentUno = sessionStorage.getItem('currentUno');
          if (currentUno) {
            sessionStorage.removeItem('currentUno');
          }
          window.location.href = '/login';
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
            fetch('http://localhost:3001/api/messages/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uno: user.Uno, msg_no: msg.Msg_no })
            }).catch(err => console.error('Failed to mark read:', err));
          });
        }
      } catch (error) {
        // 静默失败，不要打扰用户
        console.error('Message polling error:', error);
        
        // 如果是 401，说明可能被踢下线或会话过期
        // 这里的 fetch 不会自动抛出 401 错误，需要手动检查 response.ok 或 status
        // 但上面的 await response.json() 可能会在网络错误时失败
      }
    };

    // 立即执行一次
    fetchNewMessages();

    // 设置定时器
    const intervalId = setInterval(fetchNewMessages, POLL_INTERVAL);

    return () => clearInterval(intervalId);
  }, []);

  /**
   * 处理队列中的下一条消息
   */
  const processNextMessage = () => {
    if (notificationQueue.current.length === 0) {
      isProcessingQueue.current = false;
      return;
    }

    isProcessingQueue.current = true;
    const nextMsg = notificationQueue.current.shift(); // 取出队首
    setActiveNotification(nextMsg);
  };

  /**
   * 处理接收到的新消息
   * @param {CustomEvent} event - 包含消息详情的自定义事件
   */
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
    const user = getCurrentUserFromStorage();
    if (user && user.Uno) {
      try {
        await fetch('http://localhost:3001/api/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.Uno })
        });
      } catch (err) {
        console.error('Logout failed:', err);
      }
    }
    sessionStorage.removeItem('currentUno');
    if (onLogout) onLogout();
  };

  return (
    <div className="standard-page-root">
      {/* 1. 导航栏容器 */}
      <div className="nav-container">
        {/* 标题格式: "教学管理系统 - ??端" */}
        <Navbar title={`教学管理系统 - ${resolvedSystemRole}端`} onLogout={handleLogoutWrapper} />
      </div>

      {/* 2. 路径栏容器 */}
      <div className="path-container">
        <Breadcrumb path={path} onNavigate={handleDefaultNavigate} />
      </div>

      {/* 3. 主体栏容器 */}
      {/* 
         严格填满剩余空间: flex: 1 (在 CSS 中定义)
         动画: 使用 AnimatePresence mode="wait" 实现 "先消失后显示" 的效果。
      */}
      <div className="page-content-bar">
        <AnimatePresence mode="wait">
          {disableContentAnimation ? (
            <div key={pageKey} className="content-motion-wrapper">
              {children}
            </div>
          ) : (
            <MotionDiv
              key={pageKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="content-motion-wrapper"
            >
              {children}
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>

      {/* 全局消息通知组件 */}
      {/* 只有当 activeNotification 存在时才渲染 */}
      {activeNotification && (
        <Notification 
          key={activeNotification.Msg_no} // 确保每次新消息都重新挂载组件以重置状态
          message={activeNotification} 
          onDismiss={handleDismissNotification} 
        />
      )}
    </div>
  );
};

// 注册 Table 组件，方便通过 StandardPageLayout.Table 访问
// StandardPageLayout.Table = Table;

export default StandardPageLayout;
