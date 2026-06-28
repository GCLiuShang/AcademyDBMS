/** DBAdmin API 封装 — SQL 控制台前端与后端交互 */
const DBADMIN_USER_KEY = 'dbadminUser';
const DBADMIN_TOKEN_KEY = 'dbadminToken';

function getDbadminUser() {
  try { return sessionStorage.getItem(DBADMIN_USER_KEY) || ''; } catch { return ''; }
}

function getDbadminToken() {
  try { return sessionStorage.getItem(DBADMIN_TOKEN_KEY) || ''; } catch { return ''; }
}

function getDbadminHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', 'X-DBAdmin-User': getDbadminUser(), 'X-DBAdmin-Token': getDbadminToken(), ...extra };
}

export async function dbadminGrantsCheck(sid) {
  const res = await fetch('/api/dbadmin/grants/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sid }),
  });
  return res.json();
}

export async function dbadminLogin(username, password, sid) {
  const res = await fetch('/api/dbadmin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, sid }),
  });
  return res.json();
}

export async function dbadminLogout(username) {
  const user = username || getDbadminUser();
  const res = await fetch('/api/dbadmin/exit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DBAdmin-User': user },
    body: JSON.stringify({ username: user }),
  });
  return res.json();
}

export async function dbadminExecute(sql) {
  const res = await fetch('/api/dbadmin/execute', {
    method: 'POST',
    headers: getDbadminHeaders(),
    body: JSON.stringify({ sql }),
  });
  return res.json();
}
