/**
 * 获取当前登录用户信息。
 * 从 sessionStorage（标签页隔离）读取完整用户对象。
 * sessionStorage 无数据时，尝试从 localStorage 恢复（兼容旧会话）。
 */
export const getCurrentUserFromStorage = () => {
  try {
    const currentUser = sessionStorage.getItem('currentUser');
    if (currentUser) {
      const parsed = JSON.parse(currentUser);
      if (parsed && parsed.Uno) {
        return parsed;
      }
    }
  } catch {
    // 忽略解析错误
  }
  try {
    const currentUno = sessionStorage.getItem('currentUno');
    if (currentUno) {
      const mapStr = localStorage.getItem('userMap');
      if (mapStr) {
        const map = JSON.parse(mapStr);
        if (map && typeof map === 'object' && map[currentUno]) {
          // 从 localStorage 恢复后同步回 sessionStorage
          const user = map[currentUno];
          sessionStorage.setItem('currentUser', JSON.stringify(user));
          return user;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * 设置当前标签页的用户信息（登录时调用）。
 * 同时更新 sessionStorage（标签页隔离）和 localStorage（兼容旧代码）。
 */
export const setCurrentUserToStorage = (user) => {
  if (!user || !user.Uno) return;

  sessionStorage.setItem('currentUser', JSON.stringify(user));
  sessionStorage.setItem('currentUno', user.Uno);

  // localStorage：用户映射，用于其他标签页初始化等兼容场景
  try {
    const raw = localStorage.getItem('userMap');
    const map = raw ? JSON.parse(raw) : {};
    map[user.Uno] = user;
    localStorage.setItem('userMap', JSON.stringify(map));
  } catch {
    localStorage.setItem('userMap', JSON.stringify({ [user.Uno]: user }));
  }
};

/**
 * 清除当前标签页的用户信息（注销时调用）。
 * 只清理当前标签页的 sessionStorage，不影响其他标签页。
 * 注意：不清除 localStorage.userMap，因为可能还有其他标签页在使用。
 */
export const clearCurrentUserFromStorage = () => {
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('currentUno');
  sessionStorage.removeItem('sid');
};

