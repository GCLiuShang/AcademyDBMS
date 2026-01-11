import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import StandardPageLayout from '../../components/Layout/StandardPageLayout';
import { useBreadcrumb } from '../../components/Breadcrumb/BreadcrumbContext';
import './Dashboard.css';

const SubContainer = ({ title, children, showMore = true, onMoreClick }) => {
  return (
    <div className="dashboard-sub-container">
      <div className="sub-header">
        {/* Placeholder for header content if needed, currently just grey bar */}
        <span className="sub-title">{title}</span>
      </div>
      <div className="sub-content">
        {children}
      </div>
      <div className="sub-footer">
        {showMore && (
          <button className="more-btn" onClick={onMoreClick}>
            <img src="/images/dashboard/more.svg" alt="More" />
          </button>
        )}
      </div>
    </div>
  );
};

const FeatureList = ({ items = [], onItemMore }) => {
  return (
    <div className="feature-list-container">
      <div className="feature-list">
        {items.map((item) => (
          <div key={item.id} className="feature-row">
            <div className="feature-icon-area">
              <img className="feature-icon" src={item.icon} alt={item.label} />
            </div>
            <div className="feature-text-area">
              <div className="feature-title">{item.label}</div>
              <button
                type="button"
                className="feature-more-btn"
                onClick={() => onItemMore && onItemMore(item)}
              >
                <img src="/images/dashboard/more.svg" alt="More" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * BaseDashboard Component
 * 
 * Reusable dashboard layout for all roles.
 * 
 * @param {string} systemRole - The role name to display in the Navbar (e.g. "学生", "教授").
 */
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
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

const BaseDashboard = ({ systemRole, queryItems = [], businessItems = [] }) => {
  const navigate = useNavigate();
    const location = useLocation();
  const { setBreadcrumb } = useBreadcrumb();

  // Reset breadcrumb to Home when entering dashboard
  useEffect(() => {
    setBreadcrumb([{ id: 'dashboard', name: '主页', url: location.pathname }]);
  }, [setBreadcrumb, location.pathname]);
  
  // State for messages
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [sentMessages, setSentMessages] = useState([]);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const user = getCurrentUserFromStorage();
        if (!user || !user.Uno) return;

        const response = await fetch('/api/dashboard/messages');
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

  // Format time helper
  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${min}`;
  };

  // Define the path for Breadcrumb
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
      // path prop removed, handled by Context
    >
      <div className="dashboard-content">
        
        {/* 1. Message Column (消息) */}
        <div className="dashboard-main-col">
          {/* Receive Box (收信) - Top 50% */}
          <div className="dashboard-sub-wrapper">
            <SubContainer title="收信" onMoreClick={() => navigate('/receivebox')}>
              <div className="message-list-container">
                <div className="message-list">
                  {receivedMessages.length === 0 ? (
                    <div className="empty-message">暂无收信</div>
                  ) : (
                    receivedMessages.slice(0, 8).map((msg, index) => (
                      <div key={msg.Msg_no || index} className="message-item">
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
          
          {/* Send Box (发信) - Bottom 50% */}
          <div className="dashboard-sub-wrapper">
             <SubContainer title="发信" onMoreClick={() => navigate('/sendbox')}>
               <div className="message-list-container">
                <div className="message-list">
                  {sentMessages.length === 0 ? (
                    <div className="empty-message">暂无发信</div>
                  ) : (
                    sentMessages.slice(0, 8).map((msg, index) => (
                      <div key={msg.Msg_no || index} className="message-item">
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

        {/* 2. Query Column (查询) */}
        <div className="dashboard-main-col">
          <SubContainer title="查询" showMore={false}>
            <FeatureList items={queryItems} onItemMore={handleItemMore} />
          </SubContainer>
        </div>

        {/* 3. Business Column (业务) */}
        <div className="dashboard-main-col">
          <SubContainer title="业务" showMore={false}>
            <FeatureList items={businessItems} onItemMore={handleItemMore} />
          </SubContainer>
        </div>

        {/* 4. View Column (视图) */}
        <div className="dashboard-main-col">
           <div className="empty-main-container">视图功能区</div>
        </div>

      </div>
    </StandardPageLayout>
  );
};

export default BaseDashboard;
