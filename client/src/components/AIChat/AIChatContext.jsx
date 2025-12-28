import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const AIChatFeatureContext = createContext(null);

export function AIChatProvider({ children }) {
  const [featuresByPathname, setFeaturesByPathname] = useState({});

  const setFeaturesForPathname = useCallback((pathname, features) => {
    setFeaturesByPathname((prev) => ({ ...prev, [pathname]: Array.isArray(features) ? features : [] }));
  }, []);

  const value = useMemo(
    () => ({
      featuresByPathname,
      setFeaturesForPathname,
    }),
    [featuresByPathname, setFeaturesForPathname]
  );

  return <AIChatFeatureContext.Provider value={value}>{children}</AIChatFeatureContext.Provider>;
}

export function useAIChatFeatures(features) {
  const ctx = useContext(AIChatFeatureContext);
  const location = useLocation();

  if (!ctx) {
    throw new Error('useAIChatFeatures must be used within AIChatProvider');
  }

  const pathname = location.pathname;
  const stableFeatures = useMemo(() => (Array.isArray(features) ? features : []), [features]);

  useEffect(() => {
    ctx.setFeaturesForPathname(pathname, stableFeatures);
    return () => {
      ctx.setFeaturesForPathname(pathname, []);
    };
  }, [ctx, pathname, stableFeatures]);

  return null;
}

export function useAIChatFeatureList() {
  const ctx = useContext(AIChatFeatureContext);
  const location = useLocation();

  if (!ctx) return [];
  return ctx.featuresByPathname[location.pathname] || [];
}
