import { app, ipcMain } from 'electron';
import { spawn as spawnPty, IPty } from 'node-pty';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface LocalShellStream {
  process: IPty | ChildProcessWithoutNullStreams;
  control?: NodeJS.WritableStream;
  mode: 'pty' | 'bridge';
}

const localShellStreams = new Map<string, LocalShellStream>();

const isExecutable = (candidate: string | undefined) => {
  if (!candidate) {
    return false;
  }

  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const createLocalShellCommand = () => {
  if (process.platform === 'win32') {
    const command =
      process.env.COMSPEC ||
      process.env.POWERSHELL_DISTRIBUTION_CHANNEL ||
      'powershell.exe';
    return {
      command,
      args: command.toLowerCase().includes('powershell') ? ['-NoLogo'] : [],
    };
  }

  const shellCandidates = [
    process.env.SHELL,
    os.userInfo().shell,
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
  ].filter((value, index, items): value is string => Boolean(value) && items.indexOf(value) === index);

  const shell = shellCandidates.find((candidate) => isExecutable(candidate)) || '/bin/sh';
  const shellName = path.basename(shell).toLowerCase();

  if (shellName === 'fish') {
    return {
      command: shell,
      args: ['-l'],
    };
  }

  if (shellName === 'nu') {
    return {
      command: shell,
      args: [],
    };
  }

  return {
    command: shell,
    args: ['-il'],
  };
};

const getPythonExecutable = () => {
  const candidates = ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3'];
  return candidates.find((candidate) => isExecutable(candidate)) || 'python3';
};

ipcMain.handle('localShell:start', async (event, options?: { cols?: number; rows?: number }) => {
  const { command, args } = createLocalShellCommand();
  const streamId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  if (process.platform === 'win32') {
    const pty = spawnPty(command, args, {
      name: 'xterm-256color',
      cols: Math.max(40, options?.cols || 120),
      rows: Math.max(12, options?.rows || 32),
      cwd: os.homedir(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    localShellStreams.set(streamId, { process: pty, mode: 'pty' });

    pty.onData((data) => {
      event.sender.send('localShell:data', streamId, data);
    });

    pty.onExit(() => {
      localShellStreams.delete(streamId);
      event.sender.send('localShell:close', streamId);
    });
  } else {
    const bridgePath = path.join(app.getAppPath(), 'electron', 'local-shell-bridge.py');
    const python = getPythonExecutable();
    const child = spawn(
      python,
      [
        bridgePath,
        command,
        String(Math.max(40, options?.cols || 120)),
        String(Math.max(12, options?.rows || 32)),
        ...args,
      ],
      {
        cwd: os.homedir(),
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      }
    );

    localShellStreams.set(streamId, {
      process: child,
      control: child.stdio[3] as NodeJS.WritableStream,
      mode: 'bridge',
    });

    child.stdout.on('data', (data: Buffer) => {
      event.sender.send('localShell:data', streamId, data.toString());
    });

    child.stderr.on('data', (data: Buffer) => {
      event.sender.send('localShell:data', streamId, data.toString());
    });

    child.on('close', () => {
      localShellStreams.delete(streamId);
      event.sender.send('localShell:close', streamId);
    });
  }

  return { streamId };
});

ipcMain.handle('localShell:write', async (_, streamId: string, data: string) => {
  const stream = localShellStreams.get(streamId);
  if (!stream) {
    throw new Error('Local shell stream not found');
  }

  if (stream.mode === 'pty') {
    (stream.process as IPty).write(data);
  } else {
    (stream.process as ChildProcessWithoutNullStreams).stdin.write(data);
  }
});

ipcMain.handle('localShell:resize', async (_, streamId: string, cols: number, rows: number) => {
  const stream = localShellStreams.get(streamId);
  if (!stream) {
    return;
  }

  if (stream.mode === 'pty') {
    (stream.process as IPty).resize(Math.max(40, cols), Math.max(12, rows));
    return;
  }

  stream.control?.write(
    `${JSON.stringify({
      type: 'resize',
      cols: Math.max(40, cols),
      rows: Math.max(12, rows),
    })}\n`
  );
});

ipcMain.handle('localShell:close', async (_, streamId: string) => {
  const stream = localShellStreams.get(streamId);
  if (!stream) {
    return;
  }

  if (stream.mode === 'pty') {
    (stream.process as IPty).kill();
  } else {
    (stream.process as ChildProcessWithoutNullStreams).kill();
  }
  localShellStreams.delete(streamId);
});
