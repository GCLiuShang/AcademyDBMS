import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import { dbadminExecute, dbadminLogout } from '../../services/dbadminApi';
import DBAdminLoginForm from './DBAdminLoginForm';
import './DBAdmin.css';

const SQL_KEYWORDS = [
  'SELECT','FROM','WHERE','INSERT','INTO','VALUES',
  'UPDATE','SET','DELETE','CREATE','TABLE','DROP',
  'ALTER','ADD','COLUMN','INDEX','VIEW','AS',
  'JOIN','INNER','LEFT','RIGHT','ON','AND','OR','NOT',
  'IN','LIKE','BETWEEN','IS','NULL',
  'ORDER','BY','GROUP','HAVING',
  'LIMIT','OFFSET','DISTINCT',
  'COUNT','SUM','AVG','MAX','MIN',
  'SHOW','DATABASES','TABLES','DESC','DESCRIBE',
  'USE','GRANT','REVOKE','UNION','ALL',
  'EXISTS','CASE','WHEN','THEN','ELSE','END',
  'ASC','DESC','PRIMARY','KEY','FOREIGN','REFERENCES',
];

// 布局常量（单位 px）
const TOOLBAR_H = 40;
const LINE_H = 22;
const GAP = 16;
const CONTAINER_PAD = 16;

