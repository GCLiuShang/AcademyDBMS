const express = require('express');
const router = express.Router();
const { validateSQL } = require('../services/sqlValidator');
const { inspectSQL } = require('../services/sqlInjectionGuard');
const dbadminAuth = require('../services/dbadminAuthService');
const { getCookieName, parseCookieHeader } = require('../services/sessionService');

/** 从 SQL 中识别 SHOW/USE/DESC 等解析器无法处理的特殊命令 */
function parseSpecialCommand(sql) {
  const trimmed = sql.trim().replace(/;$/, '').trim();

  let m = trimmed.match(/^\s*SHOW\s+DATABASES\s*(LIKE\s+(.+))?\s*$/i);
  if (m) {
    return { command: 'show_databases', likePattern: m[2] || null };
  }

  m = trimmed.match(/^\s*SHOW\s+TABLES\s*(FROM\s+(\S+))?\s*(LIKE\s+(.+))?\s*$/i);
  if (m) {
    return { command: 'show_tables', dbName: m[2] || null, likePattern: m[4] || null };
  }

  m = trimmed.match(/^\s*USE\s+(\S+)\s*$/i);
  if (m) {
    return { command: 'use_database', dbName: m[1] };
  }

  m = trimmed.match(/^\s*(?:SHOW\s+(?:COLUMNS|FIELDS)\s+FROM|DESC|DESCRIBE)\s+(\S+)\s*$/i);
  if (m) {
    return { command: 'show_columns', tableName: m[1] };
  }

  m = trimmed.match(/^\s*SHOW\s+CREATE\s+TABLE\s+(\S+)\s*$/i);
  if (m) {
    return { command: 'show_create_table', tableName: m[1] };
  }

  return null;
}

