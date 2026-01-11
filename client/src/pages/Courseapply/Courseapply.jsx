import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Courseapply.css';

const Courseapply = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);

  const [businessFlags, setBusinessFlags] = useState(null);

  const [cnoPoolViewName, setCnoPoolViewName] = useState(null);
  const [profViewName, setProfViewName] = useState(null);

  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const [courseQuery, setCourseQuery] = useState('');
  const [courseOptions, setCourseOptions] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [profDropdownOpen, setProfDropdownOpen] = useState(false);
  const [profQuery, setProfQuery] = useState('');
  const [profOptions, setProfOptions] = useState([]);
  const [selectedProfs, setSelectedProfs] = useState([]);

  const [campusOptions, setCampusOptions] = useState([]);
  const [campus, setCampus] = useState('');

  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [dayOptions, setDayOptions] = useState([]);
  const [selectedDays, setSelectedDays] = useState([]);

  const [maxStudents, setMaxStudents] = useState('');

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({});

  const courseSearchTimerRef = useRef(null);
  const profSearchTimerRef = useRef(null);
  const courseDropdownRef = useRef(null);
  const profDropdownRef = useRef(null);
  const dayDropdownRef = useRef(null);

  useEffect(() => {
    const user = getCurrentUserFromStorage();
    if (user) {
      setUserInfo(user);
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    const fetchBusinessFlags = async () => {
      try {
        const res = await fetch('/api/business/status');
        const json = await res.json();
        if (json.success) {
          setBusinessFlags({
            curricularOpen: Boolean(json.curricularOpen),
            courseOpen: Boolean(json.courseOpen),
            enrollOpen: Boolean(json.enrollOpen),
          });
        } else {
          setBusinessFlags(null);
        }
      } catch {
        setBusinessFlags(null);
      }
    };
    fetchBusinessFlags();
  }, []);

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  const selectedProfMap = useMemo(() => {
    return new Map(selectedProfs.map((p) => [p.Pno, p]));
  }, [selectedProfs]);

  const selectedDaySet = useMemo(() => {
    return new Set(selectedDays);
  }, [selectedDays]);

  useEffect(() => {
    const onDocumentClick = (e) => {
      if (courseDropdownRef.current && !courseDropdownRef.current.contains(e.target)) setCourseDropdownOpen(false);
      if (profDropdownRef.current && !profDropdownRef.current.contains(e.target)) setProfDropdownOpen(false);
      if (dayDropdownRef.current && !dayDropdownRef.current.contains(e.target)) setDayDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const userInfoRef = useRef(userInfo);
  useEffect(() => {
    userInfoRef.current = userInfo;
  }, [userInfo]);

  useEffect(() => {
    const fetchBasicOptions = async () => {
      try {
        const campusParams = new URLSearchParams({ tableName: 'Campus', page: 1, limit: 200, orderBy: 'Cam_name', orderDir: 'ASC' });
        const campusRes = await fetch(`/api/common/table/list?${campusParams.toString()}`);
        const campusJson = await campusRes.json();
        if (campusJson.success) {
          const options = (campusJson.data || [])
            .filter((r) => r?.Cam_status === '正常')
            .map((r) => r.Cam_name)
            .filter(Boolean);
          setCampusOptions(options);
        } else {
          setCampusOptions([]);
        }
      } catch {
        setCampusOptions([]);
      }

      try {
        const dayParams = new URLSearchParams({ tableName: 'Dayofweek', page: 1, limit: 20, orderBy: 'Day', orderDir: 'ASC' });
        const dayRes = await fetch(`/api/common/table/list?${dayParams.toString()}`);
        const dayJson = await dayRes.json();
        if (dayJson.success) {
          const options = (dayJson.data || []).map((r) => String(r.Day)).filter((d) => /^[1-7]$/.test(d));
          setDayOptions(options.sort((a, b) => Number(a) - Number(b)));
        } else {
          setDayOptions([]);
        }
      } catch {
        setDayOptions([]);
      }
    };
    fetchBasicOptions();
  }, []);

  useEffect(() => {
    if (!userInfo?.Uno) return;

    const initView = async () => {
      try {
        const res = await fetch('/api/courseapply/view/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const json = await res.json();
        if (json.success) {
          setCnoPoolViewName(json.cnoPoolViewName);
          setProfViewName(json.profViewName);
        } else {
          setCnoPoolViewName(null);
          setProfViewName(null);
        }
      } catch {
        setCnoPoolViewName(null);
        setProfViewName(null);
      }
    };

    initView();

    return () => {
      const currentUser = userInfoRef.current;
      if (!currentUser?.Uno) return;
      fetch('/api/courseapply/view/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});
    };
  }, [userInfo?.Uno]);

  const fetchData = useCallback(async () => {
    if (!cnoPoolViewName) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tableName: cnoPoolViewName,
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
  }, [cnoPoolViewName, currentPage, pageSize, searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchCoursesByCno = useCallback(
    async (query) => {
      if (!cnoPoolViewName) return [];
      const params = new URLSearchParams({
        tableName: cnoPoolViewName,
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
    [cnoPoolViewName]
  );

  const fetchProfsByPno = useCallback(
    async (query) => {
      if (!profViewName) return [];
      const params = new URLSearchParams({
        tableName: profViewName,
        page: 1,
        limit: 50,
        orderBy: 'Pno',
        orderDir: 'ASC',
        search_Pno: query,
      });
      const res = await fetch(`/api/common/table/list?${params.toString()}`);
      const json = await res.json();
      if (json.success) return json.data || [];
      return [];
    },
    [profViewName]
  );

  useEffect(() => {
    if (courseSearchTimerRef.current) clearTimeout(courseSearchTimerRef.current);
    const q = courseQuery.trim();
    if (q.length < 3) return;

    courseSearchTimerRef.current = setTimeout(async () => {
      try {
        const rows = await fetchCoursesByCno(q);
        setCourseOptions(rows);
      } catch {
        setCourseOptions([]);
      }
    }, 250);

    return () => {
      if (courseSearchTimerRef.current) clearTimeout(courseSearchTimerRef.current);
    };
  }, [courseQuery, fetchCoursesByCno]);

  useEffect(() => {
    if (profSearchTimerRef.current) clearTimeout(profSearchTimerRef.current);
    const q = profQuery.trim();
    if (q.length < 3) return;

    profSearchTimerRef.current = setTimeout(async () => {
      try {
        const rows = await fetchProfsByPno(q);
        setProfOptions(rows);
      } catch {
        setProfOptions([]);
      }
    }, 250);

    return () => {
      if (profSearchTimerRef.current) clearTimeout(profSearchTimerRef.current);
    };
  }, [profQuery, fetchProfsByPno]);

  const addProf = (prof) => {
    if (!prof?.Pno) return;
    if (selectedProfMap.has(prof.Pno)) return;
    setSelectedProfs((prev) => [...prev, { Pno: prof.Pno, Pname: prof.Pname }]);
  };

  const removeProf = (pno) => {
    setSelectedProfs((prev) => prev.filter((p) => p.Pno !== pno));
  };

  const toggleDay = (day) => {
    if (!/^[1-7]$/.test(String(day))) return;
    setSelectedDays((prev) => {
      const set = new Set(prev);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return Array.from(set).sort((a, b) => Number(a) - Number(b));
    });
  };

  const canSend = useMemo(() => {
    if (!userInfo?.Uno) return false;
    if (businessFlags && !businessFlags.courseOpen) return false;
    if (!selectedCourse?.Cno) return false;
    if (!campus) return false;
    if (!maxStudents.trim()) return false;
    const pmaxNum = Number(maxStudents);
    if (!Number.isFinite(pmaxNum) || pmaxNum <= 0) return false;
    if (selectedProfs.length === 0) return false;
    if (selectedDays.length === 0) return false;
    return true;
  }, [businessFlags, campus, maxStudents, selectedCourse?.Cno, selectedDays.length, selectedProfs.length, userInfo?.Uno]);

  const handleSend = async () => {
    if (!userInfo?.Uno) return;
    if (!canSend) return;

    const pmaxNumRaw = Number(maxStudents);
    const finalPmax = Math.min(120, Math.floor(pmaxNumRaw));

    try {
      const res = await fetch('/api/courseapply/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cno: selectedCourse.Cno,
          campus,
          pmax: finalPmax,
          professorPnos: selectedProfs.map((p) => p.Pno),
          days: selectedDays,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedCourse(null);
        setCourseQuery('');
        setCourseOptions([]);
        setSelectedProfs([]);
        setProfQuery('');
        setProfOptions([]);
        setCampus('');
        setSelectedDays([]);
        setMaxStudents('');
        setCurrentPage(1);
        fetchData();
      } else {
        alert(json.message || '提交失败');
      }
    } catch {
      alert('提交失败');
    }
  };

  const columns = useMemo(() => {
    return [
      { key: 'Cno', title: '课程编号', width: '22%' },
      { key: 'Cattri', title: '课程属性', width: '18%' },
      { key: 'Cname', title: '课程名称', width: '40%' },
      { key: 'Cseme', title: '开课学期', width: '20%' },
    ];
  }, []);

  return (
    <MorePageLayout
      title="任教申请"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <div className="courseapply-root">
        <div className="courseapply-left">
          <div className="courseapply-left-title">任教申请</div>
          {businessFlags && !businessFlags.courseOpen && (
            <div
              style={{
                margin: '8px 12px',
                padding: '6px 10px',
                borderRadius: 6,
                backgroundColor: '#fff7e6',
                color: '#ad4e00',
                fontSize: 12,
              }}
            >
              当前任教申请业务未开放，暂时无法发起新的申请。
            </div>
          )}
          <div className="courseapply-form" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
            <div className="courseapply-row small">
              <div className="courseapply-cell" style={{ width: '100%' }}>
                <span className="courseapply-label">任教课程：</span>
                <div className="courseapply-picker" ref={courseDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                  <div className="courseapply-picker-control" onClick={() => setCourseDropdownOpen((v) => !v)}>
                    <div className="courseapply-picker-chips">
                      {selectedCourse ? (
                        <div className="courseapply-picker-chip">
                          <span className="courseapply-picker-chip-text">{selectedCourse.Cno}</span>
                          <button
                            type="button"
                            className="courseapply-picker-chip-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCourse(null);
                            }}
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <span className="courseapply-picker-placeholder">点击选择课程</span>
                      )}
                    </div>
                    <div className="courseapply-picker-caret">▾</div>
                  </div>

                  {courseDropdownOpen && (
                    <div className="courseapply-picker-dropdown">
                      <input
                        className="courseapply-picker-search"
                        value={courseQuery}
                        onChange={(e) => setCourseQuery(e.target.value)}
                        placeholder="输入 Cno 模糊搜索（至少3个字符）"
                      />
                      <div className="courseapply-picker-options">
                        {courseQuery.trim().length < 3 ? (
                          <div className="courseapply-picker-hint">请输入至少3个字符</div>
                        ) : courseOptions.length === 0 ? (
                          <div className="courseapply-picker-hint">无匹配结果</div>
                        ) : (
                          courseOptions.map((c) => (
                            <button
                              key={c.Cno}
                              type="button"
                              className={`courseapply-picker-option ${selectedCourse?.Cno === c.Cno ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedCourse({ Cno: c.Cno, Cname: c.Cname });
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

            <div className="courseapply-row small">
              <div className="courseapply-cell" style={{ width: '100%' }}>
                <span className="courseapply-label">任教教授：</span>
                <div className="courseapply-picker" ref={profDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                  <div className="courseapply-picker-control" onClick={() => setProfDropdownOpen((v) => !v)}>
                    <div className="courseapply-picker-chips">
                      {selectedProfs.map((p) => (
                        <div key={p.Pno} className="courseapply-picker-chip">
                          <span className="courseapply-picker-chip-text">{p.Pno}</span>
                          <button
                            type="button"
                            className="courseapply-picker-chip-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeProf(p.Pno);
                            }}
                          >
                            X
                          </button>
                        </div>
                      ))}
                      {selectedProfs.length === 0 && <span className="courseapply-picker-placeholder">点击选择教授</span>}
                    </div>
                    <div className="courseapply-picker-caret">▾</div>
                  </div>

                  {profDropdownOpen && (
                    <div className="courseapply-picker-dropdown">
                      <input
                        className="courseapply-picker-search"
                        value={profQuery}
                        onChange={(e) => setProfQuery(e.target.value)}
                        placeholder="输入 Pno 模糊搜索（至少3个字符）"
                      />
                      <div className="courseapply-picker-options">
                        {profQuery.trim().length < 3 ? (
                          <div className="courseapply-picker-hint">请输入至少3个字符</div>
                        ) : profOptions.length === 0 ? (
                          <div className="courseapply-picker-hint">无匹配结果</div>
                        ) : (
                          profOptions.map((p) => (
                            <button
                              key={p.Pno}
                              type="button"
                              className={`courseapply-picker-option ${selectedProfMap.has(p.Pno) ? 'selected' : ''}`}
                              onClick={() => addProf(p)}
                            >
                              <span className="uno">{p.Pno}</span>
                              <span className="urole">{p.Pname}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="courseapply-row small">
              <div className="courseapply-cell" style={{ width: '100%' }}>
                <span className="courseapply-label">意向任教校区：</span>
                <select className="courseapply-select" value={campus} onChange={(e) => setCampus(e.target.value)}>
                  <option value="">请选择</option>
                  {campusOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="courseapply-row small">
              <div className="courseapply-cell" style={{ width: '100%' }}>
                <span className="courseapply-label">意向任教星期：</span>
                <div className="courseapply-picker" ref={dayDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                  <div className="courseapply-picker-control" onClick={() => setDayDropdownOpen((v) => !v)}>
                    <div className="courseapply-picker-chips">
                      {selectedDays.map((d) => (
                        <div key={d} className="courseapply-picker-chip">
                          <span className="courseapply-picker-chip-text">{d}</span>
                          <button
                            type="button"
                            className="courseapply-picker-chip-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDay(d);
                            }}
                          >
                            X
                          </button>
                        </div>
                      ))}
                      {selectedDays.length === 0 && <span className="courseapply-picker-placeholder">点击选择星期</span>}
                    </div>
                    <div className="courseapply-picker-caret">▾</div>
                  </div>

                  {dayDropdownOpen && (
                    <div className="courseapply-picker-dropdown">
                      <div className="courseapply-picker-options">
                        {dayOptions.length === 0 ? (
                          <div className="courseapply-picker-hint">无可用选项</div>
                        ) : (
                          dayOptions.map((d) => (
                            <button
                              key={d}
                              type="button"
                              className={`courseapply-picker-option ${selectedDaySet.has(d) ? 'selected' : ''}`}
                              onClick={() => toggleDay(d)}
                            >
                              <span className="uno">{d}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="courseapply-row small">
              <div className="courseapply-cell" style={{ width: '100%' }}>
                <span className="courseapply-label">意向最大人数：</span>
                <input
                  className="courseapply-input"
                  value={maxStudents}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    if (!digits) {
                      setMaxStudents('');
                      return;
                    }
                    const nextNum = Number(digits);
                    if (Number.isFinite(nextNum) && nextNum >= 120) {
                      if (maxStudents !== '120') alert('最大人数为120，如需多于120请新建一个业务');
                      setMaxStudents('120');
                      return;
                    }
                    setMaxStudents(digits);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="courseapply-right">
          <div className="courseapply-right-top">
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
          <div className="courseapply-right-bottom">
            <button type="button" className="courseapply-send" disabled={!canSend} onClick={handleSend}>
              发送申请
            </button>
          </div>
        </div>
      </div>
    </MorePageLayout>
  );
};

export default Courseapply;
