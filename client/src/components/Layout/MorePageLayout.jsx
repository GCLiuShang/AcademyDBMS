import React, { useEffect } from 'react';
import StandardPageLayout from './StandardPageLayout';
import { motion } from 'framer-motion';
import { useBreadcrumb } from '../Breadcrumb/BreadcrumbContext';
import { useLocation } from 'react-router-dom';
import './MorePageLayout.css';

const MotionDiv = motion.div;

/**
 * MorePageLayout — 更多详情页布局
 *
 * 继承自 StandardPageLayout，自动在 BreadcrumbContext 中追加当前页面标题。
 * 重定义主体栏头部（标题、装饰线）和进入动画。
 */
const MorePageLayout = ({
  title,
  // parentPath prop removed, handled by Context
  systemRole,
  onLogout,
  onNavigate,
  children
}) => {
  const { updateBreadcrumb } = useBreadcrumb();
  const location = useLocation();

  // 页面挂载时，将自己加入路径（包含 URL）
  // 面包屑更新是纯视觉辅助，不应阻塞页面内容渲染
  useEffect(() => {
    updateBreadcrumb({ id: title, name: title, url: location.pathname });
  }, [title, updateBreadcrumb, location.pathname]);

  return (
    <StandardPageLayout
      systemRole={systemRole}
      onLogout={onLogout}
      onNavigate={onNavigate}
      disableContentAnimation={true} // 禁用默认动画，由内部控制
    >
      <div className="more-page-container">
        <>
          {/* 标题栏 */}
          <MotionDiv
            className="more-page-header"
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0 0 0)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            <span className="header-title">{title}</span>
            <div className="header-line-container">
              <div className="header-line"></div>
              <img src="/images/dashboard/line-arrow.svg" alt="Arrow" className="header-arrow" />
            </div>
          </MotionDiv>

          {/* 内容区域 */}
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
      </div>
    </StandardPageLayout>
  );
};

export default MorePageLayout;
