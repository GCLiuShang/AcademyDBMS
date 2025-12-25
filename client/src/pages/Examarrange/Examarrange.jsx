import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Examarrange.css';

const API_BASE = 'http://localhost:3001';

const Examarrange = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);

  const [examDropdownOpen, setExamDropdownOpen] = useState(false);
  const [examQuery, setExamQuery] = useState('');
  const [examOptions, setExamOptions] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);

  const [profDropdownOpen, setProfDropdownOpen] = useState(false);
  const [profQuery, setProfQuery] = useState('');
  const [profOptions, setProfOptions] = useState([]);
  const [selectedProfs, setSelectedProfs] = useState([]);

  const [selectedArrangeName, setSelectedArrangeName] = useState('');

  const [arranges, setArranges] = useState([]);

  const [students, setStudents] = useState([]);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [studentsPage, setStudentsPage] = useState(1);
  const [studentsPageSize, setStudentsPageSize] = useState(20);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsSearchParams, setStudentsSearchParams] = useState({});

  const examSearchTimerRef = useRef(null);
  const profSearchTimerRef = useRef(null);
  const examDropdownRef = useRef(null);
  const profDropdownRef = useRef(null);
  const userInfoRef = useRef(null);
  const hasInitialInvigilatorsRef = useRef(false);

  useEffect(() => {
    const user = getCurrentUserFromStorage();
    if (user) {
      setUserInfo(user);
      userInfoRef.current = user;
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    userInfoRef.current = userInfo;
  }, [userInfo]);

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  useEffect(() => {
    const onDocumentClick = (e) => {
      if (examDropdownRef.current && !examDropdownRef.current.contains(e.target)) setExamDropdownOpen(false);
      if (profDropdownRef.current && !profDropdownRef.current.contains(e.target)) setProfDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
    };
  }, []);

  const fetchExamOptions = useCallback(
    async (query) => {
      if (!userInfoRef.current?.Uno) return [];
      const body = { uno: userInfoRef.current.Uno, query };
      const res = await fetch(`${API_BASE}/api/examarrange/exam/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) return json.data || [];
      return [];
    },
    []
  );

  const fetchProfOptions = useCallback(
    async (query) => {
      if (!userInfoRef.current?.Uno) return [];
      const body = { uno: userInfoRef.current.Uno, query };
      const res = await fetch(`${API_BASE}/api/examarrange/prof/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) return json.data || [];
      return [];
    },
    []
  );

  useEffect(() => {
    if (!examDropdownOpen) return;
    const q = examQuery.trim();
    if (examSearchTimerRef.current) clearTimeout(examSearchTimerRef.current);
    examSearchTimerRef.current = setTimeout(async () => {
      if (q.length < 5) {
        setExamOptions([]);
        return;
      }
      try {
        const rows = await fetchExamOptions(q);
        setExamOptions(rows);
      } catch {
        setExamOptions([]);
      }
    }, 250);
    return () => {
      if (examSearchTimerRef.current) clearTimeout(examSearchTimerRef.current);
    };
  }, [examDropdownOpen, examQuery, fetchExamOptions]);

  useEffect(() => {
    if (!profDropdownOpen) return;
    const q = profQuery.trim();
    if (profSearchTimerRef.current) clearTimeout(profSearchTimerRef.current);
    profSearchTimerRef.current = setTimeout(async () => {
      if (q.length < 3) {
        setProfOptions([]);
        return;
      }
      try {
        const rows = await fetchProfOptions(q);
        setProfOptions(rows);
      } catch {
        setProfOptions([]);
      }
    }, 250);
    return () => {
      if (profSearchTimerRef.current) clearTimeout(profSearchTimerRef.current);
    };
  }, [profDropdownOpen, profQuery, fetchProfOptions]);

  const selectedProfMap = useMemo(() => {
    return new Map(selectedProfs.map((p) => [p.Pno, p]));
  }, [selectedProfs]);

  const fetchExamDetails = useCallback(
    async (eno) => {
      if (!userInfoRef.current?.Uno) return;
      try {
        const res = await fetch(`${API_BASE}/api/examarrange/exam/details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno: userInfoRef.current.Uno, eno }),
        });
        const json = await res.json();
        if (json.success) {
          setArranges(json.arranges || []);
          const invs = Array.isArray(json.invigilators) ? json.invigilators : [];
          setSelectedProfs(
            invs.map((r) => ({
              Pno: r.Pno,
              Pname: r.Pname || '',
            }))
          );
          hasInitialInvigilatorsRef.current = true;
          if (json.arranges && json.arranges.length > 0) {
            setSelectedArrangeName(json.arranges[0].Clrmname || '');
          } else {
            setSelectedArrangeName('');
          }
          setStudentsPage(1);
          setStudentsSearchParams({});
        } else {
          setArranges([]);
          setSelectedProfs([]);
          hasInitialInvigilatorsRef.current = false;
          setSelectedArrangeName('');
        }
      } catch {
        setArranges([]);
        setSelectedProfs([]);
        hasInitialInvigilatorsRef.current = false;
        setSelectedArrangeName('');
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedExam?.Eno) return;
    fetchExamDetails(selectedExam.Eno);
  }, [fetchExamDetails, selectedExam?.Eno]);

  const fetchStudents = useCallback(async () => {
    if (!userInfo?.Uno) return;
    if (!selectedExam?.Eno) {
      setStudents([]);
      setStudentsTotal(0);
      return;
    }
    setStudentsLoading(true);
    try {
      const body = {
        uno: userInfo.Uno,
        eno: selectedExam.Eno,
        page: studentsPage,
        limit: studentsPageSize,
      };
      if (studentsSearchParams.Sno) {
        body.search = studentsSearchParams.Sno;
      }
      const res = await fetch(`${API_BASE}/api/examarrange/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setStudents(json.data || []);
        setStudentsTotal(json.pagination?.total || 0);
      } else {
        setStudents([]);
        setStudentsTotal(0);
      }
    } catch {
      setStudents([]);
      setStudentsTotal(0);
    } finally {
      setStudentsLoading(false);
    }
  }, [selectedExam?.Eno, studentsPage, studentsPageSize, studentsSearchParams, userInfo]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const saveInvigilators = useCallback(
    async (profs) => {
      if (!userInfo?.Uno) return;
      if (!selectedExam?.Eno) return;
      try {
        const res = await fetch(`${API_BASE}/api/examarrange/invigilate/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uno: userInfo.Uno,
            eno: selectedExam.Eno,
            profPnos: profs.map((p) => p.Pno),
          }),
        });
        const json = await res.json();
        if (json.success) {
          const next = profs.filter((p) => json.profPnos.includes(p.Pno));
          setSelectedProfs(next);
        }
      } catch {
        setSelectedProfs(profs);
      }
    },
    [selectedExam?.Eno, userInfo]
  );

  const addProf = (prof) => {
    if (!prof?.Pno) return;
    if (selectedProfMap.has(prof.Pno)) return;
    const next = [...selectedProfs, { Pno: prof.Pno, Pname: prof.Pname }];
    setSelectedProfs(next);
    if (hasInitialInvigilatorsRef.current) {
      saveInvigilators(next);
    }
  };

  const removeProf = (pno) => {
    const next = selectedProfs.filter((p) => p.Pno !== pno);
    setSelectedProfs(next);
    if (hasInitialInvigilatorsRef.current) {
      saveInvigilators(next);
    }
  };

  const handleArrangeClick = async (arrangeId, clrmName) => {
    if (!userInfo?.Uno) return;
    if (!arrangeId) return;
    try {
      const res = await fetch(`${API_BASE}/api/examarrange/arrange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uno: userInfo.Uno, arrangeId }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedArrangeName(clrmName || '');
        await fetchExamDetails(selectedExam.Eno);
        await fetchStudents();
      }
    } catch {
      setSelectedArrangeName(clrmName || '');
    }
  };

  const studentColumns = useMemo(() => {
    return [
      { key: 'Sno', title: '学生编号', width: '30%' },
      {
        key: 'arranged',
        title: '安排状态',
        width: '20%',
        render: (row) => (row.arranged ? '是' : '否'),
      },
      {
        key: 'classroom',
        title: '教室名称',
        width: '30%',
        render: (row) => row.classroom || '无',
      },
      {
        key: 'seat',
        title: '座位号',
        width: '20%',
        render: (row) => (row.seat != null ? row.seat : '无'),
      },
    ];
  }, []);

  return (
    <MorePageLayout
      title="考试安排"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <div className="curricularapply-root">
        <div className="curricularapply-left">
          <div className="curricularapply-left-title">考试安排</div>
          <div className="examarrange-form">
            <div className="curricularapply-row small">
              <div className="curricularapply-cell" style={{ width: '100%' }}>
                <span className="curricularapply-label">考试编号：</span>
                <div className="editmessage-receiver" ref={examDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                  <div className="editmessage-receiver-control" onClick={() => setExamDropdownOpen((v) => !v)}>
                    <div className="editmessage-receiver-chips">
                      {selectedExam ? (
                        <div className="editmessage-chip">
                          <span className="editmessage-chip-text">{selectedExam.Eno}</span>
                          <button
                            type="button"
                            className="editmessage-chip-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedExam(null);
                              setExamQuery('');
                              setExamOptions([]);
                              setArranges([]);
                              setSelectedProfs([]);
                              setSelectedArrangeName('');
                              hasInitialInvigilatorsRef.current = false;
                              setStudents([]);
                              setStudentsTotal(0);
                            }}
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <span className="editmessage-receiver-placeholder">点击选择考试</span>
                      )}
                    </div>
                    <div className="editmessage-receiver-caret">▾</div>
                  </div>

                  {examDropdownOpen && (
                    <div className="editmessage-receiver-dropdown">
                      <input
                        className="editmessage-receiver-search"
                        value={examQuery}
                        onChange={(e) => setExamQuery(e.target.value)}
                        placeholder="输入 Eno 模糊搜索（至少5个字符）"
                      />
                      <div className="editmessage-receiver-options">
                        {examQuery.trim().length < 5 ? (
                          <div className="editmessage-receiver-hint">请输入至少5个字符</div>
                        ) : examOptions.length === 0 ? (
                          <div className="editmessage-receiver-hint">无匹配结果</div>
                        ) : (
                          examOptions.map((eitem) => (
                            <button
                              key={eitem.Eno}
                              type="button"
                              className={`editmessage-receiver-option ${selectedExam?.Eno === eitem.Eno ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedExam({
                                  Eno: eitem.Eno,
                                  Cno: eitem.Cno,
                                  Cname: eitem.Cname,
                                  Eattri: eitem.Eattri,
                                });
                                setExamDropdownOpen(false);
                              }}
                            >
                              <span className="uno">{eitem.Eno}</span>
                              <span className="urole">{eitem.Cname}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="curricularapply-row small">
              <div className="curricularapply-cell" style={{ width: '100%' }}>
                <span className="curricularapply-label">监考教师编号：</span>
                <div className="editmessage-receiver" ref={profDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                  <div className="editmessage-receiver-control" onClick={() => setProfDropdownOpen((v) => !v)}>
                    <div className="editmessage-receiver-chips">
                      {selectedProfs.map((p) => (
                        <div key={p.Pno} className="editmessage-chip">
                          <span className="editmessage-chip-text">{p.Pno}</span>
                          <button
                            type="button"
                            className="editmessage-chip-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeProf(p.Pno);
                            }}
                          >
                            X
                          </button>
                        </div>
                      ))}
                      {selectedProfs.length === 0 && <span className="editmessage-receiver-placeholder">点击选择教授</span>}
                    </div>
                    <div className="editmessage-receiver-caret">▾</div>
                  </div>

                  {profDropdownOpen && (
                    <div className="editmessage-receiver-dropdown">
                      <input
                        className="editmessage-receiver-search"
                        value={profQuery}
                        onChange={(e) => setProfQuery(e.target.value)}
                        placeholder="输入 Pno 或姓名模糊搜索（至少3个字符）"
                      />
                      <div className="editmessage-receiver-options">
                        {profQuery.trim().length < 3 ? (
                          <div className="editmessage-receiver-hint">请输入至少3个字符</div>
                        ) : profOptions.length === 0 ? (
                          <div className="editmessage-receiver-hint">无匹配结果</div>
                        ) : (
                          profOptions.map((p) => (
                            <button
                              key={p.Pno}
                              type="button"
                              className={`editmessage-receiver-option ${selectedProfMap.has(p.Pno) ? 'selected' : ''}`}
                              onClick={() => addProf(p)}
                            >
                              <span className="uno">{p.Pname}</span>
                              <span className="urole">{p.Pno}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="curricularapply-row small">
              <div className="curricularapply-cell" style={{ width: '100%' }}>
                <span className="curricularapply-label">教室名称：</span>
                <span className="examarrange-classroom-value">{selectedArrangeName || ''}</span>
              </div>
            </div>

            <div className="examarrange-arrange-container">
              <div className="examarrange-arrange-header">
                <span className="examarrange-arrange-title">教室安排情况</span>
              </div>
              <div className="examarrange-arrange-list">
                {arranges.length === 0 ? (
                  <div className="examarrange-arrange-empty">当前考试没有安排教室</div>
                ) : (
                  arranges.map((r) => (
                    <div key={r.ArrangeE_ID} className="examarrange-arrange-row">
                      <div className="examarrange-arrange-cell examarrange-arrange-room">{r.Clrmname}</div>
                      <div className="examarrange-arrange-cell examarrange-arrange-status">
                        {r.HasTake ? '√' : '×'}
                      </div>
                      <div className="examarrange-arrange-cell examarrange-arrange-action">
                        <button
                          type="button"
                          className="examarrange-arrange-btn"
                          onClick={() => handleArrangeClick(r.ArrangeE_ID, r.Clrmname)}
                        >
                          安排
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="curricularapply-right">
          <div className="curricularapply-right-top examarrange-right-top">
            <Table
              columns={studentColumns}
              data={students}
              total={studentsTotal}
              currentPage={studentsPage}
              pageSize={studentsPageSize}
              onPageChange={setStudentsPage}
              onPageSizeChange={setStudentsPageSize}
              onSearch={setStudentsSearchParams}
              onRefresh={fetchStudents}
              loading={studentsLoading}
            />
          </div>
        </div>
      </div>
    </MorePageLayout>
  );
};

export default Examarrange;
