import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import './Accountsettings.css';

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

const Accountsettings = () => {
  const navigate = useNavigate();
  const [userInfo] = useState(() => {
    return getCurrentUserFromStorage();
  });

  const [role, setRole] = useState('');
  const [accountData, setAccountData] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [initialValues, setInitialValues] = useState({});
  const [oldPassword, setOldPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => {
    if (!userInfo) navigate('/login');
  }, [navigate, userInfo]);

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  const fieldDefs = useMemo(() => {
    if (role === '学生') {
      return [
        { key: 'Sno', label: '学号', type: 'text', editable: false },
        { key: 'Upswd', label: '密码', type: 'password', editable: true },
        { key: 'Syear', label: '入学年份', type: 'text', editable: false },
        { key: 'Sname', label: '姓名', type: 'text', editable: true },
        { key: 'Ssex', label: '性别', type: 'enum', options: ['男', '女'], editable: true },
        { key: 'Sclass', label: '班级', type: 'text', editable: false },
        { key: 'Sstatus', label: '状态', type: 'text', editable: false },
      ];
    }

    if (role === '教授') {
      return [
        { key: 'Pno', label: '工号', type: 'text', editable: false },
        { key: 'Upswd', label: '密码', type: 'password', editable: true },
        { key: 'Pyear', label: '入职年份', type: 'text', editable: false },
        { key: 'Pname', label: '姓名', type: 'text', editable: true },
        { key: 'Psex', label: '性别', type: 'enum', options: ['男', '女'], editable: true },
        { key: 'Ptitle', label: '职称', type: 'text', editable: false },
        { key: 'Pdept', label: '学院', type: 'text', editable: false },
        { key: 'Poffice', label: '办公室', type: 'text', editable: true },
        { key: 'Pstatus', label: '状态', type: 'text', editable: false },
      ];
    }

    if (role === '学院教学办管理员') {
      return [
        { key: 'DAno', label: '工号', type: 'text', editable: false },
        { key: 'Upswd', label: '密码', type: 'password', editable: true },
        { key: 'DAyear', label: '入职年份', type: 'text', editable: false },
        { key: 'DAname', label: '姓名', type: 'text', editable: true },
        { key: 'DAdept', label: '学院', type: 'text', editable: false },
        { key: 'DAstatus', label: '状态', type: 'text', editable: false },
      ];
    }

    if (role === '学校教务处管理员') {
      return [
        { key: 'UAno', label: '工号', type: 'text', editable: false },
        { key: 'Upswd', label: '密码', type: 'password', editable: true },
        { key: 'UAyear', label: '入职年份', type: 'text', editable: false },
        { key: 'UAname', label: '姓名', type: 'text', editable: true },
        { key: 'UAstatus', label: '状态', type: 'text', editable: false },
      ];
    }

    return [];
  }, [role]);

  const fetchInfo = async () => {
    if (!userInfo) return;
    try {
      const res = await fetch('/api/account/info');
      const json = await res.json();
      if (json.success) {
        setRole(json.role);
        setAccountData(json.data);
        const init = {};
        (fieldDefs.length > 0 ? fieldDefs : []).forEach(() => {});
        if (json.data) {
          Object.keys(json.data).forEach(k => {
            init[k] = json.data[k];
          });
        }
        init.Upswd = '';
        setFormValues(init);
        setInitialValues(init);
      }
    } catch (err) {
      console.error('Fetch account info error:', err);
    }
  };

  useEffect(() => {
    fetchInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInfo]);

  useEffect(() => {
    if (!accountData) return;
    const init = {};
    Object.keys(accountData).forEach(k => {
      init[k] = accountData[k];
    });
    init.Upswd = '';
    setFormValues(init);
    setInitialValues(init);
  }, [accountData]);

  const hasChanges = useMemo(() => {
    if (!fieldDefs.length) return false;
    for (const def of fieldDefs) {
      if (!def.editable) continue;
      if (def.key === 'Upswd') {
        if ((formValues.Upswd || '').length > 0) return true;
        continue;
      }
      if ((formValues[def.key] ?? '') !== (initialValues[def.key] ?? '')) return true;
    }
    return false;
  }, [fieldDefs, formValues, initialValues]);

  const handleChange = (key, value) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = async () => {
    if (!userInfo) return;
    if (!hasChanges) return;

    setConfirmError('');

    const updates = {};
    for (const def of fieldDefs) {
      if (!def.editable) continue;
      if (def.key === 'Upswd') {
        if ((formValues.Upswd || '').length > 0) updates.Upswd = formValues.Upswd;
        continue;
      }
      if ((formValues[def.key] ?? '') !== (initialValues[def.key] ?? '')) {
        updates[def.key] = formValues[def.key];
      }
    }

    try {
      const res = await fetch('/api/account/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, updates })
      });
      const json = await res.json();
      if (!json.success) {
        if (json.code === 'WRONG_PASSWORD') {
          setConfirmError('密码错误，请修改后重试');
          return;
        }
        setConfirmError(json.message || '修改失败');
        return;
      }

      setOldPassword('');
      await fetchInfo();
    } catch (err) {
      console.error('Update account error:', err);
      setConfirmError('修改失败');
    }
  };

  return (
    <MorePageLayout
      title="账户设置"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <div className="accountsettings-container">
        <div className="accountsettings-left">
          <div className="accountsettings-box accountsettings-info">
            <div className="accountsettings-info-body">
              {fieldDefs.map(def => {
                const value = def.key === 'Upswd' ? formValues.Upswd : (formValues[def.key] ?? '');
                const displayValue = def.key === 'Upswd' ? '' : value;
                const disabled = !def.editable;
                return (
                  <div key={def.key} className="accountsettings-row">
                    <div className="accountsettings-cell accountsettings-cell-left">{def.label}</div>
                    <div className="accountsettings-cell accountsettings-cell-right">
                      {def.type === 'enum' ? (
                        <select
                          className={`accountsettings-input ${disabled ? 'disabled' : ''}`}
                          value={displayValue}
                          disabled={disabled}
                          onChange={(e) => handleChange(def.key, e.target.value)}
                        >
                          {def.options.map(opt => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : def.type === 'password' ? (
                        <input
                          type="password"
                          className="accountsettings-input"
                          placeholder="*********"
                          value={value}
                          onChange={(e) => handleChange('Upswd', e.target.value)}
                        />
                      ) : (
                        <input
                          type="text"
                          className={`accountsettings-input ${disabled ? 'disabled' : ''}`}
                          value={displayValue}
                          disabled={disabled}
                          onChange={(e) => handleChange(def.key, e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="accountsettings-right">
          <div className="accountsettings-box accountsettings-confirm">
            <div className="accountsettings-confirm-title">请输入(旧)密码以确认身份：</div>
            <div className="accountsettings-confirm-body">
              <textarea
                className="accountsettings-confirm-textarea"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
              {confirmError && <div className="accountsettings-confirm-error">{confirmError}</div>}
            </div>
          </div>
          <button
            type="button"
            className={`accountsettings-submit ${hasChanges ? 'active' : ''}`}
            disabled={!hasChanges}
            onClick={handleConfirm}
          >
            确认修改
          </button>
        </div>
      </div>
    </MorePageLayout>
  );
};

export default Accountsettings;
