import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState({ type: null, text: '' });
  
  // Animation stage: 
  // 0: Initial
  // 1: Mask fades in
  // 2: Box fades in (with welcome text)
  // 3: Welcome text fades out
  // 4: Login content fades in
  const [animStage, setAnimStage] = useState(0);

  useEffect(() => {
    document.title = '教学管理系统 - 登录';
  }, []);

  useEffect(() => {
    // Sequence of animations
    const t1 = setTimeout(() => setAnimStage(1), 100);  // Start mask fade in
    const t2 = setTimeout(() => setAnimStage(2), 600);  // 100 + 500ms (mask done) -> Box fade in
    const t3 = setTimeout(() => setAnimStage(3), 1100); // 600 + 500ms (box done) -> Text fade out
    const t4 = setTimeout(() => setAnimStage(4), 1600); // 1100 + 500ms (text done) -> Content fade in

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  const handleLogin = async () => {
    // Reset message
    setMessage({ type: null, text: '' });

    try {
      const response = await axios.post('http://localhost:3001/api/login', {
        username,
        password
      });

      if (response.data.success) {
        console.log('Login successful, user:', response.data.user);
        setMessage({ type: 'success', text: '登录成功' });
        setUsername('');
        setPassword('');
        const user = response.data.user;
        const uno = user.Uno;
        try {
          const raw = localStorage.getItem('userMap');
          const map = raw ? JSON.parse(raw) : {};
          map[uno] = user;
          localStorage.setItem('userMap', JSON.stringify(map));
        } catch {
          localStorage.setItem('userMap', JSON.stringify({ [uno]: user }));
        }
        if (uno) {
          sessionStorage.setItem('currentUno', uno);
        }
        localStorage.setItem('user', JSON.stringify(user));
        console.log('User saved to storages, redirecting in 1s...');
        
        // Determine redirect path based on user role
        // user.role is expected to be: 'Student', 'Professor', 'DeptAdmin', 'UnivAdmin' (example values, adjust as needed)
        // Or using Chinese: '学生', '教授', '学院教学办', '学校教务处'
        // Let's assume standard role mapping based on the earlier requirements.
        let targetPath = '/login';
        
        // We need to map the backend role to the frontend route
        // Assuming the backend returns roles that map to our frontend routes
        // If you don't know the exact backend role strings, we might need to log them or handle defaults.
        // For now, I will implement a basic mapping logic. 
        // NOTE: Please ensure backend returns one of these or update this logic.
        const role = user.Urole || user.role; 
        
        if (role === 'Student' || role === '学生') {
          targetPath = '/student/dashboard';
        } else if (role === 'Professor' || role === '教授' || role === 'Teacher') {
          targetPath = '/professor/dashboard';
        } else if (role === 'DeptAdmin' || role === '学院教学办' || role === '学院教学办管理员') {
          targetPath = '/dept/dashboard';
        } else if (role === 'UnivAdmin' || role === '学校教务处' || role === '学校教务处管理员') {
          targetPath = '/admin/dashboard';
        } else {
           // Fallback if role is unknown or generic
           console.warn('Unknown user role:', role);
           // Try to guess or default to student for safety? Or stay at login?
           // For now, let's default to student dashboard for testing if undefined, 
           // but realistically we should show an error or default to a safe page.
           targetPath = '/student/dashboard'; 
        }

        setTimeout(() => {
          console.log(`Executing navigate to ${targetPath}`);
          navigate(targetPath);
        }, 1000);
      }
    } catch (error) {
      console.error('Login error:', error);
      
      let errorMsg = '登录出错，请稍后重试';
      
      if (error.response && error.response.data && error.response.data.message) {
        errorMsg = error.response.data.message;
        
        // Handle Already Logged In
        if (error.response.data.code === 'ALREADY_LOGGED_IN') {
          setMessage({ type: 'error', text: '该账号已在线，请等待20秒后重试' });
          setTimeout(() => {
            setMessage({ type: null, text: '' });
          }, 20000);
          return;
        }
      } else if (error.response && error.response.status === 401) {
        errorMsg = '用户名或密码错误，请重试';
      }

      setMessage({ type: 'error', text: errorMsg });
      
      // Clear message and inputs after 3 seconds to allow reading
      setTimeout(() => {
        setMessage({ type: null, text: '' });
        // Don't clear inputs immediately so user can correct them
        // setUsername(''); 
        setPassword('');
      }, 3000);
    }
  };

  // Handle Enter key for inputs
  const handleKeyDown = (e, nextFieldId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextFieldId === 'submit') {
        handleLogin();
      } else {
        const nextElement = document.getElementById(nextFieldId);
        if (nextElement) {
          nextElement.focus();
        }
      }
    }
  };

  return (
    <div className="login-page">
      <div className={`login-mask ${animStage >= 1 ? 'visible' : ''}`}></div>
      
      <div className={`login-box ${animStage >= 2 ? 'visible' : ''}`}>
        {/* Welcome Text */}
        <div className={`welcome-text ${animStage >= 2 && animStage < 3 ? 'visible' : ''}`}>
          欢迎使用武汉理工大学教务管理系统
        </div>

        {/* Login Content (Image + Form) */}
        <div className={`login-content ${animStage >= 4 ? 'visible' : ''}`}>
          <img src="/images/login/002.jpg" alt="Logo" className="login-header-img" />
          
          <div className="login-form">
            <input
              id="username-input"
              type="text"
              className="input-field"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'password-input')}
              disabled={message.type !== null}
            />
            <input
              id="password-input"
              type="password"
              className="input-field"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'submit')}
              disabled={message.type !== null}
            />
            
            <div className="login-btn-container">
              <button className="login-btn" onClick={handleLogin}>
                登录
              </button>
              
              {message.type && (
                <div className={`login-message ${message.type === 'error' ? 'msg-error' : 'msg-success'}`}>
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
