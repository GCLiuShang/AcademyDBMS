async function getNextSequenceNumber(connection, tableName, numberColumn, conditions) {
  const whereClauses = [];
  const params = [];
  for (const [col, val] of Object.entries(conditions)) {
    whereClauses.push(`${col} = ?`);
    params.push(val);
  }
  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `SELECT MAX(${numberColumn}) as maxNum FROM ${tableName} ${whereSql} FOR UPDATE`;
  const [rows] = await connection.execute(query, params);
  const maxNum = rows[0].maxNum;
  return maxNum === null ? 0 : Number(maxNum) + 1;
}

module.exports = {
  getNextSequenceNumber,
};

