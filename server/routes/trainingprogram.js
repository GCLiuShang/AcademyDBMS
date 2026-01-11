const express = require('express');
const db = require('../db');
const { requireAuth } = require('../services/sessionService');
const { authorize, authorizeTrainingProgramDomain } = require('../services/userService');

const router = express.Router();

router.use(requireAuth);
router.use(authorize(['学院教学办管理员'], { dept: 'deptAdmin' }));
router.use(authorizeTrainingProgramDomain());

const escapeLike = (value) => String(value).replace(/([\\%_])/g, '\\$1');

const toSafeTableName = (value) => String(value).replace(/[^a-zA-Z0-9_]/g, '_');

let ensuredTpStatusEnum = false;
let ensureTpStatusEnumPromise = null;

const ensureTrainingProgramTpStatusEnum = async () => {
  if (ensuredTpStatusEnum) return;
  if (ensureTpStatusEnumPromise) return ensureTpStatusEnumPromise;

  ensureTpStatusEnumPromise = (async () => {
    const [cols] = await db.execute(`SHOW COLUMNS FROM TrainingProgram LIKE 'TPstatus'`);
    const type = String(cols?.[0]?.Type || '');
    if (type.includes('调整中') && type.includes('可使用') && type.includes('已停用')) {
      ensuredTpStatusEnum = true;
      return;
    }

    await db.execute(
      `ALTER TABLE TrainingProgram
       MODIFY TPstatus ENUM('可使用', '调整中', '已停用') NOT NULL DEFAULT '调整中'`
    );
    ensuredTpStatusEnum = true;
  })().catch((e) => {
    ensuredTpStatusEnum = true;
    throw e;
  });

  return ensureTpStatusEnumPromise;
};

const buildViewName = (type, uno, tpno) => {
  const safeType = toSafeTableName(type);
  const safeUno = toSafeTableName(uno);
  const safeTpno = toSafeTableName(tpno);
  return `View_TrainingProgram_${safeType}_${safeUno}_${safeTpno}`;
};

const isOwnTrainingProgramView = (viewName, uno) => {
  if (typeof viewName !== 'string') return false;
  if (!/^[a-zA-Z0-9_]+$/.test(viewName)) return false;
  const safeUno = toSafeTableName(uno);
  return viewName.startsWith('View_TrainingProgram_') && viewName.includes(`_${safeUno}_`);
};

const parseTpno = (tpno) => {
  if (typeof tpno !== 'string') return null;
  const trimmed = tpno.trim();
  const m = trimmed.match(/^TP([A-Z]{2}[0-9A-F]{2})-([0-9]{4})$/);
  if (!m) return null;
  return { tpno: trimmed, dom: m[1], year: Number(m[2]) };
};

const buildSearchWhere = (query, mapping) => {
  const whereParts = [];
  const params = [];
  for (const [key, expr] of Object.entries(mapping)) {
    const qKey = `search_${key}`;
    const raw = query[qKey];
    if (raw === null || raw === undefined) continue;
    const value = String(raw).trim();
    if (!value) continue;
    whereParts.push(`${expr} LIKE ? ESCAPE '\\\\'`);
    params.push(`%${escapeLike(value)}%`);
  }
  return { whereParts, params };
};

