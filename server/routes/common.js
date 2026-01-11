const express = require('express');
const db = require('../db');
const { requireAuth } = require('../services/sessionService');
const { authorize } = require('../services/userService');

const router = express.Router();

const escapeLike = (value) => String(value).replace(/([\\%_])/g, '\\$1');

router.use(requireAuth);
router.use(authorize([], { dept: 'auto' }));

const IDENT_RE = /^[a-zA-Z0-9_]+$/;
const UNO_RE = /^[a-zA-Z0-9]+$/;

const safeIdent = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return IDENT_RE.test(trimmed) ? trimmed : '';
};

const safeUnoSuffix = (uno) => {
  if (typeof uno !== 'string') return '';
  const trimmed = uno.trim();
  return UNO_RE.test(trimmed) ? trimmed : '';
};

const isAllowedRole = (role, allowedRoles) => {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  return allowedRoles.includes(role);
};

const viewEqualsOwn = (prefix, tableName, uno) => tableName === `${prefix}${uno}`;

const trainingProgramViewBelongsToUser = (tableName, uno) => {
  if (!IDENT_RE.test(tableName)) return false;
  if (!tableName.startsWith('View_TrainingProgram_')) return false;
  const safeUno = safeUnoSuffix(uno);
  if (!safeUno) return false;
  return tableName.includes(`_${safeUno}_`);
};

