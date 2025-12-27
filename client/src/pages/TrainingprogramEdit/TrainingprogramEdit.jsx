import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import Details from '../../components/Details/Details';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './TrainingprogramEdit.css';

const API_BASE = '';

const TrainingprogramEdit = () => {
  const navigate = useNavigate();
  const [userInfo] = useState(() => getCurrentUserFromStorage());
  const [accountInfo, setAccountInfo] = useState(null);
  const [deptName, setDeptName] = useState('');

  const [domDropdownOpen, setDomDropdownOpen] = useState(false);
  const [domQuery, setDomQuery] = useState('');
  const [domOptions, setDomOptions] = useState([]);
  const [selectedDom, setSelectedDom] = useState(null);
  const domDropdownRef = useRef(null);

  const [latestTpNo, setLatestTpNo] = useState('');

  const tpYear = useMemo(() => String(new Date().getFullYear()).padStart(4, '0'), []);

  const tpNo = selectedDom?.Dom_no ? `TP${selectedDom.Dom_no}-${tpYear}` : '';

  const tpName = selectedDom?.Dom_name ? `${deptName || ''}${selectedDom.Dom_name}培养方案（${tpYear}年版）` : '';

  const [selectedData, setSelectedData] = useState([]);
  const [selectedTotal, setSelectedTotal] = useState(0);
  const [selectedPage, setSelectedPage] = useState(1);
  const [selectedPageSize, setSelectedPageSize] = useState(20);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedSearchParams, setSelectedSearchParams] = useState({});
  const [selectedViewName, setSelectedViewName] = useState(null);

  const [availableData, setAvailableData] = useState([]);
  const [availableTotal, setAvailableTotal] = useState(0);
  const [availablePage, setAvailablePage] = useState(1);
  const [availablePageSize, setAvailablePageSize] = useState(20);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableSearchParams, setAvailableSearchParams] = useState({});
  const [availableViewName, setAvailableViewName] = useState(null);

  const viewRef = useRef({ uno: null, selected: null, available: null });

  const [tpStatus, setTpStatus] = useState('');

  const [credits, setCredits] = useState({
    TPcredit_GB: '0',
    TPcredit_ZB: '0',
    TPcredit_ZX: '0',
    TPcredit_TX: '0',
    TPcredit_GX: '0',
  });
  const savedCreditsRef = useRef({
    TPcredit_GB: 0,
    TPcredit_ZB: 0,
    TPcredit_ZX: 0,
    TPcredit_TX: 0,
    TPcredit_GX: 0,
  });

  const canEdit = Boolean(tpNo) && tpStatus === '调整中';
  const isLocked = Boolean(tpNo) && tpStatus === '可使用';

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState(null);

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  useEffect(() => {
    if (!userInfo) navigate('/login');
  }, [navigate, userInfo]);

  useEffect(() => {
    const fetchAccountInfo = async () => {
      if (!userInfo?.Uno) return;
      try {
        const res = await fetch(`${API_BASE}/api/account/info?uno=${userInfo.Uno}`);
        const json = await res.json();
        if (json?.success) setAccountInfo(json.data || null);
        else {
          setAccountInfo(null);
          setDeptName('');
        }
      } catch {
        setAccountInfo(null);
        setDeptName('');
      }
    };
    fetchAccountInfo();
  }, [userInfo?.Uno]);

  useEffect(() => {
    const fetchDeptName = async () => {
      const deptNo = accountInfo?.DAdept;
      if (!deptNo) return;
      try {
        const params = new URLSearchParams({
          tableName: 'Department',
          page: 1,
          limit: 1,
          search_Dept_no: deptNo,
        });
        const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
        const json = await res.json();
        if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
          setDeptName(String(json.data[0]?.Dept_name || ''));
        } else {
          setDeptName('');
        }
      } catch {
        setDeptName('');
      }
    };
    fetchDeptName();
  }, [accountInfo?.DAdept]);

  useEffect(() => {
    const onDocumentClick = (e) => {
      if (domDropdownRef.current && !domDropdownRef.current.contains(e.target)) setDomDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  useEffect(() => {
    if (!domDropdownOpen) return;
    const q = domQuery.trim();
    if (q.length < 3) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const deptNo = accountInfo?.DAdept;
      if (!deptNo) {
        if (!cancelled) setDomOptions([]);
        return;
      }
      try {
        const params = new URLSearchParams({
          tableName: 'Domain',
          page: 1,
          limit: 50,
          orderBy: 'Dom_no',
          orderDir: 'ASC',
          search_Dom_dept: deptNo,
          search_Dom_name: q,
        });
        const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) {
          setDomOptions((json.data || []).filter((r) => r?.Dom_status === '正常'));
        } else {
          setDomOptions([]);
        }
      } catch {
        if (!cancelled) setDomOptions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [domDropdownOpen, domQuery, accountInfo?.DAdept]);

  useEffect(() => {
    const fetchLatestTp = async () => {
      const domNo = selectedDom?.Dom_no;
      if (!domNo) return;
      try {
        const params = new URLSearchParams({
          tableName: 'TrainingProgram',
          page: 1,
          limit: 50,
          orderBy: 'TPyear',
          orderDir: 'DESC',
          search_TPdom: domNo,
        });
        const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
        const json = await res.json();
        if (json?.success && Array.isArray(json.data)) {
          const rows = json.data || [];
          const found = rows.find((r) => String(r?.TPyear || '') !== tpYear && typeof r?.TPno === 'string' && r.TPno);
          setLatestTpNo(found?.TPno || '');
        } else {
          setLatestTpNo('');
        }
      } catch {
        setLatestTpNo('');
      }
    };
    fetchLatestTp();
  }, [selectedDom?.Dom_no, tpYear]);

  useEffect(() => {
    let cancelled = false;

    const cleanupViews = async () => {
      const uno = viewRef.current.uno;
      const selected = viewRef.current.selected;
      const available = viewRef.current.available;
      viewRef.current = { uno: null, selected: null, available: null };

      const jobs = [];
      if (uno && selected) {
        jobs.push(
          fetch(`${API_BASE}/api/trainingprogram/view/cleanup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uno, viewName: selected }),
          }).catch(() => {})
        );
      }
      if (uno && available) {
        jobs.push(
          fetch(`${API_BASE}/api/trainingprogram/view/cleanup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uno, viewName: available }),
          }).catch(() => {})
        );
      }
      if (jobs.length > 0) await Promise.all(jobs);
    };

    const initViews = async () => {
      const uno = userInfo?.Uno;
      if (!uno || !tpNo) {
        await cleanupViews();
        if (!cancelled) {
          setSelectedViewName(null);
          setAvailableViewName(null);
        }
        return;
      }

      await cleanupViews();

      try {
        const selectedRes = await fetch(`${API_BASE}/api/trainingprogram/view/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno, tpno: tpNo, type: 'selected' }),
        });
        const selectedJson = await selectedRes.json();
        const nextSelectedView = selectedJson?.success ? selectedJson.viewName : null;

        const availableRes = await fetch(`${API_BASE}/api/trainingprogram/view/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno, tpno: tpNo, type: 'available' }),
        });
        const availableJson = await availableRes.json();
        const nextAvailableView = availableJson?.success ? availableJson.viewName : null;

        if (cancelled) return;
        viewRef.current = { uno, selected: nextSelectedView, available: nextAvailableView };
        setSelectedViewName(nextSelectedView);
        setAvailableViewName(nextAvailableView);
      } catch {
        if (cancelled) return;
        viewRef.current = { uno: null, selected: null, available: null };
        setSelectedViewName(null);
        setAvailableViewName(null);
      }
    };

    initViews();
    return () => {
      cancelled = true;
      cleanupViews().catch(() => {});
    };
  }, [tpNo, userInfo?.Uno]);

  const fetchSelected = useCallback(async () => {
    if (!selectedViewName) return;
    setSelectedLoading(true);
    try {
      const params = new URLSearchParams({
        tableName: selectedViewName,
        page: selectedPage,
        limit: selectedPageSize,
        orderBy: 'Cname',
        orderDir: 'ASC',
        ...Object.keys(selectedSearchParams).reduce((acc, key) => {
          acc[`search_${key}`] = selectedSearchParams[key];
          return acc;
        }, {}),
      });
      const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
      const json = await res.json();
      if (json?.success) {
        setSelectedData(json.data || []);
        setSelectedTotal(json.pagination?.total || 0);
      } else {
        setSelectedData([]);
        setSelectedTotal(0);
      }
    } catch {
      setSelectedData([]);
      setSelectedTotal(0);
    } finally {
      setSelectedLoading(false);
    }
  }, [selectedPage, selectedPageSize, selectedSearchParams, selectedViewName]);

  const fetchAvailable = useCallback(async () => {
    if (!availableViewName) return;
    setAvailableLoading(true);
    try {
      const params = new URLSearchParams({
        tableName: availableViewName,
        page: availablePage,
        limit: availablePageSize,
        orderBy: 'Cname',
        orderDir: 'ASC',
        ...Object.keys(availableSearchParams).reduce((acc, key) => {
          acc[`search_${key}`] = availableSearchParams[key];
          return acc;
        }, {}),
      });
      const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
      const json = await res.json();
      if (json?.success) {
        setAvailableData(json.data || []);
        setAvailableTotal(json.pagination?.total || 0);
      } else {
        setAvailableData([]);
        setAvailableTotal(0);
      }
    } catch {
      setAvailableData([]);
      setAvailableTotal(0);
    } finally {
      setAvailableLoading(false);
    }
  }, [availablePage, availablePageSize, availableSearchParams, availableViewName]);

  useEffect(() => {
    fetchSelected();
  }, [fetchSelected]);

  useEffect(() => {
    fetchAvailable();
  }, [fetchAvailable]);

  const fetchTpStatus = useCallback(async () => {
    if (!userInfo?.Uno || !tpNo) {
      setTpStatus('');
      return;
    }
    try {
      const params = new URLSearchParams({ uno: userInfo.Uno, tpno: tpNo });
      const res = await fetch(`${API_BASE}/api/trainingprogram/status/get?${params.toString()}`);
      const json = await res.json();
      if (!json?.success) {
        setTpStatus('');
        return;
      }
      setTpStatus(String(json?.data?.TPstatus || ''));
    } catch {
      setTpStatus('');
    }
  }, [tpNo, userInfo?.Uno]);

  useEffect(() => {
    fetchTpStatus();
  }, [fetchTpStatus]);

  const fetchCredits = useCallback(async () => {
    if (!userInfo?.Uno || !tpNo) {
      const zero = {
        TPcredit_GB: '0',
        TPcredit_ZB: '0',
        TPcredit_ZX: '0',
        TPcredit_TX: '0',
        TPcredit_GX: '0',
      };
      setCredits(zero);
      savedCreditsRef.current = {
        TPcredit_GB: 0,
        TPcredit_ZB: 0,
        TPcredit_ZX: 0,
        TPcredit_TX: 0,
        TPcredit_GX: 0,
      };
      return;
    }

    try {
      const params = new URLSearchParams({ uno: userInfo.Uno, tpno: tpNo });
      const res = await fetch(`${API_BASE}/api/trainingprogram/credits/get?${params.toString()}`);
      const json = await res.json();
      if (!json?.success) return;
      const data = json?.data || {};
      const nextSaved = {
        TPcredit_GB: Number.isFinite(Number(data.TPcredit_GB)) ? Number(data.TPcredit_GB) : 0,
        TPcredit_ZB: Number.isFinite(Number(data.TPcredit_ZB)) ? Number(data.TPcredit_ZB) : 0,
        TPcredit_ZX: Number.isFinite(Number(data.TPcredit_ZX)) ? Number(data.TPcredit_ZX) : 0,
        TPcredit_TX: Number.isFinite(Number(data.TPcredit_TX)) ? Number(data.TPcredit_TX) : 0,
        TPcredit_GX: Number.isFinite(Number(data.TPcredit_GX)) ? Number(data.TPcredit_GX) : 0,
      };
      savedCreditsRef.current = nextSaved;
      setCredits({
        TPcredit_GB: String(nextSaved.TPcredit_GB),
        TPcredit_ZB: String(nextSaved.TPcredit_ZB),
        TPcredit_ZX: String(nextSaved.TPcredit_ZX),
        TPcredit_TX: String(nextSaved.TPcredit_TX),
        TPcredit_GX: String(nextSaved.TPcredit_GX),
      });
    } catch {
      // ignore
    }
  }, [tpNo, userInfo?.Uno]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const handleCreditChange = useCallback((key, rawValue) => {
    const next = String(rawValue ?? '');
    if (next === '' || /^[0-9]+$/.test(next)) {
      setCredits((prev) => ({ ...prev, [key]: next }));
    }
  }, []);

  const handleCreditBlur = useCallback(
    async (key) => {
      if (!userInfo?.Uno || !tpNo) return;
      const raw = String(credits[key] ?? '');
      const normalized = raw === '' ? '0' : raw;
      const n = Number.parseInt(normalized, 10);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 255) {
        alert('请输入 0-255 的整数');
        const rollback = savedCreditsRef.current[key] ?? 0;
        setCredits((prev) => ({ ...prev, [key]: String(rollback) }));
        return;
      }

      const saved = savedCreditsRef.current[key] ?? 0;
      if (n === saved) {
        if (raw !== String(n)) setCredits((prev) => ({ ...prev, [key]: String(n) }));
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/trainingprogram/credits/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno: userInfo.Uno, tpno: tpNo, [key]: n }),
        });
        const json = await res.json();
        if (!json?.success) {
          alert(json?.message || '更新失败');
          setCredits((prev) => ({ ...prev, [key]: String(saved) }));
          return;
        }
        savedCreditsRef.current = { ...savedCreditsRef.current, [key]: n };
        setCredits((prev) => ({ ...prev, [key]: String(n) }));
      } catch {
        alert('更新失败');
        setCredits((prev) => ({ ...prev, [key]: String(saved) }));
      }
    },
    [credits, tpNo, userInfo?.Uno]
  );

  const handleDetails = useCallback((row) => {
    setDetailsRow(row);
    setDetailsOpen(true);
  }, []);

  const handleSelect = useCallback(
    async (row) => {
      if (!canEdit) return;
      if (!userInfo?.Uno || !tpNo || !row?.Cno) return;
      try {
        await fetch(`${API_BASE}/api/trainingprogram/tp-curricular/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno: userInfo.Uno, tpno: tpNo, cno: row.Cno }),
        });
      } finally {
        fetchSelected();
        fetchAvailable();
      }
    },
    [canEdit, fetchAvailable, fetchSelected, tpNo, userInfo?.Uno]
  );

  const handleDelete = useCallback(
    async (row) => {
      if (!canEdit) return;
      if (!userInfo?.Uno || !tpNo || !row?.Cno) return;
      try {
        await fetch(`${API_BASE}/api/trainingprogram/tp-curricular/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno: userInfo.Uno, tpno: tpNo, cno: row.Cno }),
        });
      } finally {
        fetchSelected();
        fetchAvailable();
      }
    },
    [canEdit, fetchAvailable, fetchSelected, tpNo, userInfo?.Uno]
  );

  const selectedColumns = useMemo(() => {
    return [
      { key: 'Cname', title: '名称', width: '28%' },
      { key: 'Cattri', title: '性质', width: '16%' },
      { key: 'Cdept', title: '学院', width: '10%' },
      { key: 'Ccredit', title: '学分', width: '10%' },
      { key: 'Cseme', title: '学期', width: '22%' },
      {
        key: 'op',
        title: '操作',
        width: '14%',
        render: (row) => (
          <div className="trainingprogramedit-operation-btns">
            <button
              type="button"
              className="trainingprogramedit-op-btn"
              title="详情"
              aria-label="详情"
              onClick={() => handleDetails(row)}
              disabled={!tpNo}
            >
              <img src="/images/table/details.svg" alt="详情" />
            </button>
            {canEdit && (
              <button
                type="button"
                className="trainingprogramedit-op-btn"
                title="删除"
                aria-label="删除"
                onClick={() => handleDelete(row)}
                disabled={!tpNo}
              >
                <img src="/images/table/delete.svg" alt="删除" />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [canEdit, handleDelete, handleDetails, tpNo]);

  const availableColumns = useMemo(() => {
    return [
      { key: 'Cname', title: '名称', width: '28%' },
      { key: 'Cattri', title: '性质', width: '16%' },
      { key: 'Cdept', title: '学院', width: '10%' },
      { key: 'Ccredit', title: '学分', width: '10%' },
      { key: 'Cseme', title: '学期', width: '22%' },
      {
        key: 'op',
        title: '操作',
        width: '14%',
        render: (row) => (
          <div className="trainingprogramedit-operation-btns">
            <button
              type="button"
              className="trainingprogramedit-op-btn"
              title="详情"
              aria-label="详情"
              onClick={() => handleDetails(row)}
              disabled={!tpNo}
            >
              <img src="/images/table/details.svg" alt="详情" />
            </button>
            {canEdit && (
              <button
                type="button"
                className="trainingprogramedit-op-btn"
                title="选择"
                aria-label="选择"
                onClick={() => handleSelect(row)}
                disabled={!tpNo}
              >
                <img src="/images/table/pass.svg" alt="选择" />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [canEdit, handleDetails, handleSelect, tpNo]);

  const detailsBody = useMemo(() => {
    if (!detailsRow) return '';
    const cno = detailsRow.Cno || '';
    const eattri = detailsRow.Ceattri || '';
    const desc = detailsRow.Cdescription || '';
    return `课程编号：${cno}\n考核方式：${eattri}\n描述：${desc}`;
  }, [detailsRow]);

  const handleImport = useCallback(async () => {
    if (!userInfo?.Uno) return;
    if (!tpNo || !latestTpNo) return;
    if (tpNo === latestTpNo) return;
    if (isLocked) return;
    if (!window.confirm(`确定将 ${latestTpNo} 的课程导入到 ${tpNo} 吗？`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/trainingprogram/tp-curricular/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uno: userInfo.Uno, fromTpno: latestTpNo, toTpno: tpNo }),
      });
      const json = await res.json();
      if (!json?.success) {
        alert(json?.message || '导入失败');
        return;
      }
      setSelectedPage(1);
      setAvailablePage(1);
      fetchSelected();
      fetchAvailable();
    } catch {
      alert('导入失败');
    }
  }, [fetchAvailable, fetchSelected, isLocked, latestTpNo, tpNo, userInfo?.Uno]);

  const handleSubmit = useCallback(async () => {
    if (!userInfo?.Uno || !tpNo) return;
    if (tpStatus !== '调整中') return;
    if (!window.confirm('是否确认提交本方案的编写，并投入使用？(确认后无法修改)')) return;
    try {
      const res = await fetch(`${API_BASE}/api/trainingprogram/status/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uno: userInfo.Uno, tpno: tpNo }),
      });
      const json = await res.json();
      if (!json?.success) {
        alert(json?.message || '提交失败');
        return;
      }
      window.location.reload();
    } catch {
      alert('提交失败');
    }
  }, [tpNo, tpStatus, userInfo?.Uno]);

  return (
    <MorePageLayout title="编写方案" systemRole={getSystemRole()} onLogout={handleLogout} onNavigate={(item) => navigate(item.url)}>
      <div className="trainingprogramedit-root">
        <div className="trainingprogramedit-left">
          <div className="trainingprogramedit-info-box">
            <div className="trainingprogramedit-row small">
              <div className="trainingprogramedit-cell" style={{ width: '100%' }}>
                <span className="trainingprogramedit-label">新建方案专业：</span>
                <div className="trainingprogramedit-picker" ref={domDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                  <div className="trainingprogramedit-picker-control" onClick={() => setDomDropdownOpen((v) => !v)}>
                    <div className="trainingprogramedit-picker-chips">
                      {selectedDom ? (
                        <div className="trainingprogramedit-picker-chip">
                          <span className="trainingprogramedit-picker-chip-text">{selectedDom.Dom_name}</span>
                          <button
                            type="button"
                            className="trainingprogramedit-picker-chip-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDom(null);
                              setLatestTpNo('');
                              setDomQuery('');
                              setSelectedViewName(null);
                              setAvailableViewName(null);
                              setSelectedData([]);
                              setSelectedTotal(0);
                              setAvailableData([]);
                              setAvailableTotal(0);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <span className="trainingprogramedit-picker-placeholder">请输入专业名称搜索</span>
                      )}
                    </div>
                    <span className="trainingprogramedit-picker-caret">{domDropdownOpen ? '▲' : '▼'}</span>
                  </div>
                  {domDropdownOpen && (
                    <div className="trainingprogramedit-picker-dropdown">
                      <input
                        className="trainingprogramedit-picker-search"
                        value={domQuery}
                        onChange={(e) => {
                          const next = e.target.value;
                          setDomQuery(next);
                          if (next.trim().length < 3) setDomOptions([]);
                        }}
                        placeholder="输入至少3个字符"
                        autoFocus
                      />
                      <div className="trainingprogramedit-picker-options">
                        {domQuery.trim().length < 3 ? (
                          <div className="trainingprogramedit-picker-hint">请输入至少3个字符</div>
                        ) : domOptions.length === 0 ? (
                          <div className="trainingprogramedit-picker-hint">无匹配结果</div>
                        ) : (
                          domOptions.map((d) => (
                            <button
                              key={d.Dom_no}
                              type="button"
                              className={`trainingprogramedit-picker-option ${selectedDom?.Dom_no === d.Dom_no ? 'selected' : ''}`}
                              onClick={() => {
                                setLatestTpNo('');
                                setSelectedPage(1);
                                setSelectedSearchParams({});
                                setAvailablePage(1);
                                setAvailableSearchParams({});
                                setSelectedDom({
                                  Dom_no: d.Dom_no,
                                  Dom_name: d.Dom_name,
                                  Dom_dept: d.Dom_dept,
                                });
                                setDomDropdownOpen(false);
                              }}
                            >
                              <span className="uno">{d.Dom_no}</span>
                              <span className="urole">{d.Dom_name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="trainingprogramedit-row small">
              <div className="trainingprogramedit-cell" style={{ width: '100%' }}>
                <span className="trainingprogramedit-label">新建方案名称：</span>
                <input className="trainingprogramedit-input" value={tpName} readOnly />
              </div>
            </div>

            <div className="trainingprogramedit-row small">
              <div className="trainingprogramedit-cell" style={{ width: '100%' }}>
                <span className="trainingprogramedit-label">新建方案编号：</span>
                <input className="trainingprogramedit-input" value={tpNo} readOnly />
              </div>
            </div>

            <div className="trainingprogramedit-row small">
              <div className="trainingprogramedit-cell" style={{ width: '100%' }}>
                <span className="trainingprogramedit-label">最新方案编号：</span>
                <div className="trainingprogramedit-latest-wrap">
                  <input className="trainingprogramedit-input" value={latestTpNo} readOnly />
                  <button
                    type="button"
                    className="trainingprogramedit-import"
                    disabled={!latestTpNo || !tpNo || latestTpNo === tpNo || isLocked}
                    onClick={handleImport}
                  >
                    导入
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="trainingprogramedit-left-bottom">
            <Table
              columns={selectedColumns}
              data={tpNo && selectedViewName ? selectedData : []}
              total={tpNo && selectedViewName ? selectedTotal : 0}
              currentPage={selectedPage}
              pageSize={selectedPageSize}
              onPageChange={setSelectedPage}
              onPageSizeChange={setSelectedPageSize}
              onSearch={(p) => {
                setSelectedPage(1);
                setSelectedSearchParams(p || {});
              }}
              onRefresh={fetchSelected}
              loading={selectedLoading}
            />
          </div>
        </div>

        <div className="trainingprogramedit-right">
          <div className="trainingprogramedit-right-top">
            <div className="trainingprogramedit-credit-box">
              <div className="trainingprogramedit-credit-row">
                <div className="trainingprogramedit-credit-col">
                  <span className="trainingprogramedit-label">公共必修学分：</span>
                  <input
                    className="trainingprogramedit-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={credits.TPcredit_GB}
                    disabled={!tpNo || isLocked}
                    onChange={(e) => handleCreditChange('TPcredit_GB', e.target.value)}
                    onBlur={() => handleCreditBlur('TPcredit_GB')}
                  />
                </div>
                <div className="trainingprogramedit-credit-col">
                  <span className="trainingprogramedit-label">专业必修学分：</span>
                  <input
                    className="trainingprogramedit-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={credits.TPcredit_ZB}
                    disabled={!tpNo || isLocked}
                    onChange={(e) => handleCreditChange('TPcredit_ZB', e.target.value)}
                    onBlur={() => handleCreditBlur('TPcredit_ZB')}
                  />
                </div>
              </div>
              <div className="trainingprogramedit-credit-row">
                <div className="trainingprogramedit-credit-col">
                  <span className="trainingprogramedit-label">专业选修学分：</span>
                  <input
                    className="trainingprogramedit-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={credits.TPcredit_ZX}
                    disabled={!tpNo || isLocked}
                    onChange={(e) => handleCreditChange('TPcredit_ZX', e.target.value)}
                    onBlur={() => handleCreditBlur('TPcredit_ZX')}
                  />
                </div>
                <div className="trainingprogramedit-credit-col">
                  <span className="trainingprogramedit-label">通识选修学分：</span>
                  <input
                    className="trainingprogramedit-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={credits.TPcredit_TX}
                    disabled={!tpNo || isLocked}
                    onChange={(e) => handleCreditChange('TPcredit_TX', e.target.value)}
                    onBlur={() => handleCreditBlur('TPcredit_TX')}
                  />
                </div>
              </div>
              <div className="trainingprogramedit-credit-row">
                <div className="trainingprogramedit-credit-col">
                  <span className="trainingprogramedit-label">个性课程学分：</span>
                  <input
                    className="trainingprogramedit-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={credits.TPcredit_GX}
                    disabled={!tpNo || isLocked}
                    onChange={(e) => handleCreditChange('TPcredit_GX', e.target.value)}
                    onBlur={() => handleCreditBlur('TPcredit_GX')}
                  />
                </div>
                <div className="trainingprogramedit-credit-col" />
              </div>
            </div>

            <div className="trainingprogramedit-right-table">
              <Table
                columns={availableColumns}
                data={tpNo && availableViewName ? availableData : []}
                total={tpNo && availableViewName ? availableTotal : 0}
                currentPage={availablePage}
                pageSize={availablePageSize}
                onPageChange={setAvailablePage}
                onPageSizeChange={setAvailablePageSize}
                onSearch={(p) => {
                  setAvailablePage(1);
                  setAvailableSearchParams(p || {});
                }}
                onRefresh={fetchAvailable}
                loading={availableLoading}
              />
            </div>
          </div>
          <div className="trainingprogramedit-right-bottom">
            <button type="button" className="trainingprogramedit-send" disabled={!tpNo || tpStatus !== '调整中'} onClick={handleSubmit}>
              确认提交(确认后无法修改)
            </button>
          </div>
        </div>
      </div>

      <Details
        open={detailsOpen}
        title={detailsRow?.Cname || ''}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsRow(null);
        }}
      >
        <div className="trainingprogramedit-details-body">{detailsBody}</div>
      </Details>
    </MorePageLayout>
  );
};

export default TrainingprogramEdit;
