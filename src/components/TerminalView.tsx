import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import type { IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { AlertTriangle, Check, RotateCcw, Search, Shield, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useHosts } from '../contexts/HostContext';
import { useTerminal } from '../contexts/TerminalContext';
import { SSHHostVerificationError, sshService } from '../services/ssh';
import SSHWorkspace from './SSHWorkspace';
import Button from './ui/button';
import '@xterm/xterm/css/xterm.css';
import './TerminalView.css';

interface TerminalViewProps {
  sessionId: string;
}

const TerminalView = ({ sessionId }: TerminalViewProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const cleanupListenersRef = useRef<(() => void)[]>([]);
  const inputDisposableRef = useRef<IDisposable | null>(null);
  const streamIdRef = useRef<string | undefined>(undefined);
  const pendingRemoteShellCloseRef = useRef<Promise<void> | null>(null);
  const localStreamIdRef = useRef<string | undefined>(undefined);
  const { getHost } = useHosts();
  const { settings, themes } = useTheme();
  const { getSession, updateSession, removeSession } = useTerminal();
  const session = getSession(sessionId);
  const sessionHostId = session?.hostId;
  const sessionType = session?.type;
  const host = sessionHostId ? getHost(sessionHostId) : undefined;
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'terminal' | 'files'>('terminal');

  const [sessionStatus, setSessionStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'
  >('idle');
  const [trustPrompt, setTrustPrompt] = useState<{
    fingerprint: string;
    host: string;
    port: number;
  } | null>(null);
  const [showConnectionLogs, setShowConnectionLogs] = useState(false);
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]);

  const isLocalSession = sessionType === 'local';

  const appendConnectionLog = useCallback((message: string) => {
    setConnectionLogs((current) => [...current.slice(-19), message]);
  }, []);

  const closeConnectionOverlay = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (host && window.electron) {
      sshService.disconnect(host.id).catch(() => undefined);
    }
    setTrustPrompt(null);
    setShowConnectionLogs(false);
    setSessionStatus('disconnected');
    setStatusMessage('SSH connection canceled');
    updateSession(sessionId, {
      status: 'disconnected',
      lastError: 'SSH connection canceled',
      streamId: undefined,
    });
  }, [host, sessionId, updateSession]);

  const getTerminalTheme = useCallback(() => {
    const theme = themes[settings.theme] || themes.dark;
    return {
      background: 'rgba(0, 0, 0, 0)',
      foreground: theme.foreground,
      cursor: theme.cursor,
      black: theme.colors.black,
      red: theme.colors.red,
      green: theme.colors.green,
      yellow: theme.colors.yellow,
      blue: theme.colors.blue,
      magenta: theme.colors.magenta,
      cyan: theme.colors.cyan,
      white: theme.colors.white,
      brightBlack: theme.colors.brightBlack,
      brightRed: theme.colors.brightRed,
      brightGreen: theme.colors.brightGreen,
      brightYellow: theme.colors.brightYellow,
      brightBlue: theme.colors.brightBlue,
      brightMagenta: theme.colors.brightMagenta,
      brightCyan: theme.colors.brightCyan,
      brightWhite: theme.colors.brightWhite,
    };
  }, [settings.theme, themes]);

  const setupMockTerminal = useCallback(
    (terminal: XTerm) => {
      terminal.clear();
      terminal.writeln(
        isLocalSession
          ? '\x1b[1;34mLocal terminal preview is active.\x1b[0m'
          : '\x1b[1;33mInteractive preview shell is active.\x1b[0m'
      );
      if (isLocalSession) {
        terminal.writeln(
          '\x1b[0;37mThe local shell backend is unavailable right now, so this tab has fallen back to preview mode.\x1b[0m'
        );
      }
      terminal.write('\r\n$ ');

      let currentLine = '';
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = terminal.onData((data) => {
        if (data === '\r') {
          terminal.write('\r\n');
          handleCommand(terminal, currentLine);
          currentLine = '';
          terminal.write('$ ');
        } else if (data === '\x7f' || data === '\b') {
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            terminal.write('\b \b');
          }
        } else if (data === '\x03') {
          terminal.write('^C\r\n$ ');
          currentLine = '';
        } else {
          currentLine += data;
          terminal.write(data);
        }
      });
    },
    [isLocalSession]
  );

  const connectLocalShell = useCallback(
    async (terminal: XTerm) => {
      cleanupListenersRef.current.forEach((cleanup) => cleanup());
      cleanupListenersRef.current = [];
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      localStreamIdRef.current = undefined;

      updateSession(sessionId, { status: 'connecting', lastError: undefined, streamId: undefined });
      setSessionStatus('connecting');
      setStatusMessage('Starting local shell...');
      terminal.clear();

      try {
        if (!window.electron) {
          throw new Error('Electron API not available');
        }

        const removeDataListener = window.electron.localShell.onData((streamId, data) => {
          if (streamId === localStreamIdRef.current) {
            terminal.write(data);
          }
        });

        const removeCloseListener = window.electron.localShell.onClose((streamId) => {
          if (streamId === localStreamIdRef.current) {
            terminal.writeln('\r\n\x1b[1;33mLocal shell closed.\x1b[0m');
            updateSession(sessionId, { status: 'disconnected', streamId: undefined });
            setSessionStatus('disconnected');
            setStatusMessage('Local shell closed');
            localStreamIdRef.current = undefined;
          }
        });

        cleanupListenersRef.current.push(removeDataListener, removeCloseListener);

        const { streamId } = await window.electron.localShell.start({
          cols: terminal.cols,
          rows: terminal.rows,
        });
        localStreamIdRef.current = streamId;
        updateSession(sessionId, { status: 'connected', streamId, lastError: undefined });
        setSessionStatus('connected');
        setStatusMessage('Local shell connected');
        terminal.focus();

        inputDisposableRef.current = terminal.onData((data) => {
          if (localStreamIdRef.current) {
            window.electron.localShell.write(localStreamIdRef.current, data).catch((error) => {
              const message = error instanceof Error ? error.message : 'Local shell write failed';
              updateSession(sessionId, { status: 'error', lastError: message });
              setSessionStatus('error');
              setStatusMessage(message);
            });
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start local shell';
        updateSession(sessionId, { status: 'error', lastError: message, streamId: undefined });
        setSessionStatus('error');
        setStatusMessage(message);
        terminal.writeln(`\x1b[1;31m${message}\x1b[0m`);
        setupMockTerminal(terminal);
      }
    },
    [sessionId, setupMockTerminal, updateSession]
  );

  const closeActiveRemoteShell = useCallback(
    async (hostId: string | undefined) => {
      if (!hostId) {
        return;
      }

      const activeStreamId = streamIdRef.current;
      if (!activeStreamId) {
        if (pendingRemoteShellCloseRef.current) {
          await pendingRemoteShellCloseRef.current;
        }
        return;
      }

      streamIdRef.current = undefined;
      updateSession(sessionId, { streamId: undefined });

      const closePromise = sshService
        .closeShell(hostId, activeStreamId)
        .catch(() => undefined)
        .finally(() => {
          if (pendingRemoteShellCloseRef.current === closePromise) {
            pendingRemoteShellCloseRef.current = null;
          }
        });

      pendingRemoteShellCloseRef.current = closePromise;
      await closePromise;
    },
    [sessionId, updateSession]
  );

  const connectSSH = useCallback(
    async (terminal: XTerm, nextHost: NonNullable<typeof host>) => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      cleanupListenersRef.current.forEach((cleanup) => cleanup());
      cleanupListenersRef.current = [];
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      await closeActiveRemoteShell(sessionHostId ?? nextHost.id);
      window.dispatchEvent(new CustomEvent('terminuks:collapse-sidebar'));
      updateSession(sessionId, { status: 'connecting', lastError: undefined, streamId: undefined });
      setSessionStatus('connecting');
      setStatusMessage(
        `Connecting to ${nextHost.username}@${nextHost.address}:${nextHost.port}...`
      );
      setTrustPrompt(null);
      setShowConnectionLogs(false);
      setConnectionLogs([
        `Starting SSH connection to ${nextHost.username}@${nextHost.address}:${nextHost.port}`,
        'Opening transport',
      ]);
      terminal.clear();

      try {
        if (!window.electron) {
          updateSession(sessionId, {
            status: 'disconnected',
            lastError: 'Electron API not available. Browser mode is demo-only.',
          });
          setSessionStatus('disconnected');
          setStatusMessage('Browser mode is demo-only. Use the Electron app for real SSH.');
          terminal.writeln(`\x1b[1;31mElectron API not available. Running in browser mode.\x1b[0m`);
          terminal.writeln(
            `\x1b[1;33mPlease use the Electron app for full SSH functionality.\x1b[0m`
          );
          setupMockTerminal(terminal);
          return;
        }

        await sshService.connect(nextHost);
        appendConnectionLog('SSH transport ready');

        let removeDataListener = () => undefined;
        let removeCloseListener = () => undefined;

        const attachStream = (streamId: string) => {
          removeDataListener();
          removeCloseListener();
          inputDisposableRef.current?.dispose();

          updateSession(sessionId, {
            status: 'connected',
            streamId,
            lastError: undefined,
          });
          appendConnectionLog('Interactive shell attached');
          streamIdRef.current = streamId;
          setSessionStatus('connected');
          setStatusMessage(`Connected to ${nextHost.username}@${nextHost.address}`);

          removeDataListener = window.electron.ssh.onStreamData((incomingHostId, sid, data) => {
            if (incomingHostId === nextHost.id && sid === streamId) {
              terminal.write(data);
            }
          });

          removeCloseListener = window.electron.ssh.onStreamClose((incomingHostId, sid) => {
            if (incomingHostId === nextHost.id && sid === streamId) {
              terminal.writeln('\r\n\x1b[1;33mConnection closed.\x1b[0m');
              updateSession(sessionId, {
                status: 'reconnecting',
                streamId: undefined,
                lastError: 'Connection closed. Attempting to reconnect...',
              });
              streamIdRef.current = undefined;
              setSessionStatus('reconnecting');
              setStatusMessage('Connection closed. Attempting to reconnect...');
              appendConnectionLog('Connection closed, attempting automatic reconnect');
              removeDataListener();
              removeCloseListener();
              reconnectTimeoutRef.current = window.setTimeout(() => {
                connectSSH(terminal, nextHost);
              }, 2000);
            }
          });

          inputDisposableRef.current = terminal.onData((data) => {
            sshService.writeToShell(nextHost.id, streamId, data).catch(async (error) => {
              if (error instanceof Error && error.message.includes('Stream not found')) {
                try {
                  const replacementStreamId = await sshService.createShell(nextHost.id);
                  attachStream(replacementStreamId);
                  await sshService.writeToShell(nextHost.id, replacementStreamId, data);
                  terminal.writeln('\r\n\x1b[1;33mSSH shell was refreshed.\x1b[0m');
                  return;
                } catch (recoveryError) {
                  const recoveryMessage =
                    recoveryError instanceof Error
                      ? recoveryError.message
                      : 'Failed to recover SSH stream';
                  updateSession(sessionId, { status: 'error', lastError: recoveryMessage });
                  setSessionStatus('error');
                  setStatusMessage(`SSH recovery failed: ${recoveryMessage}`);
                  terminal.write(`\r\n\x1b[1;31mError: ${recoveryMessage}\x1b[0m\r\n`);
                  return;
                }
              }

              const message = error instanceof Error ? error.message : 'Unknown SSH write error';
              updateSession(sessionId, { status: 'error', lastError: message });
              setSessionStatus('error');
              setStatusMessage(`SSH write failed: ${message}`);
              terminal.write(`\r\n\x1b[1;31mError: ${message}\x1b[0m\r\n`);
            });
          });

          terminal.onKey(({ domEvent }) => {
            if (domEvent.ctrlKey && domEvent.key.toLowerCase() === 'l') {
              terminal.clear();
            }
          });
        };

        const streamId = await sshService.createShell(nextHost.id);
        attachStream(streamId);
        cleanupListenersRef.current.push(
          () => removeDataListener(),
          () => removeCloseListener()
        );
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error as SSHHostVerificationError).code === 'HOST_VERIFICATION_REQUIRED'
        ) {
          const trustError = error as SSHHostVerificationError;
          updateSession(sessionId, {
            status: 'disconnected',
            streamId: undefined,
            lastError: trustError.message,
          });
          setSessionStatus('disconnected');
          setStatusMessage('Awaiting host fingerprint confirmation');
          appendConnectionLog(`Host verification required: ${trustError.fingerprint}`);
          setTrustPrompt({
            fingerprint: trustError.fingerprint,
            host: trustError.host,
            port: trustError.port,
          });
          terminal.writeln('\x1b[1;33mHost verification required before connecting.\x1b[0m');
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown SSH connection error';
        const friendlyMessage = message.includes('Timed out while waiting for handshake')
          ? 'SSH handshake timed out. Check the server address, port, firewall, and whether the host is reachable from this machine.'
          : message;
        updateSession(sessionId, {
          status: 'error',
          streamId: undefined,
          lastError: friendlyMessage,
        });
        setSessionStatus('error');
        setStatusMessage(`Connection failed: ${friendlyMessage}`);
        appendConnectionLog(`Connection failed: ${friendlyMessage}`);
        terminal.writeln(`\x1b[1;31mConnection failed: ${friendlyMessage}\x1b[0m`);
        terminal.writeln(`\x1b[1;33mFalling back to mock terminal...\x1b[0m`);
        setupMockTerminal(terminal);
      }
    },
    [
      appendConnectionLog,
      closeActiveRemoteShell,
      sessionHostId,
      sessionId,
      setupMockTerminal,
      updateSession,
    ]
  );

  useEffect(() => {
    if (!terminalRef.current || !sessionType) return;

    const theme = themes[settings.theme] || themes.dark;
    const terminal = new XTerm({
      allowProposedApi: true,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      bellStyle: settings.bellStyle,
      scrollback: settings.scrollback,
      wordSeparator: settings.wordSeparator,
      theme: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: theme.foreground,
        cursor: theme.cursor,
        black: theme.colors.black,
        red: theme.colors.red,
        green: theme.colors.green,
        yellow: theme.colors.yellow,
        blue: theme.colors.blue,
        magenta: theme.colors.magenta,
        cyan: theme.colors.cyan,
        white: theme.colors.white,
        brightBlack: theme.colors.brightBlack,
        brightRed: theme.colors.brightRed,
        brightGreen: theme.colors.brightGreen,
        brightYellow: theme.colors.brightYellow,
        brightBlue: theme.colors.brightBlue,
        brightMagenta: theme.colors.brightMagenta,
        brightCyan: theme.colors.brightCyan,
        brightWhite: theme.colors.brightWhite,
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    const unicode11Addon = new Unicode11Addon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    terminal.open(terminalRef.current);
    fitAddon.fit();
    terminal.focus();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const focusTerminal = () => terminal.focus();
    terminalRef.current.addEventListener('mousedown', focusTerminal);

    if (isLocalSession) {
      connectLocalShell(terminal);
    } else if (host) {
      connectSSH(terminal, host);
    } else {
      updateSession(sessionId, {
        status: 'disconnected',
        lastError: 'Select a saved host to connect this terminal.',
        streamId: undefined,
      });
      setSessionStatus('disconnected');
      setStatusMessage('This terminal is waiting for a host selection.');
      terminal.clear();
      terminal.writeln('\x1b[1;33mNo host selected for this terminal.\x1b[0m');
      terminal.writeln(
        '\x1b[0;37mCreate terminals from the picker to bind them to a saved host.\x1b[0m'
      );
    }

    const handleResize = () => {
      fitAddon.fit();
      if (isLocalSession && localStreamIdRef.current && window.electron && xtermRef.current) {
        window.electron.localShell
          .resize(localStreamIdRef.current, xtermRef.current.cols, xtermRef.current.rows)
          .catch(() => undefined);
      }
    };

    const handleSnippetRun = (event: Event) => {
      const detail = (event as CustomEvent<{ command: string; sessionId: string }>).detail;
      if (!detail || detail.sessionId !== sessionId || !host) {
        return;
      }

      const activeStreamId = streamIdRef.current;
      if (!activeStreamId) {
        setStatusMessage('Connect this terminal before running snippets.');
        return;
      }

      sshService.writeToShell(host.id, activeStreamId, `${detail.command}\n`).catch((error) => {
        updateSession(sessionId, { status: 'error', lastError: error.message });
        setSessionStatus('error');
        setStatusMessage(`Failed to run snippet: ${error.message}`);
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('terminuks:run-snippet', handleSnippetRun as EventListener);

    return () => {
      cleanupListenersRef.current.forEach((cleanup) => cleanup());
      cleanupListenersRef.current = [];
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      void closeActiveRemoteShell(sessionHostId ?? host?.id);
      if (localStreamIdRef.current && window.electron) {
        window.electron.localShell.close(localStreamIdRef.current).catch(() => undefined);
        localStreamIdRef.current = undefined;
      }
      terminalRef.current?.removeEventListener('mousedown', focusTerminal);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('terminuks:run-snippet', handleSnippetRun as EventListener);
      terminal.dispose();
    };
  }, [
    sessionId,
    sessionType,
    sessionHostId,
    host,
    closeActiveRemoteShell,
    connectSSH,
    connectLocalShell,
    updateSession,
    setupMockTerminal,
    isLocalSession,
  ]);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.fontSize = settings.fontSize;
    terminal.options.fontFamily = settings.fontFamily;
    terminal.options.cursorStyle = settings.cursorStyle;
    terminal.options.cursorBlink = settings.cursorBlink;
    terminal.options.bellStyle = settings.bellStyle;
    terminal.options.scrollback = settings.scrollback;
    terminal.options.wordSeparator = settings.wordSeparator;
    terminal.options.theme = getTerminalTheme();
    fitAddonRef.current?.fit();
  }, [
    getTerminalTheme,
    settings.bellStyle,
    settings.cursorBlink,
    settings.cursorStyle,
    settings.fontFamily,
    settings.fontSize,
    settings.scrollback,
    settings.wordSeparator,
  ]);

  const handleCommand = (terminal: XTerm, command: string) => {
    const cmd = command.trim();
    if (cmd === 'help') {
      terminal.writeln('Available commands:');
      terminal.writeln('  help     - Show this help message');
      terminal.writeln('  clear    - Clear the terminal');
      terminal.writeln('  echo     - Echo a message');
      terminal.writeln('  date     - Show current date');
    } else if (cmd === 'clear') {
      terminal.clear();
    } else if (cmd.startsWith('echo ')) {
      terminal.writeln(cmd.substring(5));
    } else if (cmd === 'date') {
      terminal.writeln(new Date().toString());
    } else if (cmd) {
      terminal.writeln(`\x1b[1;31mCommand not found: ${cmd}\x1b[0m`);
      terminal.writeln(
        `\x1b[1;33mNote: This is a mock terminal. Real SSH connection requires Electron.\x1b[0m`
      );
    }
  };

  const showConnectionOverlay =
    !isLocalSession &&
    Boolean(host) &&
    (sessionStatus === 'connecting' ||
      sessionStatus === 'reconnecting' ||
      sessionStatus === 'error' ||
      Boolean(trustPrompt));

  const effectiveTrustPrompt = trustPrompt;

  const effectiveSessionStatus = effectiveTrustPrompt ? 'disconnected' : sessionStatus;

  const connectionHeading = effectiveTrustPrompt
    ? 'Verify Host Fingerprint'
    : effectiveSessionStatus === 'error'
      ? 'Connection Failed'
      : effectiveSessionStatus === 'reconnecting'
        ? 'Reconnecting'
        : 'Connecting';

  const connectionDescription = effectiveTrustPrompt
    ? `The authenticity of ${effectiveTrustPrompt.host}:${effectiveTrustPrompt.port} could not be verified automatically. Review the fingerprint before trusting this host.`
    : effectiveSessionStatus === 'error'
      ? statusMessage.replace(/^Connection failed:\s*/i, '')
      : effectiveSessionStatus === 'reconnecting'
        ? 'The SSH session dropped unexpectedly. Terminuks is trying to restore the shell for you.'
        : `Opening a secure shell to ${host?.username}@${host?.address}:${host?.port}.`;

  const connectionBadgeClass = effectiveTrustPrompt
    ? 'terminal-connection-badge terminal-connection-badge-trust'
    : `terminal-connection-badge terminal-connection-badge-${effectiveSessionStatus}`;

  const connectionStage = effectiveTrustPrompt
    ? 1
    : effectiveSessionStatus === 'error'
      ? -1
      : effectiveSessionStatus === 'reconnecting'
        ? 2
        : 0;

  return (
    <div className="terminal-view">
      <div className="terminal-toolbar">
        <div className={`terminal-status terminal-status-${sessionStatus}`}>
          <span className="terminal-status-dot" />
          <span>{statusMessage}</span>
        </div>
        <div className="terminal-search">
          <div className="terminal-mode-tabs">
            <button
              type="button"
              className={viewMode === 'terminal' ? 'active' : ''}
              onClick={() => setViewMode('terminal')}
            >
              Terminal
            </button>
            <button
              type="button"
              className={viewMode === 'files' ? 'active' : ''}
              disabled={isLocalSession || !host}
              onClick={() => setViewMode('files')}
            >
              Files
            </button>
          </div>
          <Search size={14} />
          <input
            type="text"
            placeholder="Search terminal output"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              if (searchQuery) {
                searchAddonRef.current?.findNext(searchQuery);
              }
            }}
          >
            Find
          </button>
          <button
            type="button"
            onClick={() => {
              if (xtermRef.current && isLocalSession) {
                xtermRef.current.reset();
                connectLocalShell(xtermRef.current);
              } else if (xtermRef.current && host) {
                xtermRef.current.reset();
                connectSSH(xtermRef.current, host);
              }
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
      <div className="terminal-body">
        <div
          ref={terminalRef}
          className={`terminal-container ${viewMode === 'terminal' ? 'active' : 'hidden'}`}
        />
        {showConnectionOverlay && host && (
          <div className="terminal-connection-overlay">
            <div className="terminal-connection-card">
              <div className="terminal-connection-head">
                <div className={connectionBadgeClass}>
                  <span className="terminal-connection-badge-icon">
                    {effectiveTrustPrompt ? (
                      <Shield size={18} />
                    ) : effectiveSessionStatus === 'error' ? (
                      <AlertTriangle size={18} />
                    ) : (
                      <span className="terminal-connection-spinner" />
                    )}
                  </span>
                </div>
                <div className="terminal-connection-head-copy">
                  <strong>{host.name}</strong>
                  <span>
                    SSH {host.address}:{host.port}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="terminal-connection-close"
                  onClick={closeConnectionOverlay}
                  aria-label="Close connection overlay"
                >
                  <X size={16} />
                </Button>
              </div>

              <div className="terminal-connection-progress">
                <div className="terminal-connection-stage">
                  <span className={`step ${connectionStage >= 0 ? 'active' : 'error'}`} />
                  <span>Reach Host</span>
                </div>
                <span className={`line ${connectionStage >= 0 ? 'active' : 'error'}`} />
                <div className="terminal-connection-stage">
                  <span
                    className={`step ${effectiveTrustPrompt ? 'warning active' : connectionStage > 0 ? 'active' : connectionStage < 0 ? 'error' : ''}`}
                  />
                  <span>Verify Identity</span>
                </div>
                <span
                  className={`line ${connectionStage > 1 ? 'active' : connectionStage < 0 ? 'error' : ''}`}
                />
                <div className="terminal-connection-stage">
                  <span
                    className={`step ${effectiveSessionStatus === 'reconnecting' ? 'active' : effectiveSessionStatus === 'error' ? 'error' : effectiveSessionStatus === 'connecting' || effectiveTrustPrompt ? '' : 'complete'}`}
                  />
                  <span>Open Shell</span>
                </div>
              </div>

              <div className="terminal-connection-copy">
                <h3>{connectionHeading}</h3>
                <p>{connectionDescription}</p>
                {effectiveTrustPrompt && (
                  <div className="terminal-connection-fingerprint">
                    <span className="terminal-connection-fingerprint-label">Fingerprint</span>
                    <code>{effectiveTrustPrompt.fingerprint}</code>
                  </div>
                )}
              </div>

              <div className="terminal-connection-actions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConnectionLogs((value) => !value)}
                >
                  {showConnectionLogs ? 'Hide Logs' : 'Show Logs'}
                </Button>
                {effectiveTrustPrompt ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={closeConnectionOverlay}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={async () => {
                        try {
                          await sshService.trustHost(host, effectiveTrustPrompt.fingerprint);
                          appendConnectionLog(
                            `Trusted host fingerprint ${effectiveTrustPrompt.fingerprint}`
                          );
                          setTrustPrompt(null);
                          if (xtermRef.current) {
                            connectSSH(xtermRef.current, host);
                          }
                        } catch (error) {
                          const message =
                            error instanceof Error ? error.message : 'Failed to trust remote host';
                          updateSession(sessionId, {
                            status: 'error',
                            lastError: message,
                            streamId: undefined,
                          });
                          setTrustPrompt(null);
                          setSessionStatus('error');
                          setStatusMessage(`Connection failed: ${message}`);
                          appendConnectionLog(`Trust step failed: ${message}`);
                        }
                      }}
                    >
                      <Check size={14} />
                      Accept And Connect
                    </Button>
                  </>
                ) : effectiveSessionStatus === 'error' ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        removeSession(sessionId);
                      }}
                    >
                      Close Session
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (xtermRef.current) {
                          appendConnectionLog('Retry requested');
                          connectSSH(xtermRef.current, host);
                        }
                      }}
                    >
                      Retry
                    </Button>
                  </>
                ) : null}
              </div>

              {showConnectionLogs && connectionLogs.length > 0 && (
                <pre className="terminal-connection-logs">{connectionLogs.join('\n')}</pre>
              )}
            </div>
          </div>
        )}
        {host && (
          <div className={`terminal-files-view ${viewMode === 'files' ? 'active' : 'hidden'}`}>
            <SSHWorkspace hostId={host.id} />
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalView;