const POLICIES = [
  {
    match: (tableName, ctx) => viewEqualsOwn('View_ReceiveBox_', tableName, ctx.uno),
    allowedRoles: [],
    columns: ['Msg_no', 'Send_Uno', 'SenderName', 'Send_time_Formatted', 'Send_time', 'Msg_content'],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_SendBox_', tableName, ctx.uno),
    allowedRoles: [],
    columns: ['Msg_no', 'Receive_Uno', 'ReceiverName', 'Receive_time', 'Msg_content'],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_RubbishBox_Received_', tableName, ctx.uno),
    allowedRoles: [],
    columns: ['Msg_no', 'Send_Uno', 'SenderName', 'Send_time', 'Msg_content'],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_RubbishBox_Sent_', tableName, ctx.uno),
    allowedRoles: [],
    columns: ['Msg_no', 'Receive_Uno', 'ReceiverName', 'Receive_time', 'Msg_content'],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_CurricularApply_', tableName, ctx.uno),
    allowedRoles: ['教授', '学院教学办管理员'],
    columns: [
      'ApplyID',
      'Cname',
      'Cno',
      'CreateTime',
      'ApplyDate',
      'Status',
      'Cdept',
      'Cseme',
      'Cclasshour',
      'Ceattri',
      'Description',
    ],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_CurricularApprove_', tableName, ctx.uno),
    allowedRoles: ['学院教学办管理员', '学校教务处管理员'],
    columns: [
      'ApplyID',
      'Cname',
      'Cattri',
      'Applicant',
      'Cno',
      'CreateTime',
      'ApplyTime',
      'Cdept',
      'Cseme',
      'Cclasshour',
      'Ceattri',
      'Description',
    ],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_Courseapply_CnoPool_', tableName, ctx.uno),
    allowedRoles: ['教授'],
    columns: ['Cno', 'Cattri', 'Cseme', 'Cname'],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_Courseapply_Prof_', tableName, ctx.uno),
    allowedRoles: ['教授'],
    columns: ['Pno', 'Pname'],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_Courseajust_', tableName, ctx.uno),
    allowedRoles: ['教授'],
    columns: [
      'ArrangeCo_Courno',
      'ArrangeCo_classhour',
      'ArrangeCo_date',
      'ArrangeCo_Lno',
      'Ltime_begin',
      'Ltime_end',
      'Cname',
      'ArrangeCo_Pno',
      'Pname',
    ],
  },
  {
    match: (tableName, ctx) => viewEqualsOwn('View_Examapply_Curricular_', tableName, ctx.uno),
    allowedRoles: ['学院教学办管理员'],
    columns: ['Cno', 'Cattri', 'Cname', 'Cseme', 'Ceattri', 'Cclasshour', 'Description'],
  },
  {
    match: (tableName, ctx) => trainingProgramViewBelongsToUser(tableName, ctx.uno),
    allowedRoles: ['学院教学办管理员'],
    columns: ['Cno', 'Cname', 'Cattri', 'Cdept', 'Ccredit', 'Cseme', 'Ceattri', 'Cdescription'],
  },
  {
    match: (tableName) => tableName === 'Message',
    allowedRoles: [],
    columns: ['Msg_no', 'Msg_category', 'Msg_priority', 'Msg_content'],
    injectWhere: (ctx) => ({
      parts: [
        `(EXISTS (SELECT 1 FROM Msg_Send ms WHERE ms.Msg_no = t.Msg_no AND ms.Send_Uno = ?) OR EXISTS (SELECT 1 FROM Msg_Receive mr WHERE mr.Msg_no = t.Msg_no AND mr.Receive_Uno = ?))`,
      ],
      params: [ctx.uno, ctx.uno],
    }),
  },
  {
    match: (tableName) => tableName === 'Department',
    allowedRoles: ['学校教务处管理员', '学院教学办管理员'],
    columns: ['Dept_no', 'Dept_name'],
    injectWhere: (ctx) => {
      if (ctx.role !== '学院教学办管理员' || !ctx.dept) return { parts: [], params: [] };
      return { parts: ['t.Dept_no = ?'], params: [ctx.dept] };
    },
  },
  {
    match: (tableName) => tableName === 'Domain',
    allowedRoles: ['学校教务处管理员', '学院教学办管理员'],
    columns: ['Dom_no', 'Dom_dept', 'Dom_name', 'Dom_status'],
    injectWhere: (ctx) => {
      if (ctx.role !== '学院教学办管理员' || !ctx.dept) return { parts: [], params: [] };
      return { parts: ['t.Dom_dept = ?'], params: [ctx.dept] };
    },
  },
  {
    match: (tableName) => tableName === 'TrainingProgram',
    allowedRoles: ['学院教学办管理员'],
    columns: ['TPno', 'TPdom', 'TPyear', 'TPstatus'],
    injectWhere: (ctx) => {
      if (!ctx.dept) return { parts: ['1 = 0'], params: [] };
      return {
        parts: ['EXISTS (SELECT 1 FROM Domain d WHERE d.Dom_no = t.TPdom AND d.Dom_dept = ?)'],
        params: [ctx.dept],
      };
    },
  },
  {
    match: (tableName) => tableName === 'Class',
    allowedRoles: ['学校教务处管理员'],
    columns: ['Class_name', 'Class_dom', 'Class_status'],
  },
  {
    match: (tableName) => tableName === 'Campus',
    allowedRoles: ['教授'],
    columns: ['Cam_name', 'Cam_status'],
  },
  {
    match: (tableName) => tableName === 'Dayofweek',
    allowedRoles: ['教授'],
    columns: ['Day'],
  },
  {
    match: (tableName) => tableName === 'Lesson',
    allowedRoles: ['学校教务处管理员'],
    columns: ['Lno', 'Ltime_begin', 'Ltime_end'],
  },
];

const resolvePolicy = (tableName, ctx) => {
  for (const policy of POLICIES) {
    if (policy.match(tableName, ctx)) return policy;
  }
  return null;
};

/**
 * 通用表格查询接口
 * 
 * @route GET /api/common/table/list
 * @param {string} tableName - 目标表名或视图名
 * @param {number} page - 当前页码 (默认 1)
 * @param {number} limit - 每页数量 (默认 20)
 * @param {string} search_{field} - 针对特定字段的模糊搜索值
 * 
 * @description
 * 该接口支持查询数据库中的白名单内的表或视图。
 * - 简单查询: 直接传入表名 (如 tableName=Student)。
 * - 复杂关联查询: 推荐在数据库中创建视图 (VIEW) 后传入视图名 (如 tableName=View_Student_Details)，
 *   从而实现多表 JOIN 结果的查询，保持前端调用的简洁性。
 * 
 * @example
 * // 查询学生表
 * GET /api/common/table/list?tableName=Student
 * 
 * // 查询预定义的视图 (包含学院名称等关联信息)
 * GET /api/common/table/list?tableName=View_Student_Details&search_Sname=张
 */
router.get('/common/table/list', async (req, res) => {
  const { tableName: tableNameRaw, page = 1, limit = 20, orderBy, orderDir, ...restParams } = req.query;

  const tableName = safeIdent(typeof tableNameRaw === 'string' ? tableNameRaw : String(tableNameRaw || ''));
  if (!tableName) {
    return res.status(400).json({ success: false, message: 'Invalid table name format.' });
  }

  const ctx = {
    uno: safeUnoSuffix(req?.user?.Uno ? String(req.user.Uno) : ''),
    role: req?.user?.Urole ? String(req.user.Urole) : '',
    dept: req?.authz?.dept ? String(req.authz.dept) : '',
  };
  if (!ctx.uno) return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Unauthenticated' });

  const policy = resolvePolicy(tableName, ctx);
  if (!policy) return res.status(403).json({ success: false, message: 'Unauthorized table' });
  if (!isAllowedRole(ctx.role, policy.allowedRoles)) {
    return res.status(403).json({ success: false, message: 'Unauthorized role' });
  }

  const policyCols = Array.isArray(policy.columns) ? policy.columns : [];
  if (policyCols.length === 0 || !policyCols.every((c) => IDENT_RE.test(c))) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
  const colSet = new Set(policyCols);

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitRaw = parseInt(limit, 10) || 20;
  const limitNum = Math.min(Math.max(1, limitRaw), 200);
  const offset = (pageNum - 1) * limitNum;

  const whereParts = [];
  const params = [];

  for (const key of Object.keys(restParams)) {
    if (!key.startsWith('search_')) continue;
    const field = safeIdent(key.slice('search_'.length));
    if (!field) return res.status(400).json({ success: false, message: 'Invalid field name format.' });
    if (!colSet.has(field)) return res.status(403).json({ success: false, message: 'Unauthorized field' });
    const rawValue = restParams[key];
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
    if (!value.trim()) continue;
    whereParts.push(`t.${field} LIKE ? ESCAPE '\\\\'`);
    params.push(`%${escapeLike(value)}%`);
  }

  const inject = typeof policy.injectWhere === 'function' ? policy.injectWhere(ctx) : { parts: [], params: [] };
  if (inject && Array.isArray(inject.parts) && Array.isArray(inject.params)) {
    for (const part of inject.parts) {
      if (typeof part === 'string' && part.trim()) whereParts.push(part);
    }
    params.push(...inject.params);
  }

  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  let orderSql = '';
  const orderField = typeof orderBy === 'string' ? safeIdent(orderBy) : '';
  if (orderField) {
    if (!colSet.has(orderField)) return res.status(403).json({ success: false, message: 'Unauthorized orderBy' });
    const dir = String(orderDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    orderSql = `ORDER BY t.${orderField} ${dir}`;
  }

  try {
    const countSql = `SELECT COUNT(*) as total FROM ${tableName} t ${whereSql}`;
    const [countResult] = await db.execute(countSql, params);
    const total = countResult?.[0]?.total ?? 0;
    const totalPages = Math.ceil(total / limitNum) || 1;

    const selectColsSql = policyCols.map((c) => `t.${c}`).join(', ');
    const dataSql = `SELECT ${selectColsSql} FROM ${tableName} t ${whereSql} ${orderSql} LIMIT ${limitNum} OFFSET ${offset}`;
    const [rows] = await db.execute(dataSql, params);

    return res.json({
      success: true,
      data: rows,
      pagination: { total, page: pageNum, totalPages, limit: limitNum },
    });
  } catch (error) {
    console.error(`Error fetching table data for ${tableName}:`, error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
