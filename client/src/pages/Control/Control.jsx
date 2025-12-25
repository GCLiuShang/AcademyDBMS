import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Control.css';

const API_BASE = 'http://localhost:3001';

const Control = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [semeNo, setSemeNo] = useState('');

  const [curricularOpen, setCurricularOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const [initialCurricularOpen, setInitialCurricularOpen] = useState(false);
  const [initialCourseOpen, setInitialCourseOpen] = useState(false);
  const [initialEnrollOpen, setInitialEnrollOpen] = useState(false);

  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');

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
    const fetchStatus = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/api/business/status`);
        const json = await res.json();
        if (res.ok && json.success) {
          const curFlag = Boolean(json.curricularOpen);
          const courseFlag = Boolean(json.courseOpen);
          const enrollFlag = Boolean(json.enrollOpen);
          setSemeNo(json.semeNo || '');
          setCurricularOpen(curFlag);
          setCourseOpen(courseFlag);
          setEnrollOpen(enrollFlag);
          setInitialCurricularOpen(curFlag);
          setInitialCourseOpen(courseFlag);
          setInitialEnrollOpen(enrollFlag);
        } else {
          setError(json.message || '获取业务开关状态失败');
        }
      } catch {
        setError('获取业务开关状态失败');
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const hasChanges =
    !loading &&
    (curricularOpen !== initialCurricularOpen ||
      courseOpen !== initialCourseOpen ||
      enrollOpen !== initialEnrollOpen);

  const handleSave = async () => {
    if (!userInfo?.Uno || !hasChanges) return;
    setSaving(true);
    setError('');
    setConfirmError('');
    try {
      const res = await fetch(`${API_BASE}/api/business/control/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uno: userInfo.Uno,
          oldPassword: confirmPassword,
          curricularOpen,
          courseOpen,
          enrollOpen,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const curFlag = Boolean(json.curricularOpen);
        const courseFlag = Boolean(json.courseOpen);
        const enrollFlag = Boolean(json.enrollOpen);
        setSemeNo(json.semeNo || '');
        setCurricularOpen(curFlag);
        setCourseOpen(courseFlag);
        setEnrollOpen(enrollFlag);
        setInitialCurricularOpen(curFlag);
        setInitialCourseOpen(courseFlag);
        setInitialEnrollOpen(enrollFlag);
        setConfirmPassword('');
        setConfirmError('');
      } else {
        if (json.code === 'WRONG_PASSWORD') {
          setConfirmError('密码错误，请修改后重试');
        } else {
          setError(json.message || '保存失败');
        }
      }
    } catch {
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const renderSwitchButton = (isOpen, onToggle) => {
    const disabled = loading || saving;
    const classes = [
      'control-switch-button',
      isOpen ? 'open' : '',
      disabled ? 'disabled' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        type="button"
        className={classes}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onToggle(!isOpen);
        }}
      >
        {isOpen ? '开启' : '关闭'}
      </button>
    );
  };

  const renderContent = () => {
    if (!userInfo) {
      return null;
    }
    if (userInfo.Urole !== '学校教务处管理员') {
      return (
        <div className="control-denied">
          当前账号无权访问业务控制页面。
        </div>
      );
    }

    return (
      <div className="control-container">
        {error && <div className="control-error">{error}</div>}
        <div className="control-main">
          <div className="control-left">
            <div className="control-box">
              <div className="control-box-header">
                <span>业务控制</span>
                <span>
                  当前学期：
                  {loading ? '加载中...' : semeNo || '未知'}
                </span>
              </div>
              <div className="control-rows">
                <div className="control-row">
                  <div className="control-row-left">
                    申请课程业务开关
                  </div>
                  <div className="control-row-right">
                    {renderSwitchButton(curricularOpen, setCurricularOpen)}
                  </div>
                </div>
                <div className="control-row">
                  <div className="control-row-left">
                    申请课业务开关
                  </div>
                  <div className="control-row-right">
                    {renderSwitchButton(courseOpen, setCourseOpen)}
                  </div>
                </div>
                <div className="control-row">
                  <div className="control-row-left">
                    选课业务开关
                  </div>
                  <div className="control-row-right">
                    {renderSwitchButton(enrollOpen, setEnrollOpen)}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="control-right">
            <div className="control-confirm">
              <div className="control-confirm-header">
                请输入密码以确认身份：
              </div>
              <div className="control-confirm-body">
                <textarea
                  className="control-confirm-textarea"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {confirmError && (
                  <div className="control-confirm-error">
                    {confirmError}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || saving || loading || !userInfo?.Uno}
              className={`control-submit ${
                hasChanges && !saving && !loading && userInfo?.Uno ? 'active' : ''
              }`}
            >
              保存控制
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <MorePageLayout
      title="业务控制"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      {renderContent()}
    </MorePageLayout>
  );
};

export default Control;
