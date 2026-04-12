import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CommandSnippet } from '../types';

interface SnippetContextType {
  snippets: CommandSnippet[];
  addSnippet: (snippet: Omit<CommandSnippet, 'id' | 'createdAt'>) => Promise<void>;
  updateSnippet: (id: string, updates: Partial<CommandSnippet>) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
  runSnippet: (snippet: CommandSnippet, sessionId: string) => void;
}

const SnippetContext = createContext<SnippetContextType | undefined>(undefined);

const storageKey = 'commandSnippets';

export const SnippetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snippets, setSnippets] = useState<CommandSnippet[]>([]);

  useEffect(() => {
    const loadSnippets = async () => {
      if (window.electron) {
        const stored = await window.electron.store.get(storageKey);
        setSnippets(Array.isArray(stored) ? stored : []);
        return;
      }

      const stored = localStorage.getItem('terminuks_snippets');
      setSnippets(stored ? JSON.parse(stored) : []);
    };

    loadSnippets();
  }, []);

  const saveSnippets = useCallback(async (nextSnippets: CommandSnippet[]) => {
    setSnippets(nextSnippets);
    if (window.electron) {
      await window.electron.store.set(storageKey, nextSnippets);
      return;
    }

    localStorage.setItem('terminuks_snippets', JSON.stringify(nextSnippets));
  }, []);

  const addSnippet = useCallback(async (snippetData: Omit<CommandSnippet, 'id' | 'createdAt'>) => {
    const newSnippet: CommandSnippet = {
      ...snippetData,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    await saveSnippets([newSnippet, ...snippets]);
  }, [snippets, saveSnippets]);

  const updateSnippet = useCallback(async (id: string, updates: Partial<CommandSnippet>) => {
    const nextSnippets = snippets.map((s) => (s.id === id ? { ...s, ...updates } : s));
    await saveSnippets(nextSnippets);
  }, [snippets, saveSnippets]);

  const deleteSnippet = useCallback(async (id: string) => {
    const nextSnippets = snippets.filter((s) => s.id !== id);
    await saveSnippets(nextSnippets);
  }, [snippets, saveSnippets]);

  const runSnippet = useCallback((snippet: CommandSnippet, sessionId: string) => {
    window.dispatchEvent(
      new CustomEvent('terminuks:run-snippet', {
        detail: {
          command: snippet.command,
          sessionId,
        },
      })
    );
  }, []);

  return (
    <SnippetContext.Provider
      value={{
        snippets,
        addSnippet,
        updateSnippet,
        deleteSnippet,
        runSnippet,
      }}
    >
      {children}
    </SnippetContext.Provider>
  );
};

export const useSnippets = () => {
  const context = useContext(SnippetContext);
  if (!context) {
    throw new Error('useSnippets must be used within SnippetProvider');
  }
  return context;
};
