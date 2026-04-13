import { Host } from '../types';

export interface SFTPFile {
  name: string;
  type: 'file' | 'directory' | 'link';
  size: number;
  modifyTime: number;
  accessTime: number;
  rights: {
    user: string;
    group: string;
    other: string;
  };
  owner: number;
  group: number;
}

class SFTPService {
  async connect(host: Host): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }

    await window.electron.sftp.connect(host);
  }

  async disconnect(hostId: string): Promise<void> {
    if (!window.electron) {
      return;
    }

    await window.electron.sftp.disconnect(hostId);
  }

  async listFiles(hostId: string, remotePath: string): Promise<SFTPFile[]> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    return await window.electron.sftp.list(hostId, remotePath);
  }

  async downloadFile(hostId: string, remotePath: string, localPath: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    await window.electron.sftp.download(hostId, remotePath, localPath);
  }

  async uploadFile(hostId: string, localPath: string, remotePath: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    await window.electron.sftp.upload(hostId, localPath, remotePath);
  }

  async deleteFile(hostId: string, remotePath: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    await window.electron.sftp.delete(hostId, remotePath);
  }

  async deleteDirectory(hostId: string, remotePath: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    await window.electron.sftp.rmdir(hostId, remotePath);
  }

  async createDirectory(hostId: string, remotePath: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    await window.electron.sftp.mkdir(hostId, remotePath);
  }

  async rename(hostId: string, oldPath: string, newPath: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    await window.electron.sftp.rename(hostId, oldPath, newPath);
  }

  async exec(hostId: string, command: string): Promise<{ stdout: string; stderr: string }> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    return window.electron.sftp.exec(hostId, command);
  }

  async getFileInfo(hostId: string, remotePath: string): Promise<SFTPFile> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    return await window.electron.sftp.stat(hostId, remotePath);
  }

  async readFile(hostId: string, remotePath: string): Promise<string> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    return await window.electron.sftp.readFile(hostId, remotePath);
  }

  async writeFile(hostId: string, remotePath: string, content: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }
    await window.electron.sftp.writeFile(hostId, remotePath, content);
  }
}

export const sftpService = new SFTPService();
