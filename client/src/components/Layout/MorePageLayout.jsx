import React, { useEffect } from 'react';
import StandardPageLayout from './StandardPageLayout';
import { motion } from 'framer-motion';
import { useBreadcrumb } from '../Breadcrumb/BreadcrumbContext';
import { useLocation } from 'react-router-dom';
import './MorePageLayout.css';

const MotionDiv = motion.div;

/**
 * MorePageLayout Component
 * 
 * 继承自 StandardPageLayout，用于显示"更多"详情页面。
 * 
 * 特性:
 * 1. 自动在 BreadcrumbContext 中追加当前页面标题。
 * 2. 重定义主体栏头部，包含标题、装饰线和箭头。
 * 3. 重定义进入动画:
 *    - 标题栏: 从左向右擦除显示 (Wipe effect)。
 *    - 内容区域: 渐变显示 (Fade in)。
 * 
 * @param {string} title - 当前页面标题，将显示在 Header 和 Breadcrumb 中。
 * @param {string} systemRole - 系统角色。
 * @param {function} onLogout - 注销回调。
 * @param {function} onNavigate - 导航回调。
 * @param {React.ReactNode} children - 页面内容。
 */
const MorePageLayout = ({ 
  title, 
  // parentPath prop removed, handled by Context
  systemRole, 
  onLogout, 
  onNavigate, 
  children 
}) => {
  const { path, updateBreadcrumb } = useBreadcrumb();
  const location = useLocation();

  // Check if this page is already the active leaf in the breadcrumb
  // This prevents double animation triggering by ensuring we only render the animated content
  // after the breadcrumb state has caught up with the route change.
  const isReady = path.length > 0 && path[path.length - 1].id === title;

  useEffect(() => {
    // 页面挂载时，将自己加入路径 (包含 URL)
    updateBreadcrumb({ id: title, name: title, url: location.pathname });
  }, [title, updateBreadcrumb, location.pathname]);

  return (
    <StandardPageLayout
      systemRole={systemRole}
      onLogout={onLogout}
      // path prop removed, StandardPageLayout will use Context
      onNavigate={onNavigate}
      disableContentAnimation={true} // 禁用默认动画，由内部控制
    >
      <div className="more-page-container">
        {/* Only render animated content when ready to avoid double animation */}
        {isReady && (
          <>
            {/* 1. 标题栏 (Header Bar) */}
            <MotionDiv 
              className="more-page-header"
              initial={{ clipPath: 'inset(0 100% 0 0)' }}
              animate={{ clipPath: 'inset(0 0 0 0)' }}
              exit={{ opacity: 0 }} // 退出时简单淡出即可，或者保持 wipe out: clipPath: 'inset(0 0 0 100%)'
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              <span className="header-title">{title}</span>
              <div className="header-line-container">
                <div className="header-line"></div>
                <img src="/images/dashboard/line-arrow.svg" alt="Arrow" className="header-arrow" />
              </div>
            </MotionDiv>

            {/* 2. 内容区域 (Content Body) */}
            <MotionDiv 
              className="more-page-content-body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              {children}
            </MotionDiv>
          </>
        )}
      </div>
    </StandardPageLayout>
  );
};

export default MorePageLayout;
