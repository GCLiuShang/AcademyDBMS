const express = require('express');
const db = require('../db');
const { getCurrentBusinessFlags } = require('../services/businessService');

const router = express.Router();

router.post('/enroll/available', async (req, res) => {
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
        cu.Cname AS Cname,
        cu.Ccredit AS Ccredit
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
        courseCredit: r.Ccredit ?? null,
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

router.post('/enroll/selected', async (req, res) => {
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
        cu.Cname AS Cname,
        cu.Ccredit AS Ccredit
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
        courseCredit: r.Ccredit ?? null,
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

router.post('/enroll/select', async (req, res) => {
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

router.post('/enroll/drop', async (req, res) => {
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

module.exports = router;
