const db = require('../db');

async function getUserRoleByUno(uno) {
  const [rows] = await db.execute('SELECT Uno, Urole FROM User WHERE Uno = ?', [uno]);
  return rows.length > 0 ? rows[0] : null;
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

module.exports = {
  getUserRoleByUno,
  getUserProfileByRole,
};

