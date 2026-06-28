import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import StandardPageLayout from '../../components/Layout/StandardPageLayout';
import { useBreadcrumb } from '../../components/Breadcrumb/BreadcrumbContext';
import './Dashboard.css';

const SubContainer = ({ title, children, showMore = true, onMoreClick }) => {
  return (
    <div className="dashboard-sub-container">
      <div className="sub-header" onClick={onMoreClick} style={{ cursor: onMoreClick ? 'pointer' : 'default' }}>
        <span className="sub-title">{title}</span>
        {onMoreClick && <span className="sub-arrow">›</span>}
      </div>
      <div className="sub-content">
        {children}
      </div>
    </div>
  );
};

const FeatureList = ({ items = [], onItemMore }) => {
  return (
    <div className="feature-list-container">
      <div className="feature-list">
        {items.map((item) => (
          <div
            key={item.id}
            className="feature-row"
            onClick={() => onItemMore && onItemMore(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onItemMore && onItemMore(item); }}
          >
            <div className="feature-icon-area">
              <img className="feature-icon" src={item.icon} alt={item.label} />
            </div>
            <div className="feature-text-area">
              <div className="feature-title">{item.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

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
    return null;
  } catch {
    return null;
  }
};

const BaseDashboard = ({ systemRole, queryItems = [], businessItems = [] }) => {
  const navigate = useNavigate();
    const location = useLocation();
  const { setBreadcrumb } = useBreadcrumb();

  // 进入仪表盘时重置面包屑为首页
  useEffect(() => {
    setBreadcrumb([{ id: 'dashboard', name: '主页', url: location.pathname }]);
  }, [setBreadcrumb, location.pathname]);
  
  // 状态——消息数组
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [sentMessages, setSentMessages] = useState([]);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const user = getCurrentUserFromStorage();
        if (!user || !user.Uno) return;

        const response = await fetch('/api/academy/dashboard/messages');
        const data = await response.json();
        
        if (data.success) {
          setReceivedMessages(data.received || []);
          setSentMessages(data.sent || []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard messages:', error);
      }
    };

    fetchMessages();
  }, []);

  // 格式化时间
  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${min}`;
  };

  const handleLogout = () => {
    navigate('/login');
  };

  const handleItemMore = (item) => {
    if (item && item.url) navigate(item.url);
  };

  return (
    <StandardPageLayout
      systemRole={systemRole}
      onLogout={handleLogout}
    >
      <div className="dashboard-content">
        {/* 消息列 */}
        <div className="dashboard-main-col">
          {/* 收信 */}
          <div className="dashboard-sub-wrapper">
            <SubContainer title="收信" onMoreClick={() => navigate('/receivebox')}>
              <div className="message-list-container">
                <div className="message-list">
                  {receivedMessages.length === 0 ? (
                    <div className="empty-message">暂无收信</div>
                  ) : (
                    receivedMessages.slice(0, 8).map((msg, index) => (
                      <div
                        key={msg.Msg_no || index}
                        className="message-item"
                        onClick={() => navigate('/receivebox')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') navigate('/receivebox'); }}
                      >
                        <div className="msg-left">
                          <span className="msg-sender">
                            {msg.SenderName} ({msg.SenderRole || '未知'})
                          </span>
                        </div>
                        <div className="msg-center">
                          {msg.Msg_content.length > 6 ? msg.Msg_content.substring(0, 6) + '...' : msg.Msg_content}
                        </div>
                        <div className="msg-right">
                          {formatTime(msg.Send_time)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </SubContainer>
          </div>
          
          {/* 发信 */}
          <div className="dashboard-sub-wrapper">
             <SubContainer title="发信" onMoreClick={() => navigate('/sendbox')}>
               <div className="message-list-container">
                <div className="message-list">
                  {sentMessages.length === 0 ? (
                    <div className="empty-message">暂无发信</div>
                  ) : (
                    sentMessages.slice(0, 8).map((msg, index) => (
                      <div
                        key={msg.Msg_no || index}
                        className="message-item"
                        onClick={() => navigate('/sendbox')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') navigate('/sendbox'); }}
                      >
                        <div className="msg-left">
                          <span className="msg-sender">
                            {msg.ReceiverName} ({msg.ReceiverRole || '未知'})
                          </span>
                        </div>
                        <div className="msg-center">
                          {msg.Msg_content.length > 6 ? msg.Msg_content.substring(0, 6) + '...' : msg.Msg_content}
                        </div>
                        <div className="msg-right">
                          {formatTime(msg.Send_time)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
             </SubContainer>
          </div>
        </div>

        {/* 查询列 */}
        <div className="dashboard-main-col">
          <SubContainer title="查询" showMore={false}>
            <FeatureList items={queryItems} onItemMore={handleItemMore} />
          </SubContainer>
        </div>

        {/* 业务列 */}
        <div className="dashboard-main-col">
          <SubContainer title="业务" showMore={false}>
            <FeatureList items={businessItems} onItemMore={handleItemMore} />
          </SubContainer>
        </div>

        {/* 视图列 */}
        <div className="dashboard-main-col">
           <div className="empty-main-container">视图功能区</div>
        </div>

      </div>
    </StandardPageLayout>
  );
};

export default BaseDashboard;
