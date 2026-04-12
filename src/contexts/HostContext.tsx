import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Host } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface HostContextType {
  hosts: Host[];
  selectedHost: Host | null;
  addHost: (host: Omit<Host, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateHost: (id: string, updates: Partial<Host>) => void;
  deleteHost: (id: string) => void;
  selectHost: (host: Host | null) => void;
  getHost: (id: string) => Host | undefined;
  duplicateHost: (id: string) => void;
  searchHosts: (query: string) => Host[];
}

const HostContext = createContext<HostContextType | undefined>(undefined);

export const HostProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);

  // Load hosts from storage
  useEffect(() => {
    const loadHosts = async () => {
      if (window.electron) {
        const stored = await window.electron.store.get('hosts');
        if (stored) {
          setHosts(Array.isArray(stored) ? stored : []);
        }
      } else {
        // Fallback for browser testing
        const stored = localStorage.getItem('terminuks_hosts');
        if (stored) {
          setHosts(JSON.parse(stored));
        }
      }
    };
    loadHosts();
  }, []);

  // Save hosts to storage
  const saveHosts = useCallback(async (newHosts: Host[]) => {
    if (window.electron) {
      await window.electron.store.set('hosts', newHosts);
    } else {
      localStorage.setItem('terminuks_hosts', JSON.stringify(newHosts));
    }
  }, []);

  const addHost = useCallback((hostData: Omit<Host, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newHost: Host = {
      ...hostData,
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      port: hostData.port || 22,
    };
    setHosts((prev) => {
      const updated = [...prev, newHost];
      saveHosts(updated);
      return updated;
    });
  }, [saveHosts]);

  const updateHost = useCallback((id: string, updates: Partial<Host>) => {
    setHosts((prev) => {
      const updated = prev.map((host) =>
        host.id === id ? { ...host, ...updates, updatedAt: Date.now() } : host
      );
      saveHosts(updated);
      return updated;
    });
    if (selectedHost?.id === id) {
      setSelectedHost((prev) =>
        prev ? { ...prev, ...updates, updatedAt: Date.now() } : null
      );
    }
  }, [selectedHost, saveHosts]);

  const deleteHost = useCallback((id: string) => {
    setHosts((prev) => {
      const updated = prev.filter((host) => host.id !== id);
      saveHosts(updated);
      return updated;
    });
    if (selectedHost?.id === id) {
      setSelectedHost(null);
    }
  }, [selectedHost, saveHosts]);

  const selectHost = useCallback((host: Host | null) => {
    setSelectedHost(host);
  }, []);

  const getHost = useCallback((id: string) => {
    return hosts.find((h) => h.id === id);
  }, [hosts]);

  const duplicateHost = useCallback((id: string) => {
    const original = hosts.find((h) => h.id === id);
    if (!original) return;

    const newHost: Host = {
      ...original,
      id: uuidv4(),
      name: `${original.name} - Copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setHosts((prev) => {
      const updated = [...prev, newHost];
      saveHosts(updated);
      return updated;
    });
  }, [hosts, saveHosts]);

  const searchHosts = useCallback((query: string) => {
    if (!query.trim()) return hosts;
    const lowerQuery = query.toLowerCase();
    return hosts.filter(
      (host) =>
        host.name.toLowerCase().includes(lowerQuery) ||
        host.address.toLowerCase().includes(lowerQuery) ||
        host.username.toLowerCase().includes(lowerQuery) ||
        host.group?.toLowerCase().includes(lowerQuery) ||
        host.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }, [hosts]);

  return (
    <HostContext.Provider
      value={{
        hosts,
        selectedHost,
        addHost,
        updateHost,
        deleteHost,
        selectHost,
        getHost,
        duplicateHost,
        searchHosts,
      }}
    >
      {children}
    </HostContext.Provider>
  );
};

export const useHosts = () => {
  const context = useContext(HostContext);
  if (!context) {
    throw new Error('useHosts must be used within HostProvider');
  }
  return context;
};
