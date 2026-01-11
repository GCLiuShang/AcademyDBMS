import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Useradd.css';

const API_BASE = '';

const USER_TYPES = [
  { key: 'student', label: '学生' },
  { key: 'professor', label: '教授' },
  { key: 'deptadm', label: '教学办' },
  { key: 'univadm', label: '教务处' },
];

const SEX_OPTIONS = ['男', '女'];

const TITLE_OPTIONS = ['教授', '副教授', '讲师', '研究员'];

const Useradd = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);

  const [selectedTypeKey, setSelectedTypeKey] = useState('student');

  const [name, setName] = useState('');
  const [sex, setSex] = useState('');
  const [year, setYear] = useState('');
  const [dept, setDept] = useState(null);
  const [dom, setDom] = useState(null);
  const [className, setClassName] = useState(null);
  const [title, setTitle] = useState('');
  const [office, setOffice] = useState('');
  const [password, setPassword] = useState('');

  const [deptOptions, setDeptOptions] = useState([]);
  const [domOptions, setDomOptions] = useState([]);
  const [classOptions, setClassOptions] = useState([]);

  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [domDropdownOpen, setDomDropdownOpen] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);

  const [deptQuery, setDeptQuery] = useState('');
  const [domQuery, setDomQuery] = useState('');
  const [classQuery, setClassQuery] = useState('');

  const deptDropdownRef = useRef(null);
  const domDropdownRef = useRef(null);
  const classDropdownRef = useRef(null);

  const [viewName] = useState('User');
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({});

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
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target)) setDeptDropdownOpen(false);
      if (domDropdownRef.current && !domDropdownRef.current.contains(e.target)) setDomDropdownOpen(false);
      if (classDropdownRef.current && !classDropdownRef.current.contains(e.target)) setClassDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const params = new URLSearchParams({
          tableName: 'Department',
          page: 1,
          limit: 200,
          orderBy: 'Dept_no',
          orderDir: 'ASC',
        });
        const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
        const json = await res.json();
        if (json.success) {
          const rows = Array.isArray(json.data) ? json.data : [];
          setDeptOptions(rows.filter((r) => r.Dept_status === '正常'));
        } else {
          setDeptOptions([]);
        }
      } catch {
        setDeptOptions([]);
      }
    };
    fetchDepartments();
  }, []);

  useEffect(() => {
    setDom(null);
    setClassName(null);
    setDomOptions([]);
    setClassOptions([]);
    setDomQuery('');
    setClassQuery('');
    if (!dept?.Dept_no) return;

    const fetchDomains = async () => {
      try {
        const params = new URLSearchParams({
          tableName: 'Domain',
          page: 1,
          limit: 200,
          orderBy: 'Dom_no',
          orderDir: 'ASC',
          search_Dom_dept: dept.Dept_no,
        });
        const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
        const json = await res.json();
        if (json.success) {
          const rows = Array.isArray(json.data) ? json.data : [];
          setDomOptions(rows.filter((r) => r.Dom_status === '正常'));
        } else {
          setDomOptions([]);
        }
      } catch {
        setDomOptions([]);
      }
    };
    fetchDomains();
  }, [dept?.Dept_no]);

  useEffect(() => {
    setClassName(null);
    setClassOptions([]);
    setClassQuery('');
    if (!dom?.Dom_no) return;

    const fetchClasses = async () => {
      try {
        const params = new URLSearchParams({
          tableName: 'Class',
          page: 1,
          limit: 200,
          orderBy: 'Class_name',
          orderDir: 'ASC',
          search_Class_dom: dom.Dom_no,
        });
        const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
        const json = await res.json();
        if (json.success) {
          const rows = Array.isArray(json.data) ? json.data : [];
          setClassOptions(rows.filter((r) => r.Class_status === '正常'));
        } else {
          setClassOptions([]);
        }
      } catch {
        setClassOptions([]);
      }
    };
    fetchClasses();
  }, [dom?.Dom_no]);

  const fetchData = useCallback(async () => {
    if (!viewName) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tableName: viewName,
        page: currentPage,
        limit: pageSize,
        orderBy: 'Utime',
        orderDir: 'DESC',
        ...Object.keys(searchParams).reduce((acc, key) => {
          acc[`search_${key}`] = searchParams[key];
          return acc;
        }, {}),
      });
      const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setTotal(json.pagination?.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchParams, viewName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedTypeKey === 'student') {
      setPassword('student123');
    } else if (selectedTypeKey === 'professor') {
      setPassword('professor123');
    } else if (selectedTypeKey === 'deptadm') {
      setPassword('deptadm123');
    } else if (selectedTypeKey === 'univadm') {
      setPassword('univadm123');
    } else {
      setPassword('');
    }
  }, [selectedTypeKey]);

  const handleTypeClick = (key) => {
    if (key === selectedTypeKey) return;
    setSelectedTypeKey(key);
    setSex('');
    setTitle('');
    setOffice('');
  };

  const filteredDeptOptions = useMemo(() => {
    const q = deptQuery.trim();
    if (!q) return deptOptions;
    return deptOptions.filter((d) => {
      const code = d.Dept_no ? String(d.Dept_no) : '';
      const nameText = d.Dept_name ? String(d.Dept_name) : '';
      return code.includes(q) || nameText.includes(q);
    });
  }, [deptOptions, deptQuery]);

  const filteredDomOptions = useMemo(() => {
    const q = domQuery.trim();
    if (!q) return domOptions;
    return domOptions.filter((d) => {
      const code = d.Dom_no ? String(d.Dom_no) : '';
      const nameText = d.Dom_name ? String(d.Dom_name) : '';
      return code.includes(q) || nameText.includes(q);
    });
  }, [domOptions, domQuery]);

  const filteredClassOptions = useMemo(() => {
    const q = classQuery.trim();
    if (!q) return classOptions;
    return classOptions.filter((c) => {
      const nameText = c.Class_name ? String(c.Class_name) : '';
      return nameText.includes(q);
    });
  }, [classOptions, classQuery]);

  const canSubmit = useMemo(() => {
    if (!userInfo?.Uno) return false;
    if (!name.trim()) return false;
    if (!year.trim()) return false;
    if (!/^[0-9]{4}$/.test(year.trim())) return false;
    if (!password.trim()) return false;

    if (selectedTypeKey === 'student') {
      if (!sex) return false;
      return true;
    }

    if (selectedTypeKey === 'professor') {
      if (!sex) return false;
      if (!title) return false;
      return true;
    }

    if (selectedTypeKey === 'deptadm') {
      if (!dept?.Dept_no) return false;
      return true;
    }

    if (selectedTypeKey === 'univadm') {
      return true;
    }

    return false;
  }, [dept?.Dept_no, name, password, selectedTypeKey, sex, title, userInfo?.Uno, year]);

  const handleSubmit = async () => {
    if (!canSubmit || !userInfo?.Uno) return;

    const payload = {
      userType: selectedTypeKey,
      name: name.trim(),
      sex: sex || null,
      year: year.trim(),
      deptNo: dept?.Dept_no || null,
      domNo: dom?.Dom_no || null,
      className: className?.Class_name || null,
      title: title || null,
      office: office.trim() || null,
      password: password,
    };

    try {
      const res = await fetch(`${API_BASE}/api/useradd/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        alert(json?.message || '新增用户失败');
        return;
      }

      setName('');
      setSex('');
      setYear('');
      setDept(null);
      setDom(null);
      setClassName(null);
      setTitle('');
      setOffice('');
      setSearchParams({});
      setCurrentPage(1);
      fetchData();
      if (json.uno) {
        alert(`新增用户成功，编号为 ${json.uno}`);
      } else {
        alert('新增用户成功');
      }
    } catch {
      alert('新增用户失败');
    }
  };

  const columns = useMemo(() => {
    return [
      { key: 'Uno', title: '用户编号', width: '34%' },
      { key: 'Ustatus', title: '用户状态', width: '22%' },
      { key: 'Utime', title: '注册时间', width: '44%' },
    ];
  }, []);

  const currentTypeLabel = useMemo(() => {
    const found = USER_TYPES.find((t) => t.key === selectedTypeKey);
    return found ? found.label : '';
  }, [selectedTypeKey]);

  return (
    <MorePageLayout
      title="用户新增"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <div className="useradd-root">
        <div className="useradd-left">
          <div className="useradd-left-title">用户新增</div>
          <div className="useradd-form" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
            <div className="useradd-row small">
              <div className="useradd-cell" style={{ width: '100%' }}>
                {USER_TYPES.map((t) => {
                  const active = t.key === selectedTypeKey;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`useradd-type-btn ${active ? 'active' : ''}`}
                      onClick={() => handleTypeClick(t.key)}
                    >
                      <span className="useradd-type-text">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="useradd-row small">
              <div className="useradd-cell" style={{ width: '100%' }}>
                <span className="useradd-label">姓名：</span>
                <input
                  className="useradd-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                />
              </div>
            </div>

            <div className="useradd-row small">
              <div className="useradd-cell" style={{ width: '100%' }}>
                <span className="useradd-label">性别：</span>
                <select
                  className="useradd-select"
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                >
                  <option value="">请选择</option>
                  {SEX_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="useradd-row small">
              <div className="useradd-cell" style={{ width: '100%' }}>
                <span className="useradd-label">入校年份：</span>
                <input
                  className="useradd-input"
                  value={year}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    if (digits.length > 4) {
                      setYear(digits.slice(0, 4));
                    } else {
                      setYear(digits);
                    }
                  }}
                  maxLength={4}
                />
              </div>
            </div>

            <div className="useradd-row small">
              <div className="useradd-cell" style={{ width: '100%' }}>
                <span className="useradd-label">所属学院：</span>
                <div className="editmessage-receiver" ref={deptDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                  <div className="editmessage-receiver-control" onClick={() => setDeptDropdownOpen((v) => !v)}>
                    <div className="editmessage-receiver-chips">
                      {dept ? (
                        <div className="editmessage-chip">
                          <span className="editmessage-chip-text">{dept.Dept_no}</span>
                        </div>
                      ) : (
                        <span className="editmessage-receiver-placeholder">点击选择学院</span>
                      )}
                    </div>
                    <div className="editmessage-receiver-caret">▾</div>
                  </div>

                  {deptDropdownOpen && (
                    <div className="editmessage-receiver-dropdown">
                      <input
                        className="editmessage-receiver-search"
                        value={deptQuery}
                        onChange={(e) => setDeptQuery(e.target.value)}
                        placeholder="输入学院编号或名称模糊搜索"
                      />
                      <div className="editmessage-receiver-options">
                        {filteredDeptOptions.length === 0 ? (
                          <div className="editmessage-receiver-hint">无匹配结果</div>
                        ) : (
                          filteredDeptOptions.map((d) => (
                            <button
                              key={d.Dept_no}
                              type="button"
                              className={`editmessage-receiver-option ${dept?.Dept_no === d.Dept_no ? 'selected' : ''}`}
                              onClick={() => {
                                setDept(d);
                                setDeptDropdownOpen(false);
                              }}
                            >
                              <span className="uno">{d.Dept_no}</span>
                              <span className="urole">{d.Dept_name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedTypeKey === 'student' && (
              <>
                <div className="useradd-row small">
                  <div className="useradd-cell" style={{ width: '100%' }}>
                    <span className="useradd-label">专业：</span>
                    <div className="editmessage-receiver" ref={domDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                      <div className="editmessage-receiver-control" onClick={() => setDomDropdownOpen((v) => !v)}>
                        <div className="editmessage-receiver-chips">
                          {dom ? (
                            <div className="editmessage-chip">
                              <span className="editmessage-chip-text">{dom.Dom_no}</span>
                            </div>
                          ) : (
                            <span className="editmessage-receiver-placeholder">
                              {dept?.Dept_no ? '点击选择专业' : '请先选择学院'}
                            </span>
                          )}
                        </div>
                        <div className="editmessage-receiver-caret">▾</div>
                      </div>

                      {domDropdownOpen && (
                        <div className="editmessage-receiver-dropdown">
                          <input
                            className="editmessage-receiver-search"
                            value={domQuery}
                            onChange={(e) => setDomQuery(e.target.value)}
                            placeholder="输入专业编号或名称模糊搜索"
                          />
                          <div className="editmessage-receiver-options">
                            {!dept?.Dept_no ? (
                              <div className="editmessage-receiver-hint">请先选择学院</div>
                            ) : filteredDomOptions.length === 0 ? (
                              <div className="editmessage-receiver-hint">无匹配结果</div>
                            ) : (
                              filteredDomOptions.map((d) => (
                                <button
                                  key={d.Dom_no}
                                  type="button"
                                  className={`editmessage-receiver-option ${dom?.Dom_no === d.Dom_no ? 'selected' : ''}`}
                                  onClick={() => {
                                    setDom(d);
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

                <div className="useradd-row small">
                  <div className="useradd-cell" style={{ width: '100%' }}>
                    <span className="useradd-label">班级：</span>
                    <div className="editmessage-receiver" ref={classDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                      <div className="editmessage-receiver-control" onClick={() => setClassDropdownOpen((v) => !v)}>
                        <div className="editmessage-receiver-chips">
                          {className ? (
                            <div className="editmessage-chip">
                              <span className="editmessage-chip-text">{className.Class_name}</span>
                            </div>
                          ) : (
                            <span className="editmessage-receiver-placeholder">
                              {dom?.Dom_no ? '点击选择班级' : '请先选择专业'}
                            </span>
                          )}
                        </div>
                        <div className="editmessage-receiver-caret">▾</div>
                      </div>

                      {classDropdownOpen && (
                        <div className="editmessage-receiver-dropdown">
                          <input
                            className="editmessage-receiver-search"
                            value={classQuery}
                            onChange={(e) => setClassQuery(e.target.value)}
                            placeholder="输入班级名称模糊搜索"
                          />
                          <div className="editmessage-receiver-options">
                            {!dom?.Dom_no ? (
                              <div className="editmessage-receiver-hint">请先选择专业</div>
                            ) : filteredClassOptions.length === 0 ? (
                              <div className="editmessage-receiver-hint">无匹配结果</div>
                            ) : (
                              filteredClassOptions.map((c) => (
                                <button
                                  key={c.Class_name}
                                  type="button"
                                  className={`editmessage-receiver-option ${
                                    className?.Class_name === c.Class_name ? 'selected' : ''
                                  }`}
                                  onClick={() => {
                                    setClassName(c);
                                    setClassDropdownOpen(false);
                                  }}
                                >
                                  <span className="uno">{c.Class_name}</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="useradd-row small">
                  <div className="useradd-cell" style={{ width: '100%' }}>
                    <span className="useradd-label">初始密码：</span>
                    <input
                      className="useradd-input"
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value.slice(0, 20))}
                      maxLength={20}
                    />
                  </div>
                </div>
              </>
            )}

            {selectedTypeKey === 'professor' && (
              <>
                <div className="useradd-row small">
                  <div className="useradd-cell" style={{ width: '100%' }}>
                    <span className="useradd-label">职称：</span>
                    <select
                      className="useradd-select"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    >
                      <option value="">请选择</option>
                      {TITLE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="useradd-row small">
                  <div className="useradd-cell" style={{ width: '100%' }}>
                    <span className="useradd-label">办公室：</span>
                    <input
                      className="useradd-input"
                      value={office}
                      onChange={(e) => setOffice(e.target.value.slice(0, 9))}
                      maxLength={9}
                    />
                  </div>
                </div>

                <div className="useradd-row small">
                  <div className="useradd-cell" style={{ width: '100%' }}>
                    <span className="useradd-label">初始密码：</span>
                    <input
                      className="useradd-input"
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value.slice(0, 20))}
                      maxLength={20}
                    />
                  </div>
                </div>
              </>
            )}

            {selectedTypeKey === 'deptadm' && (
              <div className="useradd-row small">
                <div className="useradd-cell" style={{ width: '100%' }}>
                  <span className="useradd-label">初始密码：</span>
                  <input
                    className="useradd-input"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.slice(0, 20))}
                    maxLength={20}
                  />
                </div>
              </div>
            )}

            {selectedTypeKey === 'univadm' && (
              <div className="useradd-row small">
                <div className="useradd-cell" style={{ width: '100%' }}>
                  <span className="useradd-label">初始密码：</span>
                  <input
                    className="useradd-input"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.slice(0, 20))}
                    maxLength={20}
                  />
                </div>
              </div>
            )}

            <div className="useradd-footer">
              <span className="useradd-hint">当前新增用户类型：{currentTypeLabel}</span>
            </div>
          </div>
        </div>

        <div className="useradd-right">
          <div className="useradd-right-top">
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
          <div className="useradd-right-bottom">
            <button
              type="button"
              className="useradd-submit"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              确认加入
            </button>
          </div>
        </div>
      </div>
    </MorePageLayout>
  );
};

export default Useradd;

