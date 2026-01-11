const express = require('express');
const db = require('../db');
const { getCurrentBusinessFlags } = require('../services/businessService');
const { insertSystemMessageToMany } = require('../services/messageService');
const { requireAuth } = require('../services/sessionService');
const { authorize } = require('../services/userService');
const { verifyPassword } = require('../services/passwordService');

const router = express.Router();

router.use(requireAuth);
router.use('/business/control', authorize(['学校教务处管理员']));

router.get('/business/status', async (req, res) => {
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

router.post('/business/control/update', async (req, res) => {
  const { oldPassword, curricularOpen, courseOpen, enrollOpen } = req.body;
  const uno = req.user && req.user.Uno ? String(req.user.Uno) : '';
  if (!oldPassword) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [authRows] = await connection.execute('SELECT Upswd FROM User WHERE Uno = ? FOR UPDATE', [uno]);
    const storedHash = authRows.length > 0 ? authRows[0].Upswd : null;
    const ok = await verifyPassword(oldPassword, storedHash);
    if (!ok) {
      await connection.rollback();
      return res.status(403).json({ success: false, code: 'WRONG_PASSWORD', message: 'Wrong password' });
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

    if (!oldEnrollOpen && enrollFlag) {
      await connection.execute(`DELETE FROM Enrollment`);
    }

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

module.exports = router;
