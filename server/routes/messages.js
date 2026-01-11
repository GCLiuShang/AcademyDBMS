const express = require('express');
const db = require('../db');
const { getNextSequenceNumber } = require('../services/sequenceService');
const { requireAuth } = require('../services/sessionService');

const router = express.Router();

router.use(requireAuth);

// 3. 获取新消息 (轮询用)
router.get('/messages/new', async (req, res) => {
  const uno = String(req.user.Uno);

  try {
    // 3.1 刷新活跃时间
    await db.execute('UPDATE User SET Ulasttrytime = NOW() WHERE Uno = ?', [uno]);

    // 3.2 检查会话状态 (超时或被踢)
    const [userRows] = await db.execute('SELECT Ulasttrytime, Ustatus FROM User WHERE Uno = ?', [uno]);
    if (userRows.length > 0) {
      const user = userRows[0];
      const now = new Date();
      const TEN_MINUTES_MS = 10 * 60 * 1000;

      const TIMEOUT_MSG = '您上次操作时意外退出，超时后系统自动注销，为了账号安全请在每次退出前及时注销。';
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
        MS.Send_time,
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
router.post('/messages/read', async (req, res) => {
  const { msg_no } = req.body;
  const uno = String(req.user.Uno);
  if (!msg_no) return res.status(400).json({ success: false, message: 'Missing parameters' });

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
router.post('/messages/delete', async (req, res) => {
  const { msg_no, type } = req.body;
  const uno = String(req.user.Uno);
  if (!msg_no) return res.status(400).json({ success: false, message: 'Missing parameters' });

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
router.post('/messages/restore', async (req, res) => {
  const { msg_no, type } = req.body;
  const uno = String(req.user.Uno);
  if (!msg_no) return res.status(400).json({ success: false, message: 'Missing parameters' });

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

router.post('/messages/send', async (req, res) => {
  const { receiverUnos, category, priority, content, wdMsgNo } = req.body;
  const authedUno = String(req.user.Uno);
  if (!Array.isArray(receiverUnos) || receiverUnos.length === 0) {
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
      [msgNo, authedUno, now, true]
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
router.get('/messages/trash', async (req, res) => {
  const uno = String(req.user.Uno);

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
router.get('/dashboard/messages', async (req, res) => {
  const uno = String(req.user.Uno);

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

// ReceiveBox 视图管理接口
router.post('/receivebox/view/init', async (req, res) => {
  const uno = String(req.user.Uno);
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const viewName = `View_ReceiveBox_${uno}`;

  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);

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

router.post('/receivebox/view/cleanup', async (req, res) => {
  const uno = String(req.user.Uno);
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

// SendBox 视图管理接口
router.post('/sendbox/view/init', async (req, res) => {
  const uno = String(req.user.Uno);
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

router.post('/sendbox/view/cleanup', async (req, res) => {
  const uno = String(req.user.Uno);
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

// RubbishBox 视图管理接口
router.post('/rubbishbox/view/init', async (req, res) => {
  const uno = String(req.user.Uno);
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

router.post('/rubbishbox/view/cleanup', async (req, res) => {
  const uno = String(req.user.Uno);
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

module.exports = router;

