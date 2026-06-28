import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { setCurrentUserToStorage } from '../../utils/userSession';
import './Login.css';

const bgImages = [
  '/images/login/bg/001.jpg',
  '/images/login/bg/002.jpg',
  '/images/login/bg/003.png',
  '/images/login/bg/004.jpg',
  '/images/login/bg/005.png',
  '/images/login/bg/006.png',
  '/images/login/bg/007.png',
];

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState({ type: null, text: '' });
  const [animStage, setAnimStage] = useState(0);
  const [shake, setShake] = useState(false);
  const formRef = useRef(null);

  const [bgOrder] = useState(() => bgImages.map((_, i) => i).sort(() => Math.random() - 0.5));
  const [bgActive, setBgActive] = useState(0);
  const [bgFading, setBgFading] = useState(null);

  useEffect(() => {
    document.title = '教学管理系统 - 登录';
  }, []);

  useEffect(() => {
    bgImages.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    if (bgOrder.length === 0) return;

    const tick = () => {
      const next = (bgActive + 1) % bgOrder.length;
      setBgFading(bgActive);
      setBgActive(next);
      setTimeout(() => setBgFading(null), 900);
    };

    const interval = setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, [bgOrder, bgActive]);

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
      const response = await fetch('/api/academy/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sid,
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: '登录成功' });
        setUsername('');
        setPassword('');
        const user = data.user;

        setCurrentUserToStorage(user);

        if (data.sid) {
          sessionStorage.setItem('sid', data.sid);
        }

        const role = user.Urole || user.role;
        let targetPath = '/student/dashboard';
        if (role === 'Professor' || role === '教授' || role === 'Teacher') targetPath = '/professor/dashboard';
        else if (role === 'DeptAdmin' || role === '学院教学办' || role === '学院教学办管理员') targetPath = '/dept/dashboard';
        else if (role === 'UnivAdmin' || role === '学校教务处' || role === '学校教务处管理员') targetPath = '/admin/dashboard';

        setTimeout(() => navigate(targetPath), 800);
      } else {
        let errorMsg = data.message || '登录出错，请稍后重试';

        setMessage({ type: 'error', text: errorMsg });
        setShake(true);
        setTimeout(() => { setMessage({ type: null, text: '' }); setShake(false); setPassword(''); }, 3000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: '登录出错，请稍后重试' });
      setShake(true);
      setTimeout(() => { setMessage({ type: null, text: '' }); setShake(false); setPassword(''); }, 3000);
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
    <div className="login-page">
      <div className="login-bg-layer">
        <img
          src={bgImages[bgOrder[bgActive]]}
          className="bg-image"
          alt=""
        />
        {bgFading !== null && (
          <img
            src={bgImages[bgOrder[bgFading]]}
            className="bg-image bg-fade-out"
            alt=""
          />
        )}
      </div>

      <div className="login-left">
        <div className="left-bg" />
        <div className={`left-content ${animStage >= 1 ? 'visible' : ''}`}>
          <div className="left-panel">
            <h1 className="left-title">教学管理系统</h1>
            <p className="left-desc">武汉理工大学 · 智慧教务平台</p>
          </div>
        </div>
      </div>

      <div className={`login-right ${animStage >= 2 ? 'visible' : ''}`}>
        <div className="right-overlay" />
        <div className={`login-card ${animStage >= 2 ? 'visible' : ''}`}>
          <div className="login-card-header">
            <div className="login-logo">
              <img src="/images/login/logo-icon.jpg" alt="Logo" className="logo-img" />
            </div>
            <h2 className="login-title">用户登录</h2>
            <p className="login-desc">请输入您的账号信息</p>
          </div>

          <div className={`login-form ${animStage >= 3 ? 'visible' : ''}`} ref={formRef}>
            <div className={`float-field ${animStage >= 3 ? 'visible' : ''}`}>
              <input
                id="username-input"
                type="text"
                className={`float-input ${username ? 'has-value' : ''}`}
                placeholder=" "
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'password-input')}
                disabled={message.type !== null}
              />
              <label htmlFor="username-input" className="float-label">用户名</label>
              <div className="input-focus-bar" />
            </div>

            <div className={`float-field ${animStage >= 4 ? 'visible' : ''}`}>
              <input
                id="password-input"
                type="password"
                className={`float-input ${password ? 'has-value' : ''}`}
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'submit')}
                disabled={message.type !== null}
              />
              <label htmlFor="password-input" className="float-label">密码</label>
              <div className="input-focus-bar" />
            </div>

            <div className={`login-btn-wrap ${animStage >= 5 ? 'visible' : ''}`}>
              <button
                className={`login-btn ${shake ? 'shake' : ''}`}
                onClick={handleLogin}
                disabled={message.type !== null}
              >
                <span className="btn-text">登 录</span>
              </button>

              {message.type && (
                <div className={`login-message ${message.type === 'error' ? 'msg-error' : 'msg-success'} ${shake ? 'shake' : ''}`}>
                  <span className="msg-icon">{message.type === 'error' ? '!' : '✓'}</span>
                  {message.text}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
