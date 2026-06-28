const { Parser } = require('node-sql-parser');

const parser = new Parser();

const FORBIDDEN_FUNCTIONS = [
  { name: 'SLEEP',        severity: 'critical', message: 'SLEEP() 函数被禁止（可能的时间盲注）' },
  { name: 'BENCHMARK',    severity: 'critical', message: 'BENCHMARK() 函数被禁止（可能的布尔盲注）' },
  { name: 'LOAD_FILE',    severity: 'critical', message: 'LOAD_FILE() 函数被禁止（文件读取操作）' },
  { name: 'EXTRACTVALUE', severity: 'high',     message: 'ExtractValue() 函数被禁止（可能的报错注入）' },
  { name: 'UPDATEXML',    severity: 'high',     message: 'UpdateXML() 函数被禁止（可能的报错注入）' },
  { name: 'GTID_SUBSET',  severity: 'high',     message: 'GTID_SUBSET() 函数被禁止' },
  { name: 'GTID_SUBTRACT',severity: 'high',     message: 'GTID_SUBTRACT() 函数被禁止' },
  { name: 'NAME_CONST',   severity: 'medium',   message: 'NAME_CONST() 函数被禁止' },
];

const HIGH_RISK_PATTERNS = [
  {
    pattern: /\bINTO\s+(OUTFILE|DUMPFILE)\b/i,
    severity: 'critical',
    code: 'FILE_WRITE',
    message: '禁止写入服务器文件系统（INTO OUTFILE/DUMPFILE）',
  },
  {
    pattern: /\bLOAD\s+DATA\s+(LOCAL\s+)?INFILE\b/i,
    severity: 'critical',
    code: 'FILE_READ',
    message: '禁止从服务器文件系统读取数据',
  },
  {
    pattern: /\bLOAD_FILE\s*\(/i,
    severity: 'critical',
    code: 'LOAD_FILE',
    message: 'LOAD_FILE() 函数被禁止（文件读取操作）',
  },
  {
    pattern: /\bEXTRACTVALUE\s*\(/i,
    severity: 'high',
    code: 'EXTRACTVALUE',
    message: 'ExtractValue() 函数被禁止（可能的报错注入）',
  },
  {
    pattern: /\bUPDATEXML\s*\(/i,
    severity: 'high',
    code: 'UPDATEXML',
    message: 'UpdateXML() 函数被禁止（可能的报错注入）',
  },
  {
    pattern: /\bGTID_SUBSET\s*\(/i,
    severity: 'high',
    code: 'GTID_SUBSET',
    message: 'GTID_SUBSET() 函数被禁止',
  },
  {
    pattern: /\bGTID_SUBTRACT\s*\(/i,
    severity: 'high',
    code: 'GTID_SUBTRACT',
    message: 'GTID_SUBTRACT() 函数被禁止',
  },
  {
    pattern: /\bNAME_CONST\s*\(/i,
    severity: 'medium',
    code: 'NAME_CONST',
    message: 'NAME_CONST() 函数被禁止',
  },
  {
    pattern: /(?:DROP|ALTER|TRUNCATE|DELETE|UPDATE)\s+.*\bINFORMATION_SCHEMA\b/i,
    severity: 'critical',
    code: 'SYSTEM_TABLE_MODIFY',
    message: '禁止修改系统表（INFORMATION_SCHEMA）',
  },
  {
    pattern: /(?:DROP|ALTER|TRUNCATE)\s+(?:DATABASE|TABLE)\s+.*\bmysql\b/i,
    severity: 'critical',
    code: 'SYSTEM_DB_MODIFY',
    message: '禁止修改 MySQL 系统数据库',
  },
];

const MEDIUM_RISK_PATTERNS = [
  {
    test: (sql) => {
      const lines = sql.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const idx = line.indexOf('--');
        if (idx === -1) continue;
        const after = line.substring(idx + 2);
        if (after.trim().length > 0) {
          return true;
        }
      }
      return false;
    },
    severity: 'high',
    code: 'COMMENT_TRUNCATION',
    message: 'SQL 中包含注释符 -- 后跟内容，可能导致语句被截断执行',
  },
  {
    test: (sql) => /#/.test(sql),
    severity: 'high',
    code: 'HASH_COMMENT',
    message: 'SQL 中包含 # 注释符，可能导致语句被截断执行',
  },
  {
    test: (sql) => {
      const match = sql.match(/\bWHERE\s+.+/i);
      if (!match) return false;
      const whereClause = match[0];
      return /\bOR\s+['"]?\d+['"]?\s*[=<>!]+\s*['"]?\d+['"]?(?:\s|$)/i.test(whereClause)
        || /\bOR\s+['"][^'"]+['"]\s*=\s*['"][^'"]*['"]?(?:\s|$)/i.test(whereClause);
    },
    severity: 'high',
    code: 'ALWAYS_TRUE_CONDITION',
    message: 'WHERE 子句中包含明显的恒真条件（如 OR 1=1），疑似注入尝试',
  },
  {
    test: (sql) => {
      return /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|EXEC|EXECUTE)\b/i.test(sql);
    },
    severity: 'critical',
    code: 'STACKED_QUERY',
    message: '检测到多条 SQL 语句（堆叠查询），一次只能执行一条语句',
  },
  {
    test: (sql) => /\bSLEEP\s*\(/i.test(sql) || /\bBENCHMARK\s*\(/i.test(sql),
    severity: 'critical',
    code: 'TIME_BASED_INJECTION',
    message: 'SLEEP() 和 BENCHMARK() 函数被禁止',
  },
];

function analyzeASTForInjection(ast) {
  const findings = [];

  if (ast.where) {
    checkAlwaysTrueCondition(ast.where, findings);
  }

  if (ast.type === 'select' && ast.union) {
    findings.push({
      severity: 'medium',
      code: 'UNION_SELECT',
      message: '检测到 UNION SELECT 语句',
      suggestion: '如果是教学需要的联合查询，请忽略此警告',
    });
  }

  checkFunctionsInNode(ast, findings);

  return findings;
}

function checkAlwaysTrueCondition(node, findings) {
  if (!node || typeof node !== 'object') return;

  if (node.operator === 'OR' && node.left && node.right) {
    if (isAlwaysTrue(node.left, node.right)) {
      findings.push({
        severity: 'high',
        code: 'ALWAYS_TRUE_OR',
        message: 'WHERE 子句中 OR 连接的恒真条件',
      });
    }
  }

  for (const key of ['left', 'right', 'expr', 'value']) {
    if (node[key]) {
      checkAlwaysTrueCondition(node[key], findings);
    }
  }
  for (const key of ['params', 'arguments', 'columns']) {
    if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        checkAlwaysTrueCondition(item, findings);
      }
    }
  }
}

function isAlwaysTrue(left, right) {
  if (!left || !right) return false;

  if (left.type === 'number' && right.type === 'number') {
    return Number(left.value) === Number(right.value);
  }
  if (left.type === 'string' && right.type === 'string') {
    return left.value === right.value;
  }
  if (left.value !== undefined && right.value !== undefined &&
      typeof left.value === typeof right.value) {
    if (typeof left.value === 'number' && typeof right.value === 'number') {
      return left.value === right.value;
    }
    if (typeof left.value === 'string' && typeof right.value === 'string') {
      return left.value === right.value;
    }
  }

  return false;
}

function checkFunctionsInNode(node, findings) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'function' && node.name) {
    const funcName = typeof node.name === 'string'
      ? node.name.toUpperCase()
      : (node.name.name || '').toUpperCase();

    const forbidden = FORBIDDEN_FUNCTIONS.find(f => f.name === funcName);
    if (forbidden) {
      findings.push({
        severity: forbidden.severity,
        code: `FORBIDDEN_FUNC_${forbidden.name}`,
        message: forbidden.message,
      });
    }
  }

  const recursiveKeys = ['left', 'right', 'expr', 'args', 'where', 'having'];
  for (const key of recursiveKeys) {
    if (node[key]) {
      if (Array.isArray(node[key])) {
        node[key].forEach(item => checkFunctionsInNode(item, findings));
      } else {
        checkFunctionsInNode(node[key], findings);
      }
    }
  }
  const arrayKeys = ['columns', 'values', 'values_list', 'orderby', 'groupby'];
  for (const key of arrayKeys) {
    if (Array.isArray(node[key])) {
      node[key].forEach(item => checkFunctionsInNode(item, findings));
    }
  }
}

function inspectSQL(sqlText) {
  const trimmed = (sqlText || '').trim();
  if (!trimmed) {
    return { safe: true, findings: [], blockingFindings: [] };
  }

  const allFindings = [];

  // 第1层：文本级模式扫描
  for (const rule of HIGH_RISK_PATTERNS) {
    if (rule.pattern.test(trimmed)) {
      allFindings.push({
        severity: rule.severity,
        code: rule.code,
        message: rule.message,
      });
    }
  }

  // 第1.5层：中等风险模式扫描
  for (const rule of MEDIUM_RISK_PATTERNS) {
    if (rule.test(trimmed)) {
      allFindings.push({
        severity: rule.severity,
        code: rule.code,
        message: rule.message,
      });
    }
  }

  // 第2层：AST 语义分析
  try {
    const ast = parser.astify(trimmed, { database: 'MySQL' });
    if (ast) {
      const astFindings = analyzeASTForInjection(
        Array.isArray(ast) ? ast[0] : ast
      );
      allFindings.push(...astFindings);
    }
  } catch {
    // AST 解析失败仅补充文本检测结果
  }

  const critical = allFindings.filter(f => f.severity === 'critical');
  const high = allFindings.filter(f => f.severity === 'high');

  const blockingFindings = [...critical, ...high];

  return {
    safe: blockingFindings.length === 0,
    findings: allFindings,
    blockingFindings,
  };
}

module.exports = {
  inspectSQL,
  FORBIDDEN_FUNCTIONS,
};