const db = require('../db');

async function getUserRoleByUno(uno) {
  const [rows] = await db.execute('SELECT Uno, Urole FROM User WHERE Uno = ?', [uno]);
  return rows.length > 0 ? rows[0] : null;
}

async function getUserProfileByRole(uno, role) {
  const tables = {
    '学生': { table: 'Student', idCol: 'Sno', cols: 'Sno, Syear, Sname, Ssex, Sclass, Sstatus' },
    '教授': { table: 'Professor', idCol: 'Pno', cols: 'Pno, Pyear, Pname, Psex, Ptitle, Pdept, Poffice, Pstatus' },
    '学院教学办管理员': { table: 'Dept_Adm', idCol: 'DAno', cols: 'DAno, DAyear, DAdept, DAname, DAstatus' },
    '学校教务处管理员': { table: 'Univ_Adm', idCol: 'UAno', cols: 'UAno, UAyear, UAname, UAstatus' },
  };

  const info = tables[role];
  if (!info) return { Uno: uno };

  const [rows] = await db.execute(`SELECT ${info.cols} FROM ${info.table} WHERE ${info.idCol} = ?`, [uno]);
  return rows[0] || null;
}

function authorize(allowedRoles, options = {}) {
  const roles = Array.isArray(allowedRoles)
    ? allowedRoles.filter(Boolean)
    : allowedRoles
      ? [allowedRoles]
      : [];

  const deptSourceRaw = options && options.dept ? String(options.dept) : '';
  const deptSource =
    deptSourceRaw === 'deptAdmin' || deptSourceRaw === 'professor' || deptSourceRaw === 'auto' ? deptSourceRaw : '';
  const attachKey = options && typeof options.attachKey === 'string' && options.attachKey.trim()
    ? options.attachKey.trim()
    : 'authz';

  return async (req, res, next) => {
    try {
      const uno = req && req.user && req.user.Uno ? String(req.user.Uno) : '';
      const role = req && req.user && req.user.Urole ? String(req.user.Urole) : '';
      if (!uno) {
        return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Unauthenticated' });
      }

      if (roles.length > 0 && !roles.includes(role)) {
        return res.status(403).json({ success: false, message: 'Unauthorized role' });
      }

      let dept = null;
      if (deptSource === 'auto') {
        if (role === '学院教学办管理员') {
          const [rows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
          if (rows.length === 0) return res.status(404).json({ success: false, message: 'Dept admin not found' });
          dept = rows[0].DAdept || null;
          if (!dept) return res.status(400).json({ success: false, message: 'Dept not found' });
        } else if (role === '教授') {
          const [rows] = await db.execute('SELECT Pdept FROM Professor WHERE Pno = ?', [uno]);
          if (rows.length === 0) return res.status(404).json({ success: false, message: 'Professor not found' });
          dept = rows[0].Pdept || null;
          if (!dept) return res.status(400).json({ success: false, message: 'Professor department not found' });
        }
      } else if (deptSource === 'deptAdmin') {
        const [rows] = await db.execute('SELECT DAdept FROM Dept_Adm WHERE DAno = ?', [uno]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Dept admin not found' });
        dept = rows[0].DAdept || null;
        if (!dept) return res.status(400).json({ success: false, message: 'Dept not found' });
      } else if (deptSource === 'professor') {
        const [rows] = await db.execute('SELECT Pdept FROM Professor WHERE Pno = ?', [uno]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Professor not found' });
        dept = rows[0].Pdept || null;
        if (!dept) return res.status(400).json({ success: false, message: 'Professor department not found' });
      }

      const payload = { uno, role, dept };
      const current = req[attachKey];
      req[attachKey] = current && typeof current === 'object' ? { ...current, ...payload } : payload;

      return next();
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      const message = err && err.message ? err.message : 'Internal server error';
      if (status >= 500) console.error('authorize error:', err);
      return res.status(status).json({ success: false, message });
    }
  };
}

function authorizeTrainingProgramDomain(options = {}) {
  const attachKey = options && typeof options.attachKey === 'string' && options.attachKey.trim()
    ? options.attachKey.trim()
    : 'authz';

  const keys = Array.isArray(options.keys) && options.keys.length > 0
    ? options.keys.filter(Boolean).map(String)
    : ['tpno', 'fromTpno', 'toTpno'];

  const parseDomainFromTpno = (tpno) => {
    if (tpno === null || tpno === undefined) return null;
    const s = String(tpno).trim();
    if (!s) return null;
    const m = s.match(/^TP([A-Z]{2}[0-9A-F]{2})-([0-9]{4})$/);
    if (!m) return { error: 'Invalid TPno' };
    return { dom: m[1] };
  };

  const pickValue = (req, key) => {
    if (req?.body && Object.prototype.hasOwnProperty.call(req.body, key)) return req.body[key];
    if (req?.query && Object.prototype.hasOwnProperty.call(req.query, key)) return req.query[key];
    return undefined;
  };

  return async (req, res, next) => {
    try {
      const dept = req?.[attachKey]?.dept ? String(req[attachKey].dept) : '';
      if (!dept) {
        return res.status(400).json({ success: false, message: 'Dept not found' });
      }

      const domSet = new Set();
      for (const key of keys) {
        const raw = pickValue(req, key);
        if (raw === undefined) continue;
        const parsed = parseDomainFromTpno(raw);
        if (!parsed) continue;
        if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
        domSet.add(parsed.dom);
      }

      if (domSet.size === 0) return next();

      for (const dom of domSet) {
        const [rows] = await db.execute(
          'SELECT Dom_no FROM Domain WHERE Dom_no = ? AND Dom_dept = ?',
          [dom, dept]
        );
        if (rows.length === 0) {
          return res.status(403).json({ success: false, message: 'Unauthorized domain' });
        }
      }

      return next();
    } catch (err) {
      console.error('authorizeTrainingProgramDomain error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };
}

module.exports = {
  getUserRoleByUno,
  getUserProfileByRole,
  authorize,
  authorizeTrainingProgramDomain,
};