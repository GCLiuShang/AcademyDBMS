import React, { useState } from 'react';
import './Table.css';

/**
 * 通用表格组件 (Table)
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
  const [searchParams, setSearchParams] = useState({});
  const [activeSearchCol, setActiveSearchCol] = useState(null);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const handleSearchChange = (key, value) => {
    setSearchParams(prev => ({ ...prev, [key]: value }));
  };

  const handleSearchSubmit = () => {
    if (onSearch) onSearch(searchParams);
    setActiveSearchCol(null);
  };

  const handleClearSearch = (key) => {
    const newParams = { ...searchParams };
    delete newParams[key];
    setSearchParams(newParams);
    if (onSearch) onSearch(newParams);
    setActiveSearchCol(null);
  };

  const SkeletonRow = () => (
    <div className="table-row table-row-skeleton">
      {columns.map((col, i) => (
        <div key={i} className="table-cell" style={{ width: col.width || '1fr' }}>
          <div className="skeleton skeleton-cell" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="custom-table-container">
      {/* 1. 表头 */}
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
              <div className={`header-title-container ${isSearching ? 'hidden' : ''}`}>
                <span className="header-text">{col.title}</span>
                {!isOperation && !isLastCol && (
                  <button
                    className="filter-btn"
                    onClick={() => setActiveSearchCol(col.key)}
                  >
                    <img src="/images/table/filter.svg" alt="filter" />
                  </button>
                )}
              </div>
              {isSearching && (
                <div className="header-search-bar">
                  <input
                    type="text"
                    value={searchVal}
                    onChange={(e) => handleSearchChange(col.key, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
                    placeholder={`搜索 ${col.title}...`}
                    autoFocus
                  />
                  <button className="close-search-btn" onClick={() => {
                    if (!searchVal) handleClearSearch(col.key);
                    else handleSearchSubmit();
                  }}>✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. 内容 */}
      <div className="table-body">
        {loading ? (
          Array.from({ length: Math.min(5, pageSize) }).map((_, i) => <SkeletonRow key={i} />)
        ) : data.length === 0 ? (
          <div className="table-empty">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <line x1="14" y1="18" x2="34" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="24" x2="30" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="30" x2="26" y2="30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="empty-text">暂无数据</span>
          </div>
        ) : (
          data.map((row, rowIndex) => (
            <div key={rowIndex} className="table-row">
              {columns.map((col, colIndex) => {
                const isOperation = col.title === '操作';
                return (
                  <div
                    key={`${rowIndex}-${col.key || colIndex}`}
                    className="table-cell"
                    style={{
                      width: col.width || (isOperation ? '150px' : '1fr'),
                    }}
                  >
                    {col.render ? col.render(row, rowIndex) : row[col.key]}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* 3. 底栏 */}
      <div className="table-footer">
        <div className="footer-left">
          总计 <span className="footer-count">{total}</span> 个结果
        </div>
        <div className="footer-center">
          <button
            className="page-btn"
            disabled={currentPage <= 1}
            onClick={() => onPageChange && onPageChange(currentPage - 1)}
          >
            ‹
          </button>
          <div className="page-numbers">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  className={`page-num ${pageNum === currentPage ? 'active' : ''}`}
                  onClick={() => onPageChange && onPageChange(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            className="page-btn"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange && onPageChange(currentPage + 1)}
          >
            ›
          </button>
          <span className="page-info">共 {totalPages} 页</span>
        </div>
        <div className="footer-right">
          <span>每页</span>
          <select
            className="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange && onPageSizeChange(Number(e.target.value))}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>条</span>
          <button className="refresh-btn" onClick={onRefresh} title="刷新">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8a6 6 0 0 1 11.47-2.94M14 8a6 6 0 0 1-11.47 2.94" />
              <path d="M13.5 2v3h-3M2.5 14v-3h3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Table;
