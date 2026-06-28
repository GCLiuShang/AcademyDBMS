const { Parser } = require('node-sql-parser');

const parser = new Parser();

const ALLOWED_TYPES = new Set([
  'select', 'insert', 'update', 'delete',
  'create', 'drop', 'show', 'use',
]);

const FORBIDDEN_OPERATIONS = [
  { keyword: 'TRUNCATE',  message: 'TRUNCATE 操作已被系统禁用。如需清空表数据，请使用 DELETE FROM 语句。' },
  { keyword: 'ALTER',     message: 'ALTER 操作（修改表结构）不在当前支持的命令范围内。' },
  { keyword: 'GRANT',     message: 'GRANT 权限操作不在当前支持的命令范围内。' },
  { keyword: 'REVOKE',    message: 'REVOKE 权限操作不在当前支持的命令范围内。' },
  { keyword: 'CREATE USER', message: 'CREATE USER 用户管理操作不在当前支持的命令范围内。' },
  { keyword: 'DROP USER',   message: 'DROP USER 用户管理操作不在当前支持的命令范围内。' },
];

function validateSQL(sqlText) {
  const trimmed = (sqlText || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      type: null,
      tables: [],
      error: 'SQL 语句不能为空。请输入一条完整的 SQL 命令。',
    };
  }

  const upperSQL = trimmed.toUpperCase().replace(/\s+/g, ' ');
  for (const forbidden of FORBIDDEN_OPERATIONS) {
    const pattern = new RegExp('\\b' + forbidden.keyword.replace(/\s+/g, '\\s+') + '\\b', 'i');
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        type: null,
        tables: [],
        error: forbidden.message,
      };
    }
  }

  let ast;
  try {
    ast = parser.astify(trimmed, { database: 'MySQL' });
  } catch (parseErr) {
    return {
      valid: false,
      type: null,
      tables: [],
      error: `SQL 语法错误：${parseErr.message}。请检查您的语句是否有拼写或格式问题。`,
    };
  }

  const astArray = Array.isArray(ast) ? ast : [ast];

  if (astArray.length > 1) {
    return {
      valid: false,
      type: null,
      tables: [],
      error: '一次只能执行一条 SQL 语句。请将每条语句分开执行。',
    };
  }

  const statement = astArray[0];
  const type = (statement.type || '').toLowerCase();

  if (!ALLOWED_TYPES.has(type)) {
    return {
      valid: false,
      type: null,
      tables: [],
      error: `不支持 "${type}" 类型的 SQL 命令。当前支持的命令类型：SELECT、INSERT、UPDATE、DELETE、CREATE DATABASE、CREATE TABLE、DROP DATABASE、DROP TABLE、SHOW DATABASES、SHOW TABLES。`,
    };
  }

  const tables = extractTableNames(statement);

  return {
    valid: true,
    type: type,
    tables: tables,
    error: null,
  };
}

function extractTableNames(ast) {
  const tables = new Set();

  if (ast.from && Array.isArray(ast.from)) {
    for (const item of ast.from) {
      if (item.table) {
        tables.add(item.table);
      }
      if (item.derived && item.derived.from) {
        for (const subItem of item.derived.from) {
          if (subItem.table) tables.add(subItem.table);
        }
      }
    }
  }

  if (ast.table) {
    if (Array.isArray(ast.table)) {
      for (const t of ast.table) {
        if (typeof t === 'string') tables.add(t);
        else if (t && t.table) tables.add(t.table);
      }
    } else if (typeof ast.table === 'string') {
      tables.add(ast.table);
    } else if (ast.table.table) {
      tables.add(ast.table.table);
    }
  }

  return [...tables];
}

function isValidIdentifier(name) {
  return /^[a-zA-Z_一-龥][a-zA-Z0-9_一-龥]*$/.test(name);
}

module.exports = {
  validateSQL,
  isValidIdentifier,
  ALLOWED_TYPES,
};