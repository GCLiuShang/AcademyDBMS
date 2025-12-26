const express = require('express');
const db = require('../db');

const router = express.Router();

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
 * 该接口支持查询数据库中的任意表或视图。
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
  const { tableName, page = 1, limit = 20, orderBy, orderDir, ...restParams } = req.query;

  // 1. 安全性校验: 表名格式校验 (仅允许字母、数字、下划线)
  // 仅做格式检查，不限制是否为视图，支持查询任意存在的表或视图
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid table name format.'
    });
  }

  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClauses = [];
    let params = [];

    // 2. 动态构建搜索条件
    Object.keys(restParams).forEach(key => {
      if (key.startsWith('search_')) {
        const field = key.replace('search_', ''); // 获取字段名
        const value = restParams[key];

        // 字段名安全性校验 (仅允许字母、数字、下划线)
        if (!/^[a-zA-Z0-9_]+$/.test(field)) {
          console.warn(`Invalid field name detected: ${field}`);
          return;
        }

        if (value) {
          whereClauses.push(`${field} LIKE ?`);
          params.push(`%${value}%`);
        }
      }
    });

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    let orderSql = '';
    if (orderBy && /^[a-zA-Z0-9_]+$/.test(orderBy)) {
      const dir = String(orderDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderSql = `ORDER BY ${orderBy} ${dir}`;
    }

    // 3. 查询总数
    // tableName 已经过格式校验，可以直接拼接
    const countSql = `SELECT COUNT(*) as total FROM ${tableName} ${whereSql}`;
    const [countResult] = await db.execute(countSql, params);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limitNum) || 1;

    // 4. 查询当前页数据
    const dataSql = `SELECT * FROM ${tableName} ${whereSql} ${orderSql} LIMIT ${limitNum} OFFSET ${offset}`;
    const [rows] = await db.execute(dataSql, params);

    res.json({
      success: true,
      data: rows,
      pagination: { total, page: pageNum, totalPages, limit: limitNum }
    });

  } catch (error) {
    console.error(`Error fetching table data for ${tableName}:`, error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;

