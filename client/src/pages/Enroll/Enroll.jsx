import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import Details from '../../components/Details/Details';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Enroll.css';

const API_BASE = '';

const Enroll = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);

  const [businessFlags, setBusinessFlags] = useState(null);

  const [leftData, setLeftData] = useState([]);
  const [leftTotal, setLeftTotal] = useState(0);
  const [leftPage, setLeftPage] = useState(1);
  const [leftPageSize, setLeftPageSize] = useState(20);
  const [leftLoading, setLeftLoading] = useState(false);
  const [leftSearch, setLeftSearch] = useState({});

  const [rightData, setRightData] = useState([]);
  const [rightTotal, setRightTotal] = useState(0);
  const [rightPage, setRightPage] = useState(1);
  const [rightPageSize, setRightPageSize] = useState(20);
  const [rightLoading, setRightLoading] = useState(false);
  const [rightSearch, setRightSearch] = useState({});

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

  const fetchLeftData = useCallback(async () => {
    if (!userInfo?.Uno) return;
    setLeftLoading(true);
    try {
      const body = {
        uno: userInfo.Uno,
        page: leftPage,
        limit: leftPageSize,
      };
      if (leftSearch.Cname) body.searchName = leftSearch.Cname;
      const res = await fetch(`${API_BASE}/api/enroll/available`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setLeftData([]);
        setLeftTotal(0);
        return;
      }
      const rows = Array.isArray(json.data) ? json.data : [];
      const mapped = rows.map((r) => {
        const current = Number(r.currentCount || 0);
        const max = Number(r.maxCount || 0);
        const isFull = Number.isFinite(current) && Number.isFinite(max) && current >= max && max > 0;
        const creditValue = r.courseCredit;
        return {
          courNo: r.courNo || '',
          cno: r.cno || '',
          courseName: r.courseName || '',
          courseAttr: r.courseAttr || '',
          credit: creditValue === null || creditValue === undefined ? '' : String(creditValue),
          professors: r.professors || '',
          locations: r.locations || '',
          timeSummary: r.timeSummary || '',
          timeFull: r.timeFull || '',
          currentCount: current,
          maxCount: max,
          currentDisplay: max > 0 ? `${current}/${max}` : `${current}/-`,
          inPlanLabel: r.inPlan ? '是' : '否',
          isFull,
        };
      });
      setLeftData(mapped);
      setLeftTotal(Number(json.total || 0));
    } catch {
      setLeftData([]);
      setLeftTotal(0);
    } finally {
      setLeftLoading(false);
    }
  }, [leftPage, leftPageSize, leftSearch, userInfo?.Uno]);

  const fetchRightData = useCallback(async () => {
    if (!userInfo?.Uno) return;
    setRightLoading(true);
    try {
      const body = {
        uno: userInfo.Uno,
        page: rightPage,
        limit: rightPageSize,
      };
      if (rightSearch.Cname) body.searchName = rightSearch.Cname;
      const res = await fetch(`${API_BASE}/api/enroll/selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setRightData([]);
        setRightTotal(0);
        return;
      }
      const rows = Array.isArray(json.data) ? json.data : [];
      const mapped = rows.map((r) => {
        const current = Number(r.currentCount || 0);
        const max = Number(r.maxCount || 0);
        const creditValue = r.courseCredit;
        return {
          courNo: r.courNo || '',
          cno: r.cno || '',
          courseName: r.courseName || '',
          courseAttr: r.courseAttr || '',
          credit: creditValue === null || creditValue === undefined ? '' : String(creditValue),
          professors: r.professors || '',
          timeFull: r.timeFull || '',
          currentCount: current,
          maxCount: max,
          currentDisplay: max > 0 ? `${current}/${max}` : `${current}/-`,
        };
      });
      setRightData(mapped);
      setRightTotal(Number(json.total || 0));
    } catch {
      setRightData([]);
      setRightTotal(0);
    } finally {
      setRightLoading(false);
    }
  }, [rightPage, rightPageSize, rightSearch, userInfo?.Uno]);

  useEffect(() => {
    fetchLeftData();
  }, [fetchLeftData]);

  useEffect(() => {
    fetchRightData();
  }, [fetchRightData]);

  const handleDetails = useCallback((row) => {
    setDetailsRow(row);
    setDetailsOpen(true);
  }, []);

  const handleSelect = useCallback(
    async (row) => {
      if (!userInfo?.Uno) return;
      if (!row?.courNo) return;
      if (businessFlags && !businessFlags.enrollOpen) {
        alert('当前学生选课业务未开放');
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/enroll/select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uno: userInfo.Uno,
            courno: row.courNo,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          alert((json && json.message) || '选课失败');
          return;
        }
        fetchLeftData();
        fetchRightData();
      } catch {
        alert('选课失败');
      }
    },
    [businessFlags, fetchLeftData, fetchRightData, userInfo?.Uno]
  );

  const handleDelete = useCallback(
    async (row) => {
      if (!userInfo?.Uno) return;
      if (!row?.courNo) return;
      if (businessFlags && !businessFlags.enrollOpen) {
        alert('当前学生选课业务未开放');
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/enroll/drop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uno: userInfo.Uno,
            courno: row.courNo,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          alert((json && json.message) || '退课失败');
          return;
        }
        fetchLeftData();
        fetchRightData();
      } catch {
        alert('退课失败');
      }
    },
    [businessFlags, fetchLeftData, fetchRightData, userInfo?.Uno]
  );

  const leftColumns = useMemo(() => {
    return [
      { key: 'courseName', title: '名称', width: '16%' },
      { key: 'courseAttr', title: '性质', width: '10%' },
      { key: 'credit', title: '学分', width: '8%' },
      { key: 'professors', title: '教授', width: '16%' },
      { key: 'locations', title: '地点', width: '16%' },
      { key: 'timeSummary', title: '时间', width: '16%' },
      { key: 'currentDisplay', title: '人数', width: '8%' },
      { key: 'inPlanLabel', title: '是否在方案中', width: '10%' },
      {
        key: 'operations',
        title: '操作',
        width: '150px',
        render: (row) => (
          <div className="operation-btns">
            <button className="icon-btn" type="button" title="详情" onClick={() => handleDetails(row)}>
              <img src="/images/table/details.svg" alt="详情" />
            </button>
            {!row.isFull && (!businessFlags || businessFlags.enrollOpen) && (
              <button className="icon-btn" type="button" title="选择" onClick={() => handleSelect(row)}>
                <img src="/images/table/pass.svg" alt="选择" />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [businessFlags, handleDetails, handleSelect]);

  const rightColumns = useMemo(() => {
    return [
      { key: 'courseName', title: '名称', width: '22%' },
      { key: 'courseAttr', title: '性质', width: '12%' },
      { key: 'credit', title: '学分', width: '10%' },
      { key: 'professors', title: '教授', width: '18%' },
      { key: 'currentDisplay', title: '人数', width: '26%' },
      {
        key: 'operations',
        title: '操作',
        width: '150px',
        render: (row) => (
          <div className="operation-btns">
            <button className="icon-btn" type="button" title="详情" onClick={() => handleDetails(row)}>
              <img src="/images/table/details.svg" alt="详情" />
            </button>
            {(!businessFlags || businessFlags.enrollOpen) && (
              <button className="icon-btn" type="button" title="删除" onClick={() => handleDelete(row)}>
                <img src="/images/table/delete.svg" alt="删除" />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [businessFlags, handleDelete, handleDetails]);

  const detailsTitle = useMemo(() => {
    if (!detailsRow) return '';
    return detailsRow.courseName || '';
  }, [detailsRow]);

  const detailsBody = useMemo(() => {
    if (!detailsRow) return '';
    const lines = [
      `课编号：${detailsRow.courNo || ''}`,
      `课程性质：${detailsRow.courseAttr || ''}`,
      `任课教授：${detailsRow.professors || ''}`,
      `上课地点：${detailsRow.locations || ''}`,
      `上课时间：${detailsRow.timeFull || detailsRow.timeSummary || ''}`,
    ];
    return lines.join('\n');
  }, [detailsRow]);

  return (
    <MorePageLayout
      title="选择课程"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <Details open={detailsOpen} title={detailsTitle} onClose={() => setDetailsOpen(false)}>
        <div className="enroll-details-body">{detailsBody}</div>
      </Details>

      <div className="enroll-root">
        {businessFlags && !businessFlags.enrollOpen && (
          <div
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: 8,
              padding: '6px 10px',
              borderRadius: 6,
              backgroundColor: '#fff7e6',
              color: '#ad4e00',
              fontSize: 12,
            }}
          >
            当前学生选课业务未开放，暂时无法进行选课或退课操作。
          </div>
        )}
        <div className="enroll-tables">
          <div className="enroll-left">
            <Table
              columns={leftColumns}
              data={leftData}
              total={leftTotal}
              currentPage={leftPage}
              pageSize={leftPageSize}
              onPageChange={setLeftPage}
              onPageSizeChange={setLeftPageSize}
              onSearch={(params) => {
                setLeftPage(1);
                setLeftSearch(params || {});
              }}
              onRefresh={fetchLeftData}
              loading={leftLoading}
            />
          </div>
          <div className="enroll-right">
            <Table
              columns={rightColumns}
              data={rightData}
              total={rightTotal}
              currentPage={rightPage}
              pageSize={rightPageSize}
              onPageChange={setRightPage}
              onPageSizeChange={setRightPageSize}
              onSearch={(params) => {
                setRightPage(1);
                setRightSearch(params || {});
              }}
              onRefresh={fetchRightData}
              loading={rightLoading}
            />
          </div>
        </div>
      </div>
    </MorePageLayout>
  );
};

export default Enroll;
