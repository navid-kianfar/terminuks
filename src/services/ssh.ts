import { Host } from '../types';

export interface SSHConnection {
  connected: boolean;
  host: Host;
}

export interface SSHHostVerificationError extends Error {
  code: 'HOST_VERIFICATION_REQUIRED';
  fingerprint: string;
  host: string;
  port: number;
}

class SSHService {
  private connections: Map<string, SSHConnection> = new Map();

  async connect(host: Host): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }

    try {
      await window.electron.ssh.connect(host);
      this.connections.set(host.id, {
        connected: true,
        host,
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'HOST_VERIFICATION_REQUIRED'
      ) {
        const trustError = new Error(
          'The authenticity of this host cannot be established.'
        ) as SSHHostVerificationError;
        trustError.code = 'HOST_VERIFICATION_REQUIRED';
        trustError.fingerprint = String((error as { fingerprint?: string }).fingerprint || '');
        trustError.host = String((error as { host?: string }).host || host.address);
        trustError.port = Number((error as { port?: number }).port || host.port);
        throw trustError;
      }

      const message = error instanceof Error ? error.message : 'Unknown SSH connection error';
      throw new Error(message);
    }
  }

  async trustHost(host: Host, fingerprint: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }

    await window.electron.ssh.trustHost(host, fingerprint);
  }

  async disconnect(hostId: string): Promise<void> {
    if (!window.electron) {
      return;
    }

    try {
      await window.electron.ssh.disconnect(hostId);
      this.connections.delete(hostId);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  getConnection(hostId: string): SSHConnection | undefined {
    return this.connections.get(hostId);
  }

  isConnected(hostId: string): boolean {
    const connection = this.connections.get(hostId);
    return connection?.connected || false;
  }

  async createShell(hostId: string): Promise<string> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }

    const result = await window.electron.ssh.shell(hostId);
    return result.streamId;
  }

  async writeToShell(hostId: string, streamId: string, data: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }

    await window.electron.ssh.write(hostId, streamId, data);
  }

  async closeShell(hostId: string, streamId: string): Promise<void> {
    if (!window.electron) {
      return;
    }

    await window.electron.ssh.close(hostId, streamId);
  }
}

export const sshService = new SSHService();
