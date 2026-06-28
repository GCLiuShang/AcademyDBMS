const mysql = require('mysql2');
const crypto = require('crypto');
const db = require('../db');
const { getUserBySessionId } = require('./sessionService');

const activeUsers = new Map();
const kickedUsers = new Set();

function getMySQLConfig() {
  return {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    connectTimeout: 5000,
  };
}

/** 验证 AcademyDBMS 会话 sid 并查询 DBAdmin_Grant 授权列表 */
async function getGrantsBySid(sid) {
  if (!sid || typeof sid !== 'string' || !sid.trim()) {
    return { success: false, message: '无效的会话 ID。请提供有效的 AcademyDBMS 会话标识。', grants: [] };
  }

  const sessionUser = await getUserBySessionId(sid.trim());
  if (!sessionUser || !sessionUser.Uno) {
    return { success: false, message: '会话已过期或无效，请先登录教务系统。', grants: [] };
  }

  const uno = sessionUser.Uno;

  try {
    const [rows] = await db.execute(
      `SELECT MySQL_User FROM DBAdmin_Grant WHERE Uno = ? AND Is_Active = 1`,
      [uno]
    );

    const grants = (rows || []).map(r => r.MySQL_User).filter(Boolean);

    if (grants.length === 0) {
      return {
        success: false,
        message: '当前用户不存在或不得使用',
        uno,
        grants: [],
        user: sessionUser,
      };
    }

    return {
      success: true,
      message: `身份验证通过。已授权 ${grants.length} 个 MySQL 用户。`,
      uno,
      grants,
      user: sessionUser,
    };
  } catch (err) {
    console.error(`[DBAdmin] getGrantsBySid 查询失败：${err.message}`);
    return { success: false, message: '查询授权信息失败，请稍后重试。', grants: [] };
  }
}

