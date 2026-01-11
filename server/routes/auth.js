const express = require('express');
const db = require('../db');
const { sendSystemMessage, sendWelcomeMessage } = require('../services/messageService');
const { createSession, revokeSession, setSessionCookie, clearSessionCookie } = require('../services/sessionService');
const { verifyPassword } = require('../services/passwordService');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  if (username === 'O000000000') {
    return res.status(403).json({ success: false, message: '系统管理员账户禁止登录' });
  }

  try {
    const [users] = await db.execute('SELECT * FROM User WHERE Uno = ?', [username]);

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const user = users[0];
    const MAX_RETRIES = 5;
    const LOCK_TIME_MS = 60 * 1000;

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
          remainingTime: remainingSeconds,
        });
      }
    }

    const ok = await verifyPassword(password, user.Upswd);
    if (ok) {
      if (user.Ustatus === '在线') {
        const kickMsg = '您的账号在另一处登录，即将注销登录，若并非您操作请在重新登录后修改密码。';
        await sendSystemMessage(username, kickMsg, '重要');

        await db.execute('UPDATE User SET Ustatus = ? WHERE Uno = ?', ['离线', username]);

        return res.status(403).json({
          success: false,
          code: 'ALREADY_LOGGED_IN',
          message: '该账号已登录。已向对方发送下线通知，请等待对方下线后重试。',
        });
      }

      await db.execute(
        'UPDATE User SET Ustatus = ?, Ulosetimes = 0, Ulasttrytime = NOW() WHERE Uno = ?',
        ['在线', username]
      );

      await db.execute(`UPDATE User_Session SET Revoked = 1 WHERE Uno = ?`, [username]);
      const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
      const ipRaw =
        typeof req.headers['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for']
          : typeof req.ip === 'string'
            ? req.ip
            : '';
      const ip = ipRaw ? String(ipRaw).split(',')[0].trim() : null;
      const { sid } = await createSession({ uno: username, ua, ip });
      setSessionCookie(res, sid, req);

      const userWithoutPassword = { ...user };
      userWithoutPassword.Ustatus = '在线';
      delete userWithoutPassword.Upswd;
      delete userWithoutPassword.Ulosetimes;
      delete userWithoutPassword.Ulasttrytime;

      let name = '';
      let roleTable = '';
      let idCol = '';
      let nameCol = '';

      switch (user.Urole) {
        case '学生':
          roleTable = 'Student';
          idCol = 'Sno';
          nameCol = 'Sname';
          break;
        case '教授':
          roleTable = 'Professor';
          idCol = 'Pno';
          nameCol = 'Pname';
          break;
        case '学院教学办管理员':
          roleTable = 'Dept_Adm';
          idCol = 'DAno';
          nameCol = 'DAname';
          break;
        case '学校教务处管理员':
          roleTable = 'Univ_Adm';
          idCol = 'UAno';
          nameCol = 'UAname';
          break;
      }

      if (roleTable) {
        const [roleRows] = await db.execute(
          `SELECT ${nameCol} FROM ${roleTable} WHERE ${idCol} = ?`,
          [username]
        );
        if (roleRows.length > 0) {
          name = roleRows[0][nameCol];
        }
      }

      const finalUser = { ...userWithoutPassword, name: name || username };

      sendWelcomeMessage(finalUser).catch((err) =>
        console.error('Failed to send welcome message:', err)
      );

      res.json({ success: true, message: '登录成功', user: finalUser });
    } else {
      let newLoseTimes = user.Ulosetimes + 1;

      if (user.Ustatus === '锁定') newLoseTimes = 1;

      let newStatus = user.Ustatus === '在线' ? '离线' : user.Ustatus;

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
      const msg =
        newStatus === '锁定'
          ? `用户名或密码错误\n(还剩余0次尝试，次数为0后将锁定1分钟)`
          : `用户名或密码错误\n(还剩余${remainingAttempts}次尝试，次数为0后将锁定1分钟)`;

      res.status(401).json({ success: false, message: msg, remainingAttempts });
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    if (req.sessionSid) {
      await revokeSession(req.sessionSid);
    }
    clearSessionCookie(res, req);

    const username = req.user && req.user.Uno ? req.user.Uno : '';
    if (username) {
      await db.execute('UPDATE User SET Ustatus = ? WHERE Uno = ?', ['离线', username]);
    }

    res.json({ success: true, message: 'Logout successful' });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