const DBAdmin = () => {
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(false);
  const [dbadminUser, setDbadminUser] = useState('');
  const [showLogin, setShowLogin] = useState(true);
  const [sqlInput, setSqlInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [kicked, setKicked] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const [editorHeight, setEditorHeight] = useState(200);
  const [lastActive, setLastActive] = useState(null);
  const [editorBodyHidden, setEditorBodyHidden] = useState(false);
  const [resultBodyHidden, setResultBodyHidden] = useState(false);

  // 实际标题栏高度（动态获取）
  const [editorHeaderH, setEditorHeaderH] = useState(36);
  const [resultHeaderH, setResultHeaderH] = useState(36);

  // 动画开关：手动折叠/展开时临时禁用过渡
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const animationEnabledRef = useRef(animationEnabled);
  animationEnabledRef.current = animationEnabled;

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const containerRef = useRef(null);
  const resultBodyRef = useRef(null);
  const editorHeaderRef = useRef(null);
  const resultHeaderRef = useRef(null);

  // 同步状态到 ref，供 adjustLayout 等回调使用
  const editorCollapsedRef = useRef(editorCollapsed);
  editorCollapsedRef.current = editorCollapsed;
  const resultCollapsedRef = useRef(resultCollapsed);
  resultCollapsedRef.current = resultCollapsed;
  const editorHeightRef = useRef(editorHeight);
  editorHeightRef.current = editorHeight;
  const lastActiveRef = useRef(lastActive);
  lastActiveRef.current = lastActive;
  const editorHeaderHRef = useRef(editorHeaderH);
  editorHeaderHRef.current = editorHeaderH;
  const resultHeaderHRef = useRef(resultHeaderH);
  resultHeaderHRef.current = resultHeaderH;

  // 动态最小高度（基于实际标题高度 + 2行内容）
  const editorMinH = editorHeaderH + TOOLBAR_H + 2 * LINE_H;
  const resultMinH = resultHeaderH + 2 * LINE_H;
  const editorMinHRef = useRef(editorMinH);
  editorMinHRef.current = editorMinH;
  const resultMinHRef = useRef(resultMinH);
  resultMinHRef.current = resultMinH;

  // 从 sessionStorage 恢复登录态
  useEffect(() => {
    const user = sessionStorage.getItem('dbadminUser');
    if (user) {
      setLoggedIn(true);
      setDbadminUser(user);
      setShowLogin(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('dbadminHistory') || '[]');
      setHistory(saved);
    } catch { /* ignore */ }
  }, []);

  // 首次渲染后获取实际标题高度
  useEffect(() => {
    const timer = setTimeout(() => {
      if (editorHeaderRef.current) {
        const h = editorHeaderRef.current.offsetHeight;
        if (h > 0) setEditorHeaderH(h);
      }
      if (resultHeaderRef.current) {
        const h = resultHeaderRef.current.offsetHeight;
        if (h > 0) setResultHeaderH(h);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [loggedIn, showLogin]);

  const saveHistory = useCallback((newHistory) => {
    setHistory(newHistory);
    sessionStorage.setItem('dbadminHistory', JSON.stringify(newHistory.slice(-100)));
  }, []);

  // 被踢检测
  useEffect(() => {
    if (!loggedIn) return;
    const interval = setInterval(async () => {
      try {
        const token = sessionStorage.getItem('dbadminToken') || '';
        const res = await fetch('/api/dbadmin/status', {
          headers: { 'X-DBAdmin-User': dbadminUser, 'X-DBAdmin-Token': token },
        });
        const data = await res.json();
        if (data.data?.tokenValid === false) handleKickDetected();
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [loggedIn, dbadminUser]);

  const handleKickDetected = async () => {
    setKicked(true);
    sessionStorage.removeItem('dbadminUser');
    sessionStorage.removeItem('dbadminToken');
    sessionStorage.removeItem('dbadminHistory');
    setTimeout(() => {
      setKicked(false);
      setLoggedIn(false);
      setShowLogin(true);
      navigate(-1);
    }, 2000);
  };

  // 计算可用总高度（两个面板高度之和，不含 gap）
  const computeTotalAvailable = useCallback(() => {
    const container = containerRef.current;
    if (!container) return 0;
    const connBar = container.querySelector('.dbadmin-connection-bar');
    const connH = connBar ? connBar.offsetHeight : 0;
    const totalContentHeight = container.clientHeight - connH - CONTAINER_PAD * 2;
    return totalContentHeight - GAP;
  }, []);

  // 核心调整函数：按需扩展 + 自动折叠（保留过渡）
  const adjustLayout = useCallback((source) => {
    const ta = textareaRef.current;
    const rb = resultBodyRef.current;
    if (!ta || !rb) return;

    const totalAvailable = computeTotalAvailable();
    if (totalAvailable <= 0) return;

    const eCollapsed = editorCollapsedRef.current;
    const rCollapsed = resultCollapsedRef.current;
    const currentEditorH = editorHeightRef.current;
    const eHeaderH = editorHeaderHRef.current;
    const rHeaderH = resultHeaderHRef.current;
    const eMin = editorMinHRef.current;
    const rMin = resultMinHRef.current;

    if (source === 'editor') {
      if (eCollapsed) return;
      const editorContentH = currentEditorH - eHeaderH - TOOLBAR_H;
      if (ta.scrollHeight <= editorContentH) return;

      const desired = eHeaderH + TOOLBAR_H + ta.scrollHeight + 10;
      if (!rCollapsed) {
        const maxH = totalAvailable - rMin;
        if (desired <= maxH) {
          setEditorHeight(desired);
          setLastActive('editor');
        } else {
          // 自动折叠结果区，释放最大空间（保留动画）
          setResultBodyHidden(true);
          setResultCollapsed(true);
          setEditorHeight(totalAvailable - rHeaderH);
          setLastActive('editor');
        }
      }
    } else { // source === 'result'
      if (rCollapsed) return;
      const resultH = totalAvailable - currentEditorH;
      const resultContentH = resultH - rHeaderH;
      if (rb.scrollHeight <= resultContentH) return;

      const desired = rHeaderH + rb.scrollHeight + 18;
      if (!eCollapsed) {
        const newEditorH = totalAvailable - desired;
        if (newEditorH >= eMin) {
          setEditorHeight(newEditorH);
          setLastActive('result');
        } else {
          // 自动折叠编辑器（保留动画）
          setEditorBodyHidden(true);
          setEditorCollapsed(true);
          setEditorHeight(eHeaderH);
          setLastActive('result');
        }
      }
    }
  }, [computeTotalAvailable]);

  // 初始各占一半高度（仅登录后执行一次）
  useEffect(() => {
    if (!loggedIn || showLogin) return;
    const timer = setTimeout(() => {
      const totalAvailable = computeTotalAvailable();
      if (totalAvailable <= 0) return;
      const eMin = editorHeaderHRef.current + TOOLBAR_H + 2 * LINE_H;
      const rMin = resultHeaderHRef.current + 2 * LINE_H;
      let half = Math.floor(totalAvailable / 2);
      if (half < eMin) half = eMin;
      if (totalAvailable - half < rMin) half = totalAvailable - rMin;
      setEditorHeight(half);
    }, 0);
    return () => clearTimeout(timer);
  }, [loggedIn, showLogin, computeTotalAvailable, editorHeaderH, resultHeaderH]);

  // 编辑器内容溢出检测
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta || editorCollapsedRef.current) return;
    const eHeaderH = editorHeaderHRef.current;
    const editorContentH = editorHeightRef.current - eHeaderH - TOOLBAR_H;
    if (ta.scrollHeight > editorContentH) {
      adjustLayout('editor');
    }
  }, [sqlInput, adjustLayout]);

  // 结果区内容溢出检测
  useEffect(() => {
    if (result === null || resultCollapsedRef.current) return;
    const timer = setTimeout(() => {
      const rb = resultBodyRef.current;
      if (!rb) return;
      const totalAvailable = computeTotalAvailable();
      const rHeaderH = resultHeaderHRef.current;
      const resultH = totalAvailable - editorHeightRef.current;
      const resultContentH = resultH - rHeaderH;
      if (rb.scrollHeight > resultContentH) {
        adjustLayout('result');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [result, adjustLayout, computeTotalAvailable]);

  // 容器尺寸变化时检测溢出并调整
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const checkOverflow = () => {
      const ta = textareaRef.current;
      const rb = resultBodyRef.current;
      const eCollapsed = editorCollapsedRef.current;
      const rCollapsed = resultCollapsedRef.current;
      let overflowEditor = false, overflowResult = false;
      const totalAvailable = computeTotalAvailable();
      const eHeaderH = editorHeaderHRef.current;
      const rHeaderH = resultHeaderHRef.current;
      if (!eCollapsed && ta) {
        const editorContentH = editorHeightRef.current - eHeaderH - TOOLBAR_H;
        if (ta.scrollHeight > editorContentH) overflowEditor = true;
      }
      if (!rCollapsed && rb && totalAvailable > 0) {
        const resultH = totalAvailable - editorHeightRef.current;
        const resultContentH = resultH - rHeaderH;
        if (rb.scrollHeight > resultContentH) overflowResult = true;
      }
      if (overflowEditor || overflowResult) {
        const source = (lastActiveRef.current === 'result' && overflowResult) ? 'result' : 'editor';
        adjustLayout(source);
      }
    };
    const ro = new ResizeObserver(() => {
      checkOverflow();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [adjustLayout, computeTotalAvailable]);

  // 手动折叠/展开编辑器（无动画）
  const toggleEditor = useCallback(() => {
    setAnimationEnabled(false);               // 禁用过渡
    const eCollapsed = editorCollapsedRef.current;
    const eHeaderH = editorHeaderHRef.current;
    if (eCollapsed) {
      // 展开编辑器
      if (resultCollapsedRef.current) {
        setResultCollapsed(false);
        setResultBodyHidden(false);
      }
      setEditorCollapsed(false);
      setEditorBodyHidden(false);
      const totalAvailable = computeTotalAvailable();
      const initH = Math.max(editorMinHRef.current, Math.floor(totalAvailable / 2));
      setEditorHeight(initH);
      setLastActive('editor');
      requestAnimationFrame(() => {
        adjustLayout('editor');
        requestAnimationFrame(() => setAnimationEnabled(true)); // 恢复过渡
      });
    } else {
      // 折叠编辑器
      if (resultCollapsedRef.current) {
        setResultCollapsed(false);
        setResultBodyHidden(false);
      }
      setEditorBodyHidden(true);
      setEditorCollapsed(true);
      setEditorHeight(eHeaderH);
      setLastActive('result');
      requestAnimationFrame(() => setAnimationEnabled(true));   // 恢复过渡
    }
  }, [adjustLayout, computeTotalAvailable]);

  // 手动折叠/展开结果区（无动画）
  const toggleResultFixed = useCallback(() => {
    setAnimationEnabled(false);               // 禁用过渡
    const rCollapsed = resultCollapsedRef.current;
    if (rCollapsed) {
      // 展开结果区
      if (editorCollapsedRef.current) {
        setEditorCollapsed(false);
        setEditorBodyHidden(false);
        setEditorHeight(editorMinHRef.current);
      }
      setResultCollapsed(false);
      setResultBodyHidden(false);
      setLastActive('result');
      requestAnimationFrame(() => {
        adjustLayout('result');
        requestAnimationFrame(() => setAnimationEnabled(true));
      });
    } else {
      // 折叠结果区
      if (editorCollapsedRef.current) {
        setEditorCollapsed(false);
        setEditorBodyHidden(false);
        setEditorHeight(editorMinHRef.current);
      }
      setResultBodyHidden(true);
      setResultCollapsed(true);
      setLastActive('editor');
      requestAnimationFrame(() => setAnimationEnabled(true));
    }
  }, [adjustLayout]);

  // 行号同步
  const handleEditorScroll = useCallback((e) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
  }, []);

  // 执行 SQL
  const handleExecute = useCallback(async () => {
    const sql = sqlInput.trim();
    if (!sql) return;
    setExecuting(true);
    setResult(null);
    try {
      const json = await dbadminExecute(sql);
      if (json.code === 'DBADMIN_KICKED') { await handleKickDetected(); return; }
      setResult(json);
    } catch (err) {
      setResult({ success: false, type: 'error', message: '网络错误：' + (err.message || '无法连接到服务器'), data: null });
    } finally { setExecuting(false); }
    const newHistory = [sql, ...history.filter(h => h !== sql)].slice(0, 100);
    saveHistory(newHistory);
    setHistoryIndex(-1);
  }, [sqlInput, history, saveHistory]);

  const handleClear = useCallback(() => {
    setSqlInput('');
    setResult(null);
    setHistoryIndex(-1);
    textareaRef.current?.focus();
  }, []);

  const handleLogoutOnly = useCallback(async () => {
    await dbadminLogout(dbadminUser).catch(() => {});
    sessionStorage.removeItem('dbadminUser');
    sessionStorage.removeItem('dbadminHistory');
    setLoggedIn(false); setShowLogin(true);
  }, [dbadminUser]);

  const handleLoginSuccess = useCallback(() => {
    const user = sessionStorage.getItem('dbadminUser');
    if (user) { setLoggedIn(true); setDbadminUser(user); setShowLogin(false); }
  }, []);

  const handleNavbarLogout = useCallback(async () => { await handleLogoutOnly(); }, [handleLogoutOnly]);

  const insertKeyword = useCallback((keyword) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const prefix = start > 0 && !/\s/.test(sqlInput[start - 1]) ? ' ' : '';
    const insertion = prefix + keyword + ' ';
    const newValue = sqlInput.slice(0, start) + insertion + sqlInput.slice(end);
    setSqlInput(newValue);
    const cursorPos = start + insertion.length;
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(cursorPos, cursorPos); });
  }, [sqlInput]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart, end = ta.selectionEnd;
      setSqlInput(sqlInput.slice(0, start) + '  ' + sqlInput.slice(end));
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + 2, start + 2); });
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleExecute(); return; }
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); const ni = Math.min(historyIndex + 1, history.length - 1); if (ni >= 0 && ni < history.length) { setHistoryIndex(ni); setSqlInput(history[ni]); } return; }
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); const ni = historyIndex - 1; if (ni >= 0) { setHistoryIndex(ni); setSqlInput(history[ni]); } else { setHistoryIndex(-1); setSqlInput(''); } return; }
  }, [handleExecute, history, historyIndex, sqlInput]);

  const handleInput = useCallback((e) => { setSqlInput(e.target.value); }, []);

  const buildResultContent = () => {
    if (!result) return null;
    if (result.type === 'select' || result.type === 'show') {
      const { columns, rows, rowCount } = result.data || {};
      if (!columns || !rows) return null;
      return (
        <div className="dbadmin-result-table">
          <Table columns={columns.map(c => ({ key: c, title: c, render: (r) => { const v = r[c]; return v === null || v === undefined ? <span className="dbadmin-null">NULL</span> : String(v); } }))} data={rows} total={rowCount} currentPage={1} pageSize={500} loading={false} />
        </div>
      );
    }
    if (result.success) return (<div className="dbadmin-message dbadmin-message-success"><span className="dbadmin-message-icon">✓</span><span>{result.message}</span></div>);
    return (<div className="dbadmin-message dbadmin-message-error"><span className="dbadmin-message-icon">!</span><span>{result.message}</span>{result.security?.blocked && <div className="dbadmin-security-detail">安全拦截详情：{(result.security.findings || []).map(f => f.message).join('；')}</div>}</div>);
  };

  const getSystemRole = () => { const u = getCurrentUserFromStorage(); return u?.Urole || ''; };

  // 编辑器动态样式（根据 animationEnabled 控制过渡）
  const getEditorStyle = () => {
    const baseStyle = {};
    if (editorCollapsed) {
      baseStyle.height = editorHeaderH;
      baseStyle.flex = '0 0 auto';
    } else if (resultCollapsed) {
      baseStyle.flex = '1 1 0%';
      baseStyle.minHeight = 0;
    } else {
      baseStyle.height = editorHeight;
      baseStyle.flex = 'none';
    }
    if (!animationEnabled) {
      baseStyle.transition = 'none';
    }
    return baseStyle;
  };

  // 结果区动态样式
  const getResultStyle = () => {
    const baseStyle = {};
    if (resultCollapsed) {
      baseStyle.height = resultHeaderH;
      baseStyle.flex = '0 0 auto';
    } else {
      baseStyle.flex = '1 1 0%';
      baseStyle.minHeight = 0;
    }
    if (!animationEnabled) {
      baseStyle.transition = 'none';
    }
    return baseStyle;
  };

  return (
    <MorePageLayout title="后台管理" systemRole={getSystemRole()} onLogout={handleNavbarLogout} onNavigate={(item) => navigate(item.url)}>
      {kicked && (
        <div className="dbadmin-kicked-overlay">
          <div className="dbadmin-kicked-content"><div className="dbadmin-kicked-icon">!</div><div className="dbadmin-kicked-text">您的 DBAdmin 会话已在另一处登录，当前连接已断开</div><div className="dbadmin-kicked-sub">正在返回...</div></div>
        </div>
      )}
      {showLogin ? (
        <DBAdminLoginForm onLoginSuccess={handleLoginSuccess} />
      ) : (
        <div className="dbadmin-container" ref={containerRef}>
          {loggedIn && (
            <div className="dbadmin-connection-bar">
              <div className="dbadmin-connection-info"><span className="dbadmin-connection-dot" /><span className="dbadmin-connection-user">已连接：<strong>{dbadminUser}</strong></span></div>
              <button className="dbadmin-logout-btn" onClick={handleLogoutOnly}>退出登录</button>
            </div>
          )}
          {/* 编辑器区域 */}
          <div className={`dbadmin-editor-section ${editorCollapsed ? 'collapsed' : ''}`} style={getEditorStyle()}>
            <div className="dbadmin-editor-header" ref={editorHeaderRef}>
              <button className="dbadmin-collapse-btn" onClick={toggleEditor} title={editorCollapsed ? '展开编辑器' : '折叠编辑器'}>
                <svg className={`collapse-arrow ${!editorCollapsed ? 'expanded' : ''}`} viewBox="0 0 16 16" width="16" height="16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <span className="dbadmin-editor-label">SQL 语句</span>
              <span className="dbadmin-editor-hint">Ctrl + Enter 执行 · Tab 缩进</span>
            </div>
            <div className={`dbadmin-editor-body ${editorBodyHidden ? 'hidden' : ''}`}>
              <div className="dbadmin-editor-wrapper">
                <div className="dbadmin-line-numbers" ref={lineNumbersRef} aria-hidden="true">
                  {sqlInput.split('\n').map((_, i) => (<div key={i} className="dbadmin-line-number">{i + 1}</div>))}
                </div>
                <textarea ref={textareaRef} className="dbadmin-sql-input" value={sqlInput} onChange={handleInput} onKeyDown={handleKeyDown} onScroll={handleEditorScroll} placeholder="输入 SQL 语句并点击执行，或按 Ctrl+Enter" spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" rows={4} />
                <div className={`dbadmin-keywords-sidebar ${showKeywords ? '' : 'collapsed'}`}>
                  {SQL_KEYWORDS.map(kw => (<button key={kw} className="dbadmin-keyword-chip" onClick={() => insertKeyword(kw)} disabled={executing}>{kw}</button>))}
                </div>
              </div>
              <div className="dbadmin-toolbar">
                <button className="dbadmin-btn dbadmin-btn-execute" onClick={handleExecute} disabled={executing || !sqlInput.trim()}>{executing ? '执行中…' : '执  行'}</button>
                <button className="dbadmin-btn dbadmin-btn-clear" onClick={handleClear} disabled={executing}>清 空</button>
                <button className={`dbadmin-btn dbadmin-btn-keywords ${showKeywords ? 'active' : ''}`} onClick={() => setShowKeywords(v => !v)} disabled={executing}>{showKeywords ? '关闭侧栏' : '关键词'}</button>
              </div>
            </div>
          </div>
          {/* 结果区 */}
          <div className={`dbadmin-result-section ${resultCollapsed ? 'collapsed' : ''}`} style={getResultStyle()}>
            <div className="dbadmin-result-header" ref={resultHeaderRef}>
              <button className="dbadmin-collapse-btn" onClick={toggleResultFixed} title={resultCollapsed ? '展开结果' : '折叠结果'}>
                <svg className={`collapse-arrow ${!resultCollapsed ? 'expanded' : ''}`} viewBox="0 0 16 16" width="16" height="16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <span className="dbadmin-result-label">执行结果</span>
              {result?.data?.rowCount !== undefined && <span className="dbadmin-result-count">共 {result.data.rowCount} 行</span>}
            </div>
            <div ref={resultBodyRef} className={`dbadmin-result-body ${resultBodyHidden ? 'hidden' : ''}`}>
              {executing ? (<div className="dbadmin-loading"><div className="dbadmin-loading-spinner" /><span>正在执行…</span></div>)
              : result ? buildResultContent()
              : (<div className="dbadmin-empty"><div className="dbadmin-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" /><path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" /><path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" /></svg></div><span className="dbadmin-empty-text">输入 SQL 语句并点击「执行」开始查询</span></div>)}
            </div>
          </div>
        </div>
      )}
    </MorePageLayout>
  );
};

export default DBAdmin;
