const bcrypt = require('bcrypt');

function getBcryptRounds() {
  const raw = process.env.BCRYPT_ROUNDS;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= 10 && parsed <= 15) return parsed;
  return 12;
}

async function hashPassword(plainPassword) {
  const s = typeof plainPassword === 'string' ? plainPassword : '';
  if (!s) throw new Error('Password is required');
  return bcrypt.hash(s, getBcryptRounds());
}

async function verifyPassword(plainPassword, passwordHash) {
  const pwd = typeof plainPassword === 'string' ? plainPassword : '';
  const hash = typeof passwordHash === 'string' ? passwordHash : '';
  if (!pwd || !hash) return false;
  return bcrypt.compare(pwd, hash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};

