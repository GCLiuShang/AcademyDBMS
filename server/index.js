const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const { getNextSequenceNumber } = require('./services/sequenceService');
const { sendSystemMessage, insertSystemMessageToMany, sendWelcomeMessage } = require('./services/messageService');
const { getCurrentBusinessFlags } = require('./services/businessService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ==========================================
// API Endpoints
// ==========================================

// 1. 用户登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  // 系统管理员账户禁止从前端登录
  if (username === 'O000000000') {
    return res.status(403).json({ success: false, message: '系统管理员账户禁止登录' });
  }

  try {
    // 1.1 查询用户状态
    const [users] = await db.execute('SELECT * FROM User WHERE Uno = ?', [username]);

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const user = users[0];
    const MAX_RETRIES = 5;
    const LOCK_TIME_MS = 60 * 1000; // 1分钟锁定

    // 1.2 检查是否锁定
    if (user.Ustatus === '锁定') {
      const lastTry = new Date(user.Ulasttrytime).getTime();
      const now = Date.now();
      const timePassed = now - lastTry;

      if (timePassed < LOCK_TIME_MS) {
        const remainingSeconds = Math.ceil((LOCK_TIME_MS - timePassed) / 1000);
        return res.status(403).json({ 
          success: false, 
          message: `账户已锁定，请等待 ${remainingSeconds} 秒`,
          locked: true,
          remainingTime: remainingSeconds
        });
      }
    }

    // 1.3 验证密码
    const [match] = await db.execute(
      'SELECT * FROM User WHERE Uno = ? AND Upswd = SHA2(?, 256)',
      [username, password]
    );

    if (match.length > 0) {
      // 密码正确
      
      // 1.4 检查单点登录 (如果已在线，踢出旧会话)
      if (user.Ustatus === '在线') {
        const kickMsg = '您的账号在另一处登录，即将注销登录，若并非您操作请在重新登录后修改密码。';
        await sendSystemMessage(username, kickMsg, '重要');
        
        // 强制下线
        await db.execute('UPDATE User SET Ustatus = ? WHERE Uno = ?', ['离线', username]);

        return res.status(403).json({ 
          success: false, 
          code: 'ALREADY_LOGGED_IN',
          message: '该账号已登录。已向对方发送下线通知，请等待对方下线后重试。' 
        });
      }

      // 1.5 登录成功处理
      await db.execute(
        'UPDATE User SET Ustatus = ?, Ulosetimes = 0, Ulasttrytime = NOW() WHERE Uno = ?', 
        ['在线', username]
      );

      // 构建返回的用户信息 (去除敏感字段)
      const userWithoutPassword = { ...user };
      delete userWithoutPassword.Upswd;
      delete userWithoutPassword.Ulosetimes;
      delete userWithoutPassword.Ulasttrytime;

      // 获取用户真实姓名
      let name = '';
      let roleTable = '';
      let idCol = '';
      let nameCol = '';

      switch (user.Urole) {
        case '学生': roleTable = 'Student'; idCol = 'Sno'; nameCol = 'Sname'; break;
        case '教授': roleTable = 'Professor'; idCol = 'Pno'; nameCol = 'Pname'; break;
        case '学院教学办管理员': roleTable = 'Dept_Adm'; idCol = 'DAno'; nameCol = 'DAname'; break;
        case '学校教务处管理员': roleTable = 'Univ_Adm'; idCol = 'UAno'; nameCol = 'UAname'; break;
      }

      if (roleTable) {
        const [roleRows] = await db.execute(`SELECT ${nameCol} FROM ${roleTable} WHERE ${idCol} = ?`, [username]);
        if (roleRows.length > 0) {
          name = roleRows[0][nameCol];
        }
      }

      const finalUser = { ...userWithoutPassword, name: name || username };

      // 发送欢迎消息 (异步)
      sendWelcomeMessage(finalUser).catch(err => console.error('Failed to send welcome message:', err));

      res.json({ success: true, message: '登录成功', user: finalUser });

    } else {
      // 1.6 密码错误处理
      let newLoseTimes = user.Ulosetimes + 1;
      
      // 如果之前是锁定状态但已过时，重置为1
      if (user.Ustatus === '锁定') newLoseTimes = 1;

      let newStatus = (user.Ustatus === '在线') ? '离线' : user.Ustatus;
      
      if (newLoseTimes >= MAX_RETRIES) {
        newStatus = '锁定';
        newLoseTimes = MAX_RETRIES;
      } else {
        newStatus = '离线';
      }

      await db.execute(
        'UPDATE User SET Ustatus = ?, Ulosetimes = ?, Ulasttrytime = NOW() WHERE Uno = ?',
        [newStatus, newLoseTimes, username]
      );

      const remainingAttempts = MAX_RETRIES - newLoseTimes;
      const msg = newStatus === '锁定' 
        ? `用户名或密码错误\n(还剩余0次尝试，次数为0后将锁定1分钟)`
        : `用户名或密码错误\n(还剩余${remainingAttempts}次尝试，次数为0后将锁定1分钟)`;

      res.status(401).json({ success: false, message: msg, remainingAttempts });
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 2. 用户注销
app.post('/api/logout', async (req, res) => {
  const { username } = req.body;
  if (!username) {
     return res.status(400).json({ success: false, message: 'Username is required' });
  }

  try {
    await db.execute('UPDATE User SET Ustatus = ? WHERE Uno = ?', ['离线', username]);
    res.json({ success: true, message: 'Logout successful' });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 3. 获取新消息 (轮询用)
app.get('/api/messages/new', async (req, res) => {
  const { uno } = req.query;
  
  if (!uno) {
    return res.status(400).json({ success: false, message: 'Uno is required' });
  }

  try {
    // 3.1 刷新活跃时间
    await db.execute('UPDATE User SET Ulasttrytime = NOW() WHERE Uno = ?', [uno]);

    // 3.2 检查会话状态 (超时或被踢)
    const [userRows] = await db.execute('SELECT Ulasttrytime, Ustatus FROM User WHERE Uno = ?', [uno]);
    if (userRows.length > 0) {
      const user = userRows[0];
      const now = new Date();
      // const lastLogin = new Date(user.Ulasttrytime); // 已更新为当前时间，无需比较
      // const diffMs = now - lastLogin;
      const TEN_MINUTES_MS = 10 * 60 * 1000;

      const TIMEOUT_MSG = '会话已过期，您的登录即将注销，请重新登录';
      const KICKED_MSG = '您的账号在另一处登录，即将注销登录，若并非您操作请在重新登录后修改密码。';

      // 辅助函数: 检查最近1分钟是否已发送过某消息
      const checkRecentMsg = async (content) => {
        const [rows] = await db.execute(`
          SELECT MS.Send_time 
          FROM Msg_Receive MR 
          JOIN Msg_Send MS ON MR.Msg_no = MS.Msg_no 
          JOIN Message M ON MR.Msg_no = M.Msg_no 
          WHERE MR.Receive_Uno = ? AND M.Msg_content = ? AND MS.Send_time > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
          ORDER BY MS.Send_time DESC LIMIT 1`, 
          [uno, content]
        );
        return rows.length > 0 ? new Date(rows[0].Send_time) : null;
      };

      // 场景A: 在线超时 (>10分钟) - 已由后台定时任务接管，此处不再处理超时，只处理被踢
      /*
      if (diffMs > TEN_MINUTES_MS && user.Ustatus === '在线') {
        // ... (removed)
      }
      */

      // 场景B: 被踢下线 (状态已变为离线)
      if (user.Ustatus === '离线') {
         const sentTime = await checkRecentMsg(KICKED_MSG);
         // 检查是否是由于超时导致的注销 (非KICKED_MSG)
         const timeoutTime = await checkRecentMsg(TIMEOUT_MSG);

         if (timeoutTime && (now - timeoutTime) < 60000) {
            // 如果最近收到超时消息，则返回 SESSION_EXPIRED
            return res.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: TIMEOUT_MSG });
         }

         if (!sentTime) {
           // 可能是后台定时任务注销，或者其他原因
           // await sendSystemMessage(uno, KICKED_MSG); // 不需要再发消息，直接下线
           return res.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: '会话已过期或已在别处登录' });
         } else if ((now - sentTime) > 5000) {
           return res.status(401).json({ success: false, code: 'ACCOUNT_KICKED', message: KICKED_MSG });
         }
      }
    }

    // 3.3 查询未读消息
    const query = `
      SELECT 
        M.Msg_no, 
        M.Msg_content, 
        M.Msg_category, 
        M.Msg_priority, 
        M.Msg_date,
        MS.Send_Uno,
        CASE WHEN MS.Send_Uno = 'O000000000' THEN '系统' ELSE U.Urole END as SenderRole,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, U.Uno) as SenderName
      FROM Msg_Receive MR
      JOIN Message M ON MR.Msg_no = M.Msg_no
      JOIN Msg_Send MS ON M.Msg_no = MS.Msg_no
      LEFT JOIN User U ON MS.Send_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MR.Receive_Uno = ? 
        AND MR.Receive_display = 1
        AND MR.Receive_haveread = 0
      ORDER BY MS.Send_time DESC
    `;

    const [rows] = await db.execute(query, [uno]);
    res.json({ success: true, messages: rows });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 4. 标记消息已读
app.post('/api/messages/read', async (req, res) => {
  const { uno, msg_no } = req.body;
  if (!uno || !msg_no) return res.status(400).json({ success: false, message: 'Missing parameters' });

  try {
    const query = `UPDATE Msg_Receive SET Receive_haveread = 1, Receive_time = NOW() WHERE Msg_no = ? AND Receive_Uno = ?`;
    const [result] = await db.execute(query, [msg_no, uno]);
    res.json({ success: true, updated: result.affectedRows });
  } catch (error) {
    console.error('Error marking message read:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 5. 软删除消息
app.post('/api/messages/delete', async (req, res) => {
  const { uno, msg_no, type } = req.body;
  if (!uno || !msg_no) return res.status(400).json({ success: false, message: 'Missing parameters' });

  try {
    const query = (type === 'sent') 
      ? `UPDATE Msg_Send SET Send_display = 0 WHERE Msg_no = ? AND Send_Uno = ?`
      : `UPDATE Msg_Receive SET Receive_display = 0 WHERE Msg_no = ? AND Receive_Uno = ?`;
    
    const [result] = await db.execute(query, [msg_no, uno]);
    res.json({ success: true, updated: result.affectedRows });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 5.5 恢复消息 (从回收站恢复显示)
app.post('/api/messages/restore', async (req, res) => {
  const { uno, msg_no, type } = req.body;
  if (!uno || !msg_no) return res.status(400).json({ success: false, message: 'Missing parameters' });

  try {
    const query = (type === 'sent')
      ? `UPDATE Msg_Send SET Send_display = 1 WHERE Msg_no = ? AND Send_Uno = ?`
      : `UPDATE Msg_Receive SET Receive_display = 1 WHERE Msg_no = ? AND Receive_Uno = ?`;

    const [result] = await db.execute(query, [msg_no, uno]);
    res.json({ success: true, updated: result.affectedRows });
  } catch (error) {
    console.error('Error restoring message:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/api/users/search', async (req, res) => {
  const { uno, name, limit = 50 } = req.query;
  const limitNum = Math.min(parseInt(limit) || 50, 200);

  if (!uno && !name) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  try {
    const baseSql = `
      SELECT
        U.Uno,
        U.Urole,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname) as Name
      FROM User U
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
    `;

    if (uno) {
      const sql = `${baseSql} WHERE U.Uno LIKE ? AND U.Uno <> 'O000000000' LIMIT ${limitNum}`;
      const [rows] = await db.execute(sql, [`%${uno}%`]);
      return res.json({ success: true, data: rows });
    }

    const like = `%${name}%`;
    const sql = `
      ${baseSql}
      WHERE (S.Sname LIKE ? OR P.Pname LIKE ? OR DA.DAname LIKE ? OR UA.UAname LIKE ? OR O.Oname LIKE ?)
        AND U.Uno <> 'O000000000'
      LIMIT ${limitNum}
    `;
    const [rows] = await db.execute(sql, [like, like, like, like, like]);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/api/account/info', async (req, res) => {
  const { uno } = req.query;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  try {
    const [userRows] = await db.execute('SELECT Uno, Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const user = userRows[0];
    if (user.Urole === '学生') {
      const [rows] = await db.execute(
        'SELECT Sno, Syear, Sname, Ssex, Sclass, Sstatus FROM Student WHERE Sno = ?',
        [uno]
      );
      return res.json({ success: true, role: user.Urole, data: rows[0] || null });
    }

    if (user.Urole === '教授') {
      const [rows] = await db.execute(
        'SELECT Pno, Pyear, Pname, Psex, Ptitle, Pdept, Poffice, Pstatus FROM Professor WHERE Pno = ?',
        [uno]
      );
      return res.json({ success: true, role: user.Urole, data: rows[0] || null });
    }

    if (user.Urole === '学院教学办管理员') {
      const [rows] = await db.execute(
        'SELECT DAno, DAyear, DAdept, DAname, DAstatus FROM Dept_Adm WHERE DAno = ?',
        [uno]
      );
      return res.json({ success: true, role: user.Urole, data: rows[0] || null });
    }

    if (user.Urole === '学校教务处管理员') {
      const [rows] = await db.execute(
        'SELECT UAno, UAyear, UAname, UAstatus FROM Univ_Adm WHERE UAno = ?',
        [uno]
      );
      return res.json({ success: true, role: user.Urole, data: rows[0] || null });
    }

    return res.json({ success: true, role: user.Urole, data: { Uno: user.Uno } });
  } catch (error) {
    console.error('Error fetching account info:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/account/update', async (req, res) => {
  const { uno, oldPassword, updates } = req.body;
  if (!uno || !oldPassword || !updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
  if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
  const role = userRows[0].Urole;

  const [authRows] = await db.execute('SELECT Uno FROM User WHERE Uno = ? AND Upswd = SHA2(?, 256)', [uno, oldPassword]);
  if (authRows.length === 0) {
    return res.status(403).json({ success: false, code: 'WRONG_PASSWORD', message: 'Wrong password' });
  }

  const allowed = new Set();
  if (role === '学生') {
    allowed.add('Sname');
    allowed.add('Ssex');
    allowed.add('Upswd');
  } else if (role === '教授') {
    allowed.add('Pname');
    allowed.add('Psex');
    allowed.add('Poffice');
    allowed.add('Upswd');
  } else if (role === '学院教学办管理员') {
    allowed.add('DAname');
    allowed.add('Upswd');
  } else if (role === '学校教务处管理员') {
    allowed.add('UAname');
    allowed.add('Upswd');
  } else {
    allowed.add('Upswd');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (allowed.has('Upswd') && typeof updates.Upswd === 'string' && updates.Upswd.length > 0) {
      await connection.execute('UPDATE User SET Upswd = SHA2(?, 256) WHERE Uno = ?', [updates.Upswd, uno]);
    }

    if (role === '学生') {
      if (allowed.has('Sname') && typeof updates.Sname === 'string') {
        await connection.execute('UPDATE Student SET Sname = ? WHERE Sno = ?', [updates.Sname, uno]);
      }
      if (allowed.has('Ssex') && (updates.Ssex === '男' || updates.Ssex === '女')) {
        await connection.execute('UPDATE Student SET Ssex = ? WHERE Sno = ?', [updates.Ssex, uno]);
      }
    } else if (role === '教授') {
      if (allowed.has('Pname') && typeof updates.Pname === 'string') {
        await connection.execute('UPDATE Professor SET Pname = ? WHERE Pno = ?', [updates.Pname, uno]);
      }
      if (allowed.has('Psex') && (updates.Psex === '男' || updates.Psex === '女')) {
        await connection.execute('UPDATE Professor SET Psex = ? WHERE Pno = ?', [updates.Psex, uno]);
      }
      if (allowed.has('Poffice') && typeof updates.Poffice === 'string') {
        await connection.execute('UPDATE Professor SET Poffice = ? WHERE Pno = ?', [updates.Poffice, uno]);
      }
    } else if (role === '学院教学办管理员') {
      if (allowed.has('DAname') && typeof updates.DAname === 'string') {
        await connection.execute('UPDATE Dept_Adm SET DAname = ? WHERE DAno = ?', [updates.DAname, uno]);
      }
    } else if (role === '学校教务处管理员') {
      if (allowed.has('UAname') && typeof updates.UAname === 'string') {
        await connection.execute('UPDATE Univ_Adm SET UAname = ? WHERE UAno = ?', [updates.UAname, uno]);
      }
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating account info:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/useradd/submit', async (req, res) => {
  const { uno, userType, name, sex, year, deptNo, domNo, className, title, office, password } = req.body;

  if (!uno || !userType || !name || !year || !password) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid operator Uno format' });
  }

  if (!/^[0-9]{4}$/.test(String(year))) {
    return res.status(400).json({ success: false, message: 'Invalid year' });
  }

  const trimmedName = String(name).trim();
  if (!trimmedName || trimmedName.length > 20) {
    return res.status(400).json({ success: false, message: 'Invalid name' });
  }

  const trimmedPassword = String(password);
  if (!trimmedPassword || trimmedPassword.length > 20) {
    return res.status(400).json({ success: false, message: 'Invalid password' });
  }

  const normalizedType = String(userType);
  let urole = null;

  if (normalizedType === 'student') {
    urole = '学生';
    if (!(sex === '男' || sex === '女')) {
      return res.status(400).json({ success: false, message: 'Invalid sex for student' });
    }
  } else if (normalizedType === 'professor') {
    urole = '教授';
    if (!(sex === '男' || sex === '女')) {
      return res.status(400).json({ success: false, message: 'Invalid sex for professor' });
    }
    if (!['教授', '副教授', '讲师', '研究员'].includes(title)) {
      return res.status(400).json({ success: false, message: 'Invalid title for professor' });
    }
  } else if (normalizedType === 'deptadm') {
    urole = '学院教学办管理员';
    if (!deptNo) {
      return res.status(400).json({ success: false, message: 'Department is required for dept admin' });
    }
  } else if (normalizedType === 'univadm') {
    urole = '学校教务处管理员';
  } else {
    return res.status(400).json({ success: false, message: 'Invalid user type' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [operatorRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (operatorRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Operator not found' });
    }
    if (operatorRows[0].Urole !== '学校教务处管理员') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const yearNum = Number(year);

    let newUno = null;

    if (normalizedType === 'student') {
      const [deptRows] = await connection.execute(
        'SELECT Dept_no FROM Department WHERE Dept_no = ? AND Dept_status = \'正常\' FOR UPDATE',
        [deptNo || null]
      );
      if (deptNo && deptRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Invalid department for student' });
      }

      let classValue = null;
      if (className) {
        const [classRows] = await connection.execute(
          'SELECT Class_name FROM Class WHERE Class_name = ? FOR UPDATE',
          [className]
        );
        if (classRows.length === 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Invalid class for student' });
        }
        classValue = className;
      }

      const nextNum = await getNextSequenceNumber(connection, 'Student', 'Snumber', { Syear: yearNum });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 1048575) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'No available student number' });
      }
      const hex = nextNum.toString(16).toUpperCase().padStart(5, '0');
      newUno = `S${yearNum}${hex}`;

      await connection.execute(
        'INSERT INTO User (Uno, Upswd, Urole) VALUES (?, SHA2(?, 256), ?)',
        [newUno, trimmedPassword, urole]
      );
      await connection.execute(
        'INSERT INTO Student (Sno, Syear, Snumber, Sname, Ssex, Sclass) VALUES (?, ?, ?, ?, ?, ?)',
        [newUno, yearNum, nextNum, trimmedName, sex, classValue]
      );
    } else if (normalizedType === 'professor') {
      let deptValue = null;
      if (deptNo) {
        const [deptRows] = await connection.execute(
          'SELECT Dept_no FROM Department WHERE Dept_no = ? AND Dept_status = \'正常\' FOR UPDATE',
          [deptNo]
        );
        if (deptRows.length === 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Invalid department for professor' });
        }
        deptValue = deptNo;
      }

      const nextNum = await getNextSequenceNumber(connection, 'Professor', 'Pnumber', { Pyear: yearNum });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 1048575) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'No available professor number' });
      }
      const hex = nextNum.toString(16).toUpperCase().padStart(5, '0');
      newUno = `P${yearNum}${hex}`;

      const officeValue = office && typeof office === 'string' && office.trim().length > 0 ? office.trim().slice(0, 10) : null;

      await connection.execute(
        'INSERT INTO User (Uno, Upswd, Urole) VALUES (?, SHA2(?, 256), ?)',
        [newUno, trimmedPassword, urole]
      );
      await connection.execute(
        'INSERT INTO Professor (Pno, Pyear, Pnumber, Pname, Psex, Ptitle, Pdept, Poffice) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [newUno, yearNum, nextNum, trimmedName, sex, title, deptValue, officeValue]
      );
    } else if (normalizedType === 'deptadm') {
      const [deptRows] = await connection.execute(
        'SELECT Dept_no FROM Department WHERE Dept_no = ? AND Dept_status = \'正常\' FOR UPDATE',
        [deptNo]
      );
      if (deptRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Invalid department for dept admin' });
      }

      const nextNum = await getNextSequenceNumber(connection, 'Dept_Adm', 'DAnumber', { DAyear: yearNum });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 65535) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'No available dept admin number' });
      }
      const hex = nextNum.toString(16).toUpperCase().padStart(4, '0');
      newUno = `DA${yearNum}${hex}`;

      await connection.execute(
        'INSERT INTO User (Uno, Upswd, Urole) VALUES (?, SHA2(?, 256), ?)',
        [newUno, trimmedPassword, urole]
      );
      await connection.execute(
        'INSERT INTO Dept_Adm (DAno, DAyear, DAnumber, DAdept, DAname) VALUES (?, ?, ?, ?, ?)',
        [newUno, yearNum, nextNum, deptNo, trimmedName]
      );
    } else if (normalizedType === 'univadm') {
      const nextNum = await getNextSequenceNumber(connection, 'Univ_Adm', 'UAnumber', { UAyear: yearNum });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 65535) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'No available univ admin number' });
      }
      const hex = nextNum.toString(16).toUpperCase().padStart(4, '0');
      newUno = `UA${yearNum}${hex}`;

      await connection.execute(
        'INSERT INTO User (Uno, Upswd, Urole) VALUES (?, SHA2(?, 256), ?)',
        [newUno, trimmedPassword, urole]
      );
      await connection.execute(
        'INSERT INTO Univ_Adm (UAno, UAyear, UAnumber, UAname) VALUES (?, ?, ?, ?)',
        [newUno, yearNum, nextNum, trimmedName]
      );
    }

    await connection.commit();
    return res.json({ success: true, uno: newUno });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding user:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/messages/send', async (req, res) => {
  const { senderUno, receiverUnos, category, priority, content, wdMsgNo } = req.body;
  if (!senderUno || !Array.isArray(receiverUnos) || receiverUnos.length === 0) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  if (!content || typeof content !== 'string' || content.length > 511) {
    return res.status(400).json({ success: false, message: 'Invalid content' });
  }

  const allowedCategory = new Set(['通知', '代办', '系统', '撤回']);
  const allowedPriority = new Set(['一般', '重要']);
  const finalCategory = allowedCategory.has(category) ? category : '通知';
  const finalPriority = allowedPriority.has(priority) ? priority : '一般';

  const uniqueReceivers = Array.from(new Set(receiverUnos)).filter(u => typeof u === 'string' && u.length > 0);
  if (uniqueReceivers.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid receivers' });
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const dateStrDash = `${yyyy}-${mm}-${dd}`;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const msgNumber = await getNextSequenceNumber(connection, 'Message', 'Msg_number', { Msg_date: dateStrDash });
    const msgNumberHex = msgNumber.toString(16).toUpperCase().padStart(9, '0');
    const msgNo = `MSG${dateStr}${msgNumberHex}`;

    await connection.execute(
      `INSERT INTO Message (Msg_no, Msg_date, Msg_number, Msg_category, Msg_wdMsgno, Msg_priority, Msg_content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [msgNo, now, msgNumber, finalCategory, wdMsgNo || null, finalPriority, content]
    );

    await connection.execute(
      `INSERT INTO Msg_Send (Msg_no, Send_Uno, Send_time, Send_display)
       VALUES (?, ?, ?, ?)`,
      [msgNo, senderUno, now, true]
    );

    for (const receiverUno of uniqueReceivers) {
      await connection.execute(
        `INSERT INTO Msg_Receive (Msg_no, Receive_Uno, Receive_time, Receive_haveread, Receive_display)
         VALUES (?, ?, ?, ?, ?)`,
        [msgNo, receiverUno, '1000-01-01 00:00:00', false, true]
      );
    }

    await connection.commit();
    res.json({ success: true, msgNo });
  } catch (error) {
    await connection.rollback();
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

// 6. 获取回收站消息
app.get('/api/messages/trash', async (req, res) => {
  const { uno } = req.query;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  try {
    const receivedQuery = `
      SELECT M.Msg_no, M.Msg_content, M.Msg_category, M.Msg_priority, M.Msg_date, MS.Send_time as Time, 'received' as Type,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, '系统') as ContactName
      FROM Msg_Receive MR
      JOIN Message M ON MR.Msg_no = M.Msg_no
      JOIN Msg_Send MS ON M.Msg_no = MS.Msg_no
      LEFT JOIN User U ON MS.Send_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MR.Receive_Uno = ? AND MR.Receive_display = 0
    `;

    const sentQuery = `
      SELECT M.Msg_no, M.Msg_content, M.Msg_category, M.Msg_priority, M.Msg_date, MS.Send_time as Time, 'sent' as Type,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, '未知') as ContactName
      FROM Msg_Send MS
      JOIN Message M ON MS.Msg_no = M.Msg_no
      LEFT JOIN Msg_Receive MR ON MS.Msg_no = MR.Msg_no
      LEFT JOIN User U ON MR.Receive_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MS.Send_Uno = ? AND MS.Send_display = 0
    `;

    const [receivedRows] = await db.execute(receivedQuery, [uno]);
    const [sentRows] = await db.execute(sentQuery, [uno]);
    const allTrash = [...receivedRows, ...sentRows].sort((a, b) => new Date(b.Time) - new Date(a.Time));

    res.json({ success: true, data: allTrash });
  } catch (error) {
    console.error('Error fetching trash messages:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 7. 仪表盘消息列表
app.get('/api/dashboard/messages', async (req, res) => {
  const { uno } = req.query;
  if (!uno) return res.status(400).json({ success: false, message: 'User number (uno) is required' });

  try {
    const receivedQuery = `
      SELECT MS.Send_Uno, 
        CASE WHEN MS.Send_Uno = 'O000000000' THEN '系统' ELSE U.Urole END as SenderRole,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, '系统') as SenderName,
        M.Msg_content, MS.Send_time
      FROM Msg_Receive MR
      JOIN Msg_Send MS ON MR.Msg_no = MS.Msg_no
      JOIN Message M ON MR.Msg_no = M.Msg_no
      LEFT JOIN User U ON MS.Send_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MR.Receive_Uno = ? AND MR.Receive_display = true
      ORDER BY MS.Send_time DESC LIMIT 50
    `;
    const [receivedRows] = await db.execute(receivedQuery, [uno]);

    const sentQuery = `
      SELECT MR.Receive_Uno, 
        CASE WHEN MR.Receive_Uno = 'O000000000' THEN '系统' ELSE U.Urole END as ReceiverRole,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, '未知') as ReceiverName,
        M.Msg_content, MR.Receive_time
      FROM Msg_Send MS
      JOIN Msg_Receive MR ON MS.Msg_no = MR.Msg_no
      JOIN Message M ON MS.Msg_no = M.Msg_no
      LEFT JOIN User U ON MR.Receive_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MS.Send_Uno = ? AND MS.Send_display = true
      ORDER BY MS.Send_time DESC LIMIT 50
    `;
    const [sentRows] = await db.execute(sentQuery, [uno]);

    res.json({ success: true, received: receivedRows, sent: sentRows });
  } catch (error) {
    console.error('Error fetching dashboard messages:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/api/business/status', async (req, res) => {
  try {
    const flags = await getCurrentBusinessFlags();
    if (!flags) {
      return res.status(400).json({ success: false, message: 'Business status not found' });
    }
    const { semeNo, curricularOpen, courseOpen, enrollOpen } = flags;
    return res.json({
      success: true,
      semeNo,
      curricularOpen,
      courseOpen,
      enrollOpen,
    });
  } catch (error) {
    console.error('Error fetching business status:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/business/control/update', async (req, res) => {
  const { uno, oldPassword, curricularOpen, courseOpen, enrollOpen } = req.body;
  if (!uno || !oldPassword) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;

    const [authRows] = await connection.execute(
      'SELECT Uno FROM User WHERE Uno = ? AND Upswd = SHA2(?, 256)',
      [uno, oldPassword]
    );
    if (authRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, code: 'WRONG_PASSWORD', message: 'Wrong password' });
    }

    if (role !== '学校教务处管理员') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [semeRows] = await connection.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1 FOR UPDATE');
    if (semeRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const curFlag = !!curricularOpen;
    const courseFlag = !!courseOpen;
    const enrollFlag = !!enrollOpen;

    const [flagRows] = await connection.execute(
      `
        SELECT s.Seme_no AS Semeno,
          COALESCE(ci.Curricular_isOpen, 0) AS CurricularOpen,
          COALESCE(co.Course_isOpen, 0) AS CourseOpen,
          COALESCE(e.Enroll_isOpen, 0) AS EnrollOpen
        FROM Semester s
        LEFT JOIN Curricular_isOpen ci ON ci.Semeno = s.Seme_no
        LEFT JOIN Course_isOpen co ON co.Semeno = s.Seme_no
        LEFT JOIN Enroll_isOpen e ON e.Semeno = s.Seme_no
        WHERE s.Seme_no = ?
        FOR UPDATE
      `,
      [semeNo]
    );

    const oldCurricularOpen = flagRows.length > 0 ? Boolean(flagRows[0].CurricularOpen) : false;
    const oldCourseOpen = flagRows.length > 0 ? Boolean(flagRows[0].CourseOpen) : false;
    const oldEnrollOpen = flagRows.length > 0 ? Boolean(flagRows[0].EnrollOpen) : false;

    if (oldCurricularOpen && !curFlag) {
      const [pRows] = await connection.execute(
        `
          SELECT SetupCuP_ID AS Id, SetupCuP_Cno AS Cno
          FROM Setup_Curricular_P
          WHERE SetupCuP_status = '等待审核'
          FOR UPDATE
        `
      );
      if (pRows.length > 0) {
        const pIds = pRows.map((r) => r.Id);
        const pCnos = Array.from(new Set(pRows.map((r) => r.Cno).filter((v) => v)));
        const pIdPlaceholders = pIds.map(() => '?').join(',');
        await connection.execute(
          `UPDATE Setup_Curricular_P SET SetupCuP_status = '已经取消' WHERE SetupCuP_ID IN (${pIdPlaceholders})`,
          pIds
        );
        if (pCnos.length > 0) {
          const pCnoPlaceholders = pCnos.map(() => '?').join(',');
          await connection.execute(
            `UPDATE Cno_Pool SET Cno_status = '可用' WHERE Cno IN (${pCnoPlaceholders})`,
            pCnos
          );
        }
      }

      const [gRows] = await connection.execute(
        `
          SELECT SetupCuG_ID AS Id, SetupCuG_Cno AS Cno
          FROM Setup_Curricular_G
          WHERE SetupCuG_status = '等待审核'
          FOR UPDATE
        `
      );
      if (gRows.length > 0) {
        const gIds = gRows.map((r) => r.Id);
        const gCnos = Array.from(new Set(gRows.map((r) => r.Cno).filter((v) => v)));
        const gIdPlaceholders = gIds.map(() => '?').join(',');
        await connection.execute(
          `UPDATE Setup_Curricular_G SET SetupCuG_status = '已经取消' WHERE SetupCuG_ID IN (${gIdPlaceholders})`,
          gIds
        );
        if (gCnos.length > 0) {
          const gCnoPlaceholders = gCnos.map(() => '?').join(',');
          await connection.execute(
            `UPDATE Cno_Pool SET Cno_status = '可用' WHERE Cno IN (${gCnoPlaceholders})`,
            gCnos
          );
        }
      }
    }

    if (oldCourseOpen && !courseFlag) {
      await connection.execute(
        `
          UPDATE Setup_Course
          SET SetupCo_status = '已经取消'
          WHERE SetupCo_status = '等待审核'
        `
      );
    }

    if (oldEnrollOpen && !enrollFlag) {
      await connection.execute(
        `
          INSERT IGNORE INTO Pursuit (Pursue_Sno, Pursue_Courno)
          SELECT Enroll_Sno, Enroll_Courno
          FROM Enrollment
        `
      );

      const [zeroEnrollRows] = await connection.execute(
        `
          SELECT
            co.Cour_no AS Courno,
            co.Cour_cno AS Cno,
            cu.Cname AS Cname,
            sc.SetupCo_createPno AS CreatePno,
            sc.SetupCo_status AS SetupStatus
          FROM Course co
          JOIN Curricular cu ON cu.Cno = co.Cour_cno
          LEFT JOIN Setup_Course sc ON sc.SetupCo_Courno = co.Cour_no
          WHERE co.Cour_seme = ?
            AND co.Cour_pnow < 1
            AND co.Cour_status IN ('未开始','进行中')
          FOR UPDATE
        `,
        [semeNo]
      );

      const closingCourNos = Array.from(
        new Set(zeroEnrollRows.map((r) => r.Courno).filter((v) => v))
      );

      const courseFailNotifyList = [];
      zeroEnrollRows.forEach((row) => {
        if (
          row.Courno &&
          row.CreatePno &&
          (row.SetupStatus === '等待审核' || row.SetupStatus === '等待选课')
        ) {
          courseFailNotifyList.push({
            courno: row.Courno,
            pno: row.CreatePno,
            cname: row.Cname || '',
          });
        }
      });

      if (closingCourNos.length > 0) {
        const courPlaceholders = closingCourNos.map(() => '?').join(',');
        await connection.execute(
          `
            UPDATE Course
            SET Cour_status = '已关闭'
            WHERE Cour_no IN (${courPlaceholders})
          `,
          closingCourNos
        );
        await connection.execute(
          `
            UPDATE Setup_Course
            SET SetupCo_status = '未能开课'
            WHERE SetupCo_Courno IN (${courPlaceholders})
              AND SetupCo_status IN ('等待审核','等待选课')
          `,
          closingCourNos
        );
        await connection.execute(
          `
            UPDATE Arrange_Course
            SET ArrangeCo_status = '已结束'
            WHERE ArrangeCo_Courno IN (${courPlaceholders})
          `,
          closingCourNos
        );
      }

      const [nonZeroEnrollRows] = await connection.execute(
        `
          SELECT co.Cour_no AS Courno
          FROM Course co
          WHERE co.Cour_seme = ?
            AND co.Cour_pnow >= 1
            AND co.Cour_status IN ('未开始','进行中')
          FOR UPDATE
        `,
        [semeNo]
      );

      const passedCourNos = Array.from(
        new Set(nonZeroEnrollRows.map((r) => r.Courno).filter((v) => v))
      );

      if (passedCourNos.length > 0) {
        const passPlaceholders = passedCourNos.map(() => '?').join(',');
        await connection.execute(
          `
            UPDATE Setup_Course
            SET SetupCo_status = '已经通过'
            WHERE SetupCo_Courno IN (${passPlaceholders})
              AND SetupCo_status IN ('等待审核','等待选课')
          `,
          passedCourNos
        );
      }

      const [pRows] = await connection.execute(
        `
          SELECT
            SetupCuP_ID AS Id,
            SetupCuP_Cno AS Cno,
            SetupCuP_Cname AS Cname,
            SetupCuP_createPno AS CreatePno
          FROM Setup_Curricular_P
          WHERE SetupCuP_status = '等待选课'
          FOR UPDATE
        `
      );

      const [setupCourseRows] = await connection.execute(
        `
          SELECT SetupCo_Courno AS Courno, SetupCo_status AS Status
          FROM Setup_Course
          WHERE SetupCo_Courno LIKE ?
        `,
        [`%-${semeNo}-%`]
      );

      const cnoStatusMap = new Map();
      setupCourseRows.forEach((row) => {
        const parts = String(row.Courno || '').split('-');
        if (parts.length < 3) return;
        const cno = parts[0];
        if (!cno) return;
        const list = cnoStatusMap.get(cno) || [];
        list.push(String(row.Status || ''));
        cnoStatusMap.set(cno, list);
      });

      const failedPList = [];
      const passedPList = [];

      pRows.forEach((row) => {
        const cno = row.Cno;
        if (!cno) return;
        const statuses = cnoStatusMap.get(cno) || [];
        const hasPassed = statuses.some((s) => s === '已经通过');
        if (!hasPassed) {
          failedPList.push({
            id: row.Id,
            cno,
            cname: row.Cname || '',
            pno: row.CreatePno,
          });
        } else {
          passedPList.push(row.Id);
        }
      });

      if (failedPList.length > 0) {
        const failedIds = failedPList.map((r) => r.id);
        const failedIdPlaceholders = failedIds.map(() => '?').join(',');
        await connection.execute(
          `
            UPDATE Setup_Curricular_P
            SET SetupCuP_status = '未能开课'
            WHERE SetupCuP_ID IN (${failedIdPlaceholders})
          `,
          failedIds
        );

        const failedCnos = Array.from(
          new Set(failedPList.map((r) => r.cno).filter((v) => v))
        );
        if (failedCnos.length > 0) {
          const failedCnoPlaceholders = failedCnos.map(() => '?').join(',');
          await connection.execute(
            `
              UPDATE Cno_Pool
              SET Cno_status = '可用'
              WHERE Cno IN (${failedCnoPlaceholders})
            `,
            failedCnos
          );
        }
      }

      if (passedPList.length > 0) {
        const passedIdPlaceholders = passedPList.map(() => '?').join(',');
        await connection.execute(
          `
            UPDATE Setup_Curricular_P
            SET SetupCuP_status = '已经通过'
            WHERE SetupCuP_ID IN (${passedIdPlaceholders})
          `,
          passedPList
        );
      }

      for (const item of failedPList) {
        if (!item.pno) continue;
        const content = `很抱歉，通过选课，您申请的【${item.cname}】课程下的所有课均未能开课，课程申请被取消。`;
        await insertSystemMessageToMany(connection, [item.pno], content, '重要');
      }

      for (const item of courseFailNotifyList) {
        if (!item.pno) continue;
        const content = `很抱歉，通过选课，您申请任教的【${item.cname}】课程，由于选课人数未能达标，任教申请被取消。`;
        await insertSystemMessageToMany(connection, [item.pno], content, '重要');
      }
    }

    await connection.execute(
      `
        INSERT INTO Curricular_isOpen (Semeno, Curricular_isOpen)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE Curricular_isOpen = VALUES(Curricular_isOpen)
      `,
      [semeNo, curFlag ? 1 : 0]
    );

    await connection.execute(
      `
        INSERT INTO Course_isOpen (Semeno, Course_isOpen)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE Course_isOpen = VALUES(Course_isOpen)
      `,
      [semeNo, courseFlag ? 1 : 0]
    );

    await connection.execute(
      `
        INSERT INTO Enroll_isOpen (Semeno, Enroll_isOpen)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE Enroll_isOpen = VALUES(Enroll_isOpen)
      `,
      [semeNo, enrollFlag ? 1 : 0]
    );

    await connection.commit();
    return res.json({
      success: true,
      semeNo,
      curricularOpen: curFlag,
      courseOpen: courseFlag,
      enrollOpen: enrollFlag,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating business status:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});


// ==========================================
// 8. ReceiveBox 视图管理接口
// ==========================================

// 初始化收件箱视图
app.post('/api/receivebox/view/init', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  // 验证 uno 格式防止注入
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_ReceiveBox_${uno}`;

  try {
    // 1. 删除旧视图 (如果存在)
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);

    // 2. 创建新视图
    // 注意: 视图定义中直接嵌入 uno，筛选属于该用户的消息
    const createViewSql = `
      CREATE VIEW ${viewName} AS
      SELECT 
        MR.Msg_no,
        MS.Send_Uno,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, '系统') as SenderName,
        DATE_FORMAT(MS.Send_time, '%Y-%m-%d %H:%i') as Send_time_Formatted,
        MS.Send_time,
        M.Msg_content
      FROM Msg_Receive MR
      JOIN Message M ON MR.Msg_no = M.Msg_no
      JOIN Msg_Send MS ON MR.Msg_no = MS.Msg_no
      LEFT JOIN User U ON MS.Send_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MR.Receive_Uno = '${uno}' AND MR.Receive_display = 1
    `;
    
    await db.execute(createViewSql);

    res.json({ success: true, viewName });
  } catch (error) {
    console.error('Error creating ReceiveBox view:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 清理收件箱视图
app.post('/api/receivebox/view/cleanup', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  // 验证 uno 格式
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_ReceiveBox_${uno}`;

  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);
    res.json({ success: true, message: 'View cleanup successful' });
  } catch (error) {
    console.error('Error dropping ReceiveBox view:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 8.5 SendBox 视图管理接口
// ==========================================

// 初始化发信箱视图
app.post('/api/sendbox/view/init', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_SendBox_${uno}`;

  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);

    const createViewSql = `
      CREATE VIEW ${viewName} AS
      SELECT
        MS.Msg_no,
        MR.Receive_Uno,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, U.Uno, '未知') as ReceiverName,
        MR.Receive_time,
        M.Msg_content
      FROM Msg_Send MS
      JOIN Message M ON MS.Msg_no = M.Msg_no
      JOIN Msg_Receive MR ON MS.Msg_no = MR.Msg_no
      LEFT JOIN User U ON MR.Receive_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MS.Send_Uno = '${uno}' AND MS.Send_display = 1
    `;

    await db.execute(createViewSql);
    res.json({ success: true, viewName });
  } catch (error) {
    console.error('Error creating SendBox view:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 清理发信箱视图
app.post('/api/sendbox/view/cleanup', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_SendBox_${uno}`;

  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);
    res.json({ success: true, message: 'View cleanup successful' });
  } catch (error) {
    console.error('Error dropping SendBox view:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 8.6 RubbishBox 视图管理接口
// ==========================================

// 初始化垃圾箱视图 (收件垃圾 + 发件垃圾)
app.post('/api/rubbishbox/view/init', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const receivedViewName = `View_RubbishBox_Received_${uno}`;
  const sentViewName = `View_RubbishBox_Sent_${uno}`;

  try {
    await db.execute(`DROP VIEW IF EXISTS ${receivedViewName}`);
    await db.execute(`DROP VIEW IF EXISTS ${sentViewName}`);

    const createReceivedViewSql = `
      CREATE VIEW ${receivedViewName} AS
      SELECT
        MR.Msg_no,
        MS.Send_Uno,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, '系统') as SenderName,
        MS.Send_time,
        M.Msg_content
      FROM Msg_Receive MR
      JOIN Message M ON MR.Msg_no = M.Msg_no
      JOIN Msg_Send MS ON MR.Msg_no = MS.Msg_no
      LEFT JOIN User U ON MS.Send_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MR.Receive_Uno = '${uno}' AND MR.Receive_display = 0
    `;

    const createSentViewSql = `
      CREATE VIEW ${sentViewName} AS
      SELECT
        MS.Msg_no,
        MR.Receive_Uno,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname, U.Uno, '未知') as ReceiverName,
        MR.Receive_time,
        M.Msg_content
      FROM Msg_Send MS
      JOIN Message M ON MS.Msg_no = M.Msg_no
      JOIN Msg_Receive MR ON MS.Msg_no = MR.Msg_no
      LEFT JOIN User U ON MR.Receive_Uno = U.Uno
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
      WHERE MS.Send_Uno = '${uno}' AND MS.Send_display = 0
    `;

    await db.execute(createReceivedViewSql);
    await db.execute(createSentViewSql);

    res.json({ success: true, receivedViewName, sentViewName });
  } catch (error) {
    console.error('Error creating RubbishBox views:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 清理垃圾箱视图
app.post('/api/rubbishbox/view/cleanup', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const receivedViewName = `View_RubbishBox_Received_${uno}`;
  const sentViewName = `View_RubbishBox_Sent_${uno}`;

  try {
    await db.execute(`DROP VIEW IF EXISTS ${receivedViewName}`);
    await db.execute(`DROP VIEW IF EXISTS ${sentViewName}`);
    res.json({ success: true, message: 'View cleanup successful' });
  } catch (error) {
    console.error('Error dropping RubbishBox views:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


app.post('/api/curricularapply/view/init', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const role = userRows[0].Urole;

    const viewName = `View_CurricularApply_${uno}`;
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);

    if (role === '教授') {
      const createViewSql = `
        CREATE VIEW ${viewName} AS
        SELECT
          P.SetupCuP_ID as ApplyID,
          P.SetupCuP_Cname as Cname,
          P.SetupCuP_Cno as Cno,
          P.SetupCuP_createtime as CreateTime,
          DATE_FORMAT(P.SetupCuP_createtime, '%m-%d') as ApplyDate,
          P.SetupCuP_status as Status,
          CP.Cdept as Cdept,
          CP.Cseme as Cseme,
          P.SetupCuP_Cclasshour as Cclasshour,
          P.SetupCuP_Ceattri as Ceattri,
          P.SetupCuP_description as Description
        FROM Setup_Curricular_P P
        JOIN Cno_Pool CP ON P.SetupCuP_Cno = CP.Cno
        WHERE P.SetupCuP_createPno = '${uno}'
      `;
      await db.execute(createViewSql);
      return res.json({ success: true, viewName });
    }

    if (role === '学院教学办管理员') {
      const [deptRows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
      if (deptRows.length === 0) return res.status(404).json({ success: false, message: 'Dept admin not found' });
      const dept = deptRows[0].DAdept;

      const createViewSql = `
        CREATE VIEW ${viewName} AS
        SELECT
          G.SetupCuG_ID as ApplyID,
          G.SetupCuG_Cname as Cname,
          G.SetupCuG_Cno as Cno,
          G.SetupCuG_createtime as CreateTime,
          DATE_FORMAT(G.SetupCuG_createtime, '%m-%d') as ApplyDate,
          G.SetupCuG_status as Status,
          CP.Cdept as Cdept,
          CP.Cseme as Cseme,
          G.SetupCuG_Cclasshour as Cclasshour,
          G.SetupCuG_Ceattri as Ceattri,
          G.SetupCuG_description as Description
        FROM Setup_Curricular_G G
        JOIN Cno_Pool CP ON G.SetupCuG_Cno = CP.Cno
        WHERE CP.Cdept = '${dept}'
      `;
      await db.execute(createViewSql);
      return res.json({ success: true, viewName });
    }

    return res.status(403).json({ success: false, message: 'Unauthorized role' });
  } catch (error) {
    console.error('Error creating CurricularApply view:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/curricularapply/view/cleanup', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_CurricularApply_${uno}`;
  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);
    res.json({ success: true, message: 'View cleanup successful' });
  } catch (error) {
    console.error('Error dropping CurricularApply view:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/curricularapply/submit', async (req, res) => {
  const { uno, cattri, cseme, cname, classhour, ceattri, description } = req.body;
  if (!uno || !cattri || !cseme || !cname || !classhour) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (typeof cname !== 'string' || cname.length === 0 || cname.length > 19) {
    return res.status(400).json({ success: false, message: 'Invalid course name' });
  }
  if (!Number.isFinite(Number(classhour)) || Number(classhour) <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid class hour' });
  }
  if (description !== null && description !== undefined) {
    if (typeof description !== 'string' || description.length > 49) {
      return res.status(400).json({ success: false, message: 'Invalid description' });
    }
  }

  const allowedEattri = new Set(['无', '大作业', '线上', '线下开卷', '线下闭卷']);
  const finalCeattri = ceattri ? String(ceattri) : '无';
  if (!allowedEattri.has(finalCeattri)) {
    return res.status(400).json({ success: false, message: 'Invalid exam attribute' });
  }

  const allowedSeme = new Set([
    '第一学期',
    '第二学期',
    '第三学期',
    '第四学期',
    '第五学期',
    '第六学期',
    '第七学期',
    '第八学期',
    '第九学期',
    '第十学期',
    '第十一学期',
    '第十二学期',
    '第一和第二学期',
    '第三和第四学期',
    '第五和第六学期',
    '第七和第八学期',
    '第九和第十学期',
    '第十一和第十二学期',
    '奇数学期',
    '偶数学期',
    '任意学期',
  ]);
  if (!allowedSeme.has(cseme)) {
    return res.status(400).json({ success: false, message: 'Invalid semester' });
  }

  const attriCodeMap = new Map([
    ['公共必修', 'GB'],
    ['专业必修', 'ZB'],
    ['专业选修', 'ZX'],
    ['通识选修', 'TX'],
    ['个性课程', 'GX'],
  ]);
  const semeCodeMap = new Map([
    ['第一学期', '01'],
    ['第二学期', '02'],
    ['第三学期', '03'],
    ['第四学期', '04'],
    ['第五学期', '05'],
    ['第六学期', '06'],
    ['第七学期', '07'],
    ['第八学期', '08'],
    ['第九学期', '09'],
    ['第十学期', '0A'],
    ['第十一学期', '0B'],
    ['第十二学期', '0C'],
    ['第一和第二学期', '0D'],
    ['第三和第四学期', '0E'],
    ['第五和第六学期', '0F'],
    ['第七和第八学期', '10'],
    ['第九和第十学期', '11'],
    ['第十一和第十二学期', '12'],
    ['奇数学期', '13'],
    ['偶数学期', '14'],
    ['任意学期', '15'],
  ]);
  const attriCode = attriCodeMap.get(cattri);
  const semeCode = semeCodeMap.get(cseme);
  if (!attriCode || !semeCode) {
    return res.status(400).json({ success: false, message: 'Invalid course attribute' });
  }

  const businessFlags = await getCurrentBusinessFlags();
  if (!businessFlags || !businessFlags.curricularOpen) {
    return res.status(403).json({ success: false, message: '当前开课申请业务未开放' });
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const dateStrDash = `${yyyy}-${mm}-${dd}`;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;

    let dept = null;
    if (role === '教授') {
      if (!(cattri === '通识选修' || cattri === '个性课程')) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Invalid course attribute for professor' });
      }
      const [rows] = await connection.execute('SELECT Pdept FROM Professor WHERE Pno = ? FOR UPDATE', [uno]);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Professor not found' });
      }
      dept = rows[0].Pdept;
    } else if (role === '学院教学办管理员') {
      if (!(cattri === '公共必修' || cattri === '专业必修' || cattri === '专业选修')) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Invalid course attribute for dept admin' });
      }
      const [rows] = await connection.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ? FOR UPDATE', [uno]);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Dept admin not found' });
      }
      dept = rows[0].DAdept;
    } else {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    let cno = null;
    const [poolRows] = await connection.execute(
      `SELECT Cno, Cnumber FROM Cno_Pool
       WHERE Cattri = ? AND Cdept = ? AND Cseme = ? AND Cno_status = '可用'
       ORDER BY Cnumber ASC LIMIT 1 FOR UPDATE`,
      [cattri, dept, cseme]
    );
    if (poolRows.length > 0) {
      cno = poolRows[0].Cno;
      await connection.execute(`UPDATE Cno_Pool SET Cno_status = '正在调整' WHERE Cno = ?`, [cno]);
    } else {
      const nextCnumber = await getNextSequenceNumber(connection, 'Cno_Pool', 'Cnumber', {
        Cattri: cattri,
        Cdept: dept,
        Cseme: cseme,
      });
      const cnumberHex = Number(nextCnumber).toString(16).toUpperCase().padStart(3, '0');
      cno = `C${attriCode}${dept}${semeCode}${cnumberHex}`;
      await connection.execute(
        `INSERT INTO Cno_Pool (Cno, Cattri, Cdept, Cseme, Cnumber, Cno_status) VALUES (?, ?, ?, ?, ?, ?)`,
        [cno, cattri, dept, cseme, nextCnumber, '正在调整']
      );
    }

    if (role === '教授') {
      const seq = await getNextSequenceNumber(connection, 'Setup_Curricular_P', 'SetupCuP_number', { SetupCuP_date: dateStrDash });
      const seqHex = Number(seq).toString(16).toUpperCase().padStart(5, '0');
      const applyId = `SETCUP${dateStr}-${seqHex}`;
      await connection.execute(
        `INSERT INTO Setup_Curricular_P
          (SetupCuP_ID, SetupCuP_date, SetupCuP_number, SetupCuP_Cno, SetupCuP_Cname, SetupCuP_Cclasshour, SetupCuP_Ceattri, SetupCuP_description, SetupCuP_status, SetupCuP_createPno)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [applyId, dateStrDash, seq, cno, cname, Number(classhour), finalCeattri, description ?? null, '等待审核', uno]
      );
      await connection.commit();
      return res.json({ success: true, applyId, cno });
    }

    const seq = await getNextSequenceNumber(connection, 'Setup_Curricular_G', 'SetupCuG_number', { SetupCuG_date: dateStrDash });
    const seqHex = Number(seq).toString(16).toUpperCase().padStart(5, '0');
    const applyId = `SETCUG${dateStr}-${seqHex}`;
    await connection.execute(
      `INSERT INTO Setup_Curricular_G
        (SetupCuG_ID, SetupCuG_date, SetupCuG_number, SetupCuG_Cno, SetupCuG_Cname, SetupCuG_Cclasshour, SetupCuG_Ceattri, SetupCuG_description, SetupCuG_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [applyId, dateStrDash, seq, cno, cname, Number(classhour), finalCeattri, description ?? null, '等待审核']
    );
    await connection.commit();
    return res.json({ success: true, applyId, cno });
  } catch (error) {
    await connection.rollback();
    console.error('Error submitting curricular apply:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/curricularapply/cancel', async (req, res) => {
  const { uno, applyId } = req.body;
  if (!uno || !applyId) return res.status(400).json({ success: false, message: 'Missing parameters' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;

    if (role === '教授') {
      const [rows] = await connection.execute(
        `SELECT SetupCuP_Cno as Cno, SetupCuP_status as Status
         FROM Setup_Curricular_P
         WHERE SetupCuP_ID = ? AND SetupCuP_createPno = ? FOR UPDATE`,
        [applyId, uno]
      );
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Apply not found' });
      }
      if (rows[0].Status !== '等待审核') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Only pending apply can be cancelled' });
      }
      await connection.execute(`UPDATE Setup_Curricular_P SET SetupCuP_status = '已经取消' WHERE SetupCuP_ID = ?`, [applyId]);
      await connection.execute(`UPDATE Cno_Pool SET Cno_status = '可用' WHERE Cno = ?`, [rows[0].Cno]);
      await connection.commit();
      return res.json({ success: true });
    }

    if (role === '学院教学办管理员') {
      const [deptRows] = await connection.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ? FOR UPDATE', [uno]);
      if (deptRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Dept admin not found' });
      }
      const dept = deptRows[0].DAdept;

      const [rows] = await connection.execute(
        `SELECT G.SetupCuG_Cno as Cno, G.SetupCuG_status as Status
         FROM Setup_Curricular_G G
         JOIN Cno_Pool CP ON G.SetupCuG_Cno = CP.Cno
         WHERE G.SetupCuG_ID = ? AND CP.Cdept = ? FOR UPDATE`,
        [applyId, dept]
      );
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Apply not found' });
      }
      if (rows[0].Status !== '等待审核') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Only pending apply can be cancelled' });
      }
      await connection.execute(`UPDATE Setup_Curricular_G SET SetupCuG_status = '已经取消' WHERE SetupCuG_ID = ?`, [applyId]);
      await connection.execute(`UPDATE Cno_Pool SET Cno_status = '可用' WHERE Cno = ?`, [rows[0].Cno]);
      await connection.commit();
      return res.json({ success: true });
    }

    await connection.rollback();
    return res.status(403).json({ success: false, message: 'Unauthorized role' });
  } catch (error) {
    await connection.rollback();
    console.error('Error cancelling curricular apply:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/curricularapprove/view/init', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const role = userRows[0].Urole;

    const viewName = `View_CurricularApprove_${uno}`;
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);

    if (role === '学院教学办管理员') {
      const [deptRows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
      if (deptRows.length === 0) return res.status(404).json({ success: false, message: 'Dept admin not found' });
      const dept = deptRows[0].DAdept;

      const createViewSql = `
        CREATE VIEW ${viewName} AS
        SELECT
          P.SetupCuP_ID as ApplyID,
          P.SetupCuP_Cname as Cname,
          CP.Cattri as Cattri,
          P.SetupCuP_createPno as Applicant,
          P.SetupCuP_Cno as Cno,
          P.SetupCuP_createtime as CreateTime,
          DATE_FORMAT(P.SetupCuP_createtime, '%Y-%m-%d %H:%i') as ApplyTime,
          CP.Cdept as Cdept,
          CP.Cseme as Cseme,
          P.SetupCuP_Cclasshour as Cclasshour,
          P.SetupCuP_Ceattri as Ceattri,
          P.SetupCuP_description as Description
        FROM Setup_Curricular_P P
        JOIN Cno_Pool CP ON P.SetupCuP_Cno = CP.Cno
        WHERE CP.Cdept = '${dept}' AND P.SetupCuP_status = '等待审核'
      `;
      await db.execute(createViewSql);
      return res.json({ success: true, viewName });
    }

    if (role === '学校教务处管理员') {
      const createViewSql = `
        CREATE VIEW ${viewName} AS
        SELECT
          G.SetupCuG_ID as ApplyID,
          G.SetupCuG_Cname as Cname,
          CP.Cattri as Cattri,
          CP.Cdept as Applicant,
          G.SetupCuG_Cno as Cno,
          G.SetupCuG_createtime as CreateTime,
          DATE_FORMAT(G.SetupCuG_createtime, '%Y-%m-%d %H:%i') as ApplyTime,
          CP.Cdept as Cdept,
          CP.Cseme as Cseme,
          G.SetupCuG_Cclasshour as Cclasshour,
          G.SetupCuG_Ceattri as Ceattri,
          G.SetupCuG_description as Description
        FROM Setup_Curricular_G G
        JOIN Cno_Pool CP ON G.SetupCuG_Cno = CP.Cno
        WHERE G.SetupCuG_status = '等待审核'
      `;
      await db.execute(createViewSql);
      return res.json({ success: true, viewName });
    }

    return res.status(403).json({ success: false, message: 'Unauthorized role' });
  } catch (error) {
    console.error('Error creating CurricularApprove view:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/curricularapprove/view/cleanup', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_CurricularApprove_${uno}`;
  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);
    res.json({ success: true, message: 'View cleanup successful' });
  } catch (error) {
    console.error('Error dropping CurricularApprove view:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/curricularapprove/pass', async (req, res) => {
  const { uno, applyId } = req.body;
  if (!uno || !applyId) return res.status(400).json({ success: false, message: 'Missing parameters' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;

    if (role === '学院教学办管理员') {
      const [deptRows] = await connection.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ? FOR UPDATE', [uno]);
      if (deptRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Dept admin not found' });
      }
      const dept = deptRows[0].DAdept;

      const [rows] = await connection.execute(
        `SELECT
           P.SetupCuP_Cno as Cno,
           P.SetupCuP_Cname as Cname,
           P.SetupCuP_Cclasshour as Cclasshour,
           P.SetupCuP_Ceattri as Ceattri,
           P.SetupCuP_description as Description,
           P.SetupCuP_status as Status
         FROM Setup_Curricular_P P
         JOIN Cno_Pool CP ON P.SetupCuP_Cno = CP.Cno
         WHERE P.SetupCuP_ID = ? AND CP.Cdept = ? FOR UPDATE`,
        [applyId, dept]
      );
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Apply not found' });
      }
      if (rows[0].Status !== '等待审核') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Only pending apply can be approved' });
      }

      await connection.execute(
        `INSERT INTO Curricular (Cno, Cname, C_classhour, C_eattri, Cdescription, Cstatus)
         VALUES (?, ?, ?, ?, ?, '正常') AS new
         ON DUPLICATE KEY UPDATE
           Cname = new.Cname,
           C_classhour = new.C_classhour,
           C_eattri = new.C_eattri,
           Cdescription = new.Cdescription,
           Cstatus = '正常'`,
        [rows[0].Cno, rows[0].Cname, rows[0].Cclasshour, rows[0].Ceattri, rows[0].Description ?? null]
      );
      await connection.execute(`UPDATE Setup_Curricular_P SET SetupCuP_status = '等待选课' WHERE SetupCuP_ID = ?`, [applyId]);
      await connection.execute(`UPDATE Cno_Pool SET Cno_status = '不可用' WHERE Cno = ?`, [rows[0].Cno]);
      await connection.commit();
      return res.json({ success: true });
    }

    if (role === '学校教务处管理员') {
      const [rows] = await connection.execute(
        `SELECT
           SetupCuG_Cno as Cno,
           SetupCuG_Cname as Cname,
           SetupCuG_Cclasshour as Cclasshour,
           SetupCuG_Ceattri as Ceattri,
           SetupCuG_description as Description,
           SetupCuG_status as Status
         FROM Setup_Curricular_G
         WHERE SetupCuG_ID = ? FOR UPDATE`,
        [applyId]
      );
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Apply not found' });
      }
      if (rows[0].Status !== '等待审核') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Only pending apply can be approved' });
      }

      await connection.execute(
        `INSERT INTO Curricular (Cno, Cname, C_classhour, C_eattri, Cdescription, Cstatus)
         VALUES (?, ?, ?, ?, ?, '正常') AS new
         ON DUPLICATE KEY UPDATE
           Cname = new.Cname,
           C_classhour = new.C_classhour,
           C_eattri = new.C_eattri,
           Cdescription = new.Cdescription,
           Cstatus = '正常'`,
        [rows[0].Cno, rows[0].Cname, rows[0].Cclasshour, rows[0].Ceattri, rows[0].Description ?? null]
      );
      await connection.execute(`UPDATE Setup_Curricular_G SET SetupCuG_status = '已经通过' WHERE SetupCuG_ID = ?`, [applyId]);
      await connection.execute(`UPDATE Cno_Pool SET Cno_status = '不可用' WHERE Cno = ?`, [rows[0].Cno]);
      await connection.commit();
      return res.json({ success: true });
    }

    await connection.rollback();
    return res.status(403).json({ success: false, message: 'Unauthorized role' });
  } catch (error) {
    await connection.rollback();
    console.error('Error approving curricular apply:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/courseapply/view/init', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const role = userRows[0].Urole;
    if (role !== '教授') return res.status(403).json({ success: false, message: 'Unauthorized role' });

    const [deptRows] = await db.execute('SELECT Pdept FROM Professor WHERE Pno = ?', [uno]);
    if (deptRows.length === 0) return res.status(404).json({ success: false, message: 'Professor not found' });
    const dept = deptRows[0].Pdept;
    if (!dept) return res.status(400).json({ success: false, message: 'Professor department not found' });

    const cnoPoolViewName = `View_Courseapply_CnoPool_${uno}`;
    const profViewName = `View_Courseapply_Prof_${uno}`;
    await db.execute(`DROP VIEW IF EXISTS ${cnoPoolViewName}`);
    await db.execute(`DROP VIEW IF EXISTS ${profViewName}`);

    const createCnoPoolViewSql = `
      CREATE VIEW ${cnoPoolViewName} AS
      SELECT
        CP.Cno as Cno,
        CP.Cattri as Cattri,
        CP.Cseme as Cseme,
        CASE
          WHEN C.Cname IS NOT NULL THEN C.Cname
          WHEN GL.SetupCuG_Cname IS NOT NULL THEN CONCAT(GL.SetupCuG_Cname, '(在建)')
          WHEN PL.SetupCuP_Cname IS NOT NULL THEN CONCAT(PL.SetupCuP_Cname, '(在建)')
          ELSE ''
        END as Cname
      FROM Cno_Pool CP
      LEFT JOIN Curricular C ON C.Cno = CP.Cno
      LEFT JOIN (
        SELECT
          SetupCuG_Cno,
          SUBSTRING_INDEX(GROUP_CONCAT(SetupCuG_Cname ORDER BY SetupCuG_createtime DESC), ',', 1) as SetupCuG_Cname
        FROM Setup_Curricular_G
        GROUP BY SetupCuG_Cno
      ) GL ON GL.SetupCuG_Cno = CP.Cno
      LEFT JOIN (
        SELECT
          SetupCuP_Cno,
          SUBSTRING_INDEX(GROUP_CONCAT(SetupCuP_Cname ORDER BY SetupCuP_createtime DESC), ',', 1) as SetupCuP_Cname
        FROM Setup_Curricular_P
        GROUP BY SetupCuP_Cno
      ) PL ON PL.SetupCuP_Cno = CP.Cno
      WHERE CP.Cdept = '${dept}' AND CP.Cno_status != '可用'
    `;
    await db.execute(createCnoPoolViewSql);

    const createProfViewSql = `
      CREATE VIEW ${profViewName} AS
      SELECT
        Pno as Pno,
        Pname as Pname
      FROM Professor
      WHERE Pdept = '${dept}'
    `;
    await db.execute(createProfViewSql);

    return res.json({ success: true, cnoPoolViewName, profViewName });
  } catch (error) {
    console.error('Error creating CourseApply views:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/courseapply/view/cleanup', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const cnoPoolViewName = `View_Courseapply_CnoPool_${uno}`;
  const profViewName = `View_Courseapply_Prof_${uno}`;
  try {
    await db.execute(`DROP VIEW IF EXISTS ${cnoPoolViewName}`);
    await db.execute(`DROP VIEW IF EXISTS ${profViewName}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error dropping CourseApply views:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/courseapply/submit', async (req, res) => {
  const { uno, cno, campus, pmax, professorPnos, days } = req.body;
  if (!uno || !cno || !campus || !pmax || !Array.isArray(professorPnos) || !Array.isArray(days)) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (typeof cno !== 'string' || cno.length === 0 || cno.length > 10) {
    return res.status(400).json({ success: false, message: 'Invalid Cno' });
  }
  if (typeof campus !== 'string' || campus.length === 0 || campus.length > 8) {
    return res.status(400).json({ success: false, message: 'Invalid campus' });
  }

  const pmaxNumRaw = Number(pmax);
  if (!Number.isFinite(pmaxNumRaw) || pmaxNumRaw <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid max students' });
  }
  const pmaxNum = Math.min(120, Math.floor(pmaxNumRaw));

  const uniqueProfPnos = Array.from(
    new Set((professorPnos || []).map(v => (v === null || v === undefined ? '' : String(v).trim())).filter(Boolean))
  );
  if (uniqueProfPnos.length === 0) {
    return res.status(400).json({ success: false, message: 'Missing professors' });
  }

  const uniqueDays = Array.from(
    new Set((days || []).map(v => (v === null || v === undefined ? '' : String(v).trim())).filter(Boolean))
  );
  if (uniqueDays.length === 0) {
    return res.status(400).json({ success: false, message: 'Missing days' });
  }
  for (const d of uniqueDays) {
    if (!/^[1-7]$/.test(d)) {
      return res.status(400).json({ success: false, message: 'Invalid dayofweek' });
    }
  }

  const businessFlags = await getCurrentBusinessFlags();
  if (!businessFlags || !businessFlags.courseOpen) {
    return res.status(403).json({ success: false, message: '当前任教申请业务未开放' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;
    if (role !== '教授') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [deptRows] = await connection.execute('SELECT Pdept FROM Professor WHERE Pno = ? FOR UPDATE', [uno]);
    if (deptRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Professor not found' });
    }
    const dept = deptRows[0].Pdept;
    if (!dept) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Professor department not found' });
    }

    const [cnoRows] = await connection.execute(
      `SELECT Cno, Cattri FROM Cno_Pool WHERE Cno = ? AND Cdept = ? AND Cno_status != '可用' FOR UPDATE`,
      [cno, dept]
    );
    if (cnoRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid course selection' });
    }

    const [curricularRows] = await connection.execute(`SELECT Cno FROM Curricular WHERE Cno = ? FOR UPDATE`, [cno]);
    if (curricularRows.length === 0) {
      const cattri = cnoRows[0].Cattri;
      let source = null;
      let cname = null;
      let classhour = null;
      let ceattri = null;
      let description = null;
      let notifyUnos = [];

      if (cattri === '公共必修' || cattri === '专业必修' || cattri === '专业选修') {
        const [setupRows] = await connection.execute(
          `SELECT SetupCuG_ID as ApplyID, SetupCuG_Cname as Cname, SetupCuG_Cclasshour as Cclasshour, SetupCuG_Ceattri as Ceattri, SetupCuG_description as Description
           FROM Setup_Curricular_G
           WHERE SetupCuG_Cno = ?
           ORDER BY SetupCuG_createtime DESC
           LIMIT 1 FOR UPDATE`,
          [cno]
        );
        if (setupRows.length > 0) {
          source = { type: 'G', applyId: setupRows[0].ApplyID };
          cname = setupRows[0].Cname;
          classhour = setupRows[0].Cclasshour;
          ceattri = setupRows[0].Ceattri;
          description = setupRows[0].Description ?? null;

          const [uaRows] = await connection.execute(`SELECT UAno FROM Univ_Adm WHERE UAstatus = '在职' FOR UPDATE`);
          notifyUnos = uaRows.map((r) => r.UAno).filter(Boolean);
        }
      } else {
        const [setupRows] = await connection.execute(
          `SELECT SetupCuP_ID as ApplyID, SetupCuP_Cname as Cname, SetupCuP_Cclasshour as Cclasshour, SetupCuP_Ceattri as Ceattri, SetupCuP_description as Description
           FROM Setup_Curricular_P
           WHERE SetupCuP_Cno = ?
           ORDER BY SetupCuP_createtime DESC
           LIMIT 1 FOR UPDATE`,
          [cno]
        );
        if (setupRows.length > 0) {
          source = { type: 'P', applyId: setupRows[0].ApplyID };
          cname = setupRows[0].Cname;
          classhour = setupRows[0].Cclasshour;
          ceattri = setupRows[0].Ceattri;
          description = setupRows[0].Description ?? null;

          const [daRows] = await connection.execute(
            `SELECT DAno FROM Dept_Adm WHERE DAdept = ? AND DAstatus = '在职' FOR UPDATE`,
            [dept]
          );
          notifyUnos = daRows.map((r) => r.DAno).filter(Boolean);
        }
      }

      if (!source || !cname || !classhour || !ceattri) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Course details not found for forced approval' });
      }

      await connection.execute(
        `INSERT INTO Curricular (Cno, Cname, C_classhour, C_eattri, Cdescription, Cstatus)
         VALUES (?, ?, ?, ?, ?, '正常') AS new
         ON DUPLICATE KEY UPDATE
           Cname = new.Cname,
           C_classhour = new.C_classhour,
           C_eattri = new.C_eattri,
           Cdescription = new.Cdescription,
           Cstatus = '正常'`,
        [cno, cname, Number(classhour), ceattri, description]
      );

      if (source.type === 'G') {
        await connection.execute(`UPDATE Setup_Curricular_G SET SetupCuG_status = '已经通过' WHERE SetupCuG_ID = ? AND SetupCuG_status = '等待审核'`, [
          source.applyId,
        ]);
      } else {
        await connection.execute(`UPDATE Setup_Curricular_P SET SetupCuP_status = '等待选课' WHERE SetupCuP_ID = ? AND SetupCuP_status = '等待审核'`, [
          source.applyId,
        ]);
      }

      await connection.execute(`UPDATE Cno_Pool SET Cno_status = '不可用' WHERE Cno = ?`, [cno]);

      const content = `由于任教申请的需要，编号为${cno}的【${cname}】课程的申请已强制批准`;
      await insertSystemMessageToMany(connection, notifyUnos, content, '重要');
    }

    const [campusRows] = await connection.execute(
      `SELECT Cam_name FROM Campus WHERE Cam_name = ? AND Cam_status = '正常' FOR UPDATE`,
      [campus]
    );
    if (campusRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid campus selection' });
    }

    const profPlaceholders = uniqueProfPnos.map(() => '?').join(',');
    const profParams = [dept, ...uniqueProfPnos];
    const [profRows] = await connection.execute(
      `SELECT Pno FROM Professor WHERE Pdept = ? AND Pno IN (${profPlaceholders}) FOR UPDATE`,
      profParams
    );
    if (profRows.length !== uniqueProfPnos.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid professor selection' });
    }

    const dayPlaceholders = uniqueDays.map(() => '?').join(',');
    const [dayRows] = await connection.execute(`SELECT Day FROM Dayofweek WHERE Day IN (${dayPlaceholders}) FOR UPDATE`, uniqueDays);
    if (dayRows.length !== uniqueDays.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid dayofweek selection' });
    }

    const [semeRows] = await connection.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1 FOR UPDATE');
    if (semeRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const [maxCourseRows] = await connection.execute(
      'SELECT MAX(Cour_number) as maxNum FROM Course WHERE Cour_cno = ? AND Cour_seme = ? FOR UPDATE',
      [cno, semeNo]
    );
    const courseMax = maxCourseRows[0].maxNum === null ? -1 : Number(maxCourseRows[0].maxNum);

    const likePrefix = `${cno}-${semeNo}-%`;
    const [maxSetupRows] = await connection.execute(
      `SELECT MAX(CONV(SUBSTRING_INDEX(SetupCo_Courno, '-', -1), 16, 10)) as maxNum
       FROM Setup_Course
       WHERE SetupCo_Courno LIKE ? FOR UPDATE`,
      [likePrefix]
    );
    const setupMax = maxSetupRows[0].maxNum === null ? -1 : Number(maxSetupRows[0].maxNum);

    const nextNum = Math.max(courseMax, setupMax) + 1;
    if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 4095) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'No available course number' });
    }
    const numHex = Number(nextNum).toString(16).toUpperCase().padStart(3, '0');
    const courno = `${cno}-${semeNo}-${numHex}`;

    await connection.execute(
      `INSERT INTO Setup_Course (SetupCo_Courno, SetupCo_campus, SetupCo_pmax, SetupCo_status, SetupCo_createPno)
       VALUES (?, ?, ?, '等待审核', ?)`,
      [courno, campus, pmaxNum, uno]
    );

    for (const pno of uniqueProfPnos) {
      await connection.execute(`INSERT INTO SetupCo_Prof (SetupCo_Courno, SetupCo_Pno) VALUES (?, ?)`, [courno, pno]);
    }

    for (const d of uniqueDays) {
      await connection.execute(`INSERT INTO SetupCo_DofW (SetupCo_Courno, SetupCo_dayofweek) VALUES (?, ?)`, [courno, d]);
    }

    await connection.commit();
    return res.json({
      success: true,
      courno,
      adjustedPmax: pmaxNumRaw !== pmaxNum,
      pmax: pmaxNum,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error submitting course apply:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/examapply/view/init', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const role = userRows[0].Urole;
    if (role !== '学院教学办管理员') return res.status(403).json({ success: false, message: 'Unauthorized role' });

    const [deptRows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
    if (deptRows.length === 0) return res.status(404).json({ success: false, message: 'Dept admin not found' });
    const dept = deptRows[0].DAdept;
    if (!dept) return res.status(400).json({ success: false, message: 'Dept not found' });

    const viewName = `View_Examapply_Curricular_${uno}`;
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);

    const createViewSql = `
      CREATE VIEW ${viewName} AS
      SELECT
        C.Cno as Cno,
        CP.Cattri as Cattri,
        C.Cname as Cname,
        CP.Cseme as Cseme,
        C.C_eattri as Ceattri,
        C.C_classhour as Cclasshour,
        C.Cdescription as Description
      FROM Curricular C
      JOIN Cno_Pool CP ON CP.Cno = C.Cno
      WHERE CP.Cdept = '${dept}'
        AND C.Cstatus = '正常'
        AND C.C_eattri IN ('线下开卷','线下闭卷')
    `;
    await db.execute(createViewSql);

    return res.json({ success: true, viewName });
  } catch (error) {
    console.error('Error creating ExamApply view:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/examapply/view/cleanup', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_Examapply_Curricular_${uno}`;
  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error dropping ExamApply view:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

function parseStrictDateTime(dateStr, timeStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) return null;
  const [yStr, moStr, dStr] = dateStr.split('-');
  const [hStr, miStr, sStr] = timeStr.split(':');
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);
  const h = Number(hStr);
  const mi = Number(miStr);
  const s = Number(sStr);
  if (![y, mo, d, h, mi, s].every(Number.isInteger)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  if (h < 0 || h > 23) return null;
  if (mi < 0 || mi > 59) return null;
  if (s < 0 || s > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi, s, 0);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatDateTimeLocal(dt) {
  const yyyy = String(dt.getFullYear());
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function normalizeDateTimeParam(value) {
  if (!value) return null;
  if (value instanceof Date) return formatDateTimeLocal(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return s.replace('T', ' ').slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return formatDateTimeLocal(dt);
  return null;
}

function makeExamArrangeId(eno, num) {
  const hex = Number(num).toString(16).toUpperCase().padStart(3, '0');
  return `${eno}-${hex}`;
}

app.post('/api/examapply/submit', async (req, res) => {
  const { uno, cno, eattri, date, time, durationMinutes } = req.body;
  if (!uno || !cno || !eattri || !date || !time || durationMinutes === undefined || durationMinutes === null) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (typeof cno !== 'string' || cno.length === 0 || cno.length > 10) {
    return res.status(400).json({ success: false, message: 'Invalid Cno' });
  }
  if (!(eattri === '正考' || eattri === '补缓考' || eattri === '其他')) {
    return res.status(400).json({ success: false, message: 'Invalid exam attribute' });
  }
  const dur = Number(durationMinutes);
  if (!Number.isFinite(dur) || dur <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid duration' });
  }
  if (dur < 30 || dur > 180) {
    return res.status(400).json({ success: false, message: 'Invalid duration' });
  }

  const beginDt = parseStrictDateTime(String(date).trim(), String(time).trim());
  if (!beginDt) {
    return res.status(400).json({ success: false, message: 'Invalid datetime' });
  }
  const endDt = new Date(beginDt.getTime() + Math.floor(dur) * 60 * 1000);
  if (Number.isNaN(endDt.getTime()) || endDt <= beginDt) {
    return res.status(400).json({ success: false, message: 'Invalid datetime' });
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const dateStrDash = `${yyyy}-${mm}-${dd}`;

  const eattriCodeMap = new Map([
    ['正考', 'Z'],
    ['补缓考', 'H'],
    ['其他', 'T'],
  ]);
  const eCode = eattriCodeMap.get(eattri);
  if (!eCode) return res.status(400).json({ success: false, message: 'Invalid exam attribute' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;
    if (role !== '学院教学办管理员') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [deptRows] = await connection.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ? FOR UPDATE', [uno]);
    if (deptRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Dept admin not found' });
    }
    const dept = deptRows[0].DAdept;
    if (!dept) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Dept not found' });
    }

    const [curricularRows] = await connection.execute(
      `SELECT C.Cno
       FROM Curricular C
       JOIN Cno_Pool CP ON CP.Cno = C.Cno
       WHERE C.Cno = ?
         AND CP.Cdept = ?
         AND C.Cstatus = '正常'
         AND C.C_eattri IN ('线下开卷','线下闭卷')
       FOR UPDATE`,
      [cno, dept]
    );
    if (curricularRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid course selection' });
    }

    const [semeRows] = await connection.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1 FOR UPDATE');
    if (semeRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const seq = await getNextSequenceNumber(connection, 'Setup_Exam', 'SetupE_number', { SetupE_date: dateStrDash });
    const seqHex = Number(seq).toString(16).toUpperCase().padStart(6, '0');
    const setupEId = `SETCE${dateStr}-${seqHex}`;

    const [maxExamRows] = await connection.execute(
      `SELECT MAX(CONV(SUBSTRING(Eno, 7, 3), 16, 10)) as maxNum
       FROM Exam
       WHERE SUBSTRING(Eno, 2, 5) = ? FOR UPDATE`,
      [semeNo]
    );
    const examMax = maxExamRows[0].maxNum === null ? -1 : Number(maxExamRows[0].maxNum);

    const [maxSetupRows] = await connection.execute(
      `SELECT MAX(SetupE_Enumber) as maxNum
       FROM Setup_Exam
       WHERE SetupE_Esemeno = ? FOR UPDATE`,
      [semeNo]
    );
    const setupMax = maxSetupRows[0].maxNum === null ? -1 : Number(maxSetupRows[0].maxNum);

    const nextNum = Math.max(examMax, setupMax) + 1;
    if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 4095) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'No available exam number' });
    }

    const enumberHex = Number(nextNum).toString(16).toUpperCase().padStart(3, '0');
    const eno = `E${semeNo}${enumberHex}${eCode}`;

    await connection.execute(
      `INSERT INTO Setup_Exam
        (SetupE_ID, SetupE_date, SetupE_number, SetupE_Cno, SetupE_Eno, SetupE_Esemeno, SetupE_Enumber, SetupE_Eattri, SetupE_Etime_begin, SetupE_Etime_end, SetupE_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '等待审核')`,
      [setupEId, dateStrDash, seq, cno, eno, semeNo, nextNum, eattri, formatDateTimeLocal(beginDt), formatDateTimeLocal(endDt)]
    );

    await connection.commit();
    return res.json({ success: true, setupEId, eno });
  } catch (error) {
    await connection.rollback();
    console.error('Error submitting exam apply:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.get('/api/arrange/transactions/list', async (req, res) => {
  const { uno, page = 1, limit = 20, searchId } = req.query;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;
  const searchIdVal = searchId ? String(searchId).trim() : '';

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userRows[0].Urole !== '学校教务处管理员') {
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    let courseWhere = `SetupCo_status = '等待审核'`;
    let examWhere = `SetupE_status = '等待审核'`;
    const courseParams = [];
    const examParams = [];

    if (searchIdVal) {
      courseWhere += ` AND SetupCo_Courno LIKE ?`;
      examWhere += ` AND SetupE_ID LIKE ?`;
      const like = `%${searchIdVal}%`;
      courseParams.push(like);
      examParams.push(like);
    }

    const [courseCountRows] = await db.execute(
      `SELECT COUNT(*) as total FROM Setup_Course WHERE ${courseWhere}`,
      courseParams
    );
    const [examCountRows] = await db.execute(
      `SELECT COUNT(*) as total FROM Setup_Exam WHERE ${examWhere}`,
      examParams
    );
    const courseTotal = Number(courseCountRows[0].total) || 0;
    const examTotal = Number(examCountRows[0].total) || 0;
    const total = courseTotal + examTotal;

    const courseSql = `
      SELECT
        'course' AS type,
        '课程' AS typeLabel,
        sc.SetupCo_Courno AS id,
        sc.SetupCo_createtime AS createTime,
        DATE_FORMAT(sc.SetupCo_createtime, '%Y-%m-%d %H:%i:%s') AS createdAt,
        sc.SetupCo_campus AS campus,
        sc.SetupCo_pmax AS pmax,
        NULL AS cno,
        NULL AS seme,
        NULL AS eattri,
        NULL AS beginTime,
        NULL AS endTime
      FROM Setup_Course sc
      WHERE ${courseWhere}
    `;

    const examSql = `
      SELECT
        'exam' AS type,
        '考试' AS typeLabel,
        se.SetupE_ID AS id,
        CAST(CONCAT(se.SetupE_date, ' 00:00:00') AS DATETIME) AS createTime,
        DATE_FORMAT(se.SetupE_date, '%Y-%m-%d') AS createdAt,
        NULL AS campus,
        NULL AS pmax,
        se.SetupE_Cno AS cno,
        se.SetupE_Esemeno AS seme,
        se.SetupE_Eattri AS eattri,
        DATE_FORMAT(se.SetupE_Etime_begin, '%Y-%m-%d %H:%i:%s') AS beginTime,
        DATE_FORMAT(se.SetupE_Etime_end, '%Y-%m-%d %H:%i:%s') AS endTime
      FROM Setup_Exam se
      WHERE ${examWhere}
    `;

    const dataSql = `
      SELECT *
      FROM (
        ${courseSql}
        UNION ALL
        ${examSql}
      ) t
      ORDER BY t.createTime DESC, t.id ASC
      LIMIT ${limitNum} OFFSET ${offset}
    `;
    const params = [...courseParams, ...examParams];
    const [rows] = await db.execute(dataSql, params);

    const data = rows.map((r) => {
      const summary =
        r.type === 'course'
          ? `任教校区：${r.campus || ''}，意向最大人数：${r.pmax == null ? '' : r.pmax}`
          : `课程编号：${r.cno || ''}，考试学期：${r.seme || ''}，考试性质：${r.eattri || ''}`;
      return {
        type: r.type,
        typeLabel: r.typeLabel,
        id: r.id,
        createdAt: r.createdAt,
        campus: r.campus,
        pmax: r.pmax,
        cno: r.cno,
        seme: r.seme,
        eattri: r.eattri,
        beginTime: r.beginTime,
        endTime: r.endTime,
        summary,
      };
    });

    const totalPages = Math.ceil(total / limitNum) || 1;
    return res.json({
      success: true,
      data,
      pagination: {
        total,
        page: pageNum,
        totalPages,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error fetching arrange transactions:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/arrange/course/submit', async (req, res) => {
  const { uno, courno, selectedDay, perSessionLessons, weeks } = req.body;
  if (!uno || !courno || !selectedDay || perSessionLessons === undefined || perSessionLessons === null || !Array.isArray(weeks)) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  if (!/^[A-Z0-9]{10}-[0-9]{5}-[0-9A-F]{3}$/.test(String(courno))) {
    return res.status(400).json({ success: false, message: 'Invalid Cour_no format' });
  }
  if (!/^[1-7]$/.test(String(selectedDay))) {
    return res.status(400).json({ success: false, message: 'Invalid dayofweek' });
  }
  const per = Number(perSessionLessons);
  if (!Number.isFinite(per) || per <= 0 || per > 13) {
    return res.status(400).json({ success: false, message: 'Invalid perSessionLessons' });
  }

  const weekMap = new Map();
  for (const w of weeks) {
    const weekNo = Number(w?.week);
    const lessons = Array.isArray(w?.lessons) ? w.lessons : [];
    const classroom = w?.classroom === null || w?.classroom === undefined ? '' : String(w.classroom).trim();
    if (!Number.isFinite(weekNo) || weekNo <= 0 || weekNo > 255) {
      return res.status(400).json({ success: false, message: 'Invalid week' });
    }
    if (classroom.length === 0 || classroom.length > 30) {
      return res.status(400).json({ success: false, message: 'Invalid classroom' });
    }
    const cleanLessons = Array.from(
      new Set(
        lessons
          .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
          .filter((v) => /^[0-9]{2}$/.test(v))
      )
    ).sort((a, b) => Number(a) - Number(b));
    if (cleanLessons.length === 0 || cleanLessons.length > per) {
      return res.status(400).json({ success: false, message: 'Lessons count invalid' });
    }
    if (weekMap.has(weekNo)) {
      return res.status(400).json({ success: false, message: 'Duplicate week' });
    }
    weekMap.set(weekNo, { classroom, lessons: cleanLessons });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userRows[0].Urole !== '学校教务处管理员') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [setupRows] = await connection.execute(
      `SELECT SetupCo_Courno, SetupCo_campus, SetupCo_pmax, SetupCo_status
       FROM Setup_Course
       WHERE SetupCo_Courno = ? FOR UPDATE`,
      [courno]
    );
    if (setupRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Setup_Course not found' });
    }
    if (setupRows[0].SetupCo_status !== '等待审核') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Only pending setup can be arranged' });
    }
    const campus = setupRows[0].SetupCo_campus;
    const pmax = Number(setupRows[0].SetupCo_pmax);
    if (!campus || !Number.isFinite(pmax) || pmax <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid setup course data' });
    }

    const [profRows] = await connection.execute(
      `SELECT SetupCo_Pno
       FROM SetupCo_Prof
       WHERE SetupCo_Courno = ?
       ORDER BY SetupCo_Pno ASC
       LIMIT 1 FOR UPDATE`,
      [courno]
    );
    if (profRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'No professor assigned for this course' });
    }
    const arrangePno = profRows[0].SetupCo_Pno;

    const [dayRows] = await connection.execute(
      `SELECT 1 FROM SetupCo_DofW WHERE SetupCo_Courno = ? AND SetupCo_dayofweek = ? LIMIT 1 FOR UPDATE`,
      [courno, String(selectedDay)]
    );
    if (dayRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Selected day is not in intended days' });
    }

    const [courseExistsRows] = await connection.execute(`SELECT Cour_no FROM Course WHERE Cour_no = ? FOR UPDATE`, [courno]);
    if (courseExistsRows.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Course already exists' });
    }

    const [cno, semeNo, numHex] = String(courno).split('-');
    const number = Number.parseInt(String(numHex), 16);
    if (!cno || !semeNo || !Number.isFinite(number)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid Cour_no' });
    }

    const [curricularRows] = await connection.execute(`SELECT C_classhour FROM Curricular WHERE Cno = ? FOR UPDATE`, [cno]);
    if (curricularRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Curricular not found' });
    }
    const classhour = Number(curricularRows[0].C_classhour);
    if (!Number.isFinite(classhour) || classhour <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid curricular classhour' });
    }

    const requiredWeeks = Math.ceil(classhour / per);
    if (!Number.isFinite(requiredWeeks) || requiredWeeks <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid required weeks' });
    }
    if (weekMap.size !== requiredWeeks) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Weeks count mismatch' });
    }

    const [campusCheckRows] = await connection.execute(
      `SELECT Cam_name FROM Campus WHERE Cam_name = ? AND Cam_status = '正常' FOR UPDATE`,
      [campus]
    );
    if (campusCheckRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid campus' });
    }

    await connection.execute(
      `INSERT INTO Course (Cour_no, Cour_cno, Cour_seme, Cour_number, Cour_pmax, Cour_pnow, Cour_status)
       VALUES (?, ?, ?, ?, ?, 0, '未开始')`,
      [courno, cno, semeNo, number, Math.min(120, Math.floor(pmax))]
    );

    const classroomMetaCache = new Map();
    const lessonTimeCache = new Map();

    const resolveClassroomMeta = async (clrm) => {
      if (classroomMetaCache.has(clrm)) return classroomMetaCache.get(clrm);
      const [rows] = await connection.execute(
        `SELECT c.Clrm_capacity as Cap, b.Bd_cam as Cam
         FROM Classroom c
         JOIN Building b ON b.Bd_name = c.Clrm_bd
         WHERE c.Clrm_name = ? AND c.Clrm_status = '正常' FOR UPDATE`,
        [clrm]
      );
      if (rows.length === 0) return null;
      const meta = { cap: Number(rows[0].Cap), cam: rows[0].Cam };
      classroomMetaCache.set(clrm, meta);
      return meta;
    };

    const resolveLessonTime = async (lno) => {
      if (lessonTimeCache.has(lno)) return lessonTimeCache.get(lno);
      const [rows] = await connection.execute(`SELECT Ltime_begin as B, Ltime_end as E FROM Lesson WHERE Lno = ? FOR UPDATE`, [lno]);
      if (rows.length === 0) return null;
      const meta = { b: String(rows[0].B), e: String(rows[0].E) };
      lessonTimeCache.set(lno, meta);
      return meta;
    };

    const getDateNo = async (week) => {
      const [rows] = await connection.execute(
        `SELECT Date_no FROM Date WHERE Date_seme = ? AND Date_dayofweek = ? AND Date_week = ? LIMIT 1 FOR UPDATE`,
        [semeNo, String(selectedDay), Number(week)]
      );
      return rows.length > 0 ? String(rows[0].Date_no) : null;
    };

    const slotList = [];
    const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
    for (const w of sortedWeeks) {
      const info = weekMap.get(w);
      const dateNo = await getDateNo(w);
      if (!dateNo) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Date not found for selected week/day' });
      }
      for (const lno of info.lessons) {
        slotList.push({ week: w, dateNo, lno, classroom: info.classroom });
      }
    }
    if (slotList.length < classhour) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Not enough lessons selected' });
    }

    for (let i = 0; i < classhour; i += 1) {
      const classhourNo = i + 1;
      const slot = slotList[i];
      const meta = await resolveClassroomMeta(slot.classroom);
      if (!meta || !Number.isFinite(meta.cap)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Invalid classroom' });
      }
      if (String(meta.cam) !== String(campus)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Classroom campus mismatch' });
      }
      if (meta.cap < pmax) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Classroom capacity not enough' });
      }

      const lt = await resolveLessonTime(slot.lno);
      if (!lt?.b || !lt?.e) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Lesson not found' });
      }
      const beginStr = `${slot.dateNo} ${lt.b}`;
      const endStr = `${slot.dateNo} ${lt.e}`;
      const [occRows] = await connection.execute(
        `SELECT COUNT(*) as Cnt
         FROM View_Classroom_Occupancy
         WHERE Clrm_name = ? AND Occ_begin < ? AND Occ_end > ?`,
        [slot.classroom, endStr, beginStr]
      );
      const cnt = Number(occRows?.[0]?.Cnt || 0);
      if (cnt > 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Classroom occupied' });
      }

      await connection.execute(
        `INSERT INTO Arrange_Course
           (ArrangeCo_Courno, ArrangeCo_classhour, ArrangeCo_Lno, ArrangeCo_date, ArrangeCo_Clrmname, ArrangeCo_Pno, ArrangeCo_status)
         VALUES (?, ?, ?, ?, ?, ?, '待上课')`,
        [courno, classhourNo, slot.lno, slot.dateNo, slot.classroom, arrangePno]
      );
    }

    await connection.execute(`UPDATE Setup_Course SET SetupCo_status = '等待选课' WHERE SetupCo_Courno = ?`, [courno]);
    await connection.commit();
    return res.json({ success: true, requiredWeeks, classhour });
  } catch (error) {
    await connection.rollback();
    console.error('Error arranging course:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/enroll/available', async (req, res) => {
  const { uno, page = 1, limit = 20, searchName } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Missing Uno' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) return res.status(400).json({ success: false, message: 'Invalid Uno format' });

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNumRaw = Number(limit) || 20;
  const limitNum = Math.min(Math.max(1, limitNumRaw), 200);
  const offset = (pageNum - 1) * limitNum;
  const search = typeof searchName === 'string' ? searchName.trim() : '';

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userRows[0].Urole !== '学生') {
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [semeRows] = await db.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1');
    if (semeRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const [classRows] = await db.execute(
      `SELECT s.Sclass, c.Class_dom
       FROM Student s
       LEFT JOIN Class c ON c.Class_name = s.Sclass
       WHERE s.Sno = ?`,
      [uno]
    );
    const classDom = classRows.length > 0 ? classRows[0].Class_dom || null : null;

    let tpNos = [];
    if (classDom) {
      const [tpRows] = await db.execute(
        `SELECT TPno FROM TrainingProgram WHERE TPdom = ? AND TPstatus = '可使用'`,
        [classDom]
      );
      tpNos = tpRows.map((r) => r.TPno).filter((v) => typeof v === 'string' && v);
    }

    const baseParams = [semeNo, uno];
    const whereParts = [];
    if (search) {
      whereParts.push('cu.Cname LIKE ?');
      baseParams.push(`%${search}%`);
    }

    const countSql = `
      SELECT COUNT(*) AS Total
      FROM Course co
      JOIN Curricular cu ON cu.Cno = co.Cour_cno
      WHERE co.Cour_seme = ?
        AND co.Cour_status IN ('未开始','进行中')
        AND NOT EXISTS (
          SELECT 1 FROM Enrollment e
          WHERE e.Enroll_Courno = co.Cour_no
            AND e.Enroll_Sno = ?
        )
        ${whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : ''}
    `;
    const [countRows] = await db.execute(countSql, baseParams);
    const total = Number(countRows?.[0]?.Total || 0);

    const dataSql = `
      SELECT
        co.Cour_no AS Cour_no,
        co.Cour_cno AS Cno,
        co.Cour_pmax AS Pmax,
        co.Cour_pnow AS Pnow,
        cu.Cname AS Cname
      FROM Course co
      JOIN Curricular cu ON cu.Cno = co.Cour_cno
      WHERE co.Cour_seme = ?
        AND co.Cour_status IN ('未开始','进行中')
        AND NOT EXISTS (
          SELECT 1 FROM Enrollment e
          WHERE e.Enroll_Courno = co.Cour_no
            AND e.Enroll_Sno = ?
        )
        ${whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : ''}
      ORDER BY co.Cour_no ASC
      LIMIT ${limitNum} OFFSET ${offset}
    `;
    const [courseRows] = await db.execute(dataSql, baseParams);

    if (!courseRows || courseRows.length === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    const courNos = courseRows.map((r) => r.Cour_no);
    const cnos = Array.from(new Set(courseRows.map((r) => r.Cno)));

    const [attrRows] = await db.execute(
      `
        SELECT cp.Cno AS Cno, cp.Cattri AS Cattri
        FROM Cno_Pool cp
        WHERE cp.Cno IN (${cnos.map(() => '?').join(',')})
      `,
      cnos
    );
    const attrMap = new Map();
    (attrRows || []).forEach((r) => {
      attrMap.set(r.Cno, r.Cattri || '');
    });

    const [profRows] = await db.execute(
      `
        SELECT
          sc.SetupCo_Courno AS Courno,
          GROUP_CONCAT(DISTINCT p.Pname ORDER BY p.Pname SEPARATOR ', ') AS Professors
        FROM Setup_Course sc
        JOIN SetupCo_Prof sp ON sp.SetupCo_Courno = sc.SetupCo_Courno
        JOIN Professor p ON p.Pno = sp.SetupCo_Pno
        WHERE sc.SetupCo_Courno IN (${courNos.map(() => '?').join(',')})
        GROUP BY sc.SetupCo_Courno
      `,
      courNos
    );
    const profMap = new Map();
    (profRows || []).forEach((r) => {
      profMap.set(r.Courno, r.Professors || '');
    });

    const [locTimeRows] = await db.execute(
      `
        SELECT
          ac.ArrangeCo_Courno AS Courno,
          ac.ArrangeCo_Clrmname AS Clrmname,
          d.Date_week AS WeekNo,
          ac.ArrangeCo_Lno AS Lno
        FROM Arrange_Course ac
        JOIN Date d ON d.Date_no = ac.ArrangeCo_date
        WHERE ac.ArrangeCo_Courno IN (${courNos.map(() => '?').join(',')})
      `,
      courNos
    );
    const locationMap = new Map();
    const timeMap = new Map();
    (locTimeRows || []).forEach((r) => {
      const courno = r.Courno;
      if (!courno) return;
      if (r.Clrmname) {
        const set = locationMap.get(courno) || new Set();
        set.add(r.Clrmname);
        locationMap.set(courno, set);
      }
      const week = Number(r.WeekNo);
      const lno = r.Lno;
      if (!Number.isFinite(week) || !lno) return;
      const weekMap = timeMap.get(courno) || new Map();
      const list = weekMap.get(week) || [];
      if (!list.includes(lno)) list.push(lno);
      weekMap.set(week, list);
      timeMap.set(courno, weekMap);
    });

    const [enrollCountRows] = await db.execute(
      `
        SELECT Enroll_Courno AS Courno, COUNT(*) AS Cnt
        FROM Enrollment
        WHERE Enroll_Courno IN (${courNos.map(() => '?').join(',')})
        GROUP BY Enroll_Courno
      `,
      courNos
    );
    const countMap = new Map();
    (enrollCountRows || []).forEach((r) => {
      countMap.set(r.Courno, Number(r.Cnt) || 0);
    });

    let tpCnoSet = new Set();
    if (tpNos.length > 0 && cnos.length > 0) {
      const [tpCurRows] = await db.execute(
        `
          SELECT DISTINCT Cno
          FROM TP_Curricular
          WHERE TPno IN (${tpNos.map(() => '?').join(',')})
            AND Cno IN (${cnos.map(() => '?').join(',')})
        `,
        [...tpNos, ...cnos]
      );
      tpCnoSet = new Set((tpCurRows || []).map((r) => r.Cno));
    }

    const buildTimeString = (courno) => {
      const weekMap = timeMap.get(courno);
      if (!weekMap) return '';
      const weeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
      const parts = [];
      weeks.forEach((w) => {
        const lessons = weekMap.get(w) || [];
        const sorted = lessons
          .slice()
          .sort((a, b) => Number(a) - Number(b))
          .map((l) => `第${Number(l)}节`);
        if (sorted.length === 0) return;
        parts.push(`第${w}周(${sorted.join(',')})`);
      });
      return parts.join('，');
    };

    const result = courseRows.map((r) => {
      const courno = r.Cour_no;
      const cno = r.Cno;
      const attr = attrMap.get(cno) || '';
      const prof = profMap.get(courno) || '';
      const locSet = locationMap.get(courno) || new Set();
      const locStr = Array.from(locSet).join(', ');
      const timeFull = buildTimeString(courno);
      let timeSummary = timeFull;
      if (timeSummary && timeSummary.length > 15) {
        timeSummary = `${timeSummary.slice(0, 15)}...`;
      }
      const pmax = Number(r.Pmax || 0);
      const pnow = Number(countMap.get(courno) ?? r.Pnow ?? 0);
      const inPlan = tpCnoSet.has(cno);
      return {
        courNo: courno,
        cno,
        courseName: r.Cname || '',
        courseAttr: attr,
        professors: prof,
        locations: locStr,
        timeFull,
        timeSummary,
        currentCount: pnow,
        maxCount: pmax,
        inPlan,
      };
    });

    return res.json({ success: true, total, data: result });
  } catch (error) {
    console.error('Error fetching available enroll courses:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/enroll/selected', async (req, res) => {
  const { uno, page = 1, limit = 20, searchName } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Missing Uno' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) return res.status(400).json({ success: false, message: 'Invalid Uno format' });

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNumRaw = Number(limit) || 20;
  const limitNum = Math.min(Math.max(1, limitNumRaw), 200);
  const offset = (pageNum - 1) * limitNum;
  const search = typeof searchName === 'string' ? searchName.trim() : '';

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userRows[0].Urole !== '学生') {
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [semeRows] = await db.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1');
    if (semeRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const [classRows] = await db.execute(
      `SELECT s.Sclass, c.Class_dom
       FROM Student s
       LEFT JOIN Class c ON c.Class_name = s.Sclass
       WHERE s.Sno = ?`,
      [uno]
    );
    const classDom = classRows.length > 0 ? classRows[0].Class_dom || null : null;

    let tpNos = [];
    if (classDom) {
      const [tpRows] = await db.execute(
        `SELECT TPno FROM TrainingProgram WHERE TPdom = ? AND TPstatus = '可使用'`,
        [classDom]
      );
      tpNos = tpRows.map((r) => r.TPno).filter((v) => typeof v === 'string' && v);
    }

    const baseParams = [uno, semeNo];
    const whereParts = [];
    if (search) {
      whereParts.push('cu.Cname LIKE ?');
      baseParams.push(`%${search}%`);
    }

    const countSql = `
      SELECT COUNT(*) AS Total
      FROM Enrollment e
      JOIN Course co ON co.Cour_no = e.Enroll_Courno
      JOIN Curricular cu ON cu.Cno = co.Cour_cno
      WHERE e.Enroll_Sno = ?
        AND co.Cour_seme = ?
        ${whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : ''}
    `;
    const [countRows] = await db.execute(countSql, baseParams);
    const total = Number(countRows?.[0]?.Total || 0);

    const dataSql = `
      SELECT
        co.Cour_no AS Cour_no,
        co.Cour_cno AS Cno,
        co.Cour_pmax AS Pmax,
        co.Cour_pnow AS Pnow,
        cu.Cname AS Cname
      FROM Enrollment e
      JOIN Course co ON co.Cour_no = e.Enroll_Courno
      JOIN Curricular cu ON cu.Cno = co.Cour_cno
      WHERE e.Enroll_Sno = ?
        AND co.Cour_seme = ?
        ${whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : ''}
      ORDER BY co.Cour_no ASC
      LIMIT ${limitNum} OFFSET ${offset}
    `;
    const [courseRows] = await db.execute(dataSql, baseParams);

    if (!courseRows || courseRows.length === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    const courNos = courseRows.map((r) => r.Cour_no);
    const cnos = Array.from(new Set(courseRows.map((r) => r.Cno)));

    const [attrRows] = await db.execute(
      `
        SELECT cp.Cno AS Cno, cp.Cattri AS Cattri
        FROM Cno_Pool cp
        WHERE cp.Cno IN (${cnos.map(() => '?').join(',')})
      `,
      cnos
    );
    const attrMap = new Map();
    (attrRows || []).forEach((r) => {
      attrMap.set(r.Cno, r.Cattri || '');
    });

    const [profRows] = await db.execute(
      `
        SELECT
          sc.SetupCo_Courno AS Courno,
          GROUP_CONCAT(DISTINCT p.Pname ORDER BY p.Pname SEPARATOR ', ') AS Professors
        FROM Setup_Course sc
        JOIN SetupCo_Prof sp ON sp.SetupCo_Courno = sc.SetupCo_Courno
        JOIN Professor p ON p.Pno = sp.SetupCo_Pno
        WHERE sc.SetupCo_Courno IN (${courNos.map(() => '?').join(',')})
        GROUP BY sc.SetupCo_Courno
      `,
      courNos
    );
    const profMap = new Map();
    (profRows || []).forEach((r) => {
      profMap.set(r.Courno, r.Professors || '');
    });

    const [locTimeRows] = await db.execute(
      `
        SELECT
          ac.ArrangeCo_Courno AS Courno,
          d.Date_week AS WeekNo,
          ac.ArrangeCo_Lno AS Lno
        FROM Arrange_Course ac
        JOIN Date d ON d.Date_no = ac.ArrangeCo_date
        WHERE ac.ArrangeCo_Courno IN (${courNos.map(() => '?').join(',')})
      `,
      courNos
    );
    const timeMap = new Map();
    (locTimeRows || []).forEach((r) => {
      const courno = r.Courno;
      if (!courno) return;
      const week = Number(r.WeekNo);
      const lno = r.Lno;
      if (!Number.isFinite(week) || !lno) return;
      const weekMap = timeMap.get(courno) || new Map();
      const list = weekMap.get(week) || [];
      if (!list.includes(lno)) list.push(lno);
      weekMap.set(week, list);
      timeMap.set(courno, weekMap);
    });

    const [enrollCountRows] = await db.execute(
      `
        SELECT Enroll_Courno AS Courno, COUNT(*) AS Cnt
        FROM Enrollment
        WHERE Enroll_Courno IN (${courNos.map(() => '?').join(',')})
        GROUP BY Enroll_Courno
      `,
      courNos
    );
    const countMap = new Map();
    (enrollCountRows || []).forEach((r) => {
      countMap.set(r.Courno, Number(r.Cnt) || 0);
    });

    let tpCnoSet = new Set();
    if (tpNos.length > 0 && cnos.length > 0) {
      const [tpCurRows] = await db.execute(
        `
          SELECT DISTINCT Cno
          FROM TP_Curricular
          WHERE TPno IN (${tpNos.map(() => '?').join(',')})
            AND Cno IN (${cnos.map(() => '?').join(',')})
        `,
        [...tpNos, ...cnos]
      );
      tpCnoSet = new Set((tpCurRows || []).map((r) => r.Cno));
    }

    const buildTimeString = (courno) => {
      const weekMap = timeMap.get(courno);
      if (!weekMap) return '';
      const weeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
      const parts = [];
      weeks.forEach((w) => {
        const lessons = weekMap.get(w) || [];
        const sorted = lessons
          .slice()
          .sort((a, b) => Number(a) - Number(b))
          .map((l) => `第${Number(l)}节`);
        if (sorted.length === 0) return;
        parts.push(`第${w}周(${sorted.join(',')})`);
      });
      return parts.join('，');
    };

    const result = courseRows.map((r) => {
      const courno = r.Cour_no;
      const cno = r.Cno;
      const attr = attrMap.get(cno) || '';
      const prof = profMap.get(courno) || '';
      const timeFull = buildTimeString(courno);
      const pmax = Number(r.Pmax || 0);
      const pnow = Number(countMap.get(courno) ?? r.Pnow ?? 0);
      const inPlan = tpCnoSet.has(cno);
      return {
        courNo: courno,
        cno,
        courseName: r.Cname || '',
        courseAttr: attr,
        professors: prof,
        timeFull,
        currentCount: pnow,
        maxCount: pmax,
        inPlan,
      };
    });

    return res.json({ success: true, total, data: result });
  } catch (error) {
    console.error('Error fetching selected enroll courses:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/enroll/select', async (req, res) => {
  const { uno, courno } = req.body;
  if (!uno || !courno) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (!/^[A-Z0-9]{10}-[0-9]{5}-[0-9A-F]{3}$/.test(String(courno))) {
    return res.status(400).json({ success: false, message: 'Invalid Cour_no format' });
  }

  const businessFlags = await getCurrentBusinessFlags();
  if (!businessFlags || !businessFlags.enrollOpen) {
    return res.status(403).json({ success: false, message: '当前学生选课业务未开放' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userRows[0].Urole !== '学生') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [semeRows] = await connection.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1 FOR UPDATE');
    if (semeRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const [courseRows] = await connection.execute(
      `
        SELECT Cour_no, Cour_cno, Cour_seme, Cour_pmax, Cour_pnow, Cour_status
        FROM Course
        WHERE Cour_no = ?
        FOR UPDATE
      `,
      [courno]
    );
    if (courseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    const course = courseRows[0];
    if (String(course.Cour_seme) !== String(semeNo)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Course not in current semester' });
    }
    if (!['未开始', '进行中'].includes(course.Cour_status)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Course status not allowed for enrollment' });
    }

    const [existsRows] = await connection.execute(
      `
        SELECT 1
        FROM Enrollment
        WHERE Enroll_Courno = ? AND Enroll_Sno = ?
        LIMIT 1 FOR UPDATE
      `,
      [courno, uno]
    );
    if (existsRows.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '您已选择该课程' });
    }

    const [allEnrollRows] = await connection.execute(
      `
        SELECT e.Enroll_Courno AS Courno, co.Cour_cno AS Cno, cu.Cname AS Cname
        FROM Enrollment e
        JOIN Course co ON co.Cour_no = e.Enroll_Courno
        JOIN Curricular cu ON cu.Cno = co.Cour_cno
        WHERE e.Enroll_Sno = ? AND co.Cour_seme = ?
        FOR UPDATE
      `,
      [uno, semeNo]
    );

    const [candidateSlots] = await connection.execute(
      `
        SELECT ac.ArrangeCo_date AS DateNo, ac.ArrangeCo_Lno AS Lno
        FROM Arrange_Course ac
        WHERE ac.ArrangeCo_Courno = ?
      `,
      [courno]
    );

    const [occupiedSlots] = allEnrollRows.length
      ? await connection.execute(
          `
            SELECT
              e.Enroll_Courno AS Courno,
              cu.Cname AS Cname,
              ac.ArrangeCo_date AS DateNo,
              ac.ArrangeCo_Lno AS Lno
            FROM Enrollment e
            JOIN Course co ON co.Cour_no = e.Enroll_Courno
            JOIN Curricular cu ON cu.Cno = co.Cour_cno
            JOIN Arrange_Course ac ON ac.ArrangeCo_Courno = co.Cour_no
            WHERE e.Enroll_Sno = ? AND co.Cour_seme = ?
          `,
          [uno, semeNo]
        )
      : [[], []];

    const occupiedMap = new Map();
    (occupiedSlots || []).forEach((r) => {
      if (!r.DateNo || !r.Lno) return;
      const key = `${r.DateNo}|${r.Lno}`;
      const list = occupiedMap.get(key) || [];
      list.push(r.Cname);
      occupiedMap.set(key, list);
    });

    const conflictCourses = new Set();
    (candidateSlots || []).forEach((slot) => {
      if (!slot.DateNo || !slot.Lno) return;
      const key = `${slot.DateNo}|${slot.Lno}`;
      const list = occupiedMap.get(key);
      if (Array.isArray(list)) {
        list.forEach((name) => {
          if (name) conflictCourses.add(name);
        });
      }
    });

    if (conflictCourses.size > 0) {
      await connection.rollback();
      const names = Array.from(conflictCourses).join(', ');
      return res.status(400).json({ success: false, message: `选课时间与${names}课程冲突` });
    }

    const pmax = Number(course.Cour_pmax || 0);
    const [enrollCountRows] = await connection.execute(
      `
        SELECT COUNT(*) AS Cnt
        FROM Enrollment
        WHERE Enroll_Courno = ?
        FOR UPDATE
      `,
      [courno]
    );
    const currentCount = Number(enrollCountRows?.[0]?.Cnt || 0);
    if (!Number.isFinite(pmax) || pmax <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid course capacity' });
    }
    if (currentCount >= pmax) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '当前课程已满！' });
    }

    await connection.execute(
      `
        INSERT INTO Enrollment (Enroll_Courno, Enroll_Sno, Enroll_Cno)
        VALUES (?, ?, ?)
      `,
      [courno, uno, course.Cour_cno]
    );

    await connection.execute(
      `
        UPDATE Course
        SET Cour_pnow = Cour_pnow + 1
        WHERE Cour_no = ?
      `,
      [courno]
    );

    await connection.commit();
    return res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error selecting course:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '选课记录冲突，请检查已选课程' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/enroll/drop', async (req, res) => {
  const { uno, courno } = req.body;
  if (!uno || !courno) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (!/^[A-Z0-9]{10}-[0-9]{5}-[0-9A-F]{3}$/.test(String(courno))) {
    return res.status(400).json({ success: false, message: 'Invalid Cour_no format' });
  }

  const businessFlags = await getCurrentBusinessFlags();
  if (!businessFlags || !businessFlags.enrollOpen) {
    return res.status(403).json({ success: false, message: '当前学生选课业务未开放' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userRows[0].Urole !== '学生') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [enrollRows] = await connection.execute(
      `
        SELECT Enroll_Courno
        FROM Enrollment
        WHERE Enroll_Courno = ? AND Enroll_Sno = ?
        FOR UPDATE
      `,
      [courno, uno]
    );
    if (enrollRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    await connection.execute(
      `
        DELETE FROM Enrollment
        WHERE Enroll_Courno = ? AND Enroll_Sno = ?
      `,
      [courno, uno]
    );

    await connection.execute(
      `
        UPDATE Course
        SET Cour_pnow = CASE WHEN Cour_pnow > 0 THEN Cour_pnow - 1 ELSE 0 END
        WHERE Cour_no = ?
      `,
      [courno]
    );

    await connection.commit();
    return res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error dropping course:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/arrange/exam/submit', async (req, res) => {
  const { uno, setupEId, classrooms } = req.body;
  if (!uno || !setupEId || !Array.isArray(classrooms)) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  if (!/^SETCE[0-9]{8}-[0-9A-F]{6}$/.test(String(setupEId))) {
    return res.status(400).json({ success: false, message: 'Invalid SetupE_ID format' });
  }
  const uniqueRooms = Array.from(
    new Set((classrooms || []).map((v) => (v === null || v === undefined ? '' : String(v).trim())).filter(Boolean))
  );
  if (uniqueRooms.length === 0) {
    return res.status(400).json({ success: false, message: 'Missing classrooms' });
  }
  for (const r of uniqueRooms) {
    if (r.length === 0 || r.length > 30) return res.status(400).json({ success: false, message: 'Invalid classroom' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userRows[0].Urole !== '学校教务处管理员') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [setupRows] = await connection.execute(
      `SELECT SetupE_ID, SetupE_Cno, SetupE_Eno, SetupE_Esemeno, SetupE_Eattri, SetupE_Etime_begin, SetupE_Etime_end, SetupE_status
       FROM Setup_Exam
       WHERE SetupE_ID = ? FOR UPDATE`,
      [setupEId]
    );
    if (setupRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Setup_Exam not found' });
    }
    const setup = setupRows[0];
    if (setup.SetupE_status !== '等待审核') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Only pending setup can be arranged' });
    }

    const eno = String(setup.SetupE_Eno || '');
    const cno = String(setup.SetupE_Cno || '');
    const semeNo = String(setup.SetupE_Esemeno || '');
    const eattri = String(setup.SetupE_Eattri || '');
    const beginStr = normalizeDateTimeParam(setup.SetupE_Etime_begin);
    const endStr = normalizeDateTimeParam(setup.SetupE_Etime_end);
    if (!eno || !cno || !semeNo || !beginStr || !endStr) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid setup exam data' });
    }
    if (endStr <= beginStr) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid exam datetime' });
    }

    const dateNo = beginStr.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateNo)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid exam date' });
    }

    const [numRows] = await connection.execute(
      `SELECT COALESCE(SUM(Cour_pnow), 0) as Total
       FROM Course
       WHERE Cour_cno = ? AND Cour_seme = ? FOR UPDATE`,
      [cno, semeNo]
    );
    const people = Number(numRows?.[0]?.Total || 0);
    if (!Number.isFinite(people) || people < 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid exam people sum' });
    }

    const metaCache = new Map();
    const resolveRoomCap = async (clrm) => {
      if (metaCache.has(clrm)) return metaCache.get(clrm);
      const [rows] = await connection.execute(
        `SELECT Clrm_capacity as Cap FROM Classroom WHERE Clrm_name = ? AND Clrm_status = '正常' FOR UPDATE`,
        [clrm]
      );
      if (rows.length === 0) return null;
      const cap = Number(rows[0].Cap);
      metaCache.set(clrm, cap);
      return cap;
    };

    let capSum = 0;
    for (const r of uniqueRooms) {
      const cap = await resolveRoomCap(r);
      if (!Number.isFinite(cap)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Invalid classroom' });
      }
      capSum += cap;
    }
    if (capSum < people * 3) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Classroom capacity sum not enough' });
    }

    for (const r of uniqueRooms) {
      const [occRows] = await connection.execute(
        `SELECT COUNT(*) as Cnt
         FROM View_Classroom_Occupancy
         WHERE Clrm_name = ? AND Occ_begin < ? AND Occ_end > ?`,
        [r, endStr, beginStr]
      );
      const cnt = Number(occRows?.[0]?.Cnt || 0);
      if (cnt > 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Classroom occupied' });
      }
    }

    const [examRows] = await connection.execute(`SELECT Eno, E_cno, Eattri FROM Exam WHERE Eno = ? FOR UPDATE`, [eno]);
    if (examRows.length === 0) {
      await connection.execute(`INSERT INTO Exam (Eno, E_cno, Eattri, Estatus) VALUES (?, ?, ?, '未开始')`, [eno, cno, eattri]);
    } else {
      const ex = examRows[0];
      if (String(ex.E_cno) !== cno || String(ex.Eattri) !== eattri) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Exam already exists with mismatched data' });
      }
    }

    const arrangeIds = [];
    for (const r of uniqueRooms) {
      const nextNum = await getNextSequenceNumber(connection, 'Arrange_Exam', 'ArrangeE_number', { ArrangeE_Eno: eno });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 4095) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'No available arrange number' });
      }
      const arrangeId = makeExamArrangeId(eno, nextNum);
      await connection.execute(
        `INSERT INTO Arrange_Exam (ArrangeE_ID, ArrangeE_Eno, ArrangeE_number, ArrangeE_Clrmname) VALUES (?, ?, ?, ?)`,
        [arrangeId, eno, nextNum, r]
      );
      arrangeIds.push(arrangeId);
    }

    await connection.execute(`UPDATE Setup_Exam SET SetupE_status = '审核通过' WHERE SetupE_ID = ?`, [setupEId]);
    await connection.commit();
    return res.json({ success: true, eno, people, capacity: capSum, arrangeIds });
  } catch (error) {
    await connection.rollback();
    console.error('Error arranging exam:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/examarrange/exam/search', async (req, res) => {
  const { uno, query } = req.body;
  if (!uno || typeof query !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  const q = query.trim();
  if (q.length < 5) {
    return res.json({ success: true, data: [] });
  }

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;
    if (role !== '学院教学办管理员') {
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [deptRows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
    if (deptRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dept admin not found' });
    }
    const dept = deptRows[0].DAdept;
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Dept not found' });
    }

    const like = `%${q}%`;
    const [rows] = await db.execute(
      `SELECT
         e.Eno AS Eno,
         e.E_cno AS Cno,
         c.Cname AS Cname,
         e.Eattri AS Eattri
       FROM Exam e
       JOIN Curricular c ON c.Cno = e.E_cno
       JOIN Cno_Pool cp ON cp.Cno = e.E_cno
       WHERE cp.Cdept = ?
         AND e.Estatus = '未开始'
         AND e.Eattri = '正考'
         AND e.Eno LIKE ?
       ORDER BY e.Eno ASC
       LIMIT 50`,
      [dept, like]
    );

    return res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Error searching exams for examarrange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/examarrange/prof/search', async (req, res) => {
  const { uno, query } = req.body;
  if (!uno || typeof query !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  const q = query.trim();
  if (q.length < 3) {
    return res.json({ success: true, data: [] });
  }

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;
    if (role !== '学院教学办管理员') {
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [deptRows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
    if (deptRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dept admin not found' });
    }
    const dept = deptRows[0].DAdept;
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Dept not found' });
    }

    const like = `%${q}%`;
    const [rows] = await db.execute(
      `SELECT
         Pno,
         Pname
       FROM Professor
       WHERE Pdept = ?
         AND (Pno LIKE ? OR Pname LIKE ?)
       ORDER BY Pno ASC
       LIMIT 50`,
      [dept, like, like]
    );

    return res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Error searching professors for examarrange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/examarrange/exam/details', async (req, res) => {
  const { uno, eno } = req.body;
  if (!uno || !eno) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (!/^E[0-9]{5}[0-9A-F]{3}[ZHT]$/.test(String(eno))) {
    return res.status(400).json({ success: false, message: 'Invalid Eno format' });
  }

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;
    if (role !== '学院教学办管理员') {
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [deptRows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
    if (deptRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dept admin not found' });
    }
    const dept = deptRows[0].DAdept;
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Dept not found' });
    }

    const [examRows] = await db.execute(
      `SELECT
         e.Eno AS Eno,
         e.E_cno AS Cno,
         e.Eattri AS Eattri,
         e.Estatus AS Estatus,
         c.Cname AS Cname
       FROM Exam e
       JOIN Curricular c ON c.Cno = e.E_cno
       JOIN Cno_Pool cp ON cp.Cno = e.E_cno
       WHERE e.Eno = ?
         AND cp.Cdept = ?`,
      [eno, dept]
    );
    if (examRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examRows[0];

    const [arrangeRows] = await db.execute(
      `SELECT
         ae.ArrangeE_ID AS ArrangeE_ID,
         ae.ArrangeE_Clrmname AS Clrmname,
         COALESCE(cl.Clrm_capacity, 0) AS Capacity,
         COALESCE(t.Cnt, 0) AS TakeCount
       FROM Arrange_Exam ae
       LEFT JOIN Classroom cl ON cl.Clrm_name = ae.ArrangeE_Clrmname
       LEFT JOIN (
         SELECT TakingE_ArrangeEID, COUNT(*) AS Cnt
         FROM Take_Exam
         GROUP BY TakingE_ArrangeEID
       ) t ON t.TakingE_ArrangeEID = ae.ArrangeE_ID
       WHERE ae.ArrangeE_Eno = ?
       ORDER BY ae.ArrangeE_number ASC`,
      [eno]
    );

    const [invRows] = await db.execute(
      `SELECT DISTINCT
         iv.Invigilate_Pno AS Pno,
         p.Pname AS Pname
       FROM Invigilate iv
       JOIN Arrange_Exam ae ON ae.ArrangeE_ID = iv.Invigilate_ArrangeEID
       LEFT JOIN Professor p ON p.Pno = iv.Invigilate_Pno
       WHERE ae.ArrangeE_Eno = ?
       ORDER BY iv.Invigilate_Pno ASC`,
      [eno]
    );

    const arranges = (arrangeRows || []).map((r) => ({
      ArrangeE_ID: r.ArrangeE_ID,
      Clrmname: r.Clrmname,
      Capacity: Number(r.Capacity) || 0,
      HasTake: Number(r.TakeCount || 0) > 0
    }));

    const invigilators = (invRows || []).map((r) => ({
      Pno: r.Pno,
      Pname: r.Pname || ''
    }));

    return res.json({
      success: true,
      exam: {
        Eno: exam.Eno,
        Cno: exam.Cno,
        Cname: exam.Cname || '',
        Eattri: exam.Eattri,
        Estatus: exam.Estatus
      },
      arranges,
      invigilators
    });
  } catch (error) {
    console.error('Error fetching exam details for examarrange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/examarrange/invigilate/save', async (req, res) => {
  const { uno, eno, profPnos } = req.body;
  if (!uno || !eno || !Array.isArray(profPnos)) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (!/^E[0-9]{5}[0-9A-F]{3}[ZHT]$/.test(String(eno))) {
    return res.status(400).json({ success: false, message: 'Invalid Eno format' });
  }

  const rawList = Array.from(
    new Set(
      (profPnos || [])
        .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
        .filter(Boolean)
    )
  );

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;
    if (role !== '学院教学办管理员') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [deptRows] = await connection.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ? FOR UPDATE', [uno]);
    if (deptRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Dept admin not found' });
    }
    const dept = deptRows[0].DAdept;
    if (!dept) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Dept not found' });
    }

    const [examRows] = await connection.execute(
      `SELECT e.Eno, e.E_cno
       FROM Exam e
       JOIN Cno_Pool cp ON cp.Cno = e.E_cno
       WHERE e.Eno = ? AND cp.Cdept = ?
       FOR UPDATE`,
      [eno, dept]
    );
    if (examRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const [arrangeRows] = await connection.execute(
      `SELECT ArrangeE_ID
       FROM Arrange_Exam
       WHERE ArrangeE_Eno = ?
       FOR UPDATE`,
      [eno]
    );

    const arrangeIds = arrangeRows.map((r) => r.ArrangeE_ID);
    if (arrangeIds.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'No exam arrangements found' });
    }

    let finalProfPnos = [];
    if (rawList.length > 0) {
      const placeholders = rawList.map(() => '?').join(',');
      const [profRows] = await connection.execute(
        `SELECT Pno
         FROM Professor
         WHERE Pdept = ?
           AND Pno IN (${placeholders})
         ORDER BY Pno ASC`,
        [dept, ...rawList]
      );
      finalProfPnos = profRows.map((r) => r.Pno);
    }

    const arrangePlaceholders = arrangeIds.map(() => '?').join(',');
    await connection.execute(
      `DELETE iv
       FROM Invigilate iv
       JOIN Arrange_Exam ae ON ae.ArrangeE_ID = iv.Invigilate_ArrangeEID
       WHERE ae.ArrangeE_ID IN (${arrangePlaceholders})`,
      arrangeIds
    );

    for (const arrangeId of arrangeIds) {
      for (const pno of finalProfPnos) {
        await connection.execute(
          `INSERT INTO Invigilate (Invigilate_ArrangeEID, Invigilate_Pno, Invigilate_Status)
           VALUES (?, ?, '等待开始')`,
          [arrangeId, pno]
        );
      }
    }

    await connection.commit();
    return res.json({ success: true, profPnos: finalProfPnos });
  } catch (error) {
    await connection.rollback();
    console.error('Error saving invigilate for examarrange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/examarrange/students', async (req, res) => {
  const { uno, eno, page = 1, limit = 20, search } = req.body;
  if (!uno || !eno) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (!/^E[0-9]{5}[0-9A-F]{3}[ZHT]$/.test(String(eno))) {
    return res.status(400).json({ success: false, message: 'Invalid Eno format' });
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNumRaw = Number(limit) || 20;
  const limitNum = Math.min(Math.max(1, limitNumRaw), 200);
  const offset = (pageNum - 1) * limitNum;
  const searchSno = typeof search === 'string' ? search.trim() : '';

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;
    if (role !== '学院教学办管理员') {
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [deptRows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
    if (deptRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dept admin not found' });
    }
    const dept = deptRows[0].DAdept;
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Dept not found' });
    }

    const [examRows] = await db.execute(
      `SELECT e.Eno, e.E_cno
       FROM Exam e
       JOIN Cno_Pool cp ON cp.Cno = e.E_cno
       WHERE e.Eno = ? AND cp.Cdept = ?`,
      [eno, dept]
    );
    if (examRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examRows[0];

    const [semeRows] = await db.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1');
    if (semeRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const baseParams = [exam.E_cno, semeNo, eno, eno];
    const countWhereParts = [];
    if (searchSno) {
      countWhereParts.push('s.Sno LIKE ?');
    }
    const countParams = [...baseParams];
    if (searchSno) {
      countParams.push(`%${searchSno}%`);
    }

    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS Total
       FROM (
         SELECT s.Sno
         FROM Exam e
         JOIN Course co ON co.Cour_cno = e.E_cno AND co.Cour_seme = ?
         JOIN Pursuit pu ON pu.Pursue_Courno = co.Cour_no
         JOIN Student s ON s.Sno = pu.Pursue_Sno
         LEFT JOIN (
           SELECT te.TakingE_Sno AS Sno, MIN(te.TakingE_ArrangeEID) AS ArrangeE_ID, MIN(te.TakingE_Seatno) AS Seatno
           FROM Take_Exam te
           JOIN Arrange_Exam ae ON ae.ArrangeE_ID = te.TakingE_ArrangeEID
           WHERE ae.ArrangeE_Eno = ?
           GROUP BY te.TakingE_Sno
         ) teAgg ON teAgg.Sno = s.Sno
         WHERE e.Eno = ?
         ${searchSno ? 'AND s.Sno LIKE ?' : ''}
         GROUP BY s.Sno
       ) tmp`,
      countParams
    );

    const total = Number(countRows?.[0]?.Total || 0);

    const dataParams = [...baseParams];
    if (searchSno) {
      dataParams.push(`%${searchSno}%`);
    }
    dataParams.push(limitNum, offset);

    const [rows] = await db.execute(
      `SELECT
         s.Sno AS Sno,
         teAgg.ArrangeE_ID AS ArrangeE_ID,
         teAgg.Seatno AS Seatno,
         ae2.ArrangeE_Clrmname AS Clrmname
       FROM Exam e
       JOIN Course co ON co.Cour_cno = e.E_cno AND co.Cour_seme = ?
       JOIN Pursuit pu ON pu.Pursue_Courno = co.Cour_no
       JOIN Student s ON s.Sno = pu.Pursue_Sno
       LEFT JOIN (
         SELECT te.TakingE_Sno AS Sno, MIN(te.TakingE_ArrangeEID) AS ArrangeE_ID, MIN(te.TakingE_Seatno) AS Seatno
         FROM Take_Exam te
         JOIN Arrange_Exam ae ON ae.ArrangeE_ID = te.TakingE_ArrangeEID
         WHERE ae.ArrangeE_Eno = ?
         GROUP BY te.TakingE_Sno
       ) teAgg ON teAgg.Sno = s.Sno
       LEFT JOIN Arrange_Exam ae2 ON ae2.ArrangeE_ID = teAgg.ArrangeE_ID
       WHERE e.Eno = ?
       ${searchSno ? 'AND s.Sno LIKE ?' : ''}
       GROUP BY s.Sno, teAgg.ArrangeE_ID, teAgg.Seatno, ae2.ArrangeE_Clrmname
       ORDER BY s.Sno ASC
       LIMIT ? OFFSET ?`,
      dataParams
    );

    const data = (rows || []).map((r) => ({
      Sno: r.Sno,
      arranged: r.ArrangeE_ID != null,
      classroom: r.Clrmname || null,
      seat: r.Seatno != null ? Number(r.Seatno) : null
    }));

    const totalPages = Math.ceil(total / limitNum) || 1;

    return res.json({
      success: true,
      data,
      pagination: {
        total,
        page: pageNum,
        totalPages,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching students for examarrange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/examarrange/arrange', async (req, res) => {
  const { uno, arrangeId } = req.body;
  if (!uno || !arrangeId) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (!/^[A-Z0-9]{10}-[0-9A-F]{3}$/.test(String(arrangeId))) {
    return res.status(400).json({ success: false, message: 'Invalid ArrangeE_ID format' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const role = userRows[0].Urole;
    if (role !== '学院教学办管理员') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [deptRows] = await connection.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ? FOR UPDATE', [uno]);
    if (deptRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Dept admin not found' });
    }
    const dept = deptRows[0].DAdept;
    if (!dept) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Dept not found' });
    }

    const [arrRows] = await connection.execute(
      `SELECT
         ae.ArrangeE_ID,
         ae.ArrangeE_Eno,
         ae.ArrangeE_Clrmname,
         cl.Clrm_capacity AS Capacity,
         e.E_cno AS Cno
       FROM Arrange_Exam ae
       JOIN Exam e ON e.Eno = ae.ArrangeE_Eno
       JOIN Cno_Pool cp ON cp.Cno = e.E_cno
       LEFT JOIN Classroom cl ON cl.Clrm_name = ae.ArrangeE_Clrmname
       WHERE ae.ArrangeE_ID = ?
         AND cp.Cdept = ?
       FOR UPDATE`,
      [arrangeId, dept]
    );
    if (arrRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Arrange_Exam not found' });
    }
    const arr = arrRows[0];
    const capacity = Number(arr.Capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid classroom capacity' });
    }

    const [semeRows] = await connection.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1 FOR UPDATE');
    if (semeRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const targetTotal = Math.ceil(capacity / 3);

    const [existingRows] = await connection.execute(
      `SELECT COUNT(*) AS Cnt
       FROM Take_Exam
       WHERE TakingE_ArrangeEID = ? FOR UPDATE`,
      [arrangeId]
    );
    const existingCount = Number(existingRows?.[0]?.Cnt || 0);

    if (!Number.isFinite(existingCount) || existingCount < 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid existing take exam count' });
    }

    const remainingSlots = targetTotal - existingCount;
    if (remainingSlots <= 0) {
      await connection.commit();
      return res.json({ success: true, added: 0 });
    }

    const [candidateRows] = await connection.execute(
      `SELECT s.Sno AS Sno
       FROM Exam e
       JOIN Course co ON co.Cour_cno = e.E_cno AND co.Cour_seme = ?
       JOIN Pursuit pu ON pu.Pursue_Courno = co.Cour_no
       JOIN Student s ON s.Sno = pu.Pursue_Sno
       WHERE e.Eno = ?
         AND s.Sno NOT IN (
           SELECT te.TakingE_Sno
           FROM Take_Exam te
           JOIN Arrange_Exam ae2 ON ae2.ArrangeE_ID = te.TakingE_ArrangeEID
           WHERE ae2.ArrangeE_Eno = ?
         )`,
      [semeNo, arr.ArrangeE_Eno, arr.ArrangeE_Eno]
    );

    const candidates = (candidateRows || []).map((r) => r.Sno);
    if (candidates.length === 0) {
      await connection.commit();
      return res.json({ success: true, added: 0 });
    }

    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }

    let assignCount = Math.min(remainingSlots, candidates.length);

    const [seatRows] = await connection.execute(
      `SELECT MAX(TakingE_Seatno) AS MaxSeat
       FROM Take_Exam
       WHERE TakingE_ArrangeEID = ?
       FOR UPDATE`,
      [arrangeId]
    );
    const maxSeat = seatRows[0].MaxSeat == null ? null : Number(seatRows[0].MaxSeat);
    let nextSeat = maxSeat == null ? 0 : maxSeat + 1;

    if (nextSeat > 100) {
      await connection.commit();
      return res.json({ success: true, added: 0 });
    }

    const maxPossible = 101 - nextSeat;
    if (assignCount > maxPossible) {
      assignCount = maxPossible;
    }

    const selected = candidates.slice(0, assignCount);

    for (const sno of selected) {
      await connection.execute(
        `INSERT INTO Take_Exam (TakingE_ArrangeEID, TakingE_Sno, TakingE_Seatno, TakingE_G2Pno)
         VALUES (?, ?, ?, ?)`,
        [arrangeId, sno, nextSeat, null]
      );
      nextSeat += 1;
    }

    await connection.commit();
    return res.json({ success: true, added: assignCount });
  } catch (error) {
    await connection.rollback();
    console.error('Error arranging students for examarrange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/courseajust/view/init', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  try {
    const [userRows] = await db.execute('SELECT Urole FROM User WHERE Uno = ?', [uno]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const role = userRows[0].Urole;
    if (role !== '教授') return res.status(403).json({ success: false, message: 'Unauthorized role' });

    const viewName = `View_Courseajust_${uno}`;
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);

    const createViewSql = `
      CREATE VIEW ${viewName} AS
      SELECT
        ac.ArrangeCo_Courno AS ArrangeCo_Courno,
        ac.ArrangeCo_classhour AS ArrangeCo_classhour,
        ac.ArrangeCo_date AS ArrangeCo_date,
        ac.ArrangeCo_Lno AS ArrangeCo_Lno,
        l.Ltime_begin AS Ltime_begin,
        l.Ltime_end AS Ltime_end,
        cu.Cname AS Cname,
        ac.ArrangeCo_Pno AS ArrangeCo_Pno,
        p.Pname AS Pname
      FROM Arrange_Course ac
      JOIN Course co ON co.Cour_no = ac.ArrangeCo_Courno
      JOIN Curricular cu ON cu.Cno = co.Cour_cno
      JOIN Lesson l ON l.Lno = ac.ArrangeCo_Lno
      JOIN Setup_Course sc ON sc.SetupCo_Courno = co.Cour_no
      JOIN SetupCo_Prof sp ON sp.SetupCo_Courno = sc.SetupCo_Courno
      LEFT JOIN Professor p ON p.Pno = ac.ArrangeCo_Pno
      WHERE
        sp.SetupCo_Pno = '${uno}'
        AND sc.SetupCo_status IN ('等待选课','已经通过')
        AND co.Cour_status IN ('未开始','进行中')
    `;

    await db.execute(createViewSql);
    return res.json({ success: true, viewName });
  } catch (error) {
    console.error('Error creating Courseajust view:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/courseajust/view/cleanup', async (req, res) => {
  const { uno } = req.body;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_Courseajust_${uno}`;
  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error dropping Courseajust view:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/courseajust/replace', async (req, res) => {
  const { uno, courno, classhour } = req.body;
  if (!uno || !courno || classhour === undefined || classhour === null) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (!/^[A-Z0-9]{10}-[0-9]{5}-[0-9A-F]{3}$/.test(String(courno))) {
    return res.status(400).json({ success: false, message: 'Invalid Cour_no format' });
  }
  const classhourNum = Number(classhour);
  if (!Number.isFinite(classhourNum) || classhourNum <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid classhour' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT Urole FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (userRows[0].Urole !== '教授') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const [eligibleRows] = await connection.execute(
      `
        SELECT 1
        FROM Setup_Course sc
        JOIN SetupCo_Prof sp ON sp.SetupCo_Courno = sc.SetupCo_Courno
        JOIN Course co ON co.Cour_no = sc.SetupCo_Courno
        WHERE sc.SetupCo_Courno = ?
          AND sp.SetupCo_Pno = ?
          AND sc.SetupCo_status IN ('等待选课','已经通过')
          AND co.Cour_status IN ('未开始','进行中')
        LIMIT 1
      `,
      [courno, uno]
    );
    if (eligibleRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: '当前课程不在您的可调整范围内' });
    }

    const [arrRows] = await connection.execute(
      `
        SELECT
          ac.ArrangeCo_status AS ArrangeCo_status,
          ac.ArrangeCo_Pno AS OldPno,
          cu.Cname AS Cname
        FROM Arrange_Course ac
        JOIN Course co ON co.Cour_no = ac.ArrangeCo_Courno
        JOIN Curricular cu ON cu.Cno = co.Cour_cno
        WHERE ac.ArrangeCo_Courno = ? AND ac.ArrangeCo_classhour = ?
        FOR UPDATE
      `,
      [courno, classhourNum]
    );
    if (arrRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Arrange_Course record not found' });
    }
    if (arrRows[0].ArrangeCo_status === '已结束') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '已结束的课时不可调整任课教授' });
    }

    const oldPno = arrRows[0].OldPno ? String(arrRows[0].OldPno) : '';
    const courseName = arrRows[0].Cname ? String(arrRows[0].Cname) : '';

    const [profRows] = await connection.execute(
      `SELECT Pname FROM Professor WHERE Pno = ? FOR UPDATE`,
      [uno]
    );
    if (profRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Professor not found' });
    }
    const newProfName = profRows[0].Pname ? String(profRows[0].Pname) : '';

    await connection.execute(
      `
        UPDATE Arrange_Course
        SET ArrangeCo_Pno = ?
        WHERE ArrangeCo_Courno = ? AND ArrangeCo_classhour = ?
      `,
      [uno, courno, classhourNum]
    );

    if (oldPno && oldPno !== uno) {
      const content = `您负责的【${courseName}】课程的第${classhourNum}学时的任教转为由${newProfName || uno}负责，若有疑义请前往相应业务查看。`;
      await insertSystemMessageToMany(connection, [oldPno], content, '重要', '通知');
    }

    await connection.commit();
    return res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating Arrange_Course professor:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});


// ==========================================
// 9. 通用表格查询接口 (Generic Table API)
// ==========================================

/**
 * 通用表格查询接口
 * 
 * @route GET /api/common/table/list
 * @param {string} tableName - 目标表名或视图名
 * @param {number} page - 当前页码 (默认 1)
 * @param {number} limit - 每页数量 (默认 20)
 * @param {string} search_{field} - 针对特定字段的模糊搜索值
 * 
 * @description
 * 该接口支持查询数据库中的任意表或视图。
 * - 简单查询: 直接传入表名 (如 tableName=Student)。
 * - 复杂关联查询: 推荐在数据库中创建视图 (VIEW) 后传入视图名 (如 tableName=View_Student_Details)，
 *   从而实现多表 JOIN 结果的查询，保持前端调用的简洁性。
 * 
 * @example
 * // 查询学生表
 * GET /api/common/table/list?tableName=Student
 * 
 * // 查询预定义的视图 (包含学院名称等关联信息)
 * GET /api/common/table/list?tableName=View_Student_Details&search_Sname=张
 */
app.get('/api/common/table/list', async (req, res) => {
  const { tableName, page = 1, limit = 20, orderBy, orderDir, ...restParams } = req.query;

  // 1. 安全性校验: 表名格式校验 (仅允许字母、数字、下划线)
  // 仅做格式检查，不限制是否为视图，支持查询任意存在的表或视图
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid table name format.' 
    });
  }

  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClauses = [];
    let params = [];

    // 2. 动态构建搜索条件
    Object.keys(restParams).forEach(key => {
      if (key.startsWith('search_')) {
        const field = key.replace('search_', ''); // 获取字段名
        const value = restParams[key];
        
        // 字段名安全性校验 (仅允许字母、数字、下划线)
        if (!/^[a-zA-Z0-9_]+$/.test(field)) {
          console.warn(`Invalid field name detected: ${field}`);
          return;
        }

        if (value) {
          whereClauses.push(`${field} LIKE ?`);
          params.push(`%${value}%`);
        }
      }
    });

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    let orderSql = '';
    if (orderBy && /^[a-zA-Z0-9_]+$/.test(orderBy)) {
      const dir = String(orderDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderSql = `ORDER BY ${orderBy} ${dir}`;
    }

    // 3. 查询总数
    // tableName 已经过格式校验，可以直接拼接
    const countSql = `SELECT COUNT(*) as total FROM ${tableName} ${whereSql}`;
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limitNum) || 1;

    // 4. 查询当前页数据
    const dataSql = `SELECT * FROM ${tableName} ${whereSql} ${orderSql} LIMIT ${limitNum} OFFSET ${offset}`;
    const [rows] = await db.execute(dataSql, params);

    res.json({
      success: true,
      data: rows,
      pagination: { total, page: pageNum, totalPages, limit: limitNum }
    });

  } catch (error) {
    console.error(`Error fetching table data for ${tableName}:`, error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// Scheduled Tasks & Shutdown
// ==========================================

setInterval(async () => {
  try {
    await db.execute(
      `UPDATE Arrange_Course ac
       JOIN Lesson l ON l.Lno = ac.ArrangeCo_Lno
       SET ac.ArrangeCo_status = '上课中'
       WHERE ac.ArrangeCo_status = '待上课'
         AND ac.ArrangeCo_Clrmname IS NOT NULL
         AND ac.ArrangeCo_date IS NOT NULL
         AND ac.ArrangeCo_Lno IS NOT NULL
         AND TIMESTAMP(STR_TO_DATE(ac.ArrangeCo_date, '%Y-%m-%d'), l.Ltime_begin) <= NOW()
         AND TIMESTAMP(STR_TO_DATE(ac.ArrangeCo_date, '%Y-%m-%d'), l.Ltime_end) > NOW()`
    );

    await db.execute(
      `UPDATE Arrange_Course ac
       JOIN Lesson l ON l.Lno = ac.ArrangeCo_Lno
       SET ac.ArrangeCo_status = '已结束'
       WHERE ac.ArrangeCo_status IN ('待上课','上课中')
         AND ac.ArrangeCo_Clrmname IS NOT NULL
         AND ac.ArrangeCo_date IS NOT NULL
         AND ac.ArrangeCo_Lno IS NOT NULL
         AND TIMESTAMP(STR_TO_DATE(ac.ArrangeCo_date, '%Y-%m-%d'), l.Ltime_end) <= NOW()`
    );

    await db.execute(
      `UPDATE Exam e
       JOIN (
         SELECT se1.SetupE_Eno, se1.SetupE_Etime_begin, se1.SetupE_Etime_end
         FROM Setup_Exam se1
         JOIN (
           SELECT
             SetupE_Eno,
             MAX(SetupE_ID) AS MaxSetupE_ID
           FROM Setup_Exam
           WHERE SetupE_status = '审核通过'
           GROUP BY SetupE_Eno
         ) semax
           ON semax.SetupE_Eno = se1.SetupE_Eno
          AND semax.MaxSetupE_ID = se1.SetupE_ID
       ) se ON se.SetupE_Eno = e.Eno
       SET e.Estatus = '进行中'
       WHERE e.Estatus = '未开始'
         AND NOW() BETWEEN se.SetupE_Etime_begin AND se.SetupE_Etime_end`
    );

    await db.execute(
      `UPDATE Exam e
       JOIN (
         SELECT se1.SetupE_Eno, se1.SetupE_Etime_begin, se1.SetupE_Etime_end
         FROM Setup_Exam se1
         JOIN (
           SELECT
             SetupE_Eno,
             MAX(SetupE_ID) AS MaxSetupE_ID
           FROM Setup_Exam
           WHERE SetupE_status = '审核通过'
           GROUP BY SetupE_Eno
         ) semax
           ON semax.SetupE_Eno = se1.SetupE_Eno
          AND semax.MaxSetupE_ID = se1.SetupE_ID
       ) se ON se.SetupE_Eno = e.Eno
       SET e.Estatus = '已结束'
       WHERE e.Estatus IN ('未开始','进行中')
         AND se.SetupE_Etime_end <= NOW()`
    );

    await db.execute(
      `UPDATE Take_Exam te
       JOIN View_Classroom_Occupancy v
         ON v.Occ_type = '考试'
        AND v.ArrangeE_ID = te.TakingE_ArrangeEID
       SET te.TakingE_Status = '已经参考'
       WHERE te.TakingE_Status = '等待开考'
         AND v.Occ_end <= NOW()`
    );

    await db.execute(
      `UPDATE Invigilate iv
       JOIN View_Classroom_Occupancy v
         ON v.Occ_type = '考试'
       AND v.ArrangeE_ID = iv.Invigilate_ArrangeEID
       SET iv.Invigilate_Status = '已经监考'
       WHERE iv.Invigilate_Status = '等待开始'
         AND v.Occ_end <= NOW()`
    );

    const reminders = [
      { minutes: 4320, label: '3天', kind: '课程' },
      { minutes: 1440, label: '1天', kind: '课程' },
      { minutes: 60, label: '1小时', kind: '课程' }
    ];

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      for (const r of reminders) {
        const [courseRows] = await connection.execute(
          `SELECT
             ac.ArrangeCo_Pno AS Uno,
             cu.Cname AS Cname,
             ac.ArrangeCo_Clrmname AS Clrm,
             DATE_FORMAT(TIMESTAMP(STR_TO_DATE(ac.ArrangeCo_date, '%Y-%m-%d'), l.Ltime_begin), '%m-%d %H:%i:%s') AS BeginStr,
             DATE_FORMAT(TIMESTAMP(STR_TO_DATE(ac.ArrangeCo_date, '%Y-%m-%d'), l.Ltime_end), '%m-%d %H:%i:%s') AS EndStr
           FROM Arrange_Course ac
           JOIN Lesson l ON l.Lno = ac.ArrangeCo_Lno
           JOIN Course co ON co.Cour_no = ac.ArrangeCo_Courno
           JOIN Curricular cu ON cu.Cno = co.Cour_cno
           WHERE ac.ArrangeCo_Pno IS NOT NULL
             AND ac.ArrangeCo_Clrmname IS NOT NULL
             AND ac.ArrangeCo_date IS NOT NULL
             AND ac.ArrangeCo_Lno IS NOT NULL
             AND ac.ArrangeCo_status = '待上课'
             AND TIMESTAMP(STR_TO_DATE(ac.ArrangeCo_date, '%Y-%m-%d'), l.Ltime_begin)
               BETWEEN DATE_ADD(NOW(), INTERVAL ${r.minutes} MINUTE)
               AND DATE_ADD(DATE_ADD(NOW(), INTERVAL ${r.minutes} MINUTE), INTERVAL 2 MINUTE)`
        );

        for (const row of courseRows) {
          const content = `您在${r.label}后将参加【${row.Cname}】课程，具体时间为：${row.BeginStr}~${row.EndStr}，地址为：${row.Clrm}。请您合理安排时间。如有需要请在系统上发起调整申请。`;
          await insertSystemMessageToMany(connection, [row.Uno], content, '重要', '通知');
        }

        const [takeRows] = await connection.execute(
          `SELECT
             te.TakingE_Sno AS Uno,
             cu.Cname AS Cname,
             v.Clrm_name AS Clrm,
             DATE_FORMAT(v.Occ_begin, '%m-%d %H:%i:%s') AS BeginStr,
             DATE_FORMAT(v.Occ_end, '%m-%d %H:%i:%s') AS EndStr
           FROM Take_Exam te
           JOIN View_Classroom_Occupancy v
             ON v.Occ_type = '考试'
            AND v.ArrangeE_ID = te.TakingE_ArrangeEID
           JOIN Exam e ON e.Eno = v.Eno
           JOIN Curricular cu ON cu.Cno = e.E_cno
           WHERE te.TakingE_Status = '等待开考'
             AND v.Occ_begin
               BETWEEN DATE_ADD(NOW(), INTERVAL ${r.minutes} MINUTE)
               AND DATE_ADD(DATE_ADD(NOW(), INTERVAL ${r.minutes} MINUTE), INTERVAL 2 MINUTE)`
        );

        for (const row of takeRows) {
          const content = `您在${r.label}后将参加【${row.Cname}】考试，具体时间为：${row.BeginStr}~${row.EndStr}，地址为：${row.Clrm}。请您合理安排时间。如有需要请在系统上发起调整申请。`;
          await insertSystemMessageToMany(connection, [row.Uno], content, '重要', '通知');
        }

        const [invRows] = await connection.execute(
          `SELECT
             iv.Invigilate_Pno AS Uno,
             cu.Cname AS Cname,
             v.Clrm_name AS Clrm,
             DATE_FORMAT(v.Occ_begin, '%m-%d %H:%i:%s') AS BeginStr,
             DATE_FORMAT(v.Occ_end, '%m-%d %H:%i:%s') AS EndStr
           FROM Invigilate iv
           JOIN View_Classroom_Occupancy v
             ON v.Occ_type = '考试'
            AND v.ArrangeE_ID = iv.Invigilate_ArrangeEID
           JOIN Exam e ON e.Eno = v.Eno
           JOIN Curricular cu ON cu.Cno = e.E_cno
           WHERE iv.Invigilate_Status = '等待开始'
             AND v.Occ_begin
               BETWEEN DATE_ADD(NOW(), INTERVAL ${r.minutes} MINUTE)
               AND DATE_ADD(DATE_ADD(NOW(), INTERVAL ${r.minutes} MINUTE), INTERVAL 2 MINUTE)`
        );

        for (const row of invRows) {
          const content = `您在${r.label}后将参加【${row.Cname}】考试，具体时间为：${row.BeginStr}~${row.EndStr}，地址为：${row.Clrm}。请您合理安排时间。如有需要请在系统上发起调整申请。`;
          await insertSystemMessageToMany(connection, [row.Uno], content, '重要', '通知');
        }
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      console.error('[StatusScheduler-Notify] Error:', err);
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('[StatusScheduler] Error:', err);
  }
}, 120000);

// 1. 自动注销超时用户 (每30秒执行一次)
setInterval(async () => {
  try {
    const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);
    
    // 查找所有在线且超过10分钟未活跃的用户
    const [rows] = await db.execute(
      "SELECT Uno FROM User WHERE Ustatus = '在线' AND Ulasttrytime < ?",
      [TEN_MINUTES_AGO]
    );
    
    if (rows.length > 0) {
      console.log(`[Auto-Logout] Found ${rows.length} expired sessions.`);
      
      for (const row of rows) {
        const uno = row.Uno;
        console.log(`[Auto-Logout] Logging out user ${uno}...`);
        
        // 1. 发送系统消息
        await sendSystemMessage(uno, '会话已过期，您的登录即将注销，请重新登录', '重要');
        
        // 2. 强制下线
        await db.execute("UPDATE User SET Ustatus = '离线' WHERE Uno = ?", [uno]);
      }
    }
  } catch (err) {
    console.error('[Auto-Logout] Error:', err);
  }
}, 30000);

// 2. 优雅关闭 (服务器停止时将所有用户置为离线)
const gracefulShutdown = async () => {
  console.log('\n[Server] Shutting down...');
  try {
    const [result] = await db.execute("UPDATE User SET Ustatus = '离线' WHERE Ustatus = '在线'");
    console.log(`[Server] Set ${result.affectedRows} users to offline.`);
  } catch (err) {
    console.error('[Server] Error updating user status:', err);
  }
  process.exit(0);
};

// 监听终止信号
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
