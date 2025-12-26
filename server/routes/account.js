const express = require('express');
const db = require('../db');
const { getNextSequenceNumber } = require('../services/sequenceService');
const { getUserRoleByUno, getUserProfileByRole } = require('../services/userService');

const router = express.Router();

router.get('/users/search', async (req, res) => {
  const { uno, name, limit = 50 } = req.query;
  const limitNum = Math.min(parseInt(limit) || 50, 200);

  if (!uno && !name) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  try {
    const baseSql = `
      SELECT
        U.Uno,
        U.Urole,
        COALESCE(S.Sname, P.Pname, DA.DAname, UA.UAname, O.Oname) as Name
      FROM User U
      LEFT JOIN Student S ON U.Uno = S.Sno
      LEFT JOIN Professor P ON U.Uno = P.Pno
      LEFT JOIN Dept_Adm DA ON U.Uno = DA.DAno
      LEFT JOIN Univ_Adm UA ON U.Uno = UA.UAno
      LEFT JOIN Other O ON U.Uno = O.Ono
    `;

    if (uno) {
      const sql = `${baseSql} WHERE U.Uno LIKE ? AND U.Uno <> 'O000000000' LIMIT ${limitNum}`;
      const [rows] = await db.execute(sql, [`%${uno}%`]);
      return res.json({ success: true, data: rows });
    }

    const like = `%${name}%`;
    const sql = `
      ${baseSql}
      WHERE (S.Sname LIKE ? OR P.Pname LIKE ? OR DA.DAname LIKE ? OR UA.UAname LIKE ? OR O.Oname LIKE ?)
        AND U.Uno <> 'O000000000'
      LIMIT ${limitNum}
    `;
    const [rows] = await db.execute(sql, [like, like, like, like, like]);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/account/info', async (req, res) => {
  const { uno } = req.query;
  if (!uno) return res.status(400).json({ success: false, message: 'Uno is required' });

  try {
    const user = await getUserRoleByUno(uno);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const data = await getUserProfileByRole(uno, user.Urole);
    return res.json({ success: true, role: user.Urole, data });
  } catch (error) {
    console.error('Error fetching account info:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/account/update', async (req, res) => {
  const { uno, oldPassword, updates } = req.body;
  if (!uno || !oldPassword || !updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  const user = await getUserRoleByUno(uno);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  const role = user.Urole;

  const [authRows] = await db.execute(
    'SELECT Uno FROM User WHERE Uno = ? AND Upswd = SHA2(?, 256)',
    [uno, oldPassword]
  );
  if (authRows.length === 0) {
    return res
      .status(403)
      .json({ success: false, code: 'WRONG_PASSWORD', message: 'Wrong password' });
  }

  const allowed = new Set();
  if (role === '学生') {
    allowed.add('Sname');
    allowed.add('Ssex');
    allowed.add('Upswd');
  } else if (role === '教授') {
    allowed.add('Pname');
    allowed.add('Psex');
    allowed.add('Poffice');
    allowed.add('Upswd');
  } else if (role === '学院教学办管理员') {
    allowed.add('DAname');
    allowed.add('Upswd');
  } else if (role === '学校教务处管理员') {
    allowed.add('UAname');
    allowed.add('Upswd');
  } else {
    allowed.add('Upswd');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (allowed.has('Upswd') && typeof updates.Upswd === 'string' && updates.Upswd.length > 0) {
      await connection.execute('UPDATE User SET Upswd = SHA2(?, 256) WHERE Uno = ?', [
        updates.Upswd,
        uno,
      ]);
    }

    if (role === '学生') {
      if (allowed.has('Sname') && typeof updates.Sname === 'string') {
        await connection.execute('UPDATE Student SET Sname = ? WHERE Sno = ?', [
          updates.Sname,
          uno,
        ]);
      }
      if (allowed.has('Ssex') && (updates.Ssex === '男' || updates.Ssex === '女')) {
        await connection.execute('UPDATE Student SET Ssex = ? WHERE Sno = ?', [
          updates.Ssex,
          uno,
        ]);
      }
    } else if (role === '教授') {
      if (allowed.has('Pname') && typeof updates.Pname === 'string') {
        await connection.execute('UPDATE Professor SET Pname = ? WHERE Pno = ?', [
          updates.Pname,
          uno,
        ]);
      }
      if (allowed.has('Psex') && (updates.Psex === '男' || updates.Psex === '女')) {
        await connection.execute('UPDATE Professor SET Psex = ? WHERE Pno = ?', [
          updates.Psex,
          uno,
        ]);
      }
      if (allowed.has('Poffice') && typeof updates.Poffice === 'string') {
        await connection.execute('UPDATE Professor SET Poffice = ? WHERE Pno = ?', [
          updates.Poffice,
          uno,
        ]);
      }
    } else if (role === '学院教学办管理员') {
      if (allowed.has('DAname') && typeof updates.DAname === 'string') {
        await connection.execute('UPDATE Dept_Adm SET DAname = ? WHERE DAno = ?', [
          updates.DAname,
          uno,
        ]);
      }
    } else if (role === '学校教务处管理员') {
      if (allowed.has('UAname') && typeof updates.UAname === 'string') {
        await connection.execute('UPDATE Univ_Adm SET UAname = ? WHERE UAno = ?', [
          updates.UAname,
          uno,
        ]);
      }
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating account info:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

router.post('/useradd/submit', async (req, res) => {
  const {
    uno,
    userType,
    name,
    sex,
    year,
    deptNo,
    domNo,
    className,
    title,
    office,
    password,
  } = req.body;

  if (!uno || !userType || !name || !year || !password) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  if (!/^[a-zA-Z0-9]+$/.test(uno)) {
    return res.status(400).json({ success: false, message: 'Invalid operator Uno format' });
  }

  if (!/^[0-9]{4}$/.test(String(year))) {
    return res.status(400).json({ success: false, message: 'Invalid year' });
  }

  const trimmedName = String(name).trim();
  if (!trimmedName || trimmedName.length > 20) {
    return res.status(400).json({ success: false, message: 'Invalid name' });
  }

  const trimmedPassword = String(password);
  if (!trimmedPassword || trimmedPassword.length > 20) {
    return res.status(400).json({ success: false, message: 'Invalid password' });
  }

  const normalizedType = String(userType);
  let urole = null;

  if (normalizedType === 'student') {
    urole = '学生';
    if (!(sex === '男' || sex === '女')) {
      return res.status(400).json({ success: false, message: 'Invalid sex for student' });
    }
  } else if (normalizedType === 'professor') {
    urole = '教授';
    if (!(sex === '男' || sex === '女')) {
      return res.status(400).json({ success: false, message: 'Invalid sex for professor' });
    }
    if (!['教授', '副教授', '讲师', '研究员'].includes(title)) {
      return res.status(400).json({ success: false, message: 'Invalid title for professor' });
    }
  } else if (normalizedType === 'deptadm') {
    urole = '学院教学办管理员';
    if (!deptNo) {
      return res
        .status(400)
        .json({ success: false, message: 'Department is required for dept admin' });
    }
  } else if (normalizedType === 'univadm') {
    urole = '学校教务处管理员';
  } else {
    return res.status(400).json({ success: false, message: 'Invalid user type' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [operatorRows] = await connection.execute(
      'SELECT Urole FROM User WHERE Uno = ? FOR UPDATE',
      [uno]
    );
    if (operatorRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Operator not found' });
    }
    if (operatorRows[0].Urole !== '学校教务处管理员') {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Unauthorized role' });
    }

    const yearNum = Number(year);

    let newUno = null;

    if (normalizedType === 'student') {
      const [deptRows] = await connection.execute(
        "SELECT Dept_no FROM Department WHERE Dept_no = ? AND Dept_status = '正常' FOR UPDATE",
        [deptNo || null]
      );
      if (deptNo && deptRows.length === 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: 'Invalid department for student' });
      }

      let classValue = null;
      if (className) {
        const [classRows] = await connection.execute(
          'SELECT Class_name FROM Class WHERE Class_name = ? FOR UPDATE',
          [className]
        );
        if (classRows.length === 0) {
          await connection.rollback();
          return res
            .status(400)
            .json({ success: false, message: 'Invalid class for student' });
        }
        classValue = className;
      }

      const nextNum = await getNextSequenceNumber(connection, 'Student', 'Snumber', {
        Syear: yearNum,
      });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 1048575) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: 'No available student number' });
      }
      const hex = nextNum.toString(16).toUpperCase().padStart(5, '0');
      newUno = `S${yearNum}${hex}`;

      await connection.execute(
        'INSERT INTO User (Uno, Upswd, Urole) VALUES (?, SHA2(?, 256), ?)',
        [newUno, trimmedPassword, urole]
      );
      await connection.execute(
        'INSERT INTO Student (Sno, Syear, Snumber, Sname, Ssex, Sclass) VALUES (?, ?, ?, ?, ?, ?)',
        [newUno, yearNum, nextNum, trimmedName, sex, classValue]
      );
    } else if (normalizedType === 'professor') {
      let deptValue = null;
      if (deptNo) {
        const [deptRows] = await connection.execute(
          "SELECT Dept_no FROM Department WHERE Dept_no = ? AND Dept_status = '正常' FOR UPDATE",
          [deptNo]
        );
        if (deptRows.length === 0) {
          await connection.rollback();
          return res
            .status(400)
            .json({ success: false, message: 'Invalid department for professor' });
        }
        deptValue = deptNo;
      }

      const nextNum = await getNextSequenceNumber(connection, 'Professor', 'Pnumber', {
        Pyear: yearNum,
      });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 1048575) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: 'No available professor number' });
      }
      const hex = nextNum.toString(16).toUpperCase().padStart(5, '0');
      newUno = `P${yearNum}${hex}`;

      const officeValue =
        office && typeof office === 'string' && office.trim().length > 0
          ? office.trim().slice(0, 10)
          : null;

      await connection.execute(
        'INSERT INTO User (Uno, Upswd, Urole) VALUES (?, SHA2(?, 256), ?)',
        [newUno, trimmedPassword, urole]
      );
      await connection.execute(
        'INSERT INTO Professor (Pno, Pyear, Pnumber, Pname, Psex, Ptitle, Pdept, Poffice) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [newUno, yearNum, nextNum, trimmedName, sex, title, deptValue, officeValue]
      );
    } else if (normalizedType === 'deptadm') {
      const [deptRows] = await connection.execute(
        "SELECT Dept_no FROM Department WHERE Dept_no = ? AND Dept_status = '正常' FOR UPDATE",
        [deptNo]
      );
      if (deptRows.length === 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: 'Invalid department for dept admin' });
      }

      const nextNum = await getNextSequenceNumber(connection, 'Dept_Adm', 'DAnumber', {
        DAyear: yearNum,
      });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 65535) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: 'No available dept admin number' });
      }
      const hex = nextNum.toString(16).toUpperCase().padStart(4, '0');
      newUno = `DA${yearNum}${hex}`;

      await connection.execute(
        'INSERT INTO User (Uno, Upswd, Urole) VALUES (?, SHA2(?, 256), ?)',
        [newUno, trimmedPassword, urole]
      );
      await connection.execute(
        'INSERT INTO Dept_Adm (DAno, DAyear, DAnumber, DAdept, DAname) VALUES (?, ?, ?, ?, ?)',
        [newUno, yearNum, nextNum, deptNo, trimmedName]
      );
    } else if (normalizedType === 'univadm') {
      const nextNum = await getNextSequenceNumber(connection, 'Univ_Adm', 'UAnumber', {
        UAyear: yearNum,
      });
      if (!Number.isFinite(nextNum) || nextNum < 0 || nextNum > 65535) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: 'No available univ admin number' });
      }
      const hex = nextNum.toString(16).toUpperCase().padStart(4, '0');
      newUno = `UA${yearNum}${hex}`;

      await connection.execute(
        'INSERT INTO User (Uno, Upswd, Urole) VALUES (?, SHA2(?, 256), ?)',
        [newUno, trimmedPassword, urole]
      );
      await connection.execute(
        'INSERT INTO Univ_Adm (UAno, UAyear, UAnumber, UAname) VALUES (?, ?, ?, ?)',
        [newUno, yearNum, nextNum, trimmedName]
      );
    }

    await connection.commit();
    return res.json({ success: true, uno: newUno });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding user:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    connection.release();
  }
});

module.exports = router;

