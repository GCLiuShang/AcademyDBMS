import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import Details from '../../components/Details/Details';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Receivebox.css';

const Receivebox = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [viewName, setViewName] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState(null);
  const [detailsMeta, setDetailsMeta] = useState(null);
  
  // Table state
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({});
  const [roleByUno, setRoleByUno] = useState({});

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

  // View Initialization and Cleanup
  // Use a ref to track if we need to cleanup (to avoid stale closures in cleanup function if needed, though simple logic here works)
  const userInfoRef = useRef(userInfo);
  useEffect(() => { userInfoRef.current = userInfo; }, [userInfo]);

  useEffect(() => {
    if (!userInfo) return;

    const initView = async () => {
      try {
        const res = await fetch('/api/receivebox/view/init', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          setViewName(json.viewName);
        } else {
          console.error('Failed to init view:', json.message);
        }
      } catch (err) {
        console.error('Error init view:', err);
      }
    };

    initView();

    return () => {
      const currentUserInfo = userInfoRef.current;
      if (currentUserInfo && currentUserInfo.Uno) {
          // Use sendBeacon for more reliable cleanup on unload, or fetch with keepalive (if supported)
          // But standard fetch is fine for component unmount
          fetch('/api/receivebox/view/cleanup', { method: 'POST' }).catch(console.error);
      }
    };
  }, [userInfo]); // Only re-run if Uno changes

  // Fetch Data
  const fetchData = useCallback(async () => {
    if (!viewName) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tableName: viewName,
        page: currentPage,
        limit: pageSize,
        ...Object.keys(searchParams).reduce((acc, key) => {
          acc[`search_${key}`] = searchParams[key];
          return acc;
        }, {})
      });

      const res = await fetch(`/api/common/table/list?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setTotal(json.pagination.total);
      }
    } catch (err) {
      console.error('Fetch data error:', err);
    } finally {
      setLoading(false);
    }
  }, [viewName, currentPage, pageSize, searchParams]);

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

  useEffect(() => {
    const unos = Array.from(
      new Set(
        (data || [])
          .map((row) => row?.Send_Uno)
          .filter((uno) => uno !== null && uno !== undefined && String(uno).trim().length > 0)
          .map((uno) => String(uno).trim())
      )
    );

    const missing = unos.filter((uno) => uno !== 'O000000000' && !roleByUno[uno]);
    if (missing.length === 0) return;

    let active = true;
    Promise.all(
      missing.map(async (uno) => {
        try {
          const params = new URLSearchParams({ q: String(uno), limit: '1' });
          const res = await fetch(`/api/users/search?${params.toString()}`);
          const json = await res.json();
          const row = Array.isArray(json?.data) ? json.data[0] : null;
          if (json?.success && row?.Urole) return [uno, row.Urole];
        } catch {
          return null;
        }
        return null;
      })
    ).then((pairs) => {
      if (!active) return;
      const resolved = (pairs || []).filter(Boolean);
      if (resolved.length === 0) return;

      setRoleByUno((prev) => {
        const next = { ...prev };
        for (const [uno, role] of resolved) {
          if (!next[uno] && role) next[uno] = role;
        }
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [data, roleByUno]);

  const getRoleText = (uno) => {
    const normalized = uno === null || uno === undefined ? '' : String(uno).trim();
    if (!normalized) return '';
    if (normalized === 'O000000000') return '系统';
    return roleByUno[normalized] || '';
  };

  const handleDetails = async (row) => {
    setDetailsRow(row);
    setDetailsMeta(null);
    setDetailsOpen(true);

    try {
      const params = new URLSearchParams({
        tableName: 'Message',
        page: 1,
        limit: 1,
        search_Msg_no: row.Msg_no,
      });
      const res = await fetch(`/api/common/table/list?${params.toString()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setDetailsMeta(json.data[0]);
      }
    } catch (err) {
      console.error('Fetch message meta error:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (row) => {
    if (!window.confirm('确定删除该消息吗？')) return;
    try {
      const res = await fetch('/api/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_no: row.Msg_no, type: 'received' })
      });
      if (res.ok) {
        fetchData(); // Refresh
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const columns = [
    { key: 'SenderName', title: '发信人', width: '18%' },
    {
      key: 'Send_Uno',
      title: '身份',
      width: '12%',
      render: (row) => getRoleText(row.Send_Uno)
    },
    { key: 'Send_time_Formatted', title: '发信时间', width: '25%' },
    { 
      key: 'Msg_content', 
      title: '信件内容', 
      render: (row) => {
        const content = row.Msg_content || '';
        return content.length > 10 ? content.substring(0, 10) + '...' : content;
      }
    },
    {
      key: 'operations',
      title: '操作',
      width: '150px',
      render: (row) => (
        <div className="operation-btns">
           <button className="icon-btn" title="详情" onClick={() => handleDetails(row)}>
             <img src="/images/table/details.svg" alt="详情" />
           </button>
           <button className="icon-btn" title="删除" onClick={() => handleDelete(row)}>
             <img src="/images/table/delete.svg" alt="删除" />
           </button>
        </div>
      )
    }
  ];

  return (
    <MorePageLayout
      title="收信箱"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
       <Details
         open={detailsOpen}
         title={
           <div className="receivebox-details-title">
             <div className="receivebox-details-sender">{detailsRow?.SenderName || ''}</div>
             <div className="receivebox-details-meta">
               <div className="receivebox-details-time">
                 {detailsRow?.Send_time ? formatDateTime(detailsRow.Send_time) : ''}
               </div>
               <div className="receivebox-details-category">{detailsMeta?.Msg_category || ''}</div>
               <div className="receivebox-details-priority">{detailsMeta?.Msg_priority || ''}</div>
             </div>
           </div>
         }
         onClose={() => setDetailsOpen(false)}
       >
         <div className="receivebox-details-content">
           {detailsMeta?.Msg_content ?? detailsRow?.Msg_content ?? ''}
         </div>
       </Details>
       <div className="receivebox-container">
          <div className="receivebox-left">
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
          <div className="receivebox-right">
             <div className="trash-bin">
                <div className="trash-icon">
                   <img src="/images/dashboard/rubbish.svg" alt="Trash" />
                </div>
                <div className="trash-text">垃圾箱</div>
                <div className="trash-arrow" onClick={() => navigate('/rubbishbox')}>
                   <img src="/images/dashboard/more.svg" alt="Enter" />
                </div>
             </div>
             <div className="trash-bin">
                <div className="trash-icon">
                   <img src="/images/dashboard/editmsg.svg" alt="Edit" />
                </div>
                <div className="trash-text">发信息</div>
                <div className="trash-arrow" onClick={() => navigate('/editmessage')}>
                   <img src="/images/dashboard/more.svg" alt="Enter" />
                </div>
             </div>
          </div>
       </div>
    </MorePageLayout>
  );
};

export default Receivebox;
