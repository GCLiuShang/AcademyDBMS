const express = require('express');
const db = require('../db');
const { getNextSequenceNumber } = require('../services/sequenceService');
const { getCurrentBusinessFlags } = require('../services/businessService');

const router = express.Router();

router.post('/curricularapply/view/init', async (req, res) => {
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

router.post('/curricularapply/view/cleanup', async (req, res) => {
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

router.post('/curricularapply/submit', async (req, res) => {
  const { uno, cattri, cseme, cname, credit, classhour, ceattri, description, prerequisites } = req.body;
  if (!uno || !cattri || !cseme || !cname || !classhour) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }
  if (typeof cname !== 'string' || cname.length === 0 || cname.length > 19) {
    return res.status(400).json({ success: false, message: 'Invalid course name' });
  }
  const creditValue = credit === null || credit === undefined || credit === '' ? 0 : Number(credit);
  if (!Number.isFinite(creditValue) || !Number.isInteger(creditValue) || creditValue < 0 || creditValue > 255) {
    return res.status(400).json({ success: false, message: 'Invalid credit' });
  }
  if (!Number.isFinite(Number(classhour)) || Number(classhour) <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid class hour' });
  }
  if (description !== null && description !== undefined) {
    if (typeof description !== 'string' || description.length > 49) {
      return res.status(400).json({ success: false, message: 'Invalid description' });
    }
  }

  let prereqList = [];
  if (prerequisites !== null && prerequisites !== undefined) {
    if (!Array.isArray(prerequisites)) {
      return res.status(400).json({ success: false, message: 'Invalid prerequisites' });
    }
    prereqList = prerequisites
      .filter((x) => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => x.length > 0 && x.length <= 10 && /^[a-zA-Z0-9]+$/.test(x));
    prereqList = Array.from(new Set(prereqList));
    if (prereqList.length > 50) {
      return res.status(400).json({ success: false, message: 'Too many prerequisites' });
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
    if (role === '教授' && prereqList.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid prerequisites' });
    }

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
          (SetupCuP_ID, SetupCuP_date, SetupCuP_number, SetupCuP_Cno, SetupCuP_Cname, SetupCuP_Ccredit, SetupCuP_Cclasshour, SetupCuP_Ceattri, SetupCuP_description, SetupCuP_status, SetupCuP_createPno)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [applyId, dateStrDash, seq, cno, cname, creditValue, Number(classhour), finalCeattri, description ?? null, '等待审核', uno]
      );
      if (prereqList.length > 0) {
        const placeholders = prereqList.map(() => '?').join(',');
        const [existRows] = await connection.execute(`SELECT Cno FROM Curricular WHERE Cno IN (${placeholders})`, prereqList);
        const existSet = new Set((existRows || []).map((r) => r.Cno));
        if (existSet.size !== prereqList.length) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Invalid prerequisites' });
        }
        await connection.execute(`DELETE FROM Prerequisite_temp WHERE Cno_later = ?`, [cno]);
        const valueSql = prereqList.map(() => '(?, ?)').join(',');
        const values = prereqList.flatMap((former) => [cno, former]);
        await connection.execute(`INSERT INTO Prerequisite_temp (Cno_later, Cno_former) VALUES ${valueSql}`, values);
      }
      await connection.commit();
      return res.json({ success: true, applyId, cno });
    }

    const seq = await getNextSequenceNumber(connection, 'Setup_Curricular_G', 'SetupCuG_number', { SetupCuG_date: dateStrDash });
    const seqHex = Number(seq).toString(16).toUpperCase().padStart(5, '0');
    const applyId = `SETCUG${dateStr}-${seqHex}`;
    await connection.execute(
      `INSERT INTO Setup_Curricular_G
        (SetupCuG_ID, SetupCuG_date, SetupCuG_number, SetupCuG_Cno, SetupCuG_Cname, SetupCuG_Ccredit, SetupCuG_Cclasshour, SetupCuG_Ceattri, SetupCuG_description, SetupCuG_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [applyId, dateStrDash, seq, cno, cname, creditValue, Number(classhour), finalCeattri, description ?? null, '等待审核']
    );
    if (prereqList.length > 0) {
      const placeholders = prereqList.map(() => '?').join(',');
      const [existRows] = await connection.execute(`SELECT Cno FROM Curricular WHERE Cno IN (${placeholders})`, prereqList);
      const existSet = new Set((existRows || []).map((r) => r.Cno));
      if (existSet.size !== prereqList.length) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Invalid prerequisites' });
      }
      await connection.execute(`DELETE FROM Prerequisite_temp WHERE Cno_later = ?`, [cno]);
      const valueSql = prereqList.map(() => '(?, ?)').join(',');
      const values = prereqList.flatMap((former) => [cno, former]);
      await connection.execute(`INSERT INTO Prerequisite_temp (Cno_later, Cno_former) VALUES ${valueSql}`, values);
    }
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

router.post('/curricularapply/cancel', async (req, res) => {
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

router.post('/curricularapprove/view/init', async (req, res) => {
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

router.post('/curricularapprove/view/cleanup', async (req, res) => {
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

router.post('/curricularapprove/pass', async (req, res) => {
  const { uno, applyId } = req.body;
  if (!uno || !applyId) return res.status(400).json({ success: false, message: 'Missing parameters' });
  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid Uno format' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const movePrerequisitesFromTemp = async (cnoLater) => {
      await connection.execute(
        `INSERT IGNORE INTO Prerequisite (Cno_later, Cno_former)
         SELECT Cno_later, Cno_former
         FROM Prerequisite_temp
         WHERE Cno_later = ?`,
        [cnoLater]
      );
      await connection.execute(`DELETE FROM Prerequisite_temp WHERE Cno_later = ?`, [cnoLater]);
    };

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
           P.SetupCuP_Ccredit as Ccredit,
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
        `INSERT INTO Curricular (Cno, Cname, Ccredit, C_classhour, C_eattri, Cdescription, Cstatus)
         VALUES (?, ?, ?, ?, ?, ?, '正常') AS new
         ON DUPLICATE KEY UPDATE
           Cname = new.Cname,
           Ccredit = new.Ccredit,
           C_classhour = new.C_classhour,
           C_eattri = new.C_eattri,
           Cdescription = new.Cdescription,
           Cstatus = '正常'`,
        [rows[0].Cno, rows[0].Cname, rows[0].Ccredit, rows[0].Cclasshour, rows[0].Ceattri, rows[0].Description ?? null]
      );
      await connection.execute(`UPDATE Setup_Curricular_P SET SetupCuP_status = '等待选课' WHERE SetupCuP_ID = ?`, [applyId]);
      await connection.execute(`UPDATE Cno_Pool SET Cno_status = '不可用' WHERE Cno = ?`, [rows[0].Cno]);
      await movePrerequisitesFromTemp(rows[0].Cno);
      await connection.commit();
      return res.json({ success: true });
    }

    if (role === '学校教务处管理员') {
      const [rows] = await connection.execute(
        `SELECT
           SetupCuG_Cno as Cno,
           SetupCuG_Cname as Cname,
           SetupCuG_Ccredit as Ccredit,
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
        `INSERT INTO Curricular (Cno, Cname, Ccredit, C_classhour, C_eattri, Cdescription, Cstatus)
         VALUES (?, ?, ?, ?, ?, ?, '正常') AS new
         ON DUPLICATE KEY UPDATE
           Cname = new.Cname,
           Ccredit = new.Ccredit,
           C_classhour = new.C_classhour,
           C_eattri = new.C_eattri,
           Cdescription = new.Cdescription,
           Cstatus = '正常'`,
        [rows[0].Cno, rows[0].Cname, rows[0].Ccredit, rows[0].Cclasshour, rows[0].Ceattri, rows[0].Description ?? null]
      );
      await connection.execute(`UPDATE Setup_Curricular_G SET SetupCuG_status = '已经通过' WHERE SetupCuG_ID = ?`, [applyId]);
      await connection.execute(`UPDATE Cno_Pool SET Cno_status = '不可用' WHERE Cno = ?`, [rows[0].Cno]);
      await movePrerequisitesFromTemp(rows[0].Cno);
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

module.exports = router;
