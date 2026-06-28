import { useState, useEffect } from 'react';
import { dbadminLogin } from '../../services/dbadminApi';
import './DBAdminLoginForm.css';

const DBAdminLoginForm = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState({ type: null, text: '' });
  const [animStage, setAnimStage] = useState(0);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setAnimStage(1), 100),
      setTimeout(() => setAnimStage(2), 500),
      setTimeout(() => setAnimStage(3), 800),
      setTimeout(() => setAnimStage(4), 1100),
      setTimeout(() => setAnimStage(5), 1400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleLogin = async () => {
    setMessage({ type: null, text: '' });

    try {
      const sid = sessionStorage.getItem('sid') || '';
      const response = await dbadminLogin(username, password, sid);

      if (response.success && response.type === 'login') {
        setMessage({ type: 'success', text: '登录成功' });
        sessionStorage.setItem('dbadminUser', username);
        if (response.token) {
          sessionStorage.setItem('dbadminToken', response.token);
        }
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess();
        }, 800);
      } else {
        const errorText = response.message || '用户名或密码错误';
        setMessage({ type: 'error', text: errorText });
        setShake(true);
        setTimeout(() => {
          setMessage({ type: null, text: '' });
          setShake(false);
          setPassword('');
        }, 3000);
      }
    } catch {
      setMessage({ type: 'error', text: '登录出错，请稍后重试' });
      setShake(true);
      setTimeout(() => {
        setMessage({ type: null, text: '' });
        setShake(false);
      }, 3000);
    }
  };

  const handleKeyDown = (e, nextId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextId === 'submit') handleLogin();
      else document.getElementById(nextId)?.focus();
    }
  };

  return (
    <div className={`dbadmin-login-form-wrapper ${animStage >= 1 ? 'visible' : ''}`}>
      <div className={`dbadmin-login-card ${animStage >= 2 ? 'visible' : ''}`}>
        <div className="dbadmin-login-card-header">
          <div className="dbadmin-login-logo">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <ellipse cx="12" cy="6" rx="7" ry="2.5" />
              <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
              <path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
              <path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
            </svg>
          </div>
          <h2 className="dbadmin-login-title">数据库管理登录</h2>
          <p className="dbadmin-login-desc">请输入您的数据库账号信息</p>
        </div>

        <div className={`dbadmin-login-form ${animStage >= 3 ? 'visible' : ''}`}>
          <div className={`dbadmin-float-field ${animStage >= 3 ? 'visible' : ''}`}>
            <input
              id="dbadmin-username-input"
              type="text"
              className={`dbadmin-float-input ${username ? 'has-value' : ''}`}
              placeholder=" "
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'dbadmin-password-input')}
              disabled={message.type !== null}
            />
            <label htmlFor="dbadmin-username-input" className="dbadmin-float-label">用户名</label>
            <div className="dbadmin-input-focus-bar" />
          </div>

          <div className={`dbadmin-float-field ${animStage >= 4 ? 'visible' : ''}`}>
            <input
              id="dbadmin-password-input"
              type="password"
              className={`dbadmin-float-input ${password ? 'has-value' : ''}`}
              placeholder=" "
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'submit')}
              disabled={message.type !== null}
            />
            <label htmlFor="dbadmin-password-input" className="dbadmin-float-label">密码</label>
            <div className="dbadmin-input-focus-bar" />
          </div>

          <div className={`dbadmin-login-btn-wrap ${animStage >= 5 ? 'visible' : ''}`}>
            <button
              id="submit"
              className={`dbadmin-btn-primary ${shake ? 'shake' : ''}`}
              onClick={handleLogin}
              disabled={message.type !== null}
            >
              <span className="dbadmin-btn-text">登 录</span>
            </button>

            {message.type && (
              <div className={`dbadmin-login-message ${message.type === 'error' ? 'msg-error' : 'msg-success'} ${shake ? 'shake' : ''}`}>
                <span className="dbadmin-msg-icon">{message.type === 'error' ? '!' : '✓'}</span>
                {message.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DBAdminLoginForm;
