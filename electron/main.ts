import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import initSqlJs from 'sql.js';
import './ssh-handler';
import './sftp-handler';
import './local-shell-handler';

type StoredValue = string | number | boolean | null | Record<string, unknown> | unknown[];

class EncryptedSqliteStore {
  private db: any;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init() {
    const SQL = await initSqlJs({
      locateFile: (file: string) => path.join(app.getAppPath(), 'node_modules/sql.js/dist', file),
    });

    if (fs.existsSync(this.filePath)) {
      const encrypted = fs.readFileSync(this.filePath);
      const serializedBase64 = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(encrypted)
        : encrypted.toString('utf8');
      const bytes = Uint8Array.from(Buffer.from(serializedBase64, 'base64'));
      this.db = new SQL.Database(bytes);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.migrateLegacyStore();
    this.persist();
  }

  get(key: string): StoredValue | undefined {
    const result = this.db.exec('SELECT value FROM kv_store WHERE key = ?', [key]);
    if (!result.length || !result[0].values.length) {
      return undefined;
    }

    return JSON.parse(result[0].values[0][0] as string);
  }

  set(key: string, value: StoredValue) {
    this.db.run(
      `
        INSERT INTO kv_store (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at;
      `,
      [key, JSON.stringify(value), Date.now()]
    );
    this.persist();
  }

  delete(key: string) {
    this.db.run('DELETE FROM kv_store WHERE key = ?', [key]);
    this.persist();
  }

  getAll(): Record<string, StoredValue> {
    const result = this.db.exec('SELECT key, value FROM kv_store');
    if (!result.length) {
      return {};
    }

    return result[0].values.reduce((acc: Record<string, StoredValue>, row: unknown[]) => {
      acc[String(row[0])] = JSON.parse(String(row[1]));
      return acc;
    }, {});
  }

  private migrateLegacyStore() {
    const hasRows = this.db.exec('SELECT key FROM kv_store LIMIT 1');
    if (hasRows.length && hasRows[0].values.length) {
      return;
    }

    const legacyPath = path.join(app.getPath('userData'), 'config.json');
    if (!fs.existsSync(legacyPath)) {
      return;
    }

    try {
      const legacyStore = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as Record<
        string,
        StoredValue
      >;
      Object.entries(legacyStore).forEach(([key, value]) => this.set(key, value));
    } catch (error) {
      console.warn('Legacy store migration skipped:', error);
    }
  }

  private persist() {
    const serialized = Buffer.from(this.db.export()).toString('base64');
    const payload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(serialized)
      : Buffer.from(serialized, 'utf8');
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, payload);
  }
}

let mainWindow: BrowserWindow | null = null;
let store: EncryptedSqliteStore;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const isDevelopment = !app.isPackaged || process.env.NODE_ENV === 'development';
const execFileAsync = promisify(execFile);

const getCompressedFileKind = (name: string) => {
  const normalized = name.toLowerCase();

  if (normalized.endsWith('.tar.gz') || normalized.endsWith('.tgz')) {
    return 'tar.gz';
  }
  if (normalized.endsWith('.tar')) {
    return 'tar';
  }
  if (normalized.endsWith('.zip')) {
    return 'zip';
  }
  if (normalized.endsWith('.gz')) {
    return 'gz';
  }

  return null;
};

const runLocalCommand = async (command: string, args: string[], cwd: string) => {
  try {
    return await execFileAsync(command, args, { cwd });
  } catch (error: any) {
    throw new Error(error?.stderr?.trim() || error?.message || 'Local command failed');
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#09111f',
    titleBarStyle: 'default',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (isDevelopment) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  store = new EncryptedSqliteStore(
    path.join(app.getPath('userData'), 'storage', 'terminuks.db.enc')
  );
  await store.init();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('store:get', (_, key: string) => store.get(key));
ipcMain.handle('store:set', (_, key: string, value: StoredValue) => {
  store.set(key, value);
});
ipcMain.handle('store:delete', (_, key: string) => {
  store.delete(key);
});
ipcMain.handle('store:getAll', () => store.getAll());

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
  });
  return result;
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result;
});

ipcMain.handle('dialog:saveFile', async (_, options: Electron.SaveDialogOptions) => {
  const result = await dialog.showSaveDialog(mainWindow!, options);
  return result;
});

ipcMain.handle('localfs:list', async (_, dirPath: string) => {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const mapped = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const stat = await fs.promises.stat(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modifyTime: stat.mtimeMs,
      };
    })
  );

  return mapped.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
});

ipcMain.handle('localfs:home', async () => os.homedir());

ipcMain.handle('localfs:readFile', async (_, filePath: string) => {
  return fs.promises.readFile(filePath, 'utf8');
});

ipcMain.handle('localfs:writeFile', async (_, filePath: string, content: string) => {
  await fs.promises.writeFile(filePath, content, 'utf8');
});

ipcMain.handle('localfs:createFile', async (_, filePath: string) => {
  await fs.promises.writeFile(filePath, '', 'utf8');
});

ipcMain.handle('localfs:createDirectory', async (_, dirPath: string) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
});

ipcMain.handle('localfs:rename', async (_, oldPath: string, newPath: string) => {
  await fs.promises.rename(oldPath, newPath);
});

ipcMain.handle('localfs:delete', async (_, targetPaths: string[]) => {
  for (const targetPath of targetPaths) {
    await fs.promises.rm(targetPath, { recursive: true, force: false });
  }
});

ipcMain.handle(
  'localfs:compress',
  async (_, basePath: string, names: string[], archiveName: string) => {
    if (names.length === 0) {
      throw new Error('No files selected for compression');
    }

    await runLocalCommand('tar', ['-czf', archiveName, '--', ...names], basePath);
    return path.join(basePath, archiveName);
  }
);

ipcMain.handle('localfs:decompress', async (_, filePath: string) => {
  const cwd = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const kind = getCompressedFileKind(fileName);

  if (!kind) {
    throw new Error('Unsupported compressed file type');
  }

  if (kind === 'tar.gz') {
    await runLocalCommand('tar', ['-xzf', fileName], cwd);
  } else if (kind === 'tar') {
    await runLocalCommand('tar', ['-xf', fileName], cwd);
  } else if (kind === 'zip') {
    if (process.platform === 'win32') {
      await runLocalCommand('tar', ['-xf', fileName], cwd);
    } else {
      await runLocalCommand('unzip', ['-oq', fileName], cwd);
    }
  } else {
    await runLocalCommand('gunzip', ['-kf', fileName], cwd);
  }

  return cwd;
});
