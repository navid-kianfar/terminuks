# Terminuks

Terminuks is a desktop SSH, SFTP, and local terminal client built with Electron, React, TypeScript, and xterm.js.

It is designed as a fast, modern alternative to traditional connection managers, with multi-session tabs, integrated file access, theme-aware editing, saved hosts, snippets, and background transfers in one desktop app.

## Highlights

- SSH terminal tabs with reconnect handling, connection states, retry actions, and host fingerprint trust flow
- Local terminal tabs with real shell access
- SFTP workspaces with explicit remote-host picking, local/remote browsing, file operations, and transfer progress
- Integrated remote file editing from both SFTP and SSH workspace views
- Multi-tab session launcher for `New Terminal` and `New SFTP`
- Saved host management with groups, tags, notes, custom colors, and per-host actions
- Command snippets managed from Settings and runnable against the active SSH session
- Theme-aware UI with terminal appearance controls and light/dark/system support
- Encrypted SQLite-backed local storage for app data
- Shared transfer queue for background uploads and downloads

## Current Feature Set

### Sessions

- Open SSH terminals to any saved host
- Open multiple terminals to the same host
- Open local terminal sessions
- Open SFTP tabs separately from SSH tabs
- Switch between sessions without losing the rest of the workspace

### SSH

- Real SSH connections through Electron
- Connection overlay with connecting, reconnecting, error, and fingerprint verification states
- Host trust flow for unknown SSH fingerprints
- Retry support when a connection fails
- Terminal output search
- File workspace inside SSH sessions

### SFTP

- Start an SFTP tab without auto-binding a remote host
- Pick the remote host later from a filterable host list
- Browse local and remote directories
- Upload, download, rename, create folders, and delete files
- Edit remote files in a dialog editor
- Background transfer queue with progress updates

### Hosts

- Create, edit, duplicate, group, color, and delete saved hosts
- Search hosts from the sidebar
- Confirm destructive actions with a shared dialog system
- Empty-state handling for no-host scenarios

### Settings

- Refactored settings experience with shared UI primitives
- Manage hosts from Settings
- Appearance controls
- Terminal behavior controls
- Command snippet management

### Editing

- Theme-aware CodeMirror editor dialogs
- Editor access from SFTP and SSH workspace flows
- Language support for common config, script, and source files

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- xterm.js
- ssh2
- ssh2-sftp-client
- sql.js

## Development

### Requirements

- Node.js 18+
- `pnpm`
- Python 3 on macOS/Linux for the Unix local-shell bridge

### Install

```bash
pnpm install
```

### Run

```bash
pnpm dev
```

This starts the Vite renderer and launches the Electron desktop app.

For renderer-only styling work:

```bash
pnpm dev:web
```

### Build

```bash
pnpm build
```

### Lint

```bash
pnpm lint
```

## Important Notes

- The real app experience requires Electron. `pnpm dev:web` is only for renderer-side UI work.
- SSH, SFTP, storage, local shell, and native dialogs rely on the Electron bridge.
- Local shell support is implemented with platform-specific backends:
  - Windows uses `node-pty`
  - macOS/Linux use a Python-backed PTY bridge

## Project Structure

```text
electron/              Electron main process, preload, SSH/SFTP/local shell handlers
src/components/        App UI, terminals, SFTP, settings, dialogs, shared UI primitives
src/contexts/          Hosts, sessions, theme, snippets, transfers
src/services/          Renderer-side SSH and SFTP service wrappers
dist/                  Production renderer build
dist-electron/         Compiled Electron output
```

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
