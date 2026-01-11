import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import Details from '../../components/Details/Details';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Rubbishbox.css';

const Rubbishbox = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [receivedViewName, setReceivedViewName] = useState(null);
  const [sentViewName, setSentViewName] = useState(null);

  const [receivedData, setReceivedData] = useState([]);
  const [receivedTotal, setReceivedTotal] = useState(0);
  const [receivedPage, setReceivedPage] = useState(1);
  const [receivedPageSize, setReceivedPageSize] = useState(20);
  const [receivedLoading, setReceivedLoading] = useState(false);
  const [receivedSearchParams, setReceivedSearchParams] = useState({});

  const [sentData, setSentData] = useState([]);
  const [sentTotal, setSentTotal] = useState(0);
  const [sentPage, setSentPage] = useState(1);
  const [sentPageSize, setSentPageSize] = useState(20);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentSearchParams, setSentSearchParams] = useState({});

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSide, setDetailsSide] = useState(null);
  const [detailsRow, setDetailsRow] = useState(null);
  const [detailsMeta, setDetailsMeta] = useState(null);

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
    if (!userInfo) return;

    const initView = async () => {
      try {
        const res = await fetch('/api/rubbishbox/view/init', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          setReceivedViewName(json.receivedViewName);
          setSentViewName(json.sentViewName);
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
        fetch('/api/rubbishbox/view/cleanup', { method: 'POST' }).catch(console.error);
      }
    };
  }, [userInfo]);

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

  const truncate5 = (content) => {
    const text = content || '';
    return text.length > 5 ? text.substring(0, 5) + '...' : text;
  };

  const fetchReceived = useCallback(async () => {
    if (!receivedViewName) return;
    setReceivedLoading(true);
    try {
      const params = new URLSearchParams({
        tableName: receivedViewName,
        page: receivedPage,
        limit: receivedPageSize,
        ...Object.keys(receivedSearchParams).reduce((acc, key) => {
          acc[`search_${key}`] = receivedSearchParams[key];
          return acc;
        }, {})
      });

      const res = await fetch(`/api/common/table/list?${params}`);
      const json = await res.json();
      if (json.success) {
        setReceivedData(json.data);
        setReceivedTotal(json.pagination.total);
      }
    } catch (err) {
      console.error('Fetch received trash error:', err);
    } finally {
      setReceivedLoading(false);
    }
  }, [receivedViewName, receivedPage, receivedPageSize, receivedSearchParams]);

  const fetchSent = useCallback(async () => {
    if (!sentViewName) return;
    setSentLoading(true);
    try {
      const params = new URLSearchParams({
        tableName: sentViewName,
        page: sentPage,
        limit: sentPageSize,
        ...Object.keys(sentSearchParams).reduce((acc, key) => {
          acc[`search_${key}`] = sentSearchParams[key];
          return acc;
        }, {})
      });

      const res = await fetch(`/api/common/table/list?${params}`);
      const json = await res.json();
      if (json.success) {
        setSentData(json.data);
        setSentTotal(json.pagination.total);
      }
    } catch (err) {
      console.error('Fetch sent trash error:', err);
    } finally {
      setSentLoading(false);
    }
  }, [sentViewName, sentPage, sentPageSize, sentSearchParams]);

  useEffect(() => {
    fetchReceived();
  }, [fetchReceived]);

  useEffect(() => {
    fetchSent();
  }, [fetchSent]);

  const handleDetails = async (side, row) => {
    setDetailsSide(side);
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

  const handleRestore = async (side, row) => {
    if (!userInfo) return;
    try {
      const res = await fetch('/api/messages/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_no: row.Msg_no,
          type: side === 'sent' ? 'sent' : 'received'
        })
      });
      if (res.ok) {
        if (side === 'sent') fetchSent();
        else fetchReceived();
      }
    } catch (err) {
      console.error('Restore error:', err);
    }
  };

  const receivedColumns = [
    { key: 'SenderName', title: '发信人', width: '30%' },
    {
      key: 'Msg_content',
      title: '信件内容',
      render: (row) => truncate5(row.Msg_content)
    },
    {
      key: 'operations',
      title: '操作',
      width: '150px',
      render: (row) => (
        <div className="rubbishbox-operation-btns">
          <button className="rubbishbox-icon-btn" title="详情" onClick={() => handleDetails('received', row)}>
            <img src="/images/table/details.svg" alt="详情" />
          </button>
          <button className="rubbishbox-icon-btn" title="恢复" onClick={() => handleRestore('received', row)}>
            <img src="/images/table/refresh.svg" alt="恢复" />
          </button>
        </div>
      )
    }
  ];

  const sentColumns = [
    { key: 'ReceiverName', title: '收信人', width: '30%' },
    {
      key: 'Msg_content',
      title: '信件内容',
      render: (row) => truncate5(row.Msg_content)
    },
    {
      key: 'operations',
      title: '操作',
      width: '150px',
      render: (row) => (
        <div className="rubbishbox-operation-btns">
          <button className="rubbishbox-icon-btn" title="详情" onClick={() => handleDetails('sent', row)}>
            <img src="/images/table/details.svg" alt="详情" />
          </button>
          <button className="rubbishbox-icon-btn" title="恢复" onClick={() => handleRestore('sent', row)}>
            <img src="/images/table/refresh.svg" alt="恢复" />
          </button>
        </div>
      )
    }
  ];

  const detailsTitle =
    detailsSide === 'sent' ? (
      <div className="rubbishbox-details-title">
        <div className="rubbishbox-details-main">{detailsRow?.ReceiverName || ''}</div>
        <div className="rubbishbox-details-meta">
          <div className="rubbishbox-details-time">
            {detailsRow?.Receive_time ? formatDateTime(detailsRow.Receive_time) : ''}
          </div>
          <div className="rubbishbox-details-category">{detailsMeta?.Msg_category || ''}</div>
          <div className="rubbishbox-details-priority">{detailsMeta?.Msg_priority || ''}</div>
        </div>
      </div>
    ) : (
      <div className="rubbishbox-details-title">
        <div className="rubbishbox-details-main">{detailsRow?.SenderName || ''}</div>
        <div className="rubbishbox-details-meta">
          <div className="rubbishbox-details-time">
            {detailsRow?.Send_time ? formatDateTime(detailsRow.Send_time) : ''}
          </div>
          <div className="rubbishbox-details-category">{detailsMeta?.Msg_category || ''}</div>
          <div className="rubbishbox-details-priority">{detailsMeta?.Msg_priority || ''}</div>
        </div>
      </div>
    );

  return (
    <MorePageLayout
      title="垃圾箱"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <Details open={detailsOpen} title={detailsTitle} onClose={() => setDetailsOpen(false)}>
        <div className="rubbishbox-details-content">
          {detailsMeta?.Msg_content ?? detailsRow?.Msg_content ?? ''}
        </div>
      </Details>

      <div className="rubbishbox-container">
        <div className="rubbishbox-half">
          <Table
            columns={receivedColumns}
            data={receivedData}
            total={receivedTotal}
            currentPage={receivedPage}
            pageSize={receivedPageSize}
            onPageChange={setReceivedPage}
            onPageSizeChange={setReceivedPageSize}
            onSearch={setReceivedSearchParams}
            onRefresh={fetchReceived}
            loading={receivedLoading}
          />
        </div>
        <div className="rubbishbox-half">
          <Table
            columns={sentColumns}
            data={sentData}
            total={sentTotal}
            currentPage={sentPage}
            pageSize={sentPageSize}
            onPageChange={setSentPage}
            onPageSizeChange={setSentPageSize}
            onSearch={setSentSearchParams}
            onRefresh={fetchSent}
            loading={sentLoading}
          />
        </div>
      </div>
    </MorePageLayout>
  );
};

export default Rubbishbox;
