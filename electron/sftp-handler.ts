import { ipcMain } from 'electron';
import SftpClient from 'ssh2-sftp-client';
import * as fs from 'fs';

const clients = new Map<string, any>();
const configs = new Map<string, any>();

const createSftpConfig = (hostConfig: any) => {
  const config: any = {
    host: hostConfig.address,
    port: hostConfig.port || 22,
    username: hostConfig.username,
    readyTimeout: 20000,
  };

  if (hostConfig.authMethod === 'password' && hostConfig.password) {
    config.password = hostConfig.password;
  } else if (hostConfig.authMethod === 'key' && hostConfig.keyData) {
    config.privateKey = hostConfig.keyData;
    if (hostConfig.passphrase) {
      config.passphrase = hostConfig.passphrase;
    }
  } else if (hostConfig.authMethod === 'keyFile' && hostConfig.keyPath) {
    const keyData = fs.readFileSync(hostConfig.keyPath, 'utf8');
    config.privateKey = keyData;
    if (hostConfig.passphrase) {
      config.passphrase = hostConfig.passphrase;
    }
  } else {
    throw new Error('No valid authentication method configured');
  }

  return config;
};

ipcMain.handle('sftp:connect', async (_, hostConfig: any) => {
  const existingClient = clients.get(hostConfig.id);
  if (existingClient) {
    try {
      await existingClient.end();
    } catch {
      // Ignore stale client shutdown failures.
    }
  }

  const client = new SftpClient();
  const config = createSftpConfig(hostConfig);

  await client.connect(config);
  clients.set(hostConfig.id, client);
  configs.set(hostConfig.id, hostConfig);
  return { success: true };
});

ipcMain.handle('sftp:disconnect', async (_, hostId: string) => {
  const client = clients.get(hostId);
  if (client) {
    await client.end();
    clients.delete(hostId);
  }
  configs.delete(hostId);
});

const withClient = async <T>(hostId: string, operation: (client: any) => Promise<T>): Promise<T> => {
  const runOperation = async () => {
    const client = clients.get(hostId);
    if (!client) {
      throw new Error('Not connected to host');
    }
    return operation(client);
  };

  try {
    return await runOperation();
  } catch (error: any) {
    if (!String(error?.message || '').includes('ECONNRESET')) {
      throw error;
    }

    const hostConfig = configs.get(hostId);
    if (!hostConfig) {
      throw error;
    }

    const reconnectClient = new SftpClient();
    await reconnectClient.connect(createSftpConfig(hostConfig));
    clients.set(hostId, reconnectClient);
    return operation(reconnectClient);
  }
};

ipcMain.handle('sftp:list', async (_, hostId: string, remotePath: string) => {
  return withClient(hostId, async (client) => client.list(remotePath));
});

ipcMain.handle('sftp:download', async (event, hostId: string, remotePath: string, localPath: string, transferId?: string) => {
  await withClient(hostId, async (client) => {
    const options: any = {};
    if (transferId) {
      options.step = (total: number, _chunk: number, totalSize: number) => {
        const progress = Math.round((total / totalSize) * 100);
        event.sender.send('sftp:progress', { transferId, progress });
      };
    }
    return client.fastGet(remotePath, localPath, options);
  });
});

ipcMain.handle('sftp:upload', async (event, hostId: string, localPath: string, remotePath: string, transferId?: string) => {
  await withClient(hostId, async (client) => {
    const options: any = {};
    if (transferId) {
      options.step = (total: number, _chunk: number, totalSize: number) => {
        const progress = Math.round((total / totalSize) * 100);
        event.sender.send('sftp:progress', { transferId, progress });
      };
    }
    return client.fastPut(localPath, remotePath, options);
  });
});

ipcMain.handle('sftp:delete', async (_, hostId: string, remotePath: string) => {
  await withClient(hostId, async (client) => client.delete(remotePath));
});

ipcMain.handle('sftp:mkdir', async (_, hostId: string, remotePath: string) => {
  await withClient(hostId, async (client) => client.mkdir(remotePath, true));
});

ipcMain.handle('sftp:rmdir', async (_, hostId: string, remotePath: string) => {
  await withClient(hostId, async (client) => client.rmdir(remotePath, true));
});

ipcMain.handle('sftp:rename', async (_, hostId: string, oldPath: string, newPath: string) => {
  await withClient(hostId, async (client) => client.rename(oldPath, newPath));
});

ipcMain.handle('sftp:stat', async (_, hostId: string, remotePath: string) => {
  return withClient(hostId, async (client) => client.stat(remotePath));
});

ipcMain.handle('sftp:readFile', async (_, hostId: string, remotePath: string) => {
  const content = await withClient(hostId, async (client) =>
    client.get(remotePath, undefined, { encoding: 'utf8' })
  );
  return Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
});

ipcMain.handle('sftp:writeFile', async (_, hostId: string, remotePath: string, content: string) => {
  await withClient(hostId, async (client) =>
    client.put(Buffer.from(content, 'utf8'), remotePath, { encoding: 'utf8' })
  );
});
