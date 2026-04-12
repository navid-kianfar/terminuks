import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface TransferTask {
  id: string;
  name: string;
  type: 'upload' | 'download';
  status: 'queued' | 'working' | 'finished' | 'error';
  progress: number;
  hostId: string;
  remotePath: string;
  localPath: string;
  error?: string;
  startTime?: number;
}

interface TransferContextType {
  tasks: TransferTask[];
  addTransfer: (params: Omit<TransferTask, 'id' | 'status' | 'progress'>) => string;
  removeTask: (id: string) => void;
  retryTask: (id: string) => void;
  clearFinished: () => void;
}

const TransferContext = createContext<TransferContextType | undefined>(undefined);

export const TransferProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<TransferTask[]>([]);

  useEffect(() => {
    if (!window.electron?.sftp?.onProgress) return;

    const cleanup = window.electron.sftp.onProgress((data) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === data.transferId
            ? { ...task, progress: data.progress, status: 'working' }
            : task
        )
      );
    });

    return cleanup;
  }, []);

  const runTransfer = useCallback(async (task: TransferTask) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: 'working', progress: 0 } : t))
    );

    try {
      if (task.type === 'download') {
        await window.electron.sftp.download(task.hostId, task.remotePath, task.localPath, task.id);
      } else {
        await window.electron.sftp.upload(task.hostId, task.localPath, task.remotePath, task.id);
      }

      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: 'finished', progress: 100 } : t))
      );
    } catch (error) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
            : t
        )
      );
    }
  }, []);

  const addTransfer = useCallback(
    (params: Omit<TransferTask, 'id' | 'status' | 'progress'>) => {
      const id = uuidv4();
      const newTask: TransferTask = {
        ...params,
        id,
        status: 'queued',
        progress: 0,
        startTime: Date.now(),
      };

      setTasks((prev) => [newTask, ...prev]);
      runTransfer(newTask);
      return id;
    },
    [runTransfer]
  );

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const retryTask = useCallback(
    (id: string) => {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        runTransfer({ ...task, status: 'queued', progress: 0 });
      }
    },
    [tasks, runTransfer]
  );

  const clearFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== 'finished'));
  }, []);

  return (
    <TransferContext.Provider value={{ tasks, addTransfer, removeTask, retryTask, clearFinished }}>
      {children}
    </TransferContext.Provider>
  );
};

export const useTransfer = () => {
  const context = useContext(TransferContext);
  if (!context) {
    throw new Error('useTransfer must be used within a TransferProvider');
  }
  return context;
};
