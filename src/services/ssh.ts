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

interface SSHConnectResultSuccess {
  success: true;
}

interface SSHConnectResultVerificationRequired {
  success: false;
  code: 'HOST_VERIFICATION_REQUIRED';
  fingerprint: string;
  host: string;
  port: number;
}

type SSHConnectResult = SSHConnectResultSuccess | SSHConnectResultVerificationRequired;

class SSHService {
  private connections: Map<string, SSHConnection> = new Map();

  async connect(host: Host): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }

    try {
      const result = (await window.electron.ssh.connect(host)) as SSHConnectResult;
      if (!result.success && result.code === 'HOST_VERIFICATION_REQUIRED') {
        const trustError = new Error(
          `The authenticity of ${result.host} can't be established.`
        ) as SSHHostVerificationError;
        trustError.code = 'HOST_VERIFICATION_REQUIRED';
        trustError.fingerprint = result.fingerprint;
        trustError.host = result.host;
        trustError.port = result.port;
        throw trustError;
      }

      this.connections.set(host.id, {
        connected: true,
        host,
      });
    } catch (error: unknown) {
      // Check for host verification requirement
      const errObj = error as any;
      if (
        errObj &&
        typeof errObj === 'object' &&
        (errObj.code === 'HOST_VERIFICATION_REQUIRED' ||
          (errObj.message && errObj.message.includes('HOST_VERIFICATION_REQUIRED')))
      ) {
        const trustError = new Error(
          `The authenticity of ${String(errObj.host || host.address)} can't be established.`
        ) as SSHHostVerificationError;
        trustError.code = 'HOST_VERIFICATION_REQUIRED';
        trustError.fingerprint = String(errObj.fingerprint || '');
        trustError.host = String(errObj.host || host.address);
        trustError.port = Number(errObj.port || host.port);
        throw trustError;
      }

      const verificationMessage =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      if (
        typeof verificationMessage === 'string' &&
        verificationMessage.includes("can't be established")
      ) {
        const trustError = new Error(verificationMessage) as SSHHostVerificationError;
        trustError.code = 'HOST_VERIFICATION_REQUIRED';
        trustError.fingerprint = '';
        trustError.host = host.address;
        trustError.port = host.port;
        throw trustError;
      }

      let message = 'Unknown SSH connection error';
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        message = String((error as any).message);
      }

      // Handle Electron IPC prefix and [object Object] cases
      const cleanedMessage = message
        .replace(/^Error invoking remote method 'ssh:connect':\s*/, '')
        .replace(/^Error invoking remote method 'ssh:connect':\s*/, ''); // double check for nesting

      if (cleanedMessage === '[object Object]' || !cleanedMessage) {
        try {
          const stringified = JSON.stringify(error);
          if (stringified !== '{}' && stringified !== 'null') {
            message = stringified;
          } else {
            message =
              'SSH connection failed (unspecified error). Please check your server settings, network connection, and credentials.';
          }
        } catch {
          message =
            'SSH connection failed (unspecified error). Please check your server settings, network connection, and credentials.';
        }
      } else {
        message = cleanedMessage;
      }

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
