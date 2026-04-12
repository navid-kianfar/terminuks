import React, { createContext, useContext, useState, useCallback } from 'react';
import { TerminalSession } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface TerminalContextType {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  addSession: (session: Omit<TerminalSession, 'id' | 'createdAt'>) => string;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  getSession: (id: string) => TerminalSession | undefined;
  updateSession: (id: string, updates: Partial<TerminalSession>) => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const addSession = useCallback((sessionData: Omit<TerminalSession, 'id' | 'createdAt'>) => {
    const newSession: TerminalSession = {
      ...sessionData,
      id: uuidv4(),
      createdAt: Date.now(),
    };
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSession.id);
    return newSession.id;
  }, []);

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((session) => session.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      }
      return remaining;
    });
  }, [activeSessionId]);

  const setActiveSession = useCallback((id: string | null) => {
    setActiveSessionId(id);
  }, []);

  const getSession = useCallback((id: string) => {
    return sessions.find((s) => s.id === id);
  }, [sessions]);

  const updateSession = useCallback((id: string, updates: Partial<TerminalSession>) => {
    setSessions((prev) => {
      let changed = false;
      const nextSessions = prev.map((session) => {
        if (session.id !== id) {
          return session;
        }

        const nextSession = { ...session, ...updates };
        const hasMeaningfulChange = Object.entries(updates).some(
          ([key, value]) => session[key as keyof TerminalSession] !== value
        );

        if (!hasMeaningfulChange) {
          return session;
        }

        changed = true;
        return nextSession;
      });

      return changed ? nextSessions : prev;
    });
  }, []);

  return (
    <TerminalContext.Provider
      value={{
        sessions,
        activeSessionId,
        addSession,
        removeSession,
        setActiveSession,
        getSession,
        updateSession,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
};

export const useTerminal = () => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within TerminalProvider');
  }
  return context;
};
