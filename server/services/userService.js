const db = require('../db');

function makeHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function requireValidUno(uno) {
  if (!uno) throw makeHttpError(400, 'Uno is required');
  const normalized = String(uno).trim();
  if (!/^[a-zA-Z0-9]+$/.test(normalized)) throw makeHttpError(400, 'Invalid Uno format');
  return normalized;
}

async function getUserRoleByUno(uno) {
  const [rows] = await db.execute('SELECT Uno, Urole FROM User WHERE Uno = ?', [uno]);
  return rows.length > 0 ? rows[0] : null;
}

async function requireRole(executor, uno, allowedRoles, options = {}) {
  const { forUpdate = false } = options || {};
  const normalizedUno = requireValidUno(uno);
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (roles.length === 0) throw makeHttpError(403, 'Unauthorized role');

  const sql = forUpdate
    ? 'SELECT Urole FROM User WHERE Uno = ? FOR UPDATE'
    : 'SELECT Urole FROM User WHERE Uno = ?';

  const [rows] = await executor.execute(sql, [normalizedUno]);
  if (rows.length === 0) throw makeHttpError(404, 'User not found');
  const role = rows[0].Urole;
  if (!roles.includes(role)) throw makeHttpError(403, 'Unauthorized role');
  return role;
}

async function requireDeptForDeptAdmin(executor, uno, options = {}) {
  const { forUpdate = false } = options || {};
  const normalizedUno = requireValidUno(uno);

  const sql = forUpdate
    ? 'SELECT DAdept FROM Dept_Adm WHERE DAno = ? FOR UPDATE'
    : 'SELECT DAdept FROM Dept_Adm WHERE DAno = ?';

  const [rows] = await executor.execute(sql, [normalizedUno]);
  if (rows.length === 0) throw makeHttpError(404, 'Dept admin not found');
  const dept = rows[0].DAdept;
  if (!dept) throw makeHttpError(400, 'Dept not found');
  return dept;
}

async function getUserProfileByRole(uno, role) {
  if (role === '学生') {
    const [rows] = await db.execute(
      'SELECT Sno, Syear, Sname, Ssex, Sclass, Sstatus FROM Student WHERE Sno = ?',
      [uno]
    );
    return rows[0] || null;
  }

  if (role === '教授') {
    const [rows] = await db.execute(
      'SELECT Pno, Pyear, Pname, Psex, Ptitle, Pdept, Poffice, Pstatus FROM Professor WHERE Pno = ?',
      [uno]
    );
    return rows[0] || null;
  }

  if (role === '学院教学办管理员') {
    const [rows] = await db.execute(
      'SELECT DAno, DAyear, DAdept, DAname, DAstatus FROM Dept_Adm WHERE DAno = ?',
      [uno]
    );
    return rows[0] || null;
  }

  if (role === '学校教务处管理员') {
    const [rows] = await db.execute(
      'SELECT UAno, UAyear, UAname, UAstatus FROM Univ_Adm WHERE UAno = ?',
      [uno]
    );
    return rows[0] || null;
  }

  return { Uno: uno };
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
  requireValidUno,
  getUserRoleByUno,
  requireRole,
  requireDeptForDeptAdmin,
  getUserProfileByRole,
  authorize,
  authorizeTrainingProgramDomain,
};
