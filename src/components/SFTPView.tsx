import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {
  ArrowUp,
  Download,
  File,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Server,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { resolveLanguage } from '../utils/editor-utils';
import { useHosts } from '../contexts/HostContext';
import { useTerminal } from '../contexts/TerminalContext';
import { useTransfer } from '../contexts/TransferContext';
import { useTheme } from '../contexts/ThemeContext';
import { sftpService } from '../services/sftp';
import { Host } from '../types';
import AppDialog from './AppDialog';
import SessionLauncherDialog from './SessionLauncherDialog';
import AlertDialog from './ui/alert-dialog';
import Button from './ui/button';
import './SFTPView.css';

interface SFTPViewProps {
  sessionId: string;
}

interface RemoteFileItem {
  name: string;
  type: 'file' | 'directory' | 'link';
  size: number;
  modifyTime: number;
}

interface LocalFileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifyTime: number;
}

type PaneType = 'local' | 'remote';
type WorkspaceVariant = 'session' | 'embedded';

type DialogMode =
  | null
  | 'create-remote-file'
  | 'create-remote-folder'
  | 'create-local-file'
  | 'create-local-folder'
  | 'rename-remote'
  | 'rename-local'
  | 'delete-remote';

interface ContextMenuState {
  pane: PaneType;
  x: number;
  y: number;
  itemPath: string | null;
}

interface RenameTarget {
  path: string;
  name: string;
}

interface DualPaneSFTPWorkspaceProps {
  host?: Host;
  variant?: WorkspaceVariant;
  hostPickerHosts?: Host[];
  onSelectHost?: (host: Host) => void;
  onRemoteStateChange?: (status: 'connected' | 'error', message?: string) => void;
}

const renderSkeletonRows = (prefix: string) =>
  Array.from({ length: 10 }, (_, index) => (
    <div key={`${prefix}-${index}`} className="sftp-skeleton-row">
      <span className="sftp-skeleton-icon" />
      <span className="sftp-skeleton-line" />
      <span className="sftp-skeleton-meta" />
    </div>
  ));

const normalizeRemoteType = (type: string): RemoteFileItem['type'] => {
  if (type === 'directory' || type === 'd') return 'directory';
  if (type === 'link' || type === 'l') return 'link';
  return 'file';
};

const joinRemotePath = (basePath: string, name: string) =>
  basePath === '/' ? `/${name}` : `${basePath}/${name}`;

const getRemoteParentPath = (currentPath: string) => {
  if (currentPath === '/' || !currentPath) {
    return '/';
  }

  const trimmed =
    currentPath.endsWith('/') && currentPath !== '/' ? currentPath.slice(0, -1) : currentPath;
  const lastSlash = trimmed.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : trimmed.slice(0, lastSlash);
};

const getLocalParentPath = (currentPath: string) => {
  if (!currentPath || currentPath === '/' || /^[A-Za-z]:[\\/]?$/.test(currentPath)) {
    return currentPath || '/';
  }

  const normalized = currentPath.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/);
  if (parts.length <= 1) {
    return normalized;
  }

  if (/^[A-Za-z]:$/.test(parts[0])) {
    return parts.length === 2 ? `${parts[0]}/` : parts.slice(0, -1).join('/');
  }

  return parts.slice(0, -1).join('/') || '/';
};

const joinLocalPath = (basePath: string, name: string) => {
  const separator = basePath.includes('\\') ? '\\' : '/';
  const normalizedBase = basePath.replace(/[\\/]+$/, '');
  return `${normalizedBase}${separator}${name}`;
};

const toggleSelection = (current: string[], path: string) =>
  current.includes(path) ? current.filter((item) => item !== path) : [...current, path];

const buildRangeSelection = (items: string[], anchor: string | null, target: string) => {
  if (!anchor) {
    return [target];
  }

  const start = items.indexOf(anchor);
  const end = items.indexOf(target);
  if (start === -1 || end === -1) {
    return [target];
  }

  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  return items.slice(lower, upper + 1);
};

const summarizeTransferQueue = (
  direction: 'upload' | 'download',
  fileCount: number,
  folderCount: number
) => {
  if (!fileCount && !folderCount) {
    return `Nothing to ${direction}`;
  }

  const parts: string[] = [];
  if (fileCount) {
    parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
  }
  if (folderCount) {
    parts.push(`${folderCount} folder${folderCount === 1 ? '' : 's'}`);
  }

  return `Queued ${direction} for ${parts.join(' and ')}`;
};

