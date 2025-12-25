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
  // Initialize from sessionStorage to survive refreshes
  const [path, setPath] = useState(() => {
    try {
      const saved = sessionStorage.getItem('breadcrumbPath');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist to sessionStorage whenever path changes
  useEffect(() => {
    sessionStorage.setItem('breadcrumbPath', JSON.stringify(path));
  }, [path]);

  /**
   * Reset path completely (usually for top-level pages like Dashboard)
   */
  const setBreadcrumb = useCallback((newPath) => {
    setPath(newPath);
  }, []);

  /**
   * Signal that a page has been entered.
   * Logic:
   * 1. If the item already exists in the path, assume we navigated back to it -> Slice path to that item.
   * 2. If it's new, append it.
   * 
   * This logic inherently supports "Forward" (append) and "Backward" (slice) animations 
   * defined in StandardPageLayout and Breadcrumb components.
   */
  const updateBreadcrumb = useCallback((item) => {
    setPath((prevPath) => {
      // Check if item already exists
      const index = prevPath.findIndex((p) => p.id === item.id);
      
      if (index !== -1) {
        // Exists: Slice everything after it (Go Back logic)
        // Also update the item details (name might have changed)
        const newPath = prevPath.slice(0, index + 1);
        newPath[index] = item; 
        return newPath;
      } else {
        // New: Append (Forward logic)
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
