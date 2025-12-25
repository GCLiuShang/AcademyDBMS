import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import Details from '../../components/Details/Details';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Curricularapply.css';

const API_BASE = 'http://localhost:3001';

const SEMESTER_OPTIONS = [
  '第一学期',
  '第二学期',
  '第三学期',
  '第四学期',
  '第五学期',
  '第六学期',
  '第七学期',
  '第八学期',
  '第九学期',
  '第十学期',
  '第十一学期',
  '第十二学期',
  '第一和第二学期',
  '第三和第四学期',
  '第五和第六学期',
  '第七和第八学期',
  '第九和第十学期',
  '第十一和第十二学期',
  '奇数学期',
  '偶数学期',
  '任意学期',
];

const EATTRI_OPTIONS = ['无', '大作业', '线上', '线下开卷', '线下闭卷'];

const Curricularapply = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [accountInfo, setAccountInfo] = useState(null);

  const [businessFlags, setBusinessFlags] = useState(null);

  const [cattri, setCattri] = useState('');
  const [cseme, setCseme] = useState('');
  const [cname, setCname] = useState('');
  const [classhour, setClasshour] = useState('');
  const [ceattri, setCeattri] = useState('无');
  const [description, setDescription] = useState('');

  const [viewName, setViewName] = useState(null);
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

  useEffect(() => {
    const fetchBusinessFlags = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/business/status`);
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

  const deptValue = useMemo(() => {
    const role = userInfo?.Urole;
    if (!role || !accountInfo) return '';
    if (role === '教授') return accountInfo.Pdept || '';
    if (role === '学院教学办管理员' || role === '学院教学班管理员') return accountInfo.DAdept || '';
    return '';
  }, [userInfo?.Urole, accountInfo]);

  const attriOptions = useMemo(() => {
    const role = userInfo?.Urole;
    if (role === '教授') return ['通识选修', '个性课程'];
    if (role === '学院教学办管理员' || role === '学院教学班管理员') return ['公共必修', '专业必修', '专业选修'];
    return [];
  }, [userInfo?.Urole]);

  useEffect(() => {
    const fetchAccountInfo = async () => {
      if (!userInfo?.Uno) return;
      try {
        const res = await fetch(`http://localhost:3001/api/account/info?uno=${userInfo.Uno}`);
        const json = await res.json();
        if (json.success) setAccountInfo(json.data || null);
      } catch {
        setAccountInfo(null);
      }
    };
    fetchAccountInfo();
  }, [userInfo?.Uno]);

  const userInfoRef = useRef(userInfo);
  useEffect(() => {
    userInfoRef.current = userInfo;
  }, [userInfo]);

  useEffect(() => {
    if (!userInfo?.Uno) return;

    const initView = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/curricularapply/view/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno: userInfo.Uno }),
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
      fetch('http://localhost:3001/api/curricularapply/view/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uno: currentUser.Uno }),
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
        orderBy: 'CreateTime',
        orderDir: 'DESC',
        ...Object.keys(searchParams).reduce((acc, key) => {
          acc[`search_${key}`] = searchParams[key];
          return acc;
        }, {}),
      });

      const res = await fetch(`http://localhost:3001/api/common/table/list?${params.toString()}`);
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

  const canSend = useMemo(() => {
    if (!userInfo?.Uno) return false;
    if (businessFlags && !businessFlags.curricularOpen) return false;
    if (!deptValue) return false;
    if (!cattri) return false;
    if (!cseme) return false;
    if (!cname.trim()) return false;
    if (!classhour.trim()) return false;
    if (!ceattri) return false;
    const hourNum = Number(classhour);
    if (!Number.isFinite(hourNum) || hourNum <= 0) return false;
    if (cname.trim().length > 19) return false;
    if (description.length > 49) return false;
    if (!EATTRI_OPTIONS.includes(ceattri)) return false;
    return true;
  }, [businessFlags, userInfo?.Uno, deptValue, cattri, cseme, cname, classhour, ceattri, description]);

  const handleSend = async () => {
    if (!userInfo?.Uno) return;
    if (!canSend) return;

    try {
      const res = await fetch('http://localhost:3001/api/curricularapply/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uno: userInfo.Uno,
          cattri,
          cseme,
          cname: cname.trim(),
          classhour: Number(classhour),
          ceattri,
          description: description.trim().length === 0 ? null : description.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCattri('');
        setCseme('');
        setCname('');
        setClasshour('');
        setCeattri('无');
        setDescription('');
        setCurrentPage(1);
        fetchData();
      } else {
        alert(json.message || '发送失败');
      }
    } catch {
      alert('发送失败');
    }
  };

  const formatDateTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  };

  const handleDetails = useCallback((row) => {
    setDetailsRow(row);
    setDetailsOpen(true);
  }, []);

  const handleCancel = useCallback(async (row) => {
    if (!userInfo?.Uno) return;
    if (!row?.ApplyID) return;
    if (!window.confirm('确定删除该申请吗？')) return;
    try {
      const res = await fetch('http://localhost:3001/api/curricularapply/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uno: userInfo.Uno, applyId: row.ApplyID }),
      });
      const json = await res.json();
      if (json.success) {
        fetchData();
      } else {
        alert(json.message || '删除失败');
      }
    } catch {
      alert('删除失败');
    }
  }, [fetchData, userInfo?.Uno]);

  const columns = useMemo(() => {
    return [
      { key: 'Cname', title: '名称', width: '25%' },
      { key: 'Cno', title: '预编号', width: '25%' },
      { key: 'ApplyDate', title: '申请时间', width: '20%' },
      { key: 'Status', title: '状态', width: '15%' },
      {
        key: 'operations',
        title: '操作',
        width: '150px',
        render: (row) => (
          <div className="operation-btns">
            <button className="icon-btn" title="详情" onClick={() => handleDetails(row)}>
              <img src="/images/table/details.svg" alt="详情" />
            </button>
            {row?.Status === '等待审核' && (
              <button className="icon-btn" title="删除" onClick={() => handleCancel(row)}>
                <img src="/images/table/delete.svg" alt="删除" />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [handleCancel, handleDetails]);

  const detailsText = useMemo(() => {
    if (!detailsRow) return '';
    const lines = [
      `申请时间：${formatDateTime(detailsRow.CreateTime)}`,
      `开课学院：${detailsRow.Cdept || ''}`,
      `修读学期：${detailsRow.Cseme || ''}`,
      `课时：${detailsRow.Cclasshour ?? ''}`,
      `考核性质：${detailsRow.Ceattri ?? ''}`,
      `描述：${detailsRow.Description || ''}`,
    ];
    return lines.join('\n');
  }, [detailsRow]);

  return (
    <MorePageLayout
      title="开课申请"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <Details open={detailsOpen} title={detailsRow?.Cname || ''} onClose={() => setDetailsOpen(false)}>
        <div className="curricularapply-details-body">{detailsText}</div>
      </Details>

      <div className="curricularapply-root">
        <div className="curricularapply-left">
          <div className="curricularapply-left-title">开课申请</div>
          {businessFlags && !businessFlags.curricularOpen && (
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
              当前开课申请业务未开放，暂时无法发起新的申请。
            </div>
          )}
          <div className="curricularapply-form">
            <div className="curricularapply-row small">
              <div className="curricularapply-cell col">
                <span className="curricularapply-label">课程性质：</span>
                <select
                  className="curricularapply-select"
                  value={cattri}
                  onChange={(e) => setCattri(e.target.value)}
                >
                  <option value="">请选择</option>
                  {attriOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="curricularapply-cell col">
                <span className="curricularapply-label">开课学院：</span>
                <input className="curricularapply-input" value={deptValue} readOnly />
              </div>
              <div className="curricularapply-cell col">
                <span className="curricularapply-label">修读学期：</span>
                <select className="curricularapply-select" value={cseme} onChange={(e) => setCseme(e.target.value)}>
                  <option value="">请选择</option>
                  {SEMESTER_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="curricularapply-row small">
              <div className="curricularapply-cell" style={{ width: '100%' }}>
                <span className="curricularapply-label">课程名称：</span>
                <input
                  className="curricularapply-input"
                  value={cname}
                  onChange={(e) => setCname(e.target.value)}
                  maxLength={19}
                />
              </div>
            </div>

            <div className="curricularapply-row small">
              <div className="curricularapply-cell col">
                <span className="curricularapply-label">课时：</span>
                <input
                  className="curricularapply-input"
                  value={classhour}
                  onChange={(e) => setClasshour(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="curricularapply-cell col">
                <span className="curricularapply-label">考核性质：</span>
                <select className="curricularapply-select" value={ceattri} onChange={(e) => setCeattri(e.target.value)}>
                  {EATTRI_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="curricularapply-row large">
              <div className="curricularapply-cell curricularapply-cell-large" style={{ width: '100%', height: '100%' }}>
                <textarea
                  className="curricularapply-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={49}
                />
                <div className="curricularapply-textarea-count">{`${description.length}/49`}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="curricularapply-right">
          <div className="curricularapply-right-top">
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
          <div className="curricularapply-right-bottom">
            <button type="button" className="curricularapply-send" disabled={!canSend} onClick={handleSend}>
              发送申请
            </button>
          </div>
        </div>
      </div>
    </MorePageLayout>
  );
};

export default Curricularapply;