export const DualPaneSFTPWorkspace = ({
  host,
  variant = 'session',
  hostPickerHosts = [],
  onSelectHost,
  onRemoteStateChange,
}: DualPaneSFTPWorkspaceProps) => {
  const { resolvedTheme } = useTheme();
  const { addTransfer } = useTransfer();
  const [currentRemotePath, setCurrentRemotePath] = useState('/');
  const [currentLocalPath, setCurrentLocalPath] = useState<string | null>(null);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFileItem[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFileItem[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [selectedRemotePaths, setSelectedRemotePaths] = useState<string[]>([]);
  const [selectedLocalPaths, setSelectedLocalPaths] = useState<string[]>([]);
  const [remoteAnchor, setRemoteAnchor] = useState<string | null>(null);
  const [localAnchor, setLocalAnchor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [editorPane, setEditorPane] = useState<PaneType | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editingPath, setEditingPath] = useState<PaneType | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [draftName, setDraftName] = useState('');
  const [itemToRename, setItemToRename] = useState<RenameTarget | null>(null);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const [localFilter, setLocalFilter] = useState('');
  const [remoteFilter, setRemoteFilter] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showHostPicker, setShowHostPicker] = useState(false);
  const previousHostIdRef = useRef<string | undefined>(host?.id);

  const hostPickerEnabled = hostPickerHosts.length > 0 && Boolean(onSelectHost);

  const filteredLocalFiles = useMemo(() => {
    const query = localFilter.trim().toLowerCase();
    return query
      ? localFiles.filter((file) => file.name.toLowerCase().includes(query))
      : localFiles;
  }, [localFiles, localFilter]);

  const filteredRemoteFiles = useMemo(() => {
    const query = remoteFilter.trim().toLowerCase();
    return query
      ? remoteFiles.filter((file) => file.name.toLowerCase().includes(query))
      : remoteFiles;
  }, [remoteFiles, remoteFilter]);

  const localVisiblePaths = useMemo(
    () => filteredLocalFiles.map((file) => file.path),
    [filteredLocalFiles]
  );
  const remoteVisiblePaths = useMemo(
    () => filteredRemoteFiles.map((file) => joinRemotePath(currentRemotePath, file.name)),
    [filteredRemoteFiles, currentRemotePath]
  );

  const localEntriesByPath = useMemo(
    () => new Map(localFiles.map((file) => [file.path, file])),
    [localFiles]
  );
  const remoteEntriesByPath = useMemo(
    () =>
      new Map(
        remoteFiles.map((file) => [joinRemotePath(currentRemotePath, file.name), file] as const)
      ),
    [remoteFiles, currentRemotePath]
  );

  const loadRemoteFiles = useCallback(
    async (path: string, nextSelection: string[] = []) => {
      if (!host) {
        return;
      }

      setLoadingRemote(true);
      setError(null);
      try {
        await sftpService.connect(host).catch(() => undefined);
        const fileList = await sftpService.listFiles(host.id, path);
        setRemoteFiles(
          fileList.map((file) => ({
            name: file.name,
            type: normalizeRemoteType(file.type),
            size: file.size || 0,
            modifyTime: file.modifyTime || Date.now(),
          }))
        );
        setSelectedRemotePaths(nextSelection);
        setRemoteAnchor(nextSelection.length > 0 ? nextSelection[nextSelection.length - 1] : null);
        onRemoteStateChange?.('connected');
      } catch (loadError: unknown) {
        const message = loadError instanceof Error ? loadError.message : 'Unknown SFTP error';
        onRemoteStateChange?.('error', message);
        setError(message);
        setRemoteFiles([]);
        setSelectedRemotePaths([]);
        setRemoteAnchor(null);
      } finally {
        setLoadingRemote(false);
      }
    },
    [host, onRemoteStateChange]
  );

  const loadLocalFiles = useCallback(async (path: string, nextSelection: string[] = []) => {
    if (!window.electron) {
      return;
    }

    setLoadingLocal(true);
    try {
      const entries = await window.electron.localfs.list(path);
      setCurrentLocalPath(path);
      setLocalFiles(entries);
      setSelectedLocalPaths(nextSelection);
      setLocalAnchor(nextSelection.length > 0 ? nextSelection[nextSelection.length - 1] : null);
    } catch (loadError: unknown) {
      const message =
        loadError instanceof Error ? loadError.message : 'Unknown local filesystem error';
      setError(message);
      setLocalFiles([]);
      setSelectedLocalPaths([]);
      setLocalAnchor(null);
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  useEffect(() => {
    if (!window.electron || currentLocalPath) {
      return;
    }

    window.electron.localfs
      .home()
      .then((homePath) => {
        if (homePath) {
          loadLocalFiles(homePath);
        }
      })
      .catch(() => undefined);
  }, [currentLocalPath, loadLocalFiles]);

  useEffect(() => {
    if (previousHostIdRef.current !== host?.id) {
      previousHostIdRef.current = host?.id;
      setCurrentRemotePath('/');
      setRemoteFiles([]);
      setSelectedRemotePaths([]);
      setRemoteAnchor(null);
      setContextMenu(null);
      return;
    }

    if (host) {
      loadRemoteFiles(currentRemotePath);
      return;
    }

    setRemoteFiles([]);
    setSelectedRemotePaths([]);
    setRemoteAnchor(null);
  }, [host, currentRemotePath, loadRemoteFiles]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.sftp-context-menu')) return;
      setContextMenu(null);
    };

    window.addEventListener('pointerdown', closeMenu);
    return () => window.removeEventListener('pointerdown', closeMenu);
  }, [contextMenu]);

  useEffect(() => {
    const handleTransferFinished = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          type: 'upload' | 'download';
          hostId: string;
          remotePath: string;
          localPath: string;
        }>
      ).detail;

      if (!detail) {
        return;
      }

      if (
        detail.type === 'upload' &&
        host &&
        detail.hostId === host.id &&
        getRemoteParentPath(detail.remotePath) === currentRemotePath
      ) {
        loadRemoteFiles(currentRemotePath);
      }

      if (
        detail.type === 'download' &&
        currentLocalPath &&
        getLocalParentPath(detail.localPath) === currentLocalPath
      ) {
        loadLocalFiles(currentLocalPath);
      }
    };

    window.addEventListener('terminuks:transfer-finished', handleTransferFinished as EventListener);
    return () =>
      window.removeEventListener(
        'terminuks:transfer-finished',
        handleTransferFinished as EventListener
      );
  }, [currentLocalPath, currentRemotePath, host, loadLocalFiles, loadRemoteFiles]);

  const selectedLocalEntries = useMemo(
    () =>
      selectedLocalPaths
        .map((path) => localEntriesByPath.get(path))
        .filter((entry): entry is LocalFileItem => Boolean(entry)),
    [localEntriesByPath, selectedLocalPaths]
  );

  const selectedRemoteEntries = useMemo(
    () =>
      selectedRemotePaths
        .map((path) => remoteEntriesByPath.get(path))
        .filter((entry): entry is RemoteFileItem => Boolean(entry)),
    [remoteEntriesByPath, selectedRemotePaths]
  );

  const selectedLocalName =
    selectedLocalPaths.length === 1 ? selectedLocalPaths[0].split(/[\\/]/).pop() : null;
  const selectedRemoteName =
    selectedRemotePaths.length === 1 ? selectedRemotePaths[0].split('/').pop() : null;

  const contextLocalFile =
    contextMenu?.pane === 'local' && contextMenu.itemPath
      ? (localEntriesByPath.get(contextMenu.itemPath) ?? null)
      : null;
  const contextRemoteFile =
    contextMenu?.pane === 'remote' && contextMenu.itemPath
      ? (remoteEntriesByPath.get(contextMenu.itemPath) ?? null)
      : null;

  const contextLocalEntries = useMemo(() => {
    if (!contextMenu?.itemPath || contextMenu.pane !== 'local' || !contextLocalFile) {
      return [] as LocalFileItem[];
    }

    return selectedLocalPaths.includes(contextMenu.itemPath)
      ? selectedLocalEntries
      : [contextLocalFile];
  }, [contextLocalFile, contextMenu, selectedLocalEntries, selectedLocalPaths]);

  const contextRemoteEntries = useMemo(() => {
    if (!contextMenu?.itemPath || contextMenu.pane !== 'remote' || !contextRemoteFile) {
      return [] as RemoteFileItem[];
    }

    return selectedRemotePaths.includes(contextMenu.itemPath)
      ? selectedRemoteEntries
      : [contextRemoteFile];
  }, [contextMenu, contextRemoteFile, selectedRemoteEntries, selectedRemotePaths]);

  const editorLanguage = useMemo(
    () => (editorPath ? resolveLanguage(editorPath) : []),
    [editorPath]
  );

  const chooseLocalDirectory = async () => {
    if (!window.electron) {
      setError('Electron app is required for local file browsing.');
      return;
    }

    const result = await window.electron.dialog.openDirectory();
    if (!result.canceled && result.filePaths[0]) {
      loadLocalFiles(result.filePaths[0]);
    }
  };

  const selectLocal = (path: string, event: React.MouseEvent) => {
    if (event.shiftKey) {
      setSelectedLocalPaths(buildRangeSelection(localVisiblePaths, localAnchor, path));
      if (!localAnchor) {
        setLocalAnchor(path);
      }
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedLocalPaths((current) => toggleSelection(current, path));
      setLocalAnchor(path);
      return;
    }

    setSelectedLocalPaths([path]);
    setLocalAnchor(path);
  };

  const selectRemote = (path: string, event: React.MouseEvent) => {
    if (event.shiftKey) {
      setSelectedRemotePaths(buildRangeSelection(remoteVisiblePaths, remoteAnchor, path));
      if (!remoteAnchor) {
        setRemoteAnchor(path);
      }
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedRemotePaths((current) => toggleSelection(current, path));
      setRemoteAnchor(path);
      return;
    }

    setSelectedRemotePaths([path]);
    setRemoteAnchor(path);
  };

  const openRemoteEditor = async (remotePath: string) => {
    if (!host) {
      return;
    }

    setEditorLoading(true);
    try {
      const content = await sftpService.readFile(host.id, remotePath);
      setEditorPane('remote');
      setEditorPath(remotePath);
      setEditorContent(content);
      setEditorDirty(false);
    } catch (editorError: unknown) {
      const message = editorError instanceof Error ? editorError.message : 'Unknown editor error';
      setError(`Open file failed: ${message}`);
    } finally {
      setEditorLoading(false);
    }
  };

  const openLocalEditor = async (localPath: string) => {
    if (!window.electron) {
      return;
    }

    setEditorLoading(true);
    try {
      const content = await window.electron.localfs.readFile(localPath);
      setEditorPane('local');
      setEditorPath(localPath);
      setEditorContent(content);
      setEditorDirty(false);
    } catch (editorError: unknown) {
      const message =
        editorError instanceof Error ? editorError.message : 'Unknown local editor error';
      setError(`Open file failed: ${message}`);
    } finally {
      setEditorLoading(false);
    }
  };

  const saveEditor = async () => {
    if (!editorPath) {
      return;
    }

    try {
      if (editorPane === 'local') {
        if (!window.electron) {
          return;
        }
        await window.electron.localfs.writeFile(editorPath, editorContent);
        if (currentLocalPath) {
          await loadLocalFiles(currentLocalPath);
        }
      } else {
        if (!host) {
          return;
        }
        await sftpService.writeFile(host.id, editorPath, editorContent);
        await loadRemoteFiles(currentRemotePath);
      }

      setEditorDirty(false);
      setFeedback(`Saved ${editorPath.split(/[\\/]/).pop()}`);
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : 'Unknown save error';
      setError(`Save failed: ${message}`);
    }
  };

  const queueUploadEntries = useCallback(
    async (entries: LocalFileItem[]) => {
      if (!host || !window.electron || entries.length === 0) {
        return;
      }

      setError(null);

      try {
        await sftpService.connect(host).catch(() => undefined);

        let fileCount = 0;
        let folderCount = 0;
        const preparedRemoteFolders = new Set<string>();

        const queueEntry = async (
          entry: LocalFileItem,
          remoteParentPath: string,
          label: string
        ) => {
          const remoteTargetPath = joinRemotePath(remoteParentPath, entry.name);

          if (entry.type === 'directory') {
            if (!preparedRemoteFolders.has(remoteTargetPath)) {
              preparedRemoteFolders.add(remoteTargetPath);
              await sftpService.createDirectory(host.id, remoteTargetPath);
              folderCount += 1;
            }

            const children = await window.electron!.localfs.list(entry.path);
            for (const child of children) {
              await queueEntry(child, remoteTargetPath, `${label}/${child.name}`);
            }
            return;
          }

          addTransfer({
            name: label,
            type: 'upload',
            hostId: host.id,
            remotePath: remoteTargetPath,
            localPath: entry.path,
          });
          fileCount += 1;
        };

        for (const entry of entries) {
          await queueEntry(entry, currentRemotePath, entry.name);
        }

        if (folderCount > 0 && fileCount === 0) {
          await loadRemoteFiles(currentRemotePath);
        }

        setFeedback(summarizeTransferQueue('upload', fileCount, folderCount));
      } catch (queueError: unknown) {
        const message = queueError instanceof Error ? queueError.message : 'Unknown upload error';
        setError(`Upload failed: ${message}`);
      }
    },
    [addTransfer, currentRemotePath, host, loadRemoteFiles]
  );

  const queueUploadPaths = useCallback(
    async (paths: string[]) => {
      const entries = paths
        .map((path) => localEntriesByPath.get(path))
        .filter((entry): entry is LocalFileItem => Boolean(entry));

      await queueUploadEntries(entries);
    },
    [localEntriesByPath, queueUploadEntries]
  );

  const queueDownloadEntries = useCallback(
    async (entries: RemoteFileItem[], targetDirectory?: string) => {
      if (!host || !window.electron || entries.length === 0) {
        return;
      }

      setError(null);

      try {
        await sftpService.connect(host).catch(() => undefined);

        const includesDirectory = entries.some((entry) => entry.type === 'directory');
        let resolvedTargetDirectory = targetDirectory || currentLocalPath;

        if (!resolvedTargetDirectory) {
          if (!includesDirectory && entries.length === 1) {
            const onlyEntry = entries[0];
            const onlyEntryPath = joinRemotePath(currentRemotePath, onlyEntry.name);
            const result = await window.electron.dialog.saveFile({ defaultPath: onlyEntry.name });

            if (result.canceled || !result.filePath) {
              return;
            }

            addTransfer({
              name: onlyEntry.name,
              type: 'download',
              hostId: host.id,
              remotePath: onlyEntryPath,
              localPath: result.filePath,
            });
            setFeedback(summarizeTransferQueue('download', 1, 0));
            return;
          }

          const result = await window.electron.dialog.openDirectory();
          if (result.canceled || !result.filePaths[0]) {
            return;
          }
          resolvedTargetDirectory = result.filePaths[0];
        }

        let fileCount = 0;
        let folderCount = 0;
        const preparedLocalFolders = new Set<string>();

        const ensureLocalDirectory = async (dirPath: string) => {
          if (preparedLocalFolders.has(dirPath)) {
            return;
          }
          preparedLocalFolders.add(dirPath);
          await window.electron!.localfs.createDirectory(dirPath);
          folderCount += 1;
        };

        const queueEntry = async (
          entry: RemoteFileItem,
          remotePath: string,
          localParentPath: string,
          label: string
        ) => {
          const localTargetPath = joinLocalPath(localParentPath, entry.name);

          if (entry.type === 'directory') {
            await ensureLocalDirectory(localTargetPath);

            const children = await sftpService.listFiles(host.id, remotePath);
            for (const child of children) {
              await queueEntry(
                {
                  name: child.name,
                  type: normalizeRemoteType(child.type),
                  size: child.size || 0,
                  modifyTime: child.modifyTime || Date.now(),
                },
                joinRemotePath(remotePath, child.name),
                localTargetPath,
                `${label}/${child.name}`
              );
            }
            return;
          }

          addTransfer({
            name: label,
            type: 'download',
            hostId: host.id,
            remotePath,
            localPath: localTargetPath,
          });
          fileCount += 1;
        };

        for (const entry of entries) {
          const remotePath = joinRemotePath(currentRemotePath, entry.name);
          await queueEntry(entry, remotePath, resolvedTargetDirectory, entry.name);
        }

        if (folderCount > 0 && fileCount === 0 && currentLocalPath === resolvedTargetDirectory) {
          await loadLocalFiles(currentLocalPath);
        }

        setFeedback(summarizeTransferQueue('download', fileCount, folderCount));
      } catch (queueError: unknown) {
        const message = queueError instanceof Error ? queueError.message : 'Unknown download error';
        setError(`Download failed: ${message}`);
      }
    },
    [addTransfer, currentLocalPath, currentRemotePath, host, loadLocalFiles]
  );

  const queueDownloadPaths = useCallback(
    async (paths: string[], targetDirectory?: string) => {
      const entries = paths
        .map((path) => remoteEntriesByPath.get(path))
        .filter((entry): entry is RemoteFileItem => Boolean(entry));

      await queueDownloadEntries(entries, targetDirectory);
    },
    [queueDownloadEntries, remoteEntriesByPath]
  );

  const handleLocalDoubleClick = (file: LocalFileItem) => {
    if (file.type === 'directory') {
      loadLocalFiles(file.path);
      return;
    }

    openLocalEditor(file.path);
  };

  const handleRemoteDoubleClick = (file: RemoteFileItem) => {
    const itemPath = joinRemotePath(currentRemotePath, file.name);
    if (file.type === 'directory') {
      setCurrentRemotePath(itemPath);
      return;
    }

    openRemoteEditor(itemPath);
  };

  const confirmCreateRemoteFolder = async () => {
    if (!host || !draftName.trim()) {
      return;
    }

    try {
      await sftpService.connect(host).catch(() => undefined);
      const remotePath = joinRemotePath(currentRemotePath, draftName.trim());
      await sftpService.createDirectory(host.id, remotePath);
      setFeedback(`Created folder ${draftName.trim()}`);
      await loadRemoteFiles(currentRemotePath, [remotePath]);
    } catch (createError: unknown) {
      const message =
        createError instanceof Error ? createError.message : 'Unknown create-folder error';
      setError(`Create folder failed: ${message}`);
    } finally {
      setDraftName('');
      setDialogMode(null);
    }
  };

  const confirmCreateRemoteFile = async () => {
    if (!host || !draftName.trim()) {
      return;
    }

    const remotePath = joinRemotePath(currentRemotePath, draftName.trim());

    try {
      await sftpService.connect(host).catch(() => undefined);
      await sftpService.writeFile(host.id, remotePath, '');
      await loadRemoteFiles(currentRemotePath, [remotePath]);
      await openRemoteEditor(remotePath);
      setFeedback(`Created file ${draftName.trim()}`);
    } catch (createError: unknown) {
      const message =
        createError instanceof Error ? createError.message : 'Unknown create-file error';
      setError(`Create file failed: ${message}`);
    } finally {
      setDraftName('');
      setDialogMode(null);
    }
  };

  const confirmCreateLocalFolder = async () => {
    if (!window.electron || !currentLocalPath || !draftName.trim()) {
      return;
    }

    const targetPath = joinLocalPath(currentLocalPath, draftName.trim());

    try {
      await window.electron.localfs.createDirectory(targetPath);
      setFeedback(`Created folder ${draftName.trim()}`);
      await loadLocalFiles(currentLocalPath, [targetPath]);
    } catch (createError: unknown) {
      const message =
        createError instanceof Error ? createError.message : 'Unknown local create-folder error';
      setError(`Create folder failed: ${message}`);
    } finally {
      setDraftName('');
      setDialogMode(null);
    }
  };

  const confirmCreateLocalFile = async () => {
    if (!window.electron || !currentLocalPath || !draftName.trim()) {
      return;
    }

    const targetPath = joinLocalPath(currentLocalPath, draftName.trim());

    try {
      await window.electron.localfs.createFile(targetPath);
      await loadLocalFiles(currentLocalPath, [targetPath]);
      await openLocalEditor(targetPath);
      setFeedback(`Created file ${draftName.trim()}`);
    } catch (createError: unknown) {
      const message =
        createError instanceof Error ? createError.message : 'Unknown local create-file error';
      setError(`Create file failed: ${message}`);
    } finally {
      setDraftName('');
      setDialogMode(null);
    }
  };

  const confirmRenameRemote = async () => {
    if (!host || !itemToRename || !draftName.trim()) {
      return;
    }

    try {
      await sftpService.connect(host).catch(() => undefined);
      const parent = getRemoteParentPath(itemToRename.path);
      const newPath = joinRemotePath(parent, draftName.trim());
      await sftpService.rename(host.id, itemToRename.path, newPath);

      if (editorPane === 'remote' && editorPath === itemToRename.path) {
        setEditorPath(newPath);
      }

      setFeedback(`Renamed to ${draftName.trim()}`);
      await loadRemoteFiles(currentRemotePath, [newPath]);
    } catch (renameError: unknown) {
      const message = renameError instanceof Error ? renameError.message : 'Unknown rename error';
      setError(`Rename failed: ${message}`);
    } finally {
      setItemToRename(null);
      setDraftName('');
      setDialogMode(null);
    }
  };

  const confirmRenameLocal = async () => {
    if (!window.electron || !itemToRename || !draftName.trim()) {
      return;
    }

    try {
      const parent = getLocalParentPath(itemToRename.path);
      const newPath = joinLocalPath(parent, draftName.trim());
      await window.electron.localfs.rename(itemToRename.path, newPath);

      if (editorPane === 'local' && editorPath === itemToRename.path) {
        setEditorPath(newPath);
      }

      setFeedback(`Renamed to ${draftName.trim()}`);
      if (currentLocalPath) {
        await loadLocalFiles(currentLocalPath, [newPath]);
      }
    } catch (renameError: unknown) {
      const message = renameError instanceof Error ? renameError.message : 'Unknown rename error';
      setError(`Rename failed: ${message}`);
    } finally {
      setItemToRename(null);
      setDraftName('');
      setDialogMode(null);
    }
  };

  const confirmDeleteRemote = async () => {
    if (!host || itemsToDelete.length === 0) {
      return;
    }

    try {
      await sftpService.connect(host).catch(() => undefined);

      for (const selectedRemote of itemsToDelete) {
        const remoteEntry = remoteEntriesByPath.get(selectedRemote);
        if (remoteEntry?.type === 'directory') {
          await sftpService.deleteDirectory(host.id, selectedRemote);
        } else {
          await sftpService.deleteFile(host.id, selectedRemote);
        }
      }

      if (editorPane === 'remote' && editorPath && itemsToDelete.includes(editorPath)) {
        setEditorPath(null);
        setEditorPane(null);
        setEditorContent('');
        setEditorDirty(false);
      }

      setSelectedRemotePaths([]);
      setFeedback(
        itemsToDelete.length === 1
          ? 'Remote item deleted'
          : `${itemsToDelete.length} remote items deleted`
      );
      await loadRemoteFiles(currentRemotePath);
    } catch (deleteError: unknown) {
      const message = deleteError instanceof Error ? deleteError.message : 'Unknown delete error';
      setError(`Delete failed: ${message}`);
    } finally {
      setItemsToDelete([]);
      setDialogMode(null);
    }
  };

  const openContextMenu = (
    event: React.MouseEvent,
    pane: PaneType,
    path: string | null,
    ensureSelection?: () => void
  ) => {
    event.preventDefault();
    event.stopPropagation();
    ensureSelection?.();
    setContextMenu({
      pane,
      x: event.clientX,
      y: event.clientY,
      itemPath: path,
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${Math.round((bytes / 1024 ** index) * 100) / 100} ${units[index]}`;
  };

  const rootClassName = `sftp-view dual-pane ${variant === 'embedded' ? 'embedded' : 'session'}`;

  return (
    <div className={rootClassName}>
      {variant === 'session' && (
        <div className="sftp-toolbar">
          <div className="sftp-toolbar-title">
            <strong>
              {host ? `${host.username}@${host.address}` : 'Remote host not connected'}
            </strong>
            <span>
              {host
                ? 'Unified local and remote workspace with matching actions in both session types'
                : 'Browse local files first, then choose which saved host should power the remote pane'}
            </span>
          </div>
          <div className="sftp-toolbar-actions">
            <button
              type="button"
              onClick={() => host && loadRemoteFiles(currentRemotePath)}
              disabled={!host}
            >
              <RefreshCw size={14} />
              <span>Refresh Remote</span>
            </button>
            {hostPickerEnabled && (
              <button type="button" onClick={() => setShowHostPicker(true)}>
                <Server size={14} />
                <span>{host ? 'Change Remote Host' : 'Choose Remote Host'}</span>
              </button>
            )}
            <button type="button" onClick={chooseLocalDirectory}>
              <HardDrive size={14} />
              <span>Choose Local Folder</span>
            </button>
          </div>
        </div>
      )}

      {(feedback || error) && (
        <div className={`sftp-banner ${error ? 'error' : 'success'}`}>
          <span>{error || feedback}</span>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setError(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="sftp-panes">
        <div
          className="sftp-pane"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const remotePathsPayload = event.dataTransfer.getData(
              'application/x-terminuks-remote-list'
            );
            const remotePath = event.dataTransfer.getData('application/x-terminuks-remote');
            const remotePaths = remotePathsPayload
              ? (JSON.parse(remotePathsPayload) as string[])
              : remotePath
                ? [remotePath]
                : [];

            if (remotePaths.length > 0 && currentLocalPath) {
              queueDownloadPaths(remotePaths, currentLocalPath);
            }
          }}
          onClick={() => setSelectedLocalPaths([])}
          onContextMenu={(event) => openContextMenu(event, 'local', null)}
        >
          <div className="sftp-pane-header">
            <div className="pane-path-container">
              <span className="pane-eyebrow">Local</span>
              {editingPath === 'local' ? (
                <input
                  type="text"
                  autoFocus
                  className="pane-path-input"
                  defaultValue={currentLocalPath || ''}
                  onBlur={() => setEditingPath(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      loadLocalFiles(event.currentTarget.value);
                      setEditingPath(null);
                    } else if (event.key === 'Escape') {
                      setEditingPath(null);
                    }
                  }}
                />
              ) : (
                <strong onClick={() => setEditingPath('local')}>
                  {currentLocalPath || 'Choose a folder'}
                </strong>
              )}
            </div>
            <div className="pane-header-actions">
              <button type="button" onClick={chooseLocalDirectory} title="Choose local folder">
                <HardDrive size={14} />
              </button>
              <button
                type="button"
                disabled={!currentLocalPath}
                onClick={() => currentLocalPath && loadLocalFiles(currentLocalPath)}
                title="Refresh local folder"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                disabled={!currentLocalPath}
                onClick={() =>
                  currentLocalPath && loadLocalFiles(getLocalParentPath(currentLocalPath))
                }
                title="Go to parent folder"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                disabled={!currentLocalPath}
                onClick={() => setDialogMode('create-local-file')}
                title="New local file"
              >
                <FilePlus2 size={14} />
              </button>
              <button
                type="button"
                disabled={!currentLocalPath}
                onClick={() => setDialogMode('create-local-folder')}
                title="New local folder"
              >
                <FolderPlus size={14} />
              </button>
            </div>
          </div>
          <div className="sftp-pane-filter">
            <Search size={14} />
            <input
              type="text"
              value={localFilter}
              onChange={(event) => setLocalFilter(event.target.value)}
              placeholder="Filter local files"
            />
          </div>
          <div className="sftp-pane-body">
            {loadingLocal ? (
              <div className="sftp-skeleton-list">{renderSkeletonRows('local')}</div>
            ) : currentLocalPath ? (
              filteredLocalFiles.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className={`pane-item ${selectedLocalPaths.includes(file.path) ? 'active' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    const draggedPaths = selectedLocalPaths.includes(file.path)
                      ? selectedLocalPaths
                      : [file.path];
                    event.dataTransfer.setData('application/x-terminuks-local', file.path);
                    event.dataTransfer.setData(
                      'application/x-terminuks-local-list',
                      JSON.stringify(draggedPaths)
                    );
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectLocal(file.path, event);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    handleLocalDoubleClick(file);
                  }}
                  onContextMenu={(event) =>
                    openContextMenu(event, 'local', file.path, () => {
                      if (!selectedLocalPaths.includes(file.path)) {
                        setSelectedLocalPaths([file.path]);
                        setLocalAnchor(file.path);
                      }
                    })
                  }
                >
                  {file.type === 'directory' ? <Folder size={15} /> : <File size={15} />}
                  <span className="pane-item-name">{file.name}</span>
                  <span className="pane-item-meta">{formatFileSize(file.size)}</span>
                </button>
              ))
            ) : (
              <div className="workspace-empty">Choose a local folder to start browsing.</div>
            )}
          </div>
          <div className="sftp-pane-footer">
            {selectedLocalPaths.length > 1
              ? `${selectedLocalPaths.length} local items selected`
              : selectedLocalName
                ? `Selected: ${selectedLocalName}`
                : 'Ctrl/Cmd-click or Shift-click to select multiple local items'}
          </div>
        </div>

        <div
          className="sftp-pane"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const localPathsPayload = event.dataTransfer.getData(
              'application/x-terminuks-local-list'
            );
            const localPath = event.dataTransfer.getData('application/x-terminuks-local');
            const localPaths = localPathsPayload
              ? (JSON.parse(localPathsPayload) as string[])
              : localPath
                ? [localPath]
                : [];

            if (localPaths.length > 0) {
              queueUploadPaths(localPaths);
            }
          }}
          onClick={() => setSelectedRemotePaths([])}
          onContextMenu={(event) => openContextMenu(event, 'remote', null)}
        >
          <div className="sftp-pane-header">
            <div className="pane-path-container">
              <span className="pane-eyebrow">Remote</span>
              {editingPath === 'remote' ? (
                <input
                  type="text"
                  autoFocus
                  className="pane-path-input"
                  defaultValue={currentRemotePath}
                  onBlur={() => setEditingPath(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setCurrentRemotePath(event.currentTarget.value);
                      setEditingPath(null);
                    } else if (event.key === 'Escape') {
                      setEditingPath(null);
                    }
                  }}
                />
              ) : (
                <strong onClick={() => setEditingPath('remote')}>{currentRemotePath}</strong>
              )}
            </div>
            <div className="pane-header-actions">
              <button
                type="button"
                disabled={!host}
                onClick={() => host && loadRemoteFiles(currentRemotePath)}
                title="Refresh remote folder"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                disabled={currentRemotePath === '/' || !host}
                onClick={() => setCurrentRemotePath(getRemoteParentPath(currentRemotePath))}
                title="Go to parent folder"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                disabled={!host}
                onClick={() => setDialogMode('create-remote-file')}
                title="New remote file"
              >
                <FilePlus2 size={14} />
              </button>
              <button
                type="button"
                disabled={!host}
                onClick={() => setDialogMode('create-remote-folder')}
                title="New remote folder"
              >
                <FolderPlus size={14} />
              </button>
              {hostPickerEnabled && (
                <button
                  type="button"
                  onClick={() => setShowHostPicker(true)}
                  title={host ? 'Change remote host' : 'Choose remote host'}
                >
                  <Server size={14} />
                </button>
              )}
              <button
                type="button"
                disabled={selectedRemoteEntries.length === 0 || !host || !currentLocalPath}
                onClick={() =>
                  currentLocalPath && queueDownloadEntries(selectedRemoteEntries, currentLocalPath)
                }
                title="Download selection"
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                disabled={selectedLocalEntries.length === 0 || !host}
                onClick={() => queueUploadEntries(selectedLocalEntries)}
                title="Upload selection"
              >
                <Upload size={14} />
              </button>
              <button
                type="button"
                disabled={selectedRemotePaths.length === 0 || !host}
                onClick={() => {
                  setItemsToDelete([...selectedRemotePaths]);
                  setDialogMode('delete-remote');
                }}
                title="Delete selection"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="sftp-pane-filter">
            <Search size={14} />
            <input
              type="text"
              value={remoteFilter}
              onChange={(event) => setRemoteFilter(event.target.value)}
              placeholder="Filter remote files"
            />
          </div>
          <div className="sftp-pane-body">
            {!host ? (
              <div className="workspace-empty">
                <strong>Remote side is disconnected</strong>
                <span>
                  {hostPickerEnabled
                    ? 'Use the server button above to pick from all saved hosts.'
                    : 'Attach this workspace to a host to browse remote files.'}
                </span>
                {hostPickerEnabled && (
                  <button
                    type="button"
                    className="sftp-inline-picker-btn"
                    onClick={() => setShowHostPicker(true)}
                  >
                    <Server size={14} />
                    <span>Choose Remote Host</span>
                  </button>
                )}
              </div>
            ) : loadingRemote ? (
              <div className="sftp-skeleton-list">{renderSkeletonRows('remote')}</div>
            ) : filteredRemoteFiles.length === 0 ? (
              <div className="workspace-empty">This remote directory is empty.</div>
            ) : (
              filteredRemoteFiles.map((file) => {
                const filePath = joinRemotePath(currentRemotePath, file.name);
                return (
                  <button
                    key={filePath}
                    type="button"
                    className={`pane-item ${selectedRemotePaths.includes(filePath) ? 'active' : ''}`}
                    draggable
                    onDragStart={(event) => {
                      const draggedPaths = selectedRemotePaths.includes(filePath)
                        ? selectedRemotePaths
                        : [filePath];
                      event.dataTransfer.setData('application/x-terminuks-remote', filePath);
                      event.dataTransfer.setData(
                        'application/x-terminuks-remote-list',
                        JSON.stringify(draggedPaths)
                      );
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectRemote(filePath, event);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      handleRemoteDoubleClick(file);
                    }}
                    onContextMenu={(event) =>
                      openContextMenu(event, 'remote', filePath, () => {
                        if (!selectedRemotePaths.includes(filePath)) {
                          setSelectedRemotePaths([filePath]);
                          setRemoteAnchor(filePath);
                        }
                      })
                    }
                  >
                    {file.type === 'directory' ? <Folder size={15} /> : <Server size={15} />}
                    <span className="pane-item-name">{file.name}</span>
                    <span className="pane-item-meta">{formatFileSize(file.size)}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="sftp-pane-footer">
            {selectedRemotePaths.length > 1
              ? `${selectedRemotePaths.length} remote items selected`
              : selectedRemoteName
                ? `Selected: ${selectedRemoteName}`
                : 'Ctrl/Cmd-click or Shift-click to select multiple remote items'}
          </div>
        </div>
      </div>

      {contextMenu && (
        <div
          className="sftp-context-menu portal-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.pane === 'local' ? (
            <>
              {contextLocalFile?.type === 'directory' && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    loadLocalFiles(contextLocalFile.path);
                    setContextMenu(null);
                  }}
                >
                  <FolderOpen size={14} />
                  <span>Open Folder</span>
                </button>
              )}
              {contextLocalFile?.type === 'file' && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    openLocalEditor(contextLocalFile.path);
                    setContextMenu(null);
                  }}
                >
                  <Pencil size={14} />
                  <span>Edit in Dialog</span>
                </button>
              )}
              {contextMenu.itemPath && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    const name =
                      contextLocalFile?.name || contextMenu.itemPath.split(/[\\/]/).pop() || '';
                    setDraftName(name);
                    setItemToRename({
                      path: contextMenu.itemPath,
                      name,
                    });
                    setDialogMode('rename-local');
                    setContextMenu(null);
                  }}
                >
                  <Type size={14} />
                  <span>Rename</span>
                </button>
              )}
              {contextLocalEntries.length > 0 && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    queueUploadEntries(contextLocalEntries);
                    setContextMenu(null);
                  }}
                >
                  <Upload size={14} />
                  <span>{contextLocalEntries.length > 1 ? 'Upload Selected' : 'Upload'}</span>
                </button>
              )}
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => {
                  if (currentLocalPath) {
                    loadLocalFiles(currentLocalPath);
                  }
                  setContextMenu(null);
                }}
                disabled={!currentLocalPath}
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => {
                  setDialogMode('create-local-file');
                  setContextMenu(null);
                }}
                disabled={!currentLocalPath}
              >
                <FilePlus2 size={14} />
                <span>New File</span>
              </button>
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => {
                  setDialogMode('create-local-folder');
                  setContextMenu(null);
                }}
                disabled={!currentLocalPath}
              >
                <FolderPlus size={14} />
                <span>New Folder</span>
              </button>
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => {
                  chooseLocalDirectory();
                  setContextMenu(null);
                }}
              >
                <HardDrive size={14} />
                <span>Choose Local Folder</span>
              </button>
            </>
          ) : (
            <>
              {contextRemoteFile?.type === 'directory' && contextMenu.itemPath && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    setCurrentRemotePath(contextMenu.itemPath!);
                    setContextMenu(null);
                  }}
                >
                  <FolderOpen size={14} />
                  <span>Open Folder</span>
                </button>
              )}
              {contextRemoteFile?.type !== 'directory' && contextMenu.itemPath && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    openRemoteEditor(contextMenu.itemPath!);
                    setContextMenu(null);
                  }}
                >
                  <Pencil size={14} />
                  <span>Edit in Dialog</span>
                </button>
              )}
              {contextMenu.itemPath && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    const name =
                      contextRemoteFile?.name || contextMenu.itemPath.split('/').pop() || '';
                    setDraftName(name);
                    setItemToRename({
                      path: contextMenu.itemPath,
                      name,
                    });
                    setDialogMode('rename-remote');
                    setContextMenu(null);
                  }}
                >
                  <Type size={14} />
                  <span>Rename</span>
                </button>
              )}
              {contextRemoteEntries.length > 0 && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    if (currentLocalPath) {
                      queueDownloadEntries(contextRemoteEntries, currentLocalPath);
                    }
                    setContextMenu(null);
                  }}
                  disabled={!currentLocalPath}
                >
                  <Download size={14} />
                  <span>{contextRemoteEntries.length > 1 ? 'Download Selected' : 'Download'}</span>
                </button>
              )}
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => {
                  if (host) {
                    loadRemoteFiles(currentRemotePath);
                  }
                  setContextMenu(null);
                }}
                disabled={!host}
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => {
                  setDialogMode('create-remote-file');
                  setContextMenu(null);
                }}
                disabled={!host}
              >
                <FilePlus2 size={14} />
                <span>New File</span>
              </button>
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => {
                  setDialogMode('create-remote-folder');
                  setContextMenu(null);
                }}
                disabled={!host}
              >
                <FolderPlus size={14} />
                <span>New Folder</span>
              </button>
              {contextRemoteEntries.length > 0 && (
                <button
                  type="button"
                  className="sftp-context-item danger"
                  onClick={() => {
                    const paths =
                      contextMenu.itemPath && selectedRemotePaths.includes(contextMenu.itemPath)
                        ? [...selectedRemotePaths]
                        : contextMenu.itemPath
                          ? [contextMenu.itemPath]
                          : [];
                    setItemsToDelete(paths);
                    setDialogMode('delete-remote');
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  <span>{contextRemoteEntries.length > 1 ? 'Delete Selected' : 'Delete'}</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {editorPath && (
        <AppDialog
          title={editorPath.split(/[\\/]/).pop() || 'File'}
          description={editorPath}
          onClose={() => {
            setEditorPath(null);
            setEditorPane(null);
            setEditorDirty(false);
          }}
          size="wide"
          containToParent
          bodyClassName="app-dialog-body-flush"
          headerActions={
            <Button
              type="button"
              variant="outline"
              disabled={!editorDirty || editorLoading}
              onClick={saveEditor}
            >
              <Save size={14} />
              Save
            </Button>
          }
        >
          <div className="sftp-editor-modal">
            {editorLoading ? (
              <div className="sftp-skeleton-list">{renderSkeletonRows('editor')}</div>
            ) : (
              <CodeMirror
                value={editorContent}
                height="68vh"
                theme={resolvedTheme}
                extensions={Array.isArray(editorLanguage) ? editorLanguage : [editorLanguage]}
                onChange={(value) => {
                  setEditorContent(value);
                  setEditorDirty(true);
                }}
              />
            )}
          </div>
        </AppDialog>
      )}

      {(dialogMode === 'create-remote-file' ||
        dialogMode === 'create-remote-folder' ||
        dialogMode === 'create-local-file' ||
        dialogMode === 'create-local-folder') && (
        <AppDialog
          title={
            dialogMode === 'create-remote-file'
              ? 'Create Remote File'
              : dialogMode === 'create-remote-folder'
                ? 'Create Remote Folder'
                : dialogMode === 'create-local-file'
                  ? 'Create Local File'
                  : 'Create Local Folder'
          }
          description={
            dialogMode === 'create-remote-file'
              ? 'Create a remote file in the current directory.'
              : dialogMode === 'create-remote-folder'
                ? 'Create a remote folder in the current directory.'
                : dialogMode === 'create-local-file'
                  ? 'Create a local file in the current directory.'
                  : 'Create a local folder in the current directory.'
          }
          onClose={() => {
            setDialogMode(null);
            setDraftName('');
          }}
        >
          <div className="sftp-dialog-body">
            <input
              type="text"
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder={
                dialogMode === 'create-remote-file' || dialogMode === 'create-local-file'
                  ? 'notes.txt'
                  : 'new-folder'
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return;
                }

                if (dialogMode === 'create-remote-file') {
                  confirmCreateRemoteFile();
                } else if (dialogMode === 'create-remote-folder') {
                  confirmCreateRemoteFolder();
                } else if (dialogMode === 'create-local-file') {
                  confirmCreateLocalFile();
                } else {
                  confirmCreateLocalFolder();
                }
              }}
            />
            <div className="sftp-dialog-actions">
              <button
                type="button"
                className="sftp-dialog-cancel"
                onClick={() => setDialogMode(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sftp-dialog-primary"
                onClick={() => {
                  if (dialogMode === 'create-remote-file') {
                    confirmCreateRemoteFile();
                  } else if (dialogMode === 'create-remote-folder') {
                    confirmCreateRemoteFolder();
                  } else if (dialogMode === 'create-local-file') {
                    confirmCreateLocalFile();
                  } else {
                    confirmCreateLocalFolder();
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </AppDialog>
      )}

      {(dialogMode === 'rename-remote' || dialogMode === 'rename-local') && (
        <AppDialog
          title={dialogMode === 'rename-remote' ? 'Rename Remote Item' : 'Rename Local Item'}
          description="Enter a new name for the file or folder."
          onClose={() => {
            setDialogMode(null);
            setDraftName('');
            setItemToRename(null);
          }}
        >
          <div className="sftp-dialog-body">
            <input
              type="text"
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="New name"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  if (dialogMode === 'rename-remote') {
                    confirmRenameRemote();
                  } else {
                    confirmRenameLocal();
                  }
                }
              }}
            />
            <div className="sftp-dialog-actions">
              <button
                type="button"
                className="sftp-dialog-cancel"
                onClick={() => setDialogMode(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sftp-dialog-primary"
                onClick={() => {
                  if (dialogMode === 'rename-remote') {
                    confirmRenameRemote();
                  } else {
                    confirmRenameLocal();
                  }
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </AppDialog>
      )}

      <AlertDialog
        open={dialogMode === 'delete-remote'}
        title="Delete Remote Item"
        description="This permanently removes the selected remote file or folder."
        onClose={() => {
          setDialogMode(null);
          setItemsToDelete([]);
        }}
        onConfirm={confirmDeleteRemote}
      >
        <p>
          {itemsToDelete.length > 1
            ? `Delete ${itemsToDelete.length} selected items?`
            : `Delete ${itemsToDelete[0]?.split('/').pop() || 'this remote item'}?`}
        </p>
      </AlertDialog>

      {hostPickerEnabled && showHostPicker && (
        <SessionLauncherDialog
          mode="sftp"
          hosts={hostPickerHosts}
          onClose={() => setShowHostPicker(false)}
          onSelectHost={(selectedHost) => {
            onSelectHost?.(selectedHost);
            setShowHostPicker(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
};

const SFTPView = ({ sessionId }: SFTPViewProps) => {
  const { getHost, hosts } = useHosts();
  const { getSession, updateSession } = useTerminal();
  const session = getSession(sessionId);
  const host = session?.hostId ? getHost(session.hostId) : undefined;

  return (
    <DualPaneSFTPWorkspace
      host={host}
      variant="session"
      hostPickerHosts={hosts}
      onSelectHost={(selectedHost) => {
        updateSession(sessionId, {
          hostId: selectedHost.id,
          title: `${selectedHost.name} SFTP`,
          status: 'idle',
          lastError: undefined,
        });
      }}
      onRemoteStateChange={(status, message) => {
        updateSession(
          sessionId,
          status === 'connected'
            ? { status: 'connected', lastError: undefined }
            : { status: 'error', lastError: message }
        );
      }}
    />
  );
};

export default SFTPView;