async function executeSpecialCommand(parsed, username, pool) {
  const { command, dbName, tableName, likePattern } = parsed;

  switch (command) {
    case 'show_databases': {
      let sql = 'SHOW DATABASES';
      const params = [];
      if (likePattern) {
        const m = likePattern.match(/['"](.+)['"]/);
        if (m) {
          sql += ' LIKE ?';
          params.push(m[1]);
        }
      }
      const [rows] = await pool.query(sql, params);
      const databases = rows.map(r => Object.values(r)[0]);
      return {
        success: true,
        type: 'show',
        message: `查询成功，共 ${databases.length} 个数据库。`,
        data: {
          columns: ['Database'],
          rows: databases.map(name => ({ Database: name })),
          rowCount: databases.length,
          sqlType: 'show',
        },
      };
    }

    case 'show_tables': {
      let sql;
      const params = [];
      if (dbName) {
        sql = 'SHOW TABLES FROM ??';
        params.push(dbName);
      } else {
        sql = 'SHOW TABLES';
      }
      if (likePattern) {
        const m = likePattern.match(/['"](.+)['"]/);
        if (m) {
          sql += ' LIKE ?';
          params.push(m[1]);
        }
      }
      const [rows] = await pool.query(sql, params);
      const tables = rows.map(r => Object.values(r)[0]);
      return {
        success: true,
        type: 'show',
        message: `查询成功，共 ${tables.length} 个表。`,
        data: {
          columns: [`Tables${dbName ? '_in_' + dbName : ''}`],
          rows: tables.map(name => ({ [`Tables${dbName ? '_in_' + dbName : ''}`]: name })),
          rowCount: tables.length,
          sqlType: 'show',
        },
      };
    }

    case 'use_database': {
      try {
        await pool.query('USE ??', [dbName]);
        return {
          success: true,
          type: 'use',
          message: `已切换到数据库 "${dbName}"。注意：USE 切换仅对当前会话有效。`,
          data: {
            database: dbName,
            sqlType: 'use',
          },
        };
      } catch (err) {
        return {
          success: false,
          type: 'error',
          message: `切换数据库失败：${err.message}`,
          data: null,
        };
      }
    }

    case 'show_columns': {
      const [rows] = await pool.query('SHOW COLUMNS FROM ??', [tableName]);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'];
      return {
        success: true,
        type: 'show',
        message: `查询成功，表 "${tableName}" 共有 ${rows.length} 个字段。`,
        data: {
          columns,
          rows,
          rowCount: rows.length,
          sqlType: 'show',
        },
      };
    }

    case 'show_create_table': {
      const [rows] = await pool.query('SHOW CREATE TABLE ??', [tableName]);
      if (rows.length === 0) {
        return {
          success: false,
          type: 'error',
          message: `表 "${tableName}" 不存在。`,
          data: null,
        };
      }
      const row = rows[0];
      const createSql = Object.values(row).find(v => typeof v === 'string' && v.length > 10) || '';
      return {
        success: true,
        type: 'show',
        message: `表 "${tableName}" 的建表语句。`,
        data: {
          columns: ['Table', 'Create Table'],
          rows: [{ Table: tableName, 'Create Table': createSql }],
          rowCount: 1,
          sqlType: 'show',
        },
      };
    }

    default:
      return {
        success: false,
        type: 'error',
        message: `不支持的特殊命令: ${command}`,
        data: null,
      };
  }
}

/** 登录检查 + 分配用户专用连接池 */
function requireDBAdminLogin(req, res, next) {
  const username = req.headers['x-dbadmin-user'] || '';
  const token = req.headers['x-dbadmin-token'] || '';

  if (!username || !dbadminAuth.isLoggedIn(username)) {
    if (username && dbadminAuth.isKicked(username)) {
      return res.json({
        success: false,
        type: 'error',
        code: 'DBADMIN_KICKED',
        message: '您的 DBAdmin 会话已在另一处登录。请重新登录。',
        data: null,
      });
    }
    return res.json({
      success: false,
      type: 'error',
      message: '您尚未登录 DBAdmin。请先执行 Login 命令登录。',
      data: null,
    });
  }

  if (token && !dbadminAuth.validateSession(username, token)) {
    return res.json({
      success: false,
      type: 'error',
      code: 'DBADMIN_KICKED',
      message: '您的 DBAdmin 会话已在另一处登录。请重新登录。',
      data: null,
    });
  }

  const userPool = dbadminAuth.getOrCreateUserPool(username);
  if (!userPool) {
    return res.json({
      success: false,
      type: 'error',
      message: '无法获取用户数据库连接。请重新登录。',
      data: null,
    });
  }

  dbadminAuth.touchUser(username);
  req.dbadminUser = username;
  req.dbadminPool = userPool;
  next();
}

// 1. Login（支持二层认证）
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  let sid = req.body?.sid || req.headers['x-session-id'];
  if (!sid) {
    const cookieName = getCookieName();
    const cookies = parseCookieHeader(req.headers.cookie);
    sid = cookies[cookieName];
  }

  // 无用户名和密码但有 sid → 仅验证第一因子，返回授权 MySQL 用户列表
  if (!username && !password && sid) {
    const grantsResult = await dbadminAuth.getGrantsBySid(sid);
    if (grantsResult.success) {
      return res.json({
        success: true,
        type: 'grants',
        message: 'SSO 身份验证通过，请输入 MySQL 用户名和密码完成登录。',
        data: {
          authorizedUsers: grantsResult.grants,
          uno: grantsResult.uno,
          firstFactor: true,
        },
      });
    }
    return res.json({
      success: false,
      type: 'grants',
      message: grantsResult.message,
      data: null,
    });
  }

  if (!username || !password) {
    return res.json({
      success: false,
      type: 'login',
      message: '用户名和密码均不得为空',
      data: null,
    });
  }

  const result = await dbadminAuth.login(username, password, sid || null);

  if (!result.success && result.firstFactorSucceeded) {
    return res.json({
      success: false,
      type: 'login',
      firstFactor: true,
      message: result.message,
      data: {
        authorizedUsers: result.authorizedUsers,
        uno: result.uno,
      },
    });
  }

  return res.json({
    success: result.success,
    type: 'login',
    message: result.message,
    data: result.user,
    token: result.token,
    ...(result.uno ? { uno: result.uno, hasFirstFactor: true } : {}),
  });
});

// 2. Exit
router.post('/exit', async (req, res) => {
  const username = req.headers['x-dbadmin-user'] || req.body?.username || '';
  const result = await dbadminAuth.logout(username);
  return res.json({
    success: result.success,
    type: 'exit',
    message: result.message,
    data: null,
  });
});

// 3. SQL 执行（核心）
router.post('/execute', requireDBAdminLogin, async (req, res) => {
  const { sql } = req.body || {};
  const username = req.dbadminUser;

  const trimmedSQL = (sql || '').trim();
  if (!trimmedSQL) {
    return res.json({
      success: false,
      type: 'error',
      message: 'SQL 语句不能为空。请输入一条完整的 SQL 命令。',
      data: null,
    });
  }

  // 步骤 1：检测特殊命令（SHOW / USE / DESC 等）
  const parsedSpecial = parseSpecialCommand(trimmedSQL);
  if (parsedSpecial) {
    console.log(`[DBAdmin] 用户 "${username}" 执行特殊命令 [${parsedSpecial.command}]：${trimmedSQL.substring(0, 120)}`);
    const specialResult = await executeSpecialCommand(parsedSpecial, username, req.dbadminPool);
    return res.json(specialResult);
  }

  // 步骤 2：标准 SQL 验证
  const validation = validateSQL(trimmedSQL);
  if (!validation.valid) {
    return res.json({
      success: false,
      type: 'error',
      message: validation.error,
      data: null,
    });
  }

  console.log(`[DBAdmin] 用户 "${username}" 执行 [${validation.type}]：${trimmedSQL.substring(0, 120)}`);

  // 步骤 3：SQL 注入安全检查
  const injectionResult = inspectSQL(trimmedSQL);
  if (!injectionResult.safe) {
    const codes = injectionResult.blockingFindings.map(f => f.code).join(', ');
    const messages = injectionResult.blockingFindings.map(f => f.message).join('；');
    console.warn(`[DBAdmin] 注入检测拦截 用户="${username}" codes=[${codes}] sql="${trimmedSQL.substring(0, 200)}"`);
    return res.json({
      success: false,
      type: 'error',
      message: `安全拦截：${messages}`,
      data: null,
      security: {
        blocked: true,
        findings: injectionResult.blockingFindings,
      },
    });
  }

  // 步骤 4：执行 SQL
  try {
    const [rows, fields] = await req.dbadminPool.query(trimmedSQL);

    if (validation.type === 'select') {
      const rowArray = Array.isArray(rows) ? rows : [];
      const columns = fields
        ? fields.map(f => f.name)
        : (rowArray.length > 0 ? Object.keys(rowArray[0]) : []);

      return res.json({
        success: true,
        type: 'select',
        message: `查询成功，返回 ${rowArray.length} 行数据。`,
        data: {
          columns,
          rows: rowArray,
          rowCount: rowArray.length,
          sqlType: validation.type,
          tables: validation.tables,
        },
      });
    } else {
      const resultHeader = rows;
      const affectedRows = resultHeader?.affectedRows ?? 0;
      const insertId = resultHeader?.insertId ?? 0;
      const warningCount = resultHeader?.warningCount ?? 0;

      let actionName = '';
      switch (validation.type) {
        case 'insert': actionName = '插入'; break;
        case 'update': actionName = '修改'; break;
        case 'delete': actionName = '删除'; break;
        case 'create': actionName = '创建'; break;
        case 'drop':   actionName = '删除'; break;
        default:       actionName = '操作'; break;
      }

      let msg = `${actionName}成功。`;
      if (affectedRows > 0) {
        msg += ` 影响了 ${affectedRows} 行数据。`;
      }
      if (insertId > 0) {
        msg += ` 新插入行的自增 ID 为 ${insertId}。`;
      }
      if (warningCount > 0) {
        msg += ` (有 ${warningCount} 个警告)`;
      }

      return res.json({
        success: true,
        type: validation.type,
        message: msg,
        data: {
          affectedRows,
          insertId,
          warningCount,
          sqlType: validation.type,
          tables: validation.tables,
        },
      });
    }
  } catch (dbErr) {
    console.error(`[DBAdmin] SQL 执行错误：${dbErr.message}`);
    return res.json({
      success: false,
      type: 'error',
      message: `数据库执行错误：${dbErr.message}`,
      data: null,
    });
  }
});

// 4. Status 状态检查
router.get('/status', (req, res) => {
  const username = req.headers['x-dbadmin-user'] || '';
  const token = req.headers['x-dbadmin-token'] || '';
  const loggedIn = dbadminAuth.isLoggedIn(username);
  const tokenValid = token ? dbadminAuth.validateSession(username, token) : true;
  const sessionInfo = (loggedIn && tokenValid) ? dbadminAuth.getSessionInfo(username) : null;

  if (username) {
    dbadminAuth.touchUser(username);
  }

  return res.json({
    success: true,
    type: 'status',
    message: '',
    data: {
      loggedIn,
      username: loggedIn ? username : null,
      currentSession: sessionInfo ? {
        hasFirstFactor: sessionInfo.hasFirstFactor,
        uno: sessionInfo.uno,
        loginTime: sessionInfo.loginTime,
      } : null,
      tokenValid,
    },
  });
});

// 5. Grants 授权查询
router.post('/grants/check', async (req, res) => {
  let sid = req.body?.sid || req.headers['x-session-id'];
  if (!sid) {
    const cookieName = getCookieName();
    const cookies = parseCookieHeader(req.headers.cookie);
    sid = cookies[cookieName];
  }

  if (!sid) {
    return res.json({
      success: false,
      type: 'grants',
      message: '未检测到教务系统登录会话。请先登录教务系统，或直接使用 MySQL 用户名和密码登录。',
      data: null,
    });
  }

  const result = await dbadminAuth.getGrantsBySid(sid);
  return res.json({
    success: result.success,
    type: 'grants',
    message: result.message,
    data: result.success ? {
      authorizedUsers: result.grants,
      uno: result.uno,
    } : null,
  });
});

module.exports = router;