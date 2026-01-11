const mysql = require('mysql2');
const fs = require('fs');
require('dotenv').config();

function readSecretFile(filePath) {
  const p = typeof filePath === 'string' ? filePath.trim() : '';
  if (!p) return '';
  try {
    const content = fs.readFileSync(p, 'utf8');
    return typeof content === 'string' ? content.trim() : '';
  } catch {
    return '';
  }
}

function getConfigValue(name) {
  const direct = process.env[name];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const fromFile = readSecretFile(process.env[`${name}_FILE`]);
  if (fromFile) return fromFile;
  return '';
}

const connection = mysql.createPool({
  host: getConfigValue('DB_HOST'),
  user: getConfigValue('DB_USER'),
  password: getConfigValue('DB_PASSWORD'),
  database: getConfigValue('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = connection.promise();
