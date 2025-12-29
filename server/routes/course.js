const express = require('express');
const db = require('../db');
const { getCurrentBusinessFlags } = require('../services/businessService');
const { insertSystemMessageToMany } = require('../services/messageService');

const router = express.Router();

router.post('/course/search', async (req, res) => {
  const { query, limit } = req.body;
  if (typeof query !== 'string') return res.status(400).json({ success: false, message: 'Invalid query' });
  const q = query.trim();
  if (q.length < 3) return res.json({ success: true, data: [] });
  if (q.length > 50) return res.status(400).json({ success: false, message: 'Query too long' });

  const limitNumRaw = limit === null || limit === undefined ? 50 : Number(limit);
  const limitNum = Number.isFinite(limitNumRaw) ? Math.min(50, Math.max(1, Math.floor(limitNumRaw))) : 50;

  const escapeLike = (value) => String(value).replace(/([\\%_])/g, '\\$1');
  const like = `%${escapeLike(q)}%`;

  try {
    const [rows] = await db.execute(
      `SELECT Cno, Cname
       FROM Curricular
       WHERE Cno LIKE ? ESCAPE '\\\\' OR Cname LIKE ? ESCAPE '\\\\'
       ORDER BY Cno ASC
       LIMIT ?`,
      [like, like, limitNum]
    );
    return res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Error searching courses:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/courseapply/view/init', async (req, res) => {
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

router.post('/courseapply/view/cleanup', async (req, res) => {
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

router.post('/courseapply/submit', async (req, res) => {
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
      let ccredit = null;
      let classhour = null;
      let ceattri = null;
      let description = null;
      let notifyUnos = [];

      if (cattri === '公共必修' || cattri === '专业必修' || cattri === '专业选修') {
        const [setupRows] = await connection.execute(
          `SELECT SetupCuG_ID as ApplyID, SetupCuG_Cname as Cname, SetupCuG_Ccredit as Ccredit, SetupCuG_Cclasshour as Cclasshour, SetupCuG_Ceattri as Ceattri, SetupCuG_description as Description
           FROM Setup_Curricular_G
           WHERE SetupCuG_Cno = ?
           ORDER BY SetupCuG_createtime DESC
           LIMIT 1 FOR UPDATE`,
          [cno]
        );
        if (setupRows.length > 0) {
          source = { type: 'G', applyId: setupRows[0].ApplyID };
          cname = setupRows[0].Cname;
          ccredit = setupRows[0].Ccredit;
          classhour = setupRows[0].Cclasshour;
          ceattri = setupRows[0].Ceattri;
          description = setupRows[0].Description ?? null;

          const [uaRows] = await connection.execute(`SELECT UAno FROM Univ_Adm WHERE UAstatus = '在职' FOR UPDATE`);
          notifyUnos = uaRows.map((r) => r.UAno).filter(Boolean);
        }
      } else {
        const [setupRows] = await connection.execute(
          `SELECT SetupCuP_ID as ApplyID, SetupCuP_Cname as Cname, SetupCuP_Ccredit as Ccredit, SetupCuP_Cclasshour as Cclasshour, SetupCuP_Ceattri as Ceattri, SetupCuP_description as Description
           FROM Setup_Curricular_P
           WHERE SetupCuP_Cno = ?
           ORDER BY SetupCuP_createtime DESC
           LIMIT 1 FOR UPDATE`,
          [cno]
        );
        if (setupRows.length > 0) {
          source = { type: 'P', applyId: setupRows[0].ApplyID };
          cname = setupRows[0].Cname;
          ccredit = setupRows[0].Ccredit;
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
        `INSERT INTO Curricular (Cno, Cname, Ccredit, C_classhour, C_eattri, Cdescription, Cstatus)
         VALUES (?, ?, ?, ?, ?, ?, '正常') AS new
         ON DUPLICATE KEY UPDATE
           Cname = new.Cname,
           Ccredit = new.Ccredit,
           C_classhour = new.C_classhour,
           C_eattri = new.C_eattri,
           Cdescription = new.Cdescription,
           Cstatus = '正常'`,
        [cno, cname, Number(ccredit || 0), Number(classhour), ceattri, description]
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

router.post('/courseajust/view/init', async (req, res) => {
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

router.post('/courseajust/view/cleanup', async (req, res) => {
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

router.post('/courseajust/replace', async (req, res) => {
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

router.post('/arrange/course/submit', async (req, res) => {
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

    const [semeRows] = await connection.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1 FOR UPDATE');
    if (semeRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Semester not found' });
    }
    const semeNo = semeRows[0].Seme_no;

    const [existArrRows] = await connection.execute(
      `SELECT COUNT(*) as Cnt
       FROM Arrange_Course
       WHERE ArrangeCo_Courno = ?
       FOR UPDATE`,
      [courno]
    );
    const existCnt = Number(existArrRows?.[0]?.Cnt || 0);
    if (!Number.isFinite(existCnt) || existCnt > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Course already arranged' });
    }

    const parts = String(courno).split('-');
    const courCno = parts[0] || '';
    const courSeme = parts[1] || '';
    const courNumHex = parts[2] || '';
    const courNumber = Number.parseInt(courNumHex, 16);
    if (!courCno || !courSeme || !Number.isFinite(courNumber) || courNumber < 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid Cour_no format' });
    }
    if (String(courSeme) !== String(semeNo)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Course not in current semester' });
    }

    const [courseRows] = await connection.execute(
      `SELECT Cour_no, Cour_seme, Cour_status
       FROM Course
       WHERE Cour_no = ?
       FOR UPDATE`,
      [courno]
    );
    if (courseRows.length === 0) {
      await connection.execute(
        `INSERT INTO Course (Cour_no, Cour_cno, Cour_seme, Cour_number, Cour_pmax, Cour_pnow, Cour_status)
         VALUES (?, ?, ?, ?, ?, 0, '未开始')`,
        [courno, courCno, semeNo, courNumber, pmax]
      );
    } else if (String(courseRows[0].Cour_seme) !== String(semeNo)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Course not in current semester' });
    } else if (courseRows[0].Cour_status !== '未开始') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Only courses not started can be arranged' });
    }

    const [weekRows] = await connection.execute(
      `SELECT DISTINCT Date_week, Date_no
       FROM Date
       WHERE Date_seme = ?
       ORDER BY Date_no ASC
       FOR UPDATE`,
      [semeNo]
    );
    if (weekRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Semester dates not found' });
    }

    const weekToDates = new Map();
    for (const r of weekRows) {
      const weekNo = Number(r.Date_week);
      const dateNo = r.Date_no;
      if (!Number.isFinite(weekNo) || !dateNo) continue;
      const list = weekToDates.get(weekNo) || [];
      list.push(dateNo);
      weekToDates.set(weekNo, list);
    }

    const requiredWeeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
    const used = new Set();
    const slots = [];

    for (const weekNo of requiredWeeks) {
      const meta = weekMap.get(weekNo);
      const dates = weekToDates.get(weekNo) || [];
      if (dates.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `No dates for week ${weekNo}` });
      }

      let chosenDate = null;
      for (const d of dates) {
        const key = `${d}-${meta.classroom}`;
        if (used.has(key)) continue;
        chosenDate = d;
        used.add(key);
        break;
      }
      if (!chosenDate) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `No free date for week ${weekNo}` });
      }

      for (const l of meta.lessons) {
        const classhourNo = Number(l);
        if (!Number.isFinite(classhourNo)) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Invalid lesson number' });
        }
        slots.push({
          dateNo: chosenDate,
          lno: l,
          classroom: meta.classroom,
        });
      }
    }

    const [occupiedRows] = await connection.execute(
      `SELECT ArrangeCo_date, ArrangeCo_Lno, ArrangeCo_Clrmname
       FROM Arrange_Course
       WHERE ArrangeCo_date IN (${Array.from(new Set(slots.map((s) => s.dateNo))).map(() => '?').join(',')})
         AND ArrangeCo_Clrmname IN (${Array.from(new Set(slots.map((s) => s.classroom))).map(() => '?').join(',')})
       FOR UPDATE`,
      [
        ...Array.from(new Set(slots.map((s) => s.dateNo))),
        ...Array.from(new Set(slots.map((s) => s.classroom))),
      ]
    );

    const occSet = new Set(
      (occupiedRows || []).map((r) => `${r.ArrangeCo_date}-${r.ArrangeCo_Lno}-${r.ArrangeCo_Clrmname}`)
    );

    for (const slot of slots) {
      const key = `${slot.dateNo}-${slot.lno}-${slot.classroom}`;
      if (occSet.has(key)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Classroom and lesson already occupied' });
      }
    }

    const classhour = slots.length;

    const [curRows] = await connection.execute(
      `SELECT C_classhour
       FROM Curricular
       WHERE Cno = ?
       LIMIT 1 FOR UPDATE`,
      [courCno]
    );
    if (curRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Curricular not found' });
    }
    const totalClasshour = Number(curRows[0].C_classhour);
    if (!Number.isFinite(totalClasshour) || totalClasshour <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid curricular classhour' });
    }
    if (classhour !== totalClasshour) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Arrange classhour mismatch' });
    }

    for (let classhourNo = 1; classhourNo <= slots.length; classhourNo += 1) {
      const slot = slots[classhourNo - 1];
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

module.exports = router;
