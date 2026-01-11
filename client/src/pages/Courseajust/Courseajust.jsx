import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Courseajust.css';

const API_BASE = '';

const Courseajust = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);

  const [viewName, setViewName] = useState(null);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({});

  const userInfoRef = useRef(userInfo);

  useEffect(() => {
    const user = getCurrentUserFromStorage();
    if (user) {
      setUserInfo(user);
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
    if (!userInfo?.Uno) return;

    const initView = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/courseajust/view/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const json = await res.json();
        if (json.success && json.viewName) {
          setViewName(json.viewName);
        } else {
          setViewName(null);
        }
      } catch {
        setViewName(null);
      }
    };

    initView();

    return () => {
      const currentUser = userInfoRef.current;
      if (!currentUser?.Uno) return;
      fetch(`${API_BASE}/api/courseajust/view/cleanup`, {
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
        orderBy: 'ArrangeCo_date',
        orderDir: 'ASC',
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
      } else {
        setData([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchParams, viewName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReplace = useCallback(
    async (row) => {
      if (!userInfo?.Uno) return;
      if (!row?.ArrangeCo_Courno || !row?.ArrangeCo_classhour) return;
      const confirmed = window.confirm('您是否确认负责当前学时的任教？');
      if (!confirmed) return;
      try {
        const res = await fetch(`${API_BASE}/api/courseajust/replace`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courno: row.ArrangeCo_Courno,
            classhour: row.ArrangeCo_classhour,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          alert((json && json.message) || '替换失败');
          return;
        }
        fetchData();
      } catch {
        alert('替换失败');
      }
    },
    [fetchData, userInfo?.Uno]
  );

  const columns = useMemo(() => {
    const formatLessonTime = (row) => {
      const lnoRaw = row.ArrangeCo_Lno;
      const begin = row.Ltime_begin || row.LtimeBegin;
      const end = row.Ltime_end || row.LtimeEnd;
      const num = lnoRaw ? Number(lnoRaw) : NaN;
      const prefix = Number.isFinite(num) ? `第${num}节` : '';
      const time = begin && end ? `${begin} ~ ${end}` : '';
      if (prefix && time) return `${prefix}，${time}`;
      if (prefix) return prefix;
      if (time) return time;
      return '';
    };

    return [
      { key: 'Cname', title: '课程名称', width: '22%' },
      { key: 'ArrangeCo_classhour', title: '课时次序', width: '12%' },
      { key: 'ArrangeCo_date', title: '上课时间', width: '18%' },
      {
        key: 'LessonTime',
        title: '节次时间',
        width: '24%',
        render: (row) => formatLessonTime(row),
      },
      { key: 'Pname', title: '任教教授', width: '14%' },
      {
        key: 'operations',
        title: '操作',
        width: '150px',
        render: (row) => (
          <div className="operation-btns">
            <button className="icon-btn" title="替换" onClick={() => handleReplace(row)}>
              <img src="/images/table/replace.svg" alt="替换" />
            </button>
          </div>
        ),
      },
    ];
  }, [handleReplace]);

  return (
    <MorePageLayout
      title="任课调整"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <div className="courseajust-root">
        <Table
          columns={columns}
          data={data}
          total={total}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          onSearch={(params) => {
            setCurrentPage(1);
            setSearchParams(params);
          }}
          onRefresh={fetchData}
          loading={loading}
        />
      </div>
    </MorePageLayout>
  );
};

export default Courseajust;

