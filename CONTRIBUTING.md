# Contributing to Terminuks

Thank you for helping improve Terminuks.

## Development Setup

```bash
git clone git@github.com:navid-kianfar/terminuks.git
cd terminuks
pnpm install
pnpm dev
```

## Workflow

1. Create a branch from `main`.
2. Make focused changes.
3. Run the relevant checks.
4. Update docs when behavior changes.
5. Open a PR with a clear summary.

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm format
```

## Guidelines

- Use TypeScript and match existing patterns.
- Keep functions focused and names descriptive.
- Add comments only where they reduce confusion.
- Avoid documenting unshipped features as if they already exist.
- Prefer `pnpm` for all local development commands.

## Testing

- Manually verify host CRUD, SSH tabs, SFTP actions, snippets, and settings changes.
- Check for console errors in both renderer and Electron windows.
- If you add automated tests later, document how to run them in this file and the README.

## Project Areas

- Electron main/preload code lives in `electron/`
- React UI lives in `src/components/`
- Shared app state lives in `src/contexts/`
- Transport wrappers live in `src/services/`

## Links

- Issues: [https://github.com/navid-kianfar/terminuks/issues](https://github.com/navid-kianfar/terminuks/issues)
- Discussions: [https://github.com/navid-kianfar/terminuks/discussions](https://github.com/navid-kianfar/terminuks/discussions)
