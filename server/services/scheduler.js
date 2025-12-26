const db = require('../db');
const { sendSystemMessage, insertSystemMessageToMany } = require('./messageService');

function initScheduler() {
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

  setInterval(async () => {
    try {
      const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);

      const [rows] = await db.execute(
        "SELECT Uno FROM User WHERE Ustatus = '在线' AND Ulasttrytime < ?",
        [TEN_MINUTES_AGO]
      );

      if (rows.length > 0) {
        console.log(`[Auto-Logout] Found ${rows.length} expired sessions.`);

        for (const row of rows) {
          const uno = row.Uno;
          console.log(`[Auto-Logout] Logging out user ${uno}...`);

          await sendSystemMessage(uno, '您上次退出前会话过期，请注意在退出前及时注销登录', '重要');

          await db.execute("UPDATE User SET Ustatus = '离线' WHERE Uno = ?", [uno]);
        }
      }
    } catch (err) {
      console.error('[Auto-Logout] Error:', err);
    }
  }, 30000);

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

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

module.exports = { initScheduler };

