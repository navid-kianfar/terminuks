import { contextBridge, ipcRenderer } from 'electron';

type PersistedValue =
  | string
  | number
  | boolean
  | null
  | PersistedValue[]
  | { [key: string]: PersistedValue };

interface HostConfig {
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

contextBridge.exposeInMainWorld('electron', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: PersistedValue) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    getAll: () => ipcRenderer.invoke('store:getAll'),
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    saveFile: (options: Electron.SaveDialogOptions) =>
      ipcRenderer.invoke('dialog:saveFile', options),
  },
  localfs: {
    list: (dirPath: string) => ipcRenderer.invoke('localfs:list', dirPath),
    home: () => ipcRenderer.invoke('localfs:home'),
  },
  ssh: {
    connect: (hostConfig: HostConfig) => ipcRenderer.invoke('ssh:connect', hostConfig),
    trustHost: (hostConfig: HostConfig, fingerprint: string) =>
      ipcRenderer.invoke('ssh:trustHost', hostConfig, fingerprint),
    disconnect: (hostId: string) => ipcRenderer.invoke('ssh:disconnect', hostId),
    shell: (hostId: string) => ipcRenderer.invoke('ssh:shell', hostId),
    write: (hostId: string, streamId: string, data: string) =>
      ipcRenderer.invoke('ssh:write', hostId, streamId, data),
    close: (hostId: string, streamId: string) =>
      ipcRenderer.invoke('ssh:close', hostId, streamId),
    onStreamData: (callback: (hostId: string, streamId: string, data: string) => void) => {
      const listener = (_: unknown, hostId: string, streamId: string, data: string) =>
        callback(hostId, streamId, data);
      ipcRenderer.on('ssh:stream-data', listener);
      return () => ipcRenderer.removeListener('ssh:stream-data', listener);
    },
    onStreamClose: (callback: (hostId: string, streamId: string) => void) => {
      const listener = (_: unknown, hostId: string, streamId: string) =>
        callback(hostId, streamId);
      ipcRenderer.on('ssh:stream-close', listener);
      return () => ipcRenderer.removeListener('ssh:stream-close', listener);
    },
  },
  localShell: {
    start: (options?: { cols?: number; rows?: number }) => ipcRenderer.invoke('localShell:start', options),
    write: (streamId: string, data: string) => ipcRenderer.invoke('localShell:write', streamId, data),
    resize: (streamId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('localShell:resize', streamId, cols, rows),
    close: (streamId: string) => ipcRenderer.invoke('localShell:close', streamId),
    onData: (callback: (streamId: string, data: string) => void) => {
      const listener = (_: unknown, streamId: string, data: string) => callback(streamId, data);
      ipcRenderer.on('localShell:data', listener);
      return () => ipcRenderer.removeListener('localShell:data', listener);
    },
    onClose: (callback: (streamId: string) => void) => {
      const listener = (_: unknown, streamId: string) => callback(streamId);
      ipcRenderer.on('localShell:close', listener);
      return () => ipcRenderer.removeListener('localShell:close', listener);
    },
  },
  sftp: {
    connect: (hostConfig: HostConfig) => ipcRenderer.invoke('sftp:connect', hostConfig),
    disconnect: (hostId: string) => ipcRenderer.invoke('sftp:disconnect', hostId),
    list: (hostId: string, remotePath: string) => ipcRenderer.invoke('sftp:list', hostId, remotePath),
    download: (hostId: string, remotePath: string, localPath: string, transferId?: string) =>
      ipcRenderer.invoke('sftp:download', hostId, remotePath, localPath, transferId),
    upload: (hostId: string, localPath: string, remotePath: string, transferId?: string) =>
      ipcRenderer.invoke('sftp:upload', hostId, localPath, remotePath, transferId),
    delete: (hostId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:delete', hostId, remotePath),
    mkdir: (hostId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:mkdir', hostId, remotePath),
    rmdir: (hostId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:rmdir', hostId, remotePath),
    rename: (hostId: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke('sftp:rename', hostId, oldPath, newPath),
    stat: (hostId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:stat', hostId, remotePath),
    readFile: (hostId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:readFile', hostId, remotePath),
    writeFile: (hostId: string, remotePath: string, content: string) =>
      ipcRenderer.invoke('sftp:writeFile', hostId, remotePath, content),
    onProgress: (callback: (data: { transferId: string; progress: number }) => void) => {
      const listener = (_: unknown, data: { transferId: string; progress: number }) =>
        callback(data);
      ipcRenderer.on('sftp:progress', listener);
      return () => ipcRenderer.removeListener('sftp:progress', listener);
    },
  },
});