router.post('/trainingprogram/view/init', async (req, res) => {
  const { tpno, type } = req.body || {};
  const uno = req.user && req.user.Uno ? String(req.user.Uno) : '';

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });

  const viewType = String(type || '').trim();
  if (!(viewType === 'selected' || viewType === 'available')) {
    return res.status(400).json({ success: false, message: 'Invalid view type' });
  }

  try {
    const viewName = buildViewName(viewType, uno, parsed.tpno);
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);

    if (viewType === 'selected') {
      const createViewSql = `
        CREATE VIEW ${viewName} AS
        SELECT
          cu.Cno AS Cno,
          cu.Cname AS Cname,
          cp.Cattri AS Cattri,
          cp.Cdept AS Cdept,
          cu.Ccredit AS Ccredit,
          cp.Cseme AS Cseme,
          cu.C_eattri AS Ceattri,
          cu.Cdescription AS Cdescription
        FROM TrainingProgram tp
        JOIN TP_Curricular tpc ON tpc.TPno = tp.TPno
        JOIN Curricular cu ON cu.Cno = tpc.Cno
        JOIN Cno_Pool cp ON cp.Cno = cu.Cno
        WHERE tp.TPno = '${parsed.tpno}'
      `;
      await db.execute(createViewSql);
      return res.json({ success: true, viewName });
    }

    const createViewSql = `
      CREATE VIEW ${viewName} AS
      SELECT
        cu.Cno AS Cno,
        cu.Cname AS Cname,
        cp.Cattri AS Cattri,
        cp.Cdept AS Cdept,
        cu.Ccredit AS Ccredit,
        cp.Cseme AS Cseme,
        cu.C_eattri AS Ceattri,
        cu.Cdescription AS Cdescription
      FROM Curricular cu
      JOIN Cno_Pool cp ON cp.Cno = cu.Cno
      WHERE NOT EXISTS (
        SELECT 1 FROM TP_Curricular tpc
        WHERE tpc.TPno = '${parsed.tpno}' AND tpc.Cno = cu.Cno
      )
    `;
    await db.execute(createViewSql);
    return res.json({ success: true, viewName });
  } catch (error) {
    console.error('Error creating training program view:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/trainingprogram/view/cleanup', async (req, res) => {
  const { viewName } = req.body || {};
  const uno = req.user && req.user.Uno ? String(req.user.Uno) : '';
  if (!isOwnTrainingProgramView(viewName, uno)) {
    return res.status(400).json({ success: false, message: 'Invalid view name' });
  }

  try {
    await db.execute(`DROP VIEW IF EXISTS ${viewName}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error dropping training program view:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/trainingprogram/credits/get', async (req, res) => {
  const { tpno } = req.query;

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });

  try {
    const [rows] = await db.execute(
      `SELECT TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX
       FROM TrainingProgram
       WHERE TPno = ?`,
      [parsed.tpno]
    );
    const r = rows?.[0] || {};
    return res.json({
      success: true,
      data: {
        TPcredit_GB: Number.isFinite(Number(r.TPcredit_GB)) ? Number(r.TPcredit_GB) : 0,
        TPcredit_ZB: Number.isFinite(Number(r.TPcredit_ZB)) ? Number(r.TPcredit_ZB) : 0,
        TPcredit_ZX: Number.isFinite(Number(r.TPcredit_ZX)) ? Number(r.TPcredit_ZX) : 0,
        TPcredit_TX: Number.isFinite(Number(r.TPcredit_TX)) ? Number(r.TPcredit_TX) : 0,
        TPcredit_GX: Number.isFinite(Number(r.TPcredit_GX)) ? Number(r.TPcredit_GX) : 0,
      },
    });
  } catch (error) {
    console.error('Error fetching training program credits:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/trainingprogram/status/get', async (req, res) => {
  const { tpno } = req.query;

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });

  const connection = await db.getConnection();
  let inTransaction = false;
  try {
    await ensureTrainingProgramTpStatusEnum();
    await connection.beginTransaction();
    inTransaction = true;

    const [domRows] = await connection.execute(
      `SELECT d.Dom_no, d.Dom_name, dep.Dept_name
       FROM Domain d
       JOIN Department dep ON dep.Dept_no = d.Dom_dept
       WHERE d.Dom_no = ?
       FOR UPDATE`,
      [parsed.dom]
    );
    if (domRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Domain not found' });
    }

    const tpname = `${String(domRows[0].Dept_name || '')}${String(domRows[0].Dom_name || '')}培养方案（${String(parsed.year)}年版）`;
    await connection.execute(
      `INSERT INTO TrainingProgram
        (TPno, TPdom, TPyear, TPname, TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX, TPstatus)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, '调整中')
       ON DUPLICATE KEY UPDATE TPname = VALUES(TPname)`,
      [parsed.tpno, parsed.dom, parsed.year, tpname]
    );

    const [tpRows] = await connection.execute(`SELECT TPstatus FROM TrainingProgram WHERE TPno = ? FOR UPDATE`, [parsed.tpno]);
    await connection.commit();
    return res.json({ success: true, data: { TPstatus: tpRows?.[0]?.TPstatus || '调整中' } });
  } catch (error) {
    if (inTransaction) {
      try {
        await connection.rollback();
      } catch {}
    }
    console.error('Error fetching training program status:', error);
    if (error?.code === 'WARN_DATA_TRUNCATED') {
      return res.status(500).json({
        success: false,
        message:
          "TPstatus 字段枚举未包含“调整中”，请执行：ALTER TABLE TrainingProgram MODIFY TPstatus ENUM('可使用','调整中','已停用') NOT NULL DEFAULT '调整中';",
      });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

router.post('/trainingprogram/status/submit', async (req, res) => {
  const { tpno } = req.body || {};

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });

  const connection = await db.getConnection();
  let inTransaction = false;
  try {
    await ensureTrainingProgramTpStatusEnum();
    await connection.beginTransaction();
    inTransaction = true;

    const [domRows] = await connection.execute(
      `SELECT d.Dom_no, d.Dom_name, dep.Dept_name
       FROM Domain d
       JOIN Department dep ON dep.Dept_no = d.Dom_dept
       WHERE d.Dom_no = ?
       FOR UPDATE`,
      [parsed.dom]
    );
    if (domRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Domain not found' });
    }

    const tpname = `${String(domRows[0].Dept_name || '')}${String(domRows[0].Dom_name || '')}培养方案（${String(parsed.year)}年版）`;
    await connection.execute(
      `INSERT INTO TrainingProgram
        (TPno, TPdom, TPyear, TPname, TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX, TPstatus)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, '调整中')
       ON DUPLICATE KEY UPDATE TPname = VALUES(TPname)`,
      [parsed.tpno, parsed.dom, parsed.year, tpname]
    );

    const [tpRows] = await connection.execute(`SELECT TPstatus FROM TrainingProgram WHERE TPno = ? FOR UPDATE`, [parsed.tpno]);
    const current = tpRows?.[0]?.TPstatus;
    if (current !== '调整中') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid status transition' });
    }

    await connection.execute(`UPDATE TrainingProgram SET TPstatus = '可使用' WHERE TPno = ?`, [parsed.tpno]);
    await connection.execute(`UPDATE TrainingProgram SET TPstatus = '已停用' WHERE TPdom = ? AND TPno <> ?`, [
      parsed.dom,
      parsed.tpno,
    ]);

    await connection.commit();
    return res.json({ success: true });
  } catch (error) {
    if (inTransaction) {
      try {
        await connection.rollback();
      } catch {}
    }
    console.error('Error submitting training program:', error);
    if (error?.code === 'WARN_DATA_TRUNCATED') {
      return res.status(500).json({
        success: false,
        message:
          "TPstatus 字段枚举未包含“调整中”，请执行：ALTER TABLE TrainingProgram MODIFY TPstatus ENUM('可使用','调整中','已停用') NOT NULL DEFAULT '调整中';",
      });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

router.post('/trainingprogram/credits/update', async (req, res) => {
  const { tpno, TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX } = req.body || {};

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });

  const candidates = { TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX };
  const updates = {};
  for (const [k, v] of Object.entries(candidates)) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 255) {
      return res.status(400).json({ success: false, message: `Invalid ${k}` });
    }
    updates[k] = n;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

  const connection = await db.getConnection();
  let inTransaction = false;
  try {
    await ensureTrainingProgramTpStatusEnum();
    await connection.beginTransaction();
    inTransaction = true;

    const [domRows] = await connection.execute(
      `SELECT d.Dom_no, d.Dom_name, dep.Dept_name
       FROM Domain d
       JOIN Department dep ON dep.Dept_no = d.Dom_dept
       WHERE d.Dom_no = ?
       FOR UPDATE`,
      [parsed.dom]
    );
    if (domRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Domain not found' });
    }

    const tpname = `${String(domRows[0].Dept_name || '')}${String(domRows[0].Dom_name || '')}培养方案（${String(parsed.year)}年版）`;

    await connection.execute(
      `INSERT INTO TrainingProgram
        (TPno, TPdom, TPyear, TPname, TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX, TPstatus)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, '调整中')
       ON DUPLICATE KEY UPDATE TPname = VALUES(TPname)`,
      [parsed.tpno, parsed.dom, parsed.year, tpname]
    );

    const [tpRows] = await connection.execute(`SELECT TPstatus FROM TrainingProgram WHERE TPno = ? FOR UPDATE`, [parsed.tpno]);
    if (tpRows?.[0]?.TPstatus === '可使用') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Training program is locked' });
    }

    const setParts = [];
    const params = [];
    for (const [k, v] of Object.entries(updates)) {
      setParts.push(`${k} = ?`);
      params.push(v);
    }
    params.push(parsed.tpno);

    await connection.execute(`UPDATE TrainingProgram SET ${setParts.join(', ')} WHERE TPno = ?`, params);

    const [rows] = await connection.execute(
      `SELECT TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX
       FROM TrainingProgram
       WHERE TPno = ?`,
      [parsed.tpno]
    );

    await connection.commit();
    const r = rows?.[0] || {};
    return res.json({
      success: true,
      data: {
        TPcredit_GB: Number.isFinite(Number(r.TPcredit_GB)) ? Number(r.TPcredit_GB) : 0,
        TPcredit_ZB: Number.isFinite(Number(r.TPcredit_ZB)) ? Number(r.TPcredit_ZB) : 0,
        TPcredit_ZX: Number.isFinite(Number(r.TPcredit_ZX)) ? Number(r.TPcredit_ZX) : 0,
        TPcredit_TX: Number.isFinite(Number(r.TPcredit_TX)) ? Number(r.TPcredit_TX) : 0,
        TPcredit_GX: Number.isFinite(Number(r.TPcredit_GX)) ? Number(r.TPcredit_GX) : 0,
      },
    });
  } catch (error) {
    if (inTransaction) {
      try {
        await connection.rollback();
      } catch {}
    }
    console.error('Error updating training program credits:', error);
    if (error?.code === 'WARN_DATA_TRUNCATED') {
      return res.status(500).json({
        success: false,
        message:
          "TPstatus 字段枚举未包含“调整中”，请执行：ALTER TABLE TrainingProgram MODIFY TPstatus ENUM('可使用','调整中','已停用') NOT NULL DEFAULT '调整中';",
      });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

router.get('/trainingprogram/courses/selected', async (req, res) => {
  const { tpno, page = 1, limit = 20, orderBy, orderDir, ...rest } = req.query;

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  try {
    const search = buildSearchWhere(
      { ...rest },
      {
        Cname: 'cu.Cname',
        Cattri: 'cp.Cattri',
        Cdept: 'cp.Cdept',
        Ccredit: 'cu.Ccredit',
        Cseme: 'cp.Cseme',
      }
    );

    const whereParts = ['tpc.TPno = ?'].concat(search.whereParts);
    const params = [parsed.tpno, ...search.params];
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const orderMap = {
      Cname: 'cu.Cname',
      Cattri: 'cp.Cattri',
      Cdept: 'cp.Cdept',
      Ccredit: 'cu.Ccredit',
      Cseme: 'cp.Cseme',
    };
    const orderKey = typeof orderBy === 'string' ? orderBy : '';
    const orderExpr = orderMap[orderKey] || 'cu.Cname';
    const dir = String(orderDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const orderSql = `ORDER BY ${orderExpr} ${dir}`;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM TP_Curricular tpc
      JOIN Curricular cu ON cu.Cno = tpc.Cno
      JOIN Cno_Pool cp ON cp.Cno = cu.Cno
      ${whereSql}
    `;
    const [countRows] = await db.execute(countSql, params);
    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.ceil(total / limitNum) || 1;

    const dataSql = `
      SELECT
        cu.Cno AS Cno,
        cu.Cname AS Cname,
        cp.Cattri AS Cattri,
        cp.Cdept AS Cdept,
        cu.Ccredit AS Ccredit,
        cp.Cseme AS Cseme,
        cu.C_eattri AS Ceattri,
        cu.Cdescription AS Cdescription
      FROM TP_Curricular tpc
      JOIN Curricular cu ON cu.Cno = tpc.Cno
      JOIN Cno_Pool cp ON cp.Cno = cu.Cno
      ${whereSql}
      ${orderSql}
      LIMIT ${limitNum} OFFSET ${offset}
    `;
    const [rows] = await db.execute(dataSql, params);

    return res.json({
      success: true,
      data: rows || [],
      pagination: { total, page: pageNum, totalPages, limit: limitNum },
    });
  } catch (error) {
    console.error('Error fetching selected training program courses:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/trainingprogram/courses/available', async (req, res) => {
  const { tpno, page = 1, limit = 20, orderBy, orderDir, ...rest } = req.query;

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  try {
    const dept = req.authz && req.authz.dept ? String(req.authz.dept) : '';

    const search = buildSearchWhere(
      { ...rest },
      {
        Cname: 'cu.Cname',
        Cattri: 'cp.Cattri',
        Cdept: 'cp.Cdept',
        Ccredit: 'cu.Ccredit',
        Cseme: 'cp.Cseme',
      }
    );

    const whereParts = [`cp.Cdept = ?`, `cu.Cstatus = '正常'`, ...search.whereParts];
    const params = [dept, ...search.params];
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const orderMap = {
      Cname: 'cu.Cname',
      Cattri: 'cp.Cattri',
      Cdept: 'cp.Cdept',
      Ccredit: 'cu.Ccredit',
      Cseme: 'cp.Cseme',
    };
    const orderKey = typeof orderBy === 'string' ? orderBy : '';
    const orderExpr = orderMap[orderKey] || 'cu.Cname';
    const dir = String(orderDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const orderSql = `ORDER BY ${orderExpr} ${dir}`;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM Curricular cu
      JOIN Cno_Pool cp ON cp.Cno = cu.Cno
      ${whereSql}
        AND NOT EXISTS (
          SELECT 1 FROM TP_Curricular tpc
          WHERE tpc.TPno = ? AND tpc.Cno = cu.Cno
        )
    `;
    const [countRows] = await db.execute(countSql, [...params, parsed.tpno]);
    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.ceil(total / limitNum) || 1;

    const dataSql = `
      SELECT
        cu.Cno AS Cno,
        cu.Cname AS Cname,
        cp.Cattri AS Cattri,
        cp.Cdept AS Cdept,
        cu.Ccredit AS Ccredit,
        cp.Cseme AS Cseme,
        cu.C_eattri AS Ceattri,
        cu.Cdescription AS Cdescription
      FROM Curricular cu
      JOIN Cno_Pool cp ON cp.Cno = cu.Cno
      ${whereSql}
        AND NOT EXISTS (
          SELECT 1 FROM TP_Curricular tpc
          WHERE tpc.TPno = ? AND tpc.Cno = cu.Cno
        )
      ${orderSql}
      LIMIT ${limitNum} OFFSET ${offset}
    `;
    const [rows] = await db.execute(dataSql, [...params, parsed.tpno]);

    return res.json({
      success: true,
      data: rows || [],
      pagination: { total, page: pageNum, totalPages, limit: limitNum },
    });
  } catch (error) {
    console.error('Error fetching available curricular list for training program:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/trainingprogram/tp-curricular/add', async (req, res) => {
  const { tpno, cno } = req.body || {};

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });
  if (typeof cno !== 'string' || !/^C[A-Z]{2}[A-Z]{2}[0-9A-F]{2}[0-9A-F]{3}$/.test(cno.trim())) {
    return res.status(400).json({ success: false, message: 'Invalid Cno' });
  }
  const dept = req.authz && req.authz.dept ? String(req.authz.dept) : '';

  const connection = await db.getConnection();
  let inTransaction = false;
  try {
    await ensureTrainingProgramTpStatusEnum();
    await connection.beginTransaction();
    inTransaction = true;

    const [domRows] = await connection.execute(
      `SELECT d.Dom_no, d.Dom_name, dep.Dept_name
       FROM Domain d
       JOIN Department dep ON dep.Dept_no = d.Dom_dept
       WHERE d.Dom_no = ? AND d.Dom_dept = ?
       FOR UPDATE`,
      [parsed.dom, dept]
    );
    if (domRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized domain' });
    }

    const [cRows] = await connection.execute(`SELECT Cno FROM Curricular WHERE Cno = ? AND Cstatus = '正常' FOR UPDATE`, [
      cno.trim(),
    ]);
    if (cRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Curricular not found' });
    }

    const tpname = `${String(domRows[0].Dept_name || '')}${String(domRows[0].Dom_name || '')}培养方案（${String(parsed.year)}年版）`;

    await connection.execute(
      `INSERT INTO TrainingProgram
        (TPno, TPdom, TPyear, TPname, TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX, TPstatus)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, '调整中')
       ON DUPLICATE KEY UPDATE TPname = VALUES(TPname)`,
      [parsed.tpno, parsed.dom, parsed.year, tpname]
    );

    const [tpRows] = await connection.execute(`SELECT TPstatus FROM TrainingProgram WHERE TPno = ? FOR UPDATE`, [parsed.tpno]);
    if (tpRows?.[0]?.TPstatus === '可使用') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Training program is locked' });
    }

    await connection.execute(`INSERT IGNORE INTO TP_Curricular (TPno, Cno) VALUES (?, ?)`, [parsed.tpno, cno.trim()]);

    await connection.commit();
    return res.json({ success: true });
  } catch (error) {
    if (inTransaction) {
      try {
        await connection.rollback();
      } catch {}
    }
    console.error('Error adding curricular to training program:', error);
    if (error?.code === 'WARN_DATA_TRUNCATED') {
      return res.status(500).json({
        success: false,
        message:
          "TPstatus 字段枚举未包含“调整中”，请执行：ALTER TABLE TrainingProgram MODIFY TPstatus ENUM('可使用','调整中','已停用') NOT NULL DEFAULT '调整中';",
      });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

router.post('/trainingprogram/tp-curricular/import', async (req, res) => {
  const { fromTpno, toTpno } = req.body || {};

  const fromParsed = parseTpno(fromTpno);
  if (!fromParsed) return res.status(400).json({ success: false, message: 'Invalid fromTpno' });
  const toParsed = parseTpno(toTpno);
  if (!toParsed) return res.status(400).json({ success: false, message: 'Invalid toTpno' });
  if (fromParsed.tpno === toParsed.tpno) return res.status(400).json({ success: false, message: 'Same TPno' });
  if (fromParsed.dom !== toParsed.dom) return res.status(400).json({ success: false, message: 'Domain mismatch' });
  const dept = req.authz && req.authz.dept ? String(req.authz.dept) : '';

  const connection = await db.getConnection();
  let inTransaction = false;
  try {
    await ensureTrainingProgramTpStatusEnum();
    await connection.beginTransaction();
    inTransaction = true;

    const [domRows] = await connection.execute(
      `SELECT d.Dom_no, d.Dom_name, dep.Dept_name
       FROM Domain d
       JOIN Department dep ON dep.Dept_no = d.Dom_dept
       WHERE d.Dom_no = ? AND d.Dom_dept = ?
       FOR UPDATE`,
      [toParsed.dom, dept]
    );
    if (domRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized domain' });
    }

    const tpname = `${String(domRows[0].Dept_name || '')}${String(domRows[0].Dom_name || '')}培养方案（${String(toParsed.year)}年版）`;

    await connection.execute(
      `INSERT INTO TrainingProgram
        (TPno, TPdom, TPyear, TPname, TPcredit_GB, TPcredit_ZB, TPcredit_ZX, TPcredit_TX, TPcredit_GX, TPstatus)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, '调整中')
       ON DUPLICATE KEY UPDATE TPname = VALUES(TPname)`,
      [toParsed.tpno, toParsed.dom, toParsed.year, tpname]
    );

    const [tpRows] = await connection.execute(`SELECT TPstatus FROM TrainingProgram WHERE TPno = ? FOR UPDATE`, [toParsed.tpno]);
    if (tpRows?.[0]?.TPstatus === '可使用') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Training program is locked' });
    }

    const [result] = await connection.execute(
      `INSERT IGNORE INTO TP_Curricular (TPno, Cno)
       SELECT ?, tpc.Cno
       FROM TP_Curricular tpc
       WHERE tpc.TPno = ?`,
      [toParsed.tpno, fromParsed.tpno]
    );

    await connection.commit();
    return res.json({
      success: true,
      inserted: Number(result?.affectedRows || 0),
    });
  } catch (error) {
    if (inTransaction) {
      try {
        await connection.rollback();
      } catch {}
    }
    console.error('Error importing training program curricular:', error);
    if (error?.code === 'WARN_DATA_TRUNCATED') {
      return res.status(500).json({
        success: false,
        message:
          "TPstatus 字段枚举未包含“调整中”，请执行：ALTER TABLE TrainingProgram MODIFY TPstatus ENUM('可使用','调整中','已停用') NOT NULL DEFAULT '调整中';",
      });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

router.post('/trainingprogram/tp-curricular/remove', async (req, res) => {
  const { tpno, cno } = req.body || {};

  const parsed = parseTpno(tpno);
  if (!parsed) return res.status(400).json({ success: false, message: 'Invalid TPno' });
  if (typeof cno !== 'string' || !/^C[A-Z]{2}[A-Z]{2}[0-9A-F]{2}[0-9A-F]{3}$/.test(cno.trim())) {
    return res.status(400).json({ success: false, message: 'Invalid Cno' });
  }
  const dept = req.authz && req.authz.dept ? String(req.authz.dept) : '';

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [domRows] = await connection.execute('SELECT Dom_no FROM Domain WHERE Dom_no = ? AND Dom_dept = ? FOR UPDATE', [
      parsed.dom,
      dept,
    ]);
    if (domRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized domain' });
    }

    const [tpRows] = await connection.execute(`SELECT TPstatus FROM TrainingProgram WHERE TPno = ? FOR UPDATE`, [parsed.tpno]);
    if (tpRows?.[0]?.TPstatus === '可使用') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Training program is locked' });
    }

    await connection.execute(`DELETE FROM TP_Curricular WHERE TPno = ? AND Cno = ?`, [parsed.tpno, cno.trim()]);

    await connection.commit();
    return res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error removing curricular from training program:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
