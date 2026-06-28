import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import './SideMenu.css';

const MotionDiv = motion.div;

const SideMenu = ({ open, onClose, navItems, username }) => {
  const navigate = useNavigate();
  const scrollLockRef = useRef({ locked: false, prevOverflow: '', prevPaddingRight: '' });

  const lockScroll = useCallback(() => {
    if (scrollLockRef.current.locked) return;
    const body = document.body;
    scrollLockRef.current.prevOverflow = body.style.overflow;
    scrollLockRef.current.prevPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    scrollLockRef.current.locked = true;
  }, []);

  const unlockScroll = useCallback(() => {
    if (!scrollLockRef.current.locked) return;
    const body = document.body;
    body.style.overflow = scrollLockRef.current.prevOverflow;
    body.style.paddingRight = scrollLockRef.current.prevPaddingRight;
    scrollLockRef.current.locked = false;
  }, []);

  useEffect(() => {
    if (open) lockScroll();
    // 关闭时解锁
    return () => {
      unlockScroll();
    };
  }, [open, lockScroll, unlockScroll]);

  /* ---------- 导航项点击处理 ---------- */
  // 目标页面通过 MorePageLayout 挂载时会自行调用 updateBreadcrumb，
  // 若 SideMenu 也更新面包屑，会导致 ID 不匹配产生重复条目
  const handleItemClick = useCallback(
    (item) => {
      if (!item.url) return;
      navigate(item.url);
      onClose();
    },
    [navigate, onClose]
  );

  /* ---------- 后台管理按钮处理 ---------- */
  const handleDbadminAccess = useCallback(async () => {
    // 检查当前路径是否已是 DBAdmin 页面
    if (window.location.pathname === '/dbadmin') {
      const dbUser = sessionStorage.getItem('dbadminUser');
      if (dbUser) {
        alert('您已经在后台管理界面了！');
        onClose();
        return;
      }
    }
    const sid = sessionStorage.getItem('sid');
    if (!sid) { alert('请先登录教务系统'); return; }
    try {
      const res = await fetch('/api/dbadmin/grants/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid }),
      });
      const json = await res.json();
      if (json.success && json.data?.authorizedUsers?.length > 0) {
        navigate('/dbadmin', { state: { authorizedUsers: json.data.authorizedUsers } });
        onClose();
      } else {
        alert('您无权访问');
      }
    } catch {
      alert('您无权访问');
    }
  }, [navigate, onClose]);

  /* ---------- 渲染导航项列表 ---------- */
  const renderNavItems = (items) =>
    items.map((item) => (
      <button
        key={item.id}
        className={`sidemenu-item${!item.url ? ' disabled' : ''}`}
        onClick={() => handleItemClick(item)}
        disabled={!item.url}
        type="button"
      >
        <img className="sidemenu-item-icon" src={item.icon} alt={item.label} draggable={false} />
        <span className="sidemenu-item-label">{item.label}</span>
        {item.url && <span className="sidemenu-item-arrow">›</span>}
      </button>
    ));

  /* ---------- 数据提取 ---------- */
  const { queryItems = [], businessItems = [] } = navItems || {};
  // 只渲染有 url 的可导航项（无 url 的项暂不可点击）
  const clickableBusinessItems = businessItems.filter((i) => i.url);
  const clickableQueryItems = queryItems.filter((i) => i.url);

  return (
    <AnimatePresence onExitComplete={unlockScroll}>
      {open && (
        <div className="sidemenu-root">
      {/* 遮罩层 */}
          <MotionDiv
            className="sidemenu-mask"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            onClick={onClose}
          />

          {/* 面板层 */}
          <MotionDiv
            className="sidemenu-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {/* 面板头部 */}
            <div className="sidemenu-header">
              <div className="sidemenu-header-top">
                <span className="sidemenu-header-icon">☰</span>
                <span className="sidemenu-header-title">导航菜单</span>
              </div>
              {username && (
                <div className="sidemenu-user">
                  <span className="sidemenu-user-name">{username}</span>
                  <span className="sidemenu-user-role">
                    {navItems?.systemRole || ''}
                  </span>
                </div>
              )}
            </div>

            {/* 导航列表 */}
            <nav className="sidemenu-nav">
              {/* 业务功能区域 */}
              {clickableBusinessItems.length > 0 && (
                <div className="sidemenu-section">
                  <div className="sidemenu-section-title">业务</div>
                  <div className="sidemenu-section-items">
                    {renderNavItems(clickableBusinessItems)}
                  </div>
                </div>
              )}

              {clickableQueryItems.length > 0 && (
                <div className="sidemenu-section">
                  <div className="sidemenu-section-title">查询</div>
                  <div className="sidemenu-section-items">
                    {renderNavItems(clickableQueryItems)}
                  </div>
                </div>
              )}

              {/* 空状态 */}
              {clickableBusinessItems.length === 0 &&
                clickableQueryItems.length === 0 && (
                  <div className="sidemenu-empty">暂无可用功能</div>
                )}
            </nav>

            {/* 底部固定栏：后台管理按钮 */}
            <div className="sidemenu-footer">
              <button className="sidemenu-footer-btn" onClick={handleDbadminAccess} type="button">
                <img src="/images/dashboard/db.svg" alt="" className="sidemenu-item-icon" draggable={false} />
                <span className="sidemenu-item-label">后台管理</span>
                <span className="sidemenu-item-arrow">›</span>
              </button>
            </div>
          </MotionDiv>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SideMenu;
