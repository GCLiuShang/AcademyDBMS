import React, { useState } from 'react';
import './Table.css';

/**
 * 通用表格组件 (Table)
 * 
 * @param {Array} columns - 列定义数组，每项格式: { key: string, title: string, width?: string, render?: function }
 *                          注意: 最后一项的 title 必须为 "操作"。
 * @param {Array} data - 表格数据数组
 * @param {number} total - 数据总条数
 * @param {number} currentPage - 当前页码 (从1开始)
 * @param {number} pageSize - 每页显示数量
 * @param {function} onPageChange - 页码改变回调 (page) => {}
 * @param {function} onPageSizeChange - 每页数量改变回调 (size) => {}
 * @param {function} onSearch - 搜索条件改变回调 (searchParams) => {}
 * @param {function} onRefresh - 刷新按钮回调 () => {}
 * @param {boolean} loading - 是否正在加载
 */
const Table = ({
  columns = [],
  data = [],
  total = 0,
  currentPage = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  onSearch,
  onRefresh,
  loading = false
}) => {
  // 搜索状态管理: { [columnKey]: searchValue }
  const [searchParams, setSearchParams] = useState({});
  // 当前正在搜索的列 (控制输入框显示)
  const [activeSearchCol, setActiveSearchCol] = useState(null);
  
  const totalPages = Math.ceil(total / pageSize) || 1;

  // 处理搜索输入变更
  const handleSearchChange = (key, value) => {
    setSearchParams(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 提交搜索 (回车或点击关闭)
  const handleSearchSubmit = () => {
    if (onSearch) {
      onSearch(searchParams);
    }
    setActiveSearchCol(null);
  };

  // 清除某列搜索
  const handleClearSearch = (key) => {
    const newParams = { ...searchParams };
    delete newParams[key];
    setSearchParams(newParams);
    if (onSearch) {
      onSearch(newParams);
    }
    setActiveSearchCol(null);
  };

  // Helper to get cell style
  const getCellStyle = (col, isOperation) => {
    return { 
      width: col.width || (isOperation ? '150px' : '1fr'),
      textAlign: isOperation ? 'center' : 'left',
      justifyContent: isOperation ? 'center' : 'flex-start'
    };
  };

  return (
    <div className="custom-table-container">
      {/* 1. 顶部栏 (表头) */}
      <div className="table-header">
        {columns.map((col, index) => {
          const isLastCol = index === columns.length - 1;
          const isOperation = col.title === '操作';
          const searchVal = searchParams[col.key] || '';
          const isSearching = activeSearchCol === col.key;

          return (
            <div 
              key={col.key || index} 
              className="table-header-cell"
              style={{ width: col.width || (isOperation ? '150px' : '1fr') }}
            >
              {/* 正常显示的标题 */}
              <div className={`header-title-container ${isSearching ? 'hidden' : ''}`}>
                <span className="header-text">{col.title}</span>
                {/* 只有非操作列且非最后一列才显示筛选按钮 */}
                {!isOperation && !isLastCol && (
                  <button 
                    className="filter-btn"
                    onClick={() => setActiveSearchCol(col.key)}
                  >
                    <img src="/images/table/filter.svg" alt="filter" />
                  </button>
                )}
              </div>

              {/* 搜索栏 (覆盖层) */}
              {isSearching && (
                <div className="header-search-bar">
                  <input
                    type="text"
                    value={searchVal}
                    onChange={(e) => handleSearchChange(col.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearchSubmit();
                    }}
                    placeholder={`搜索 ${col.title}...`}
                    autoFocus
                  />
                  <button 
                    className="close-search-btn"
                    onClick={() => {
                      if (!searchVal) {
                        handleClearSearch(col.key);
                      } else {
                        handleSearchSubmit();
                      }
                    }}
                  >
                    X
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. 内容栏 */}
      <div className="table-body">
        {loading ? (
          <div className="table-loading">加载中...</div>
        ) : data.length === 0 ? (
          <div className="table-empty">暂无数据</div>
        ) : (
          data.map((row, rowIndex) => (
            <div key={rowIndex} className="table-row">
              {columns.map((col, colIndex) => {
                const isOperation = col.title === '操作';
                return (
                  <div 
                    key={`${rowIndex}-${col.key || colIndex}`} 
                    className="table-cell"
                    style={getCellStyle(col, isOperation)}
                  >
                    {col.render ? col.render(row, rowIndex) : row[col.key]}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* 3. 底部栏 */}
      <div className="table-footer">
        {/* 左侧: 总计 */}
        <div className="footer-left">
          总计 {total} 个结果
        </div>

        {/* 中间: 翻页 */}
        <div className="footer-center">
          <button 
            className="page-btn" 
            disabled={currentPage <= 1}
            onClick={() => onPageChange && onPageChange(currentPage - 1)}
          >
            &lt;
          </button>
          <span className="page-info">
            第 {currentPage} 页，共 {totalPages} 页
          </span>
          <button 
            className="page-btn" 
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange && onPageChange(currentPage + 1)}
          >
            &gt;
          </button>
        </div>

        {/* 右侧: 每页数量 & 刷新 */}
        <div className="footer-right">
          <span>一页最多显示</span>
          <select 
            className="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange && onPageSizeChange(Number(e.target.value))}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>个结果</span>
          
          <button className="refresh-btn" onClick={onRefresh}>
            <img src="/images/table/refresh.svg" alt="refresh" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Table;
