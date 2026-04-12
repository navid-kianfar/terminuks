import { app, ipcMain } from 'electron';
import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

interface SSHConnection {
  client: any;
  connected: boolean;
  streams: Map<string, any>;
}

const connections = new Map<string, SSHConnection>();
const trustedHostsPath = path.join(app.getPath('userData'), 'storage', 'trusted-hosts.json');

const loadTrustedHosts = (): Record<string, string[]> => {
  if (!fs.existsSync(trustedHostsPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(trustedHostsPath, 'utf8')) as Record<string, string[]>;
  } catch {
    return {};
  }
};

const saveTrustedHosts = (trustedHosts: Record<string, string[]>) => {
  fs.mkdirSync(path.dirname(trustedHostsPath), { recursive: true });
  fs.writeFileSync(trustedHostsPath, JSON.stringify(trustedHosts, null, 2));
};

const getTrustedHostKey = (hostConfig: any) => `${hostConfig.address}:${hostConfig.port || 22}`;

ipcMain.handle('ssh:connect', async (_, hostConfig: any) => {
  const existingConnection = connections.get(hostConfig.id);
  if (existingConnection?.connected) {
    return { success: true };
  }

  if (existingConnection) {
    try {
      existingConnection.client.end();
    } catch {
      // Ignore cleanup failures while replacing a stale connection.
    }
    connections.delete(hostConfig.id);
  }

  return new Promise((resolve, reject) => {
    const client = new Client();
    let pendingFingerprint: string | null = null;
    const config: any = {
      host: hostConfig.address,
      port: hostConfig.port || 22,
      username: hostConfig.username,
      readyTimeout: 45000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      hostVerifier: (key: Buffer) => {
        const fingerprint = `SHA256:${createHash('sha256').update(key).digest('base64')}`;
        const trustedHosts = loadTrustedHosts();
        const trustedFingerprints = trustedHosts[getTrustedHostKey(hostConfig)] || [];

        if (trustedFingerprints.includes(fingerprint)) {
          return true;
        }

        pendingFingerprint = fingerprint;
        return false;
      },
    };

    // Handle authentication
    if (hostConfig.authMethod === 'password' && hostConfig.password) {
      config.password = hostConfig.password;
    } else if (hostConfig.authMethod === 'key' && hostConfig.keyData) {
      config.privateKey = hostConfig.keyData;
      if (hostConfig.passphrase) {
        config.passphrase = hostConfig.passphrase;
      }
    } else if (hostConfig.authMethod === 'keyFile' && hostConfig.keyPath) {
      try {
        const keyData = fs.readFileSync(hostConfig.keyPath, 'utf8');
        config.privateKey = keyData;
        if (hostConfig.passphrase) {
          config.passphrase = hostConfig.passphrase;
        }
      } catch (error: any) {
        reject(new Error(`Failed to read key file: ${error.message}`));
        return;
      }
    } else {
      reject(new Error('No valid authentication method configured'));
      return;
    }

    const connection: SSHConnection = {
      client,
      connected: false,
      streams: new Map(),
    };

    client.on('ready', () => {
      connection.connected = true;
      connections.set(hostConfig.id, connection);
      resolve({ success: true });
    });

    client.on('close', () => {
      connection.connected = false;
      connection.streams.clear();
    });

    client.on('end', () => {
      connection.connected = false;
      connection.streams.clear();
    });

    client.on('error', (err: Error) => {
      connection.connected = false;
      if (pendingFingerprint) {
        reject({
          code: 'HOST_VERIFICATION_REQUIRED',
          message: `The authenticity of ${hostConfig.address} can't be established.`,
          fingerprint: pendingFingerprint,
          host: hostConfig.address,
          port: hostConfig.port || 22,
        });
        return;
      }
      reject(err);
    });

    client.connect(config);
  });
});

ipcMain.handle('ssh:trustHost', async (_, hostConfig: any, fingerprint: string) => {
  const trustedHosts = loadTrustedHosts();
  const key = getTrustedHostKey(hostConfig);
  const current = trustedHosts[key] || [];
  if (!current.includes(fingerprint)) {
    trustedHosts[key] = [...current, fingerprint];
    saveTrustedHosts(trustedHosts);
  }
});

ipcMain.handle('ssh:disconnect', async (_, hostId: string) => {
  const connection = connections.get(hostId);
  if (connection) {
    connection.client.end();
    connections.delete(hostId);
  }
});

ipcMain.handle('ssh:shell', async (event, hostId: string) => {
  return new Promise((resolve, reject) => {
    const connection = connections.get(hostId);
    if (!connection || !connection.connected) {
      reject(new Error('Not connected to host'));
      return;
    }

    connection.client.shell((err: Error | undefined, stream: any) => {
      if (err) {
        reject(err);
        return;
      }

      const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      connection.streams.set(streamId, stream);

      // Forward stream data to renderer via IPC
      stream.on('data', (data: Buffer) => {
        event.sender.send('ssh:stream-data', hostId, streamId, data.toString());
      });

      stream.stderr.on('data', (data: Buffer) => {
        event.sender.send('ssh:stream-data', hostId, streamId, data.toString());
      });

      stream.on('close', () => {
        connection.streams.delete(streamId);
        event.sender.send('ssh:stream-close', hostId, streamId);
      });

      resolve({ streamId });
    });
  });
});

ipcMain.handle('ssh:write', async (_, hostId: string, streamId: string, data: string) => {
  const connection = connections.get(hostId);
  if (!connection) {
    throw new Error('Not connected to host');
  }

  const stream = connection.streams.get(streamId);
  if (!stream) {
    throw new Error('Stream not found');
  }

  stream.write(data);
});

ipcMain.handle('ssh:close', async (_, hostId: string, streamId: string) => {
  const connection = connections.get(hostId);
  if (!connection) {
    return;
  }

  const stream = connection.streams.get(streamId);
  if (!stream) {
    return;
  }

  stream.end('exit\n');
  connection.streams.delete(streamId);
});
