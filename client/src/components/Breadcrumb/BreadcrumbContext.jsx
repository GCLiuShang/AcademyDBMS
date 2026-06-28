import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BreadcrumbContext = createContext();

export const useBreadcrumb = () => {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumb must be used within a BreadcrumbProvider');
  }
  return context;
};

export const BreadcrumbProvider = ({ children }) => {
  // 从 sessionStorage 初始化，支持刷新后恢复
  const [path, setPath] = useState(() => {
    try {
      const saved = sessionStorage.getItem('breadcrumbPath');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // path 变化时持久化到 sessionStorage
  useEffect(() => {
    sessionStorage.setItem('breadcrumbPath', JSON.stringify(path));
  }, [path]);

  /**
   * 重置整个路径（用于 Dashboard 等顶层页面）
   */
  const setBreadcrumb = useCallback((newPath) => {
    setPath(newPath);
  }, []);

  /**
   * 页面进入时调用。
   * 如果路径中已有该项目 → 截断到该项（返回导航）。
   * 如果是新项目 → 追加（向前导航）。
   */
  const updateBreadcrumb = useCallback((item) => {
    setPath((prevPath) => {
      // Check if item already exists
      const index = prevPath.findIndex((p) => p.id === item.id);
      
      if (index !== -1) {
        // 如果存在：截断到该项之后（返回导航），并更新项目详情
        const newPath = prevPath.slice(0, index + 1);
        newPath[index] = item; 
        return newPath;
      } else {
        // 新项目：追加（向前导航）
        return [...prevPath, item];
      }
    });
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ path, setBreadcrumb, updateBreadcrumb }}>
      {children}
    </BreadcrumbContext.Provider>
  );
};
