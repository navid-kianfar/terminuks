# Quick Start Guide

## Install

```bash
pnpm install
```

## Start Development

```bash
pnpm dev
```

This will:

- Start the Vite dev server on `http://localhost:5173`
- Launch the Electron app
- Open DevTools automatically in development

## First Steps

1. Add a host from the sidebar.
2. Open an SSH tab or SFTP tab from the main tab bar.
3. Use the `Snippets` tab to save common commands.
4. Use the `Settings` tab to adjust terminal behavior.

## Build For Production

```bash
pnpm build
```

## Troubleshooting

### SSH Issues

- Make sure the host is reachable.
- Verify credentials and key paths.
- Use the Electron app for real SSH connections.

### SFTP Issues

- Ensure the server supports SFTP.
- Check remote permissions.
- Try refreshing the directory after operations.

### Development Issues

- Confirm Node.js 18+ and `pnpm` are installed.
- Reinstall dependencies with `pnpm install` if the app fails to boot.
- Check the renderer and Electron console output for errors.
- `pnpm dev:web` is renderer-only and cannot run SSH/SFTP features without Electron.

## Next Steps

- Read [README.md](README.md) for the project overview.
- Review [TODO.md](TODO.md) for the feature backlog.
- Use [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.
