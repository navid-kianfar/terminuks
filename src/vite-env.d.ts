/// <reference types="vite/client" />

type PersistedValue =
  | string
  | number
  | boolean
  | null
  | PersistedValue[]
  | { [key: string]: PersistedValue };

interface ElectronHostConfig {
  id: string;
  name: string;
  address: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key' | 'keyFile';
  password?: string;
  keyPath?: string;
  keyData?: string;
  passphrase?: string;
}

type ElectronSSHConnectResult =
  | { success: true }
  | {
      success: false;
      code: 'HOST_VERIFICATION_REQUIRED';
      fingerprint: string;
      host: string;
      port: number;
    };

interface Window {
  electron?: {
    store: {
      get: (key: string) => Promise<PersistedValue | undefined>;
      set: (key: string, value: PersistedValue) => Promise<void>;
      delete: (key: string) => Promise<void>;
      getAll: () => Promise<Record<string, PersistedValue>>;
    };
    dialog: {
      openFile: () => Promise<Electron.OpenDialogReturnValue>;
      openDirectory: () => Promise<Electron.OpenDialogReturnValue>;
      saveFile: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
    };
    localfs: {
      list: (dirPath: string) => Promise<
        Array<{
          name: string;
          path: string;
          type: 'file' | 'directory';
          size: number;
          modifyTime: number;
        }>
      >;
      home: () => Promise<string>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<void>;
      createFile: (filePath: string) => Promise<void>;
      createDirectory: (dirPath: string) => Promise<void>;
      rename: (oldPath: string, newPath: string) => Promise<void>;
      delete: (targetPaths: string[]) => Promise<void>;
      compress: (basePath: string, names: string[], archiveName: string) => Promise<string>;
      decompress: (filePath: string) => Promise<string>;
    };
    ssh: {
      connect: (hostConfig: ElectronHostConfig) => Promise<ElectronSSHConnectResult>;
      trustHost: (hostConfig: ElectronHostConfig, fingerprint: string) => Promise<void>;
      disconnect: (hostId: string) => Promise<void>;
      shell: (hostId: string) => Promise<{ streamId: string }>;
      write: (hostId: string, streamId: string, data: string) => Promise<void>;
      close: (hostId: string, streamId: string) => Promise<void>;
      onStreamData: (
        callback: (hostId: string, streamId: string, data: string) => void
      ) => () => void;
      onStreamClose: (callback: (hostId: string, streamId: string) => void) => () => void;
    };
    localShell: {
      start: (options?: { cols?: number; rows?: number }) => Promise<{ streamId: string }>;
      write: (streamId: string, data: string) => Promise<void>;
      resize: (streamId: string, cols: number, rows: number) => Promise<void>;
      close: (streamId: string) => Promise<void>;
      onData: (callback: (streamId: string, data: string) => void) => () => void;
      onClose: (callback: (streamId: string) => void) => () => void;
    };
    sftp: {
      connect: (hostConfig: ElectronHostConfig) => Promise<{ success: boolean }>;
      disconnect: (hostId: string) => Promise<void>;
      list: (
        hostId: string,
        remotePath: string
      ) => Promise<
        Array<{
          name: string;
          type: string;
          size?: number;
          modifyTime?: number;
        }>
      >;
      download: (hostId: string, remotePath: string, localPath: string) => Promise<void>;
      upload: (hostId: string, localPath: string, remotePath: string) => Promise<void>;
      delete: (hostId: string, remotePath: string) => Promise<void>;
      mkdir: (hostId: string, remotePath: string) => Promise<void>;
      rmdir: (hostId: string, remotePath: string) => Promise<void>;
      rename: (hostId: string, oldPath: string, newPath: string) => Promise<void>;
      exec: (hostId: string, command: string) => Promise<{ stdout: string; stderr: string }>;
      stat: (hostId: string, remotePath: string) => Promise<PersistedValue>;
      readFile: (hostId: string, remotePath: string) => Promise<string>;
      writeFile: (hostId: string, remotePath: string, content: string) => Promise<void>;
    };
  };
}
