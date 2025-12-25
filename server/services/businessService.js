const db = require('../db');

async function getCurrentBusinessFlags() {
  const [semeRows] = await db.execute('SELECT Seme_no FROM Semester ORDER BY Seme_no DESC LIMIT 1');
  if (semeRows.length === 0) {
    return null;
  }
  const semeNo = semeRows[0].Seme_no;
  const [rows] = await db.execute(
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
    `,
    [semeNo]
  );
  if (rows.length === 0) {
    return null;
  }
  const row = rows[0];
  return {
    semeNo: row.Semeno,
    curricularOpen: Boolean(row.CurricularOpen),
    courseOpen: Boolean(row.CourseOpen),
    enrollOpen: Boolean(row.EnrollOpen),
  };
}

module.exports = {
  getCurrentBusinessFlags,
};

