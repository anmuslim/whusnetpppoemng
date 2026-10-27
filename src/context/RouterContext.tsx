import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { RouterSummary } from '../types/index.ts';
import { api } from '../api/client.ts';
import { useAuth } from './AuthContext.tsx';

export type RefreshInterval = 0 | 5 | 10 | 30; // seconds (0 = off)

interface RouterContextType {
  routers: RouterSummary[];
  selectedRouterId: string; // 'all' or router.id
  selectedRouter: RouterSummary | null;
  setSelectedRouterId: (id: string) => void;
  loadingRouters: boolean;
  refreshRouters: () => Promise<void>;
  refreshInterval: RefreshInterval;
  setRefreshInterval: (interval: RefreshInterval) => void;
  refreshTick: number;
  triggerManualRefresh: () => void;
  isMultiRouter: boolean;
}

const RouterContext = createContext<RouterContextType>({
  routers: [],
  selectedRouterId: 'all',
  selectedRouter: null,
  setSelectedRouterId: () => {},
  loadingRouters: false,
  refreshRouters: async () => {},
  refreshInterval: 10,
  setRefreshInterval: () => {},
  refreshTick: 0,
  triggerManualRefresh: () => {},
  isMultiRouter: true,
});

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [routers, setRouters] = useState<RouterSummary[]>([]);
  const [selectedRouterId, setSelectedRouterId] = useState<string>(() => {
    return localStorage.getItem('pppoe_selected_router') || 'all';
  });
  const [loadingRouters, setLoadingRouters] = useState(false);
  const [refreshInterval, setRefreshIntervalState] = useState<RefreshInterval>(() => {
    const saved = localStorage.getItem('pppoe_refresh_interval');
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if ([0, 5, 10, 30].includes(parsed)) return parsed as RefreshInterval;
    }
    return 10;
  });
  const [refreshTick, setRefreshTick] = useState(0);

  const setRefreshInterval = (interval: RefreshInterval) => {
    setRefreshIntervalState(interval);
    localStorage.setItem('pppoe_refresh_interval', String(interval));
  };

  const handleSetSelectedRouterId = (id: string) => {
    setSelectedRouterId(id);
    localStorage.setItem('pppoe_selected_router', id);
  };

  const triggerManualRefresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const refreshRouters = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingRouters(true);
      const res = await api.routers.getAll();
      if (res.success && Array.isArray(res.data)) {
        setRouters(res.data);
      }
    } catch (err) {
      console.error('Failed to load routers:', err);
    } finally {
      setLoadingRouters(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      refreshRouters();
    }
  }, [user, refreshRouters]);

  // Polling timer
  useEffect(() => {
    if (!user || refreshInterval === 0) return;
    const intervalId = setInterval(() => {
      setRefreshTick((prev) => prev + 1);
    }, refreshInterval * 1000);
    return () => clearInterval(intervalId);
  }, [user, refreshInterval]);

  const selectedRouter = routers.find((r) => r.id === selectedRouterId) || null;
  const isMultiRouter = selectedRouterId === 'all';

  return (
    <RouterContext.Provider
      value={{
        routers,
        selectedRouterId,
        selectedRouter,
        setSelectedRouterId: handleSetSelectedRouterId,
        loadingRouters,
        refreshRouters,
        refreshInterval,
        setRefreshInterval,
        refreshTick,
        triggerManualRefresh,
        isMultiRouter,
      }}
    >
      {children}
    </RouterContext.Provider>
  );
};

export const useRouterContext = () => useContext(RouterContext);
