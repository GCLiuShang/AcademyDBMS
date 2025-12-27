import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import Details from '../../components/Details/Details';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Curricularapprove.css';

const Curricularapprove = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);

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

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  const userInfoRef = useRef(userInfo);
  useEffect(() => {
    userInfoRef.current = userInfo;
  }, [userInfo]);

  useEffect(() => {
    if (!userInfo?.Uno) return;

    const initView = async () => {
      try {
        const res = await fetch('/api/curricularapprove/view/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno: userInfo.Uno }),
        });
        const json = await res.json();
        if (json.success) setViewName(json.viewName);
        else setViewName(null);
      } catch {
        setViewName(null);
      }
    };

    initView();

    return () => {
      const currentUser = userInfoRef.current;
      if (!currentUser?.Uno) return;
      fetch('/api/curricularapprove/view/cleanup', {
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

      const res = await fetch(`/api/common/table/list?${params.toString()}`);
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

  const handleDetails = useCallback((row) => {
    setDetailsRow(row);
    setDetailsOpen(true);
  }, []);

  const handlePass = useCallback(
    async (row) => {
      if (!userInfo?.Uno) return;
      if (!row?.ApplyID) return;
      if (!window.confirm('确定通过该申请吗？')) return;
      try {
        const res = await fetch('/api/curricularapprove/pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uno: userInfo.Uno, applyId: row.ApplyID }),
        });
        const json = await res.json();
        if (json.success) {
          fetchData();
        } else {
          alert(json.message || '通过失败');
        }
      } catch {
        alert('通过失败');
      }
    },
    [fetchData, userInfo?.Uno]
  );

  const columns = useMemo(() => {
    return [
      { key: 'Cname', title: '课程名称', width: '22%' },
      { key: 'Cattri', title: '课程性质', width: '15%' },
      { key: 'Applicant', title: '申请方', width: '15%' },
      { key: 'Cno', title: '预编号', width: '18%' },
      { key: 'ApplyTime', title: '申请时间', width: '20%' },
      {
        key: 'operations',
        title: '操作',
        width: '150px',
        render: (row) => (
          <div className="operation-btns">
            <button className="icon-btn" title="详情" onClick={() => handleDetails(row)}>
              <img src="/images/table/details.svg" alt="详情" />
            </button>
            <button className="icon-btn" title="通过" onClick={() => handlePass(row)}>
              <img src="/images/table/pass.svg" alt="通过" />
            </button>
          </div>
        ),
      },
    ];
  }, [handleDetails, handlePass]);

  const detailsTitle = detailsRow?.Cname || '';
  const detailsBody = useMemo(() => {
    if (!detailsRow) return '';
    const lines = [
      `申请时间：${detailsRow.ApplyTime ?? ''}`,
      `学分：${detailsRow.Ccredit ?? ''}`,
      `开课学院：${detailsRow.Cdept ?? ''}`,
      `修读学期：${detailsRow.Cseme ?? ''}`,
      `课时：${detailsRow.Cclasshour ?? ''}`,
      `考核性质：${detailsRow.Ceattri ?? ''}`,
      `描述：${detailsRow.Description ?? ''}`,
    ];
    return lines.join('\n');
  }, [detailsRow]);

  return (
    <MorePageLayout
      title="开课审批"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <div className="curricularapprove-root">
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

      <Details open={detailsOpen} title={detailsTitle} onClose={() => setDetailsOpen(false)}>
        <div className="curricularapprove-details-body">{detailsBody}</div>
      </Details>
    </MorePageLayout>
  );
};

export default Curricularapprove;
