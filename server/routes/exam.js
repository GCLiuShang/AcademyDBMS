const express = require('express');
const db = require('../db');
const { getNextSequenceNumber } = require('../services/sequenceService');

const router = express.Router();

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

router.post('/examapply/view/init', async (req, res) => {
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

router.post('/examapply/view/cleanup', async (req, res) => {
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

router.post('/examapply/submit', async (req, res) => {
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

router.get('/arrange/transactions/list', async (req, res) => {
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

router.post('/arrange/exam/submit', async (req, res) => {
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
      await connection.execute(`INSERT INTO Exam (Eno, E_cno, Eattri, Estatus) VALUES (?, ?, ?, '未开始')`, [
        eno,
        cno,
        eattri,
      ]);
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

router.post('/examarrange/exam/search', async (req, res) => {
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

router.post('/examarrange/prof/search', async (req, res) => {
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

router.post('/examarrange/exam/details', async (req, res) => {
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
      HasTake: Number(r.TakeCount || 0) > 0,
    }));

    const invigilators = (invRows || []).map((r) => ({
      Pno: r.Pno,
      Pname: r.Pname || '',
    }));

    return res.json({
      success: true,
      exam: {
        Eno: exam.Eno,
        Cno: exam.Cno,
        Cname: exam.Cname || '',
        Eattri: exam.Eattri,
        Estatus: exam.Estatus,
      },
      arranges,
      invigilators,
    });
  } catch (error) {
    console.error('Error fetching exam details for examarrange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/examarrange/invigilate/save', async (req, res) => {
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

router.post('/examarrange/students', async (req, res) => {
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
      seat: r.Seatno != null ? Number(r.Seatno) : null,
    }));

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
    console.error('Error fetching students for examarrange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/examarrange/arrange', async (req, res) => {
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

module.exports = router;
