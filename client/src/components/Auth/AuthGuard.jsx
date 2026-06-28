import { Navigate, Outlet } from 'react-router-dom';
import { getCurrentUserFromStorage } from '../../utils/userSession';

/**
 * AuthGuard — 前端路由守卫。
 *
 * 使用 React Router v6 布局路由模式包裹受保护的路由。
 * 从 sessionStorage 检查用户登录状态，未登录时重定向到 /login。
 */
const AuthGuard = () => {
  const user = getCurrentUserFromStorage();
  if (!user || !user.Uno) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

export default AuthGuard;