/** DBAdmin 用户登录（支持二层认证） */
async function login(username, password, sid = null) {
  if (!username || typeof username !== 'string' || !username.trim() || (!password && password !== '')) {
    return { success: false, message: '用户名和密码均不得为空', user: null };
  }

  const trimmedUsername = username.trim();

  // 第一因子验证：校验 sid → DBAdmin_Grant
  let firstFactorInfo = null;
  if (sid && typeof sid === 'string' && sid.trim()) {
    const grantsResult = await getGrantsBySid(sid.trim());

    if (!grantsResult.success) {
      console.log(`[DBAdmin] 用户 "${trimmedUsername}" 登录时 sid 验证未通过：${grantsResult.message}。降级为纯 MySQL 认证。`);
    } else {
      if (!grantsResult.grants.includes(trimmedUsername)) {
        return {
          success: false,
          message: '当前用户不存在或不得使用',
          user: null,
          firstFactorSucceeded: true,
          authorizedUsers: grantsResult.grants,
          uno: grantsResult.uno,
        };
      }
      firstFactorInfo = {
        sid: sid.trim(),
        uno: grantsResult.uno,
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  // 清理旧会话（后登录者获胜）
  if (activeUsers.has(trimmedUsername)) {
    kickedUsers.add(trimmedUsername);
    setTimeout(() => kickedUsers.delete(trimmedUsername), 60000);
    await closeUserPool(trimmedUsername).catch(() => {});
    activeUsers.delete(trimmedUsername);
    console.log(`[DBAdmin] 用户 "${trimmedUsername}" 的旧会话已被清除（后登录者获胜）。`);
  }

  // 第二因子验证：通过 MySQL 连接验证凭据
  const baseConfig = getMySQLConfig();
  let testConnection = null;

  try {
    testConnection = await new Promise((resolve, reject) => {
      const conn = mysql.createConnection({
        host: baseConfig.host,
        port: baseConfig.port,
        user: trimmedUsername,
        password: password,
        connectTimeout: baseConfig.connectTimeout,
      });

      conn.connect((err) => {
        if (err) {
          try { conn.destroy(); } catch (_) {}
          reject(err);
        } else {
          resolve(conn);
        }
      });
    });

    try { testConnection.destroy(); } catch (_) {}
    testConnection = null;

    const sessionToken = crypto.randomBytes(16).toString('hex');
    const userInfo = {
      username: trimmedUsername,
      password: password,
      loginTime: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      authFactors: firstFactorInfo,
      token: sessionToken,
    };
    activeUsers.set(trimmedUsername, userInfo);

    console.log(`[DBAdmin] 用户 "${trimmedUsername}" 登录成功${firstFactorInfo ? '（二层认证，教务用户：' + firstFactorInfo.uno + '）' : '（纯 MySQL 认证）'}。当前在线用户数：${activeUsers.size}`);

    const result = {
      success: true,
      message: `登录成功！欢迎 "${trimmedUsername}"。`,
      user: {
        username: trimmedUsername,
        loginTime: userInfo.loginTime,
      },
      token: sessionToken,
    };

    if (firstFactorInfo) {
      result.uno = firstFactorInfo.uno;
      result.hasFirstFactor = true;
    }

    return result;
  } catch (err) {
    console.warn(`[DBAdmin] 用户 "${trimmedUsername}" 登录失败：${err.message}`);

    const result = {
      success: false,
      message: '用户名或密码错误',
      user: null,
    };

    if (firstFactorInfo) {
      result.firstFactorSucceeded = true;
      result.uno = firstFactorInfo.uno;
    }

    return result;
  } finally {
    if (testConnection) {
      try { testConnection.destroy(); } catch (_) {}
    }
  }
}

function getSessionInfo(username) {
  if (!username || typeof username !== 'string') return null;
  const session = activeUsers.get(username.trim());
  if (!session) return null;
  return {
    username: session.username,
    loginTime: session.loginTime,
    lastActive: session.lastActive,
    hasFirstFactor: session.authFactors !== null && session.authFactors !== undefined,
    uno: session.authFactors?.uno || null,
  };
}

async function logout(username) {
  if (!username || typeof username !== 'string') {
    return { success: false, message: '未指定要退出的用户。请提供有效的用户名。' };
  }

  const trimmedUsername = username.trim();
  if (!trimmedUsername) {
    return { success: false, message: '用户名不能为纯空白字符。' };
  }

  if (activeUsers.has(trimmedUsername)) {
    await closeUserPool(trimmedUsername).catch(() => {});
    activeUsers.delete(trimmedUsername);
    console.log(`[DBAdmin] 用户 "${trimmedUsername}" 已退出。当前在线用户数：${activeUsers.size}`);
    return { success: true, message: `用户 "${trimmedUsername}" 已成功退出。已释放关联资源。` };
  }

  return { success: false, message: `用户 "${trimmedUsername}" 当前未登录。` };
}

function isLoggedIn(username) {
  if (!username || typeof username !== 'string') return false;
  return activeUsers.has(username.trim());
}

function getOrCreateUserPool(username) {
  if (!username || typeof username !== 'string') return null;
  const trimmed = username.trim();
  const session = activeUsers.get(trimmed);
  if (!session || !session.password) return null;

  if (session._pool) {
    return session._pool;
  }

  const baseConfig = getMySQLConfig();
  const pool = mysql.createPool({
    host: baseConfig.host,
    port: baseConfig.port,
    user: trimmed,
    password: session.password,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: 'utf8mb4',
  });

  session._pool = pool.promise();
  return session._pool;
}

function isLoggedIn(username) {
  if (!username || typeof username !== 'string') return false;
  return activeUsers.has(username.trim());
}

function isKicked(username) {
  if (!username || typeof username !== 'string') return false;
  return kickedUsers.has(username.trim());
}

function validateSession(username, token) {
  if (!username || typeof username !== 'string') return false;
  if (!token || typeof token !== 'string') return false;
  const session = activeUsers.get(username.trim());
  if (!session) return false;
  return session.token === token;
}

function touchUser(username) {
  if (!username || typeof username !== 'string') return;
  const trimmed = username.trim();
  const session = activeUsers.get(trimmed);
  if (session) {
    session.lastActive = new Date().toISOString();
  }
}

function cleanInactiveSessions(maxInactiveMinutes = 60) {
  const now = Date.now();
  const maxInactiveMs = maxInactiveMinutes * 60 * 1000;
  let cleaned = 0;

  for (const [username, session] of activeUsers.entries()) {
    const lastActiveMs = new Date(session.lastActive).getTime();
    if (now - lastActiveMs > maxInactiveMs) {
      if (session._pool) {
        session._pool.end().catch(() => {});
      }
      activeUsers.delete(username);
      cleaned++;
      console.log(`[DBAdmin] 不活跃用户 "${username}" 已自动登出（超过 ${maxInactiveMinutes} 分钟未活动）`);
    }
  }

  return cleaned;
}

module.exports = {
  login,
  logout,
  isLoggedIn,
  isKicked,
  validateSession,
  touchUser,
  cleanInactiveSessions,
  getOrCreateUserPool,
  getGrantsBySid,
  getSessionInfo,
};