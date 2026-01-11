import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import Details from '../../components/Details/Details';
import './Examapply.css';

const EXAM_ATTRI_OPTIONS = ['正考', '补缓考', '其他'];

const getCurrentUserFromStorage = () => {
  try {
    const currentUno = sessionStorage.getItem('currentUno');
    if (currentUno) {
      const mapStr = localStorage.getItem('userMap');
      if (mapStr) {
        const map = JSON.parse(mapStr);
        if (map && typeof map === 'object' && map[currentUno]) {
          return map[currentUno];
        }
      }
    }
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yStr, mStr, dStr] = value.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1) return false;
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (d > daysInMonth) return false;
  return true;
}

function isValidTimeString(value) {
  if (!/^\d{2}:\d{2}:\d{2}$/.test(value)) return false;
  const [hStr, mStr, sStr] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const s = Number(sStr);
  if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(s)) return false;
  if (h < 0 || h > 23) return false;
  if (m < 0 || m > 59) return false;
  if (s < 0 || s > 59) return false;
  return true;
}

const Examapply = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [viewName, setViewName] = useState(null);

  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const [courseQuery, setCourseQuery] = useState('');
  const [courseOptions, setCourseOptions] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const courseSearchTimerRef = useRef(null);
  const courseDropdownRef = useRef(null);

  const [examAttri, setExamAttri] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [durationMin, setDurationMin] = useState('');

  const [dateError, setDateError] = useState('');
  const [timeError, setTimeError] = useState('');
  const [durationError, setDurationError] = useState('');

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({});

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState(null);

  useEffect(() => {
    const user = getCurrentUserFromStorage();
    if (user) {
      setUserInfo(user);
    } else {
      navigate('/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  useEffect(() => {
    const onDocumentClick = (e) => {
      if (courseDropdownRef.current && !courseDropdownRef.current.contains(e.target)) setCourseDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const userInfoRef = useRef(userInfo);
  useEffect(() => {
    userInfoRef.current = userInfo;
  }, [userInfo]);

  useEffect(() => {
    if (!userInfo?.Uno) return;

    const initView = async () => {
      try {
        const res = await fetch('/api/examapply/view/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const json = await res.json();
        if (json.success) setViewName(json.viewName);
      } catch {
        setViewName(null);
      }
    };

    initView();

    return () => {
      const currentUser = userInfoRef.current;
      if (!currentUser?.Uno) return;
      fetch('/api/examapply/view/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});
    };
  }, [userInfo?.Uno]);

  const fetchData = useCallback(async () => {
    if (!viewName) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tableName: viewName,
        page: currentPage,
        limit: pageSize,
        orderBy: 'Cno',
        orderDir: 'ASC',
        ...Object.keys(searchParams).reduce((acc, key) => {
          acc[`search_${key}`] = searchParams[key];
          return acc;
        }, {}),
      });
      const res = await fetch(`/api/common/table/list?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setTotal(json.pagination?.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [viewName, currentPage, pageSize, searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchCoursesByCno = useCallback(
    async (query) => {
      if (!viewName) return [];
      const params = new URLSearchParams({
        tableName: viewName,
        page: 1,
        limit: 50,
        orderBy: 'Cno',
        orderDir: 'ASC',
        search_Cno: query,
      });
      const res = await fetch(`/api/common/table/list?${params.toString()}`);
      const json = await res.json();
      if (json.success) return json.data || [];
      return [];
    },
    [viewName]
  );

  useEffect(() => {
    if (!courseDropdownOpen) return;
    const q = courseQuery.trim();
    if (courseSearchTimerRef.current) clearTimeout(courseSearchTimerRef.current);
    courseSearchTimerRef.current = setTimeout(async () => {
      if (q.length < 5) {
        setCourseOptions([]);
        return;
      }
      try {
        const rows = await fetchCoursesByCno(q);
        setCourseOptions(
          (rows || [])
            .filter((r) => r?.Cno && typeof r.Cno === 'string' && r.Cno.includes(q))
            .slice(0, 50)
        );
      } catch {
        setCourseOptions([]);
      }
    }, 250);
    return () => {
      if (courseSearchTimerRef.current) clearTimeout(courseSearchTimerRef.current);
    };
  }, [courseDropdownOpen, courseQuery, fetchCoursesByCno]);

  const canSend = useMemo(() => {
    if (!userInfo?.Uno) return false;
    if (!selectedCourse?.Cno) return false;
    if (!examAttri || !EXAM_ATTRI_OPTIONS.includes(examAttri)) return false;
    if (!dateStr || !isValidDateString(dateStr)) return false;
    if (!timeStr || !isValidTimeString(timeStr)) return false;
    const dur = Number(durationMin);
    if (!Number.isFinite(dur) || dur <= 0) return false;
    if (dur < 30 || dur > 180) return false;
    if (dateError || timeError || durationError) return false;
    return true;
  }, [userInfo?.Uno, selectedCourse?.Cno, examAttri, dateStr, timeStr, durationMin, dateError, timeError, durationError]);

  const handleSend = async () => {
    if (!userInfo?.Uno) return;
    if (!canSend) return;
    try {
      const res = await fetch('/api/examapply/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cno: selectedCourse.Cno,
          eattri: examAttri,
          date: dateStr,
          time: timeStr,
          durationMinutes: Number(durationMin),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedCourse(null);
        setCourseQuery('');
        setCourseOptions([]);
        setExamAttri('');
        setDateStr('');
        setTimeStr('');
        setDurationMin('');
        setDateError('');
        setTimeError('');
        setDurationError('');
        setCurrentPage(1);
        fetchData();
      } else {
        alert(json.message || '提交失败');
      }
    } catch {
      alert('提交失败');
    }
  };

  const handleDetails = useCallback((row) => {
    setDetailsRow(row);
    setDetailsOpen(true);
  }, []);

  const columns = useMemo(() => {
    return [
      { key: 'Cno', title: '课程编号', width: '20%' },
      { key: 'Cattri', title: '课程性质', width: '18%' },
      { key: 'Cname', title: '课程名称', width: '30%' },
      { key: 'Ceattri', title: '考核性质', width: '18%' },
      {
        key: 'op',
        title: '操作',
        width: '14%',
        render: (row) => (
          <div className="operation-btns">
            <button type="button" className="examapply-detail-btn" title="详情" aria-label="详情" onClick={() => handleDetails(row)}>
              <img src="/images/table/details.svg" alt="详情" />
            </button>
          </div>
        ),
      },
    ];
  }, [handleDetails]);

  const detailsBody = useMemo(() => {
    if (!detailsRow) return '';
    const seme = detailsRow.Cseme || '';
    const classhour = detailsRow.Cclasshour ?? '';
    const desc = detailsRow.Description ?? '';
    return `修读学期：${seme}\n课时：${classhour}\n描述：${desc}`;
  }, [detailsRow]);

  return (
    <MorePageLayout title="考试申请" systemRole={getSystemRole()} onLogout={handleLogout} onNavigate={(item) => navigate(item.url)}>
      <div className="examapply-root">
        <div className="examapply-left">
          <div className="examapply-form" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
            <div className="examapply-row small">
              <div className="examapply-cell" style={{ width: '100%' }}>
                <span className="examapply-label">对应课程编号：</span>
                <div className="examapply-picker" ref={courseDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                  <div className="examapply-picker-control" onClick={() => setCourseDropdownOpen((v) => !v)}>
                    <div className="examapply-picker-chips">
                      {selectedCourse ? (
                        <div className="examapply-picker-chip">
                          <span className="examapply-picker-chip-text">{selectedCourse.Cno}</span>
                          <button
                            type="button"
                            className="examapply-picker-chip-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCourse(null);
                            }}
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <span className="examapply-picker-placeholder">点击选择课程</span>
                      )}
                    </div>
                    <div className="examapply-picker-caret">▾</div>
                  </div>

                  {courseDropdownOpen && (
                    <div className="examapply-picker-dropdown">
                      <input
                        className="examapply-picker-search"
                        value={courseQuery}
                        onChange={(e) => setCourseQuery(e.target.value)}
                        placeholder="输入 Cno 模糊搜索（至少5个字符）"
                      />
                      <div className="examapply-picker-options">
                        {courseQuery.trim().length < 5 ? (
                          <div className="examapply-picker-hint">请输入至少5个字符</div>
                        ) : courseOptions.length === 0 ? (
                          <div className="examapply-picker-hint">无匹配结果</div>
                        ) : (
                          courseOptions.map((c) => (
                            <button
                              key={c.Cno}
                              type="button"
                              className={`examapply-picker-option ${selectedCourse?.Cno === c.Cno ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedCourse({
                                  Cno: c.Cno,
                                  Cname: c.Cname,
                                });
                                setCourseDropdownOpen(false);
                              }}
                            >
                              <span className="uno">{c.Cno}</span>
                              <span className="urole">{c.Cname}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="examapply-row small">
              <div className="examapply-cell" style={{ width: '100%' }}>
                <span className="examapply-label">考试性质：</span>
                <select className="examapply-select" value={examAttri} onChange={(e) => setExamAttri(e.target.value)}>
                  <option value="">请选择</option>
                  {EXAM_ATTRI_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="examapply-row small">
              <div className="examapply-cell" style={{ width: '100%' }}>
                <span className="examapply-label">考试开始时间：</span>
                <input
                  className="examapply-input"
                  value={dateStr}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9-]/g, '');
                    setDateStr(next);
                    if (dateError) setDateError('');
                  }}
                  onBlur={() => {
                    const v = dateStr.trim();
                    if (!v) return;
                    if (!isValidDateString(v)) {
                      setDateError('请输入合法日期');
                      setDateStr('');
                    }
                  }}
                  placeholder="yyyy-mm-dd(如2020-02-21)"
                  inputMode="numeric"
                />
                <input
                  className="examapply-input"
                  value={timeStr}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9:]/g, '');
                    setTimeStr(next);
                    if (timeError) setTimeError('');
                  }}
                  onBlur={() => {
                    const v = timeStr.trim();
                    if (!v) return;
                    if (!isValidTimeString(v)) {
                      setTimeError('请输入合法时间');
                      setTimeStr('');
                    }
                  }}
                  placeholder="hh:mm:ss(如08:30:00)"
                  inputMode="numeric"
                />
              </div>
            </div>
            {(dateError || timeError) && (
              <div className="examapply-error-row">
                {dateError && <div className="examapply-error">{dateError}</div>}
                {timeError && <div className="examapply-error">{timeError}</div>}
              </div>
            )}

            <div className="examapply-row small">
              <div className="examapply-cell" style={{ width: '100%' }}>
                <span className="examapply-label">考试时长(分钟)：</span>
                <input
                  className="examapply-input"
                  value={durationMin}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    if (!digits) {
                      setDurationMin('');
                      setDurationError('');
                      return;
                    }
                    const nextNum = Number(digits);
                    if (Number.isFinite(nextNum) && nextNum > 180) {
                      setDurationError('考试时长最大为180分钟');
                      setDurationMin('180');
                      return;
                    }
                    if (Number.isFinite(nextNum) && nextNum < 30) {
                      setDurationError('考试时长需不少于30分钟');
                    } else {
                      setDurationError('');
                    }
                    setDurationMin(digits);
                  }}
                  inputMode="numeric"
                />
              </div>
            </div>
            {durationError && (
              <div className="examapply-error-row">
                <div className="examapply-error">{durationError}</div>
              </div>
            )}
          </div>
        </div>

        <div className="examapply-right">
          <div className="examapply-right-top">
            <Table
              columns={columns}
              data={data}
              total={total}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              onSearch={setSearchParams}
              onRefresh={fetchData}
              loading={loading}
            />
          </div>
          <div className="examapply-right-bottom">
            <button type="button" className="examapply-send" disabled={!canSend} onClick={handleSend}>
              发送申请
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
        <div className="examapply-details-body">{detailsBody}</div>
      </Details>
    </MorePageLayout>
  );
};

export default Examapply;

