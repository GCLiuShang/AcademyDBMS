const mysql = require('mysql2');
const fs = require('fs');
require('dotenv').config();

function readSecretFile(filePath) {
  const p = typeof filePath === 'string' ? filePath.trim() : '';
  if (!p) return '';
  try {
    return fs.readFileSync(p, 'utf8').trim();
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
  host: getConfigValue('MYSQL_HOST') || getConfigValue('DB_HOST') || 'localhost',
  user: getConfigValue('MYSQL_USER') || getConfigValue('DB_USER') || 'root',
  password: getConfigValue('MYSQL_PASSWORD') || getConfigValue('DB_PASSWORD') || '',
  database: getConfigValue('MYSQL_DATABASE') || getConfigValue('DB_NAME') || 'academy_database',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4'
});

module.exports = connection.promise();