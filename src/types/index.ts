export interface Host {
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
  group?: string;
  tags?: string[];
  color?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TerminalSession {
  id: string;
  hostId?: string;
  title: string;
  type: 'ssh' | 'sftp' | 'local';
  createdAt: number;
  status?: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  streamId?: string;
  lastError?: string;
}

export interface CommandSnippet {
  id: string;
  name: string;
  command: string;
  description?: string;
  tags?: string[];
  createdAt: number;
}

export interface Theme {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  colors: {
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export interface Settings {
  theme: string;
  fontSize: number;
  fontFamily: string;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  bellStyle: 'none' | 'sound' | 'visual';
  scrollback: number;
  wordSeparator: string;
}
