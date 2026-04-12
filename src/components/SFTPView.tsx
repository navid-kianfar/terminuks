import { useState, useEffect, useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { resolveLanguage } from '../utils/editor-utils';
import {
  Folder,
  File,
  RefreshCw,
  ArrowUp,
  FolderPlus,
  Download,
  Upload,
  Trash2,
  HardDrive,
  Server,
  Search,
  FolderOpen,
  Type,
  Pencil,
  Save,
} from 'lucide-react';
import { useHosts } from '../contexts/HostContext';
import { useTerminal } from '../contexts/TerminalContext';
import { useTransfer } from '../contexts/TransferContext';
import { useTheme } from '../contexts/ThemeContext';
import { sftpService } from '../services/sftp';
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

interface ContextMenuState {
  pane: PaneType;
  x: number;
  y: number;
  itemPath: string | null;
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

  const trimmed = currentPath.endsWith('/') && currentPath !== '/'
    ? currentPath.slice(0, -1)
    : currentPath;
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

const SFTPView = ({ sessionId }: SFTPViewProps) => {
  const { getHost, hosts } = useHosts();
  const { resolvedTheme } = useTheme();
  const { getSession, updateSession } = useTerminal();
  const session = getSession(sessionId);
  const host = session?.hostId ? getHost(session.hostId) : undefined;
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
  const [editorContent, setEditorContent] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editingPath, setEditingPath] = useState<PaneType | null>(null);
  const [dialogMode, setDialogMode] = useState<null | 'create-folder' | 'delete-remote' | 'rename-remote'>(null);
  const [draftName, setDraftName] = useState('');
  const [itemToRename, setItemToRename] = useState<{ path: string; name: string } | null>(null);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const [localFilter, setLocalFilter] = useState('');
  const [remoteFilter, setRemoteFilter] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showHostPicker, setShowHostPicker] = useState(false);
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

  const localItemPaths = useMemo(() => filteredLocalFiles.map((file) => file.path), [filteredLocalFiles]);
  const remoteItemPaths = useMemo(
    () => filteredRemoteFiles.map((file) => joinRemotePath(currentRemotePath, file.name)),
    [filteredRemoteFiles, currentRemotePath]
  );

  const loadRemoteFiles = useCallback(async (path: string) => {
    if (!host) return;
    setLoadingRemote(true);
    setError(null);
    try {
      await sftpService.connect(host).catch(() => undefined);
      const fileList = await sftpService.listFiles(host.id, path);
      updateSession(sessionId, { status: 'connected', lastError: undefined });
      setRemoteFiles(
        fileList.map((file) => ({
          name: file.name,
          type: normalizeRemoteType(file.type),
          size: file.size || 0,
          modifyTime: file.modifyTime || Date.now(),
        }))
      );
      setSelectedRemotePaths([]);
      setRemoteAnchor(null);
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : 'Unknown SFTP error';
      updateSession(sessionId, { status: 'error', lastError: message });
      setError(message);
      setRemoteFiles([]);
    } finally {
      setLoadingRemote(false);
    }
  }, [host, sessionId, updateSession]);

  const loadLocalFiles = useCallback(async (path: string) => {
    if (!window.electron) {
      return;
    }

    setLoadingLocal(true);
    try {
      const entries = await window.electron.localfs.list(path);
      setCurrentLocalPath(path);
      setLocalFiles(entries);
      setSelectedLocalPaths([]);
      setLocalAnchor(null);
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : 'Unknown local filesystem error';
      setError(message);
      setLocalFiles([]);
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  useEffect(() => {
    if (host) {
      loadRemoteFiles(currentRemotePath);
    }
  }, [host, currentRemotePath, loadRemoteFiles]);

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
    if (!contextMenu) return;
    const closeMenu = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.sftp-context-menu')) return;
      setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenu);
    return () => window.removeEventListener('pointerdown', closeMenu);
  }, [contextMenu]);

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
      setSelectedLocalPaths(buildRangeSelection(localItemPaths, localAnchor, path));
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
      setSelectedRemotePaths(buildRangeSelection(remoteItemPaths, remoteAnchor, path));
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

  const { addTransfer } = useTransfer();

  const uploadLocalFiles = useCallback(async (paths: string[]) => {
    if (!host || paths.length === 0) return;

    paths.forEach((localPath) => {
      const fileName = localPath.split(/[\\/]/).pop() || 'upload';
      const remotePath = joinRemotePath(currentRemotePath, fileName);
      
      addTransfer({
        name: fileName,
        type: 'upload',
        hostId: host.id,
        remotePath,
        localPath,
      });
    });

    setFeedback(`Adding ${paths.length} file(s) to transfer queue`);
  }, [host, currentRemotePath, addTransfer]);

  const downloadRemoteFiles = useCallback(async (paths: string[], targetDir?: string) => {
    if (!host || !window.electron || paths.length === 0) return;

    for (const remotePath of paths) {
      const fileName = remotePath.split('/').pop() || 'download';
      let targetPath = targetDir ? `${targetDir}/${fileName}` : null;

      if (!targetPath) {
        const result = await window.electron.dialog.saveFile({ defaultPath: fileName });
        if (result.canceled || !result.filePath) continue;
        targetPath = result.filePath;
      }

      addTransfer({
        name: fileName,
        type: 'download',
        hostId: host.id,
        remotePath,
        localPath: targetPath,
      });
    }

    setFeedback(`Adding ${paths.length} file(s) to transfer queue`);
  }, [host, addTransfer]);

  const openRemoteEditor = async (remotePath: string) => {
    if (!host) {
      return;
    }

    setEditorLoading(true);
    try {
      const content = await sftpService.readFile(host.id, remotePath);
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

  const saveEditor = async () => {
    if (!host || !editorPath) {
      return;
    }

    try {
      await sftpService.writeFile(host.id, editorPath, editorContent);
      setEditorDirty(false);
      setFeedback(`Saved ${editorPath.split('/').pop()}`);
      await loadRemoteFiles(currentRemotePath);
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : 'Unknown save error';
      setError(`Save failed: ${message}`);
    }
  };

  const handleLocalDoubleClick = (file: LocalFileItem) => {
    if (file.type === 'directory') {
      loadLocalFiles(file.path);
    }
  };

  const handleRemoteDoubleClick = (file: RemoteFileItem) => {
    const itemPath = joinRemotePath(currentRemotePath, file.name);
    if (file.type === 'directory') {
      setCurrentRemotePath(itemPath);
      return;
    }

    openRemoteEditor(itemPath);
  };

  const confirmCreateFolder = async () => {
    if (!host || !draftName.trim()) {
      return;
    }
    try {
      await sftpService.connect(host).catch(() => undefined);
      const remotePath = joinRemotePath(currentRemotePath, draftName.trim());
      await sftpService.createDirectory(host.id, remotePath);
      setFeedback(`Created folder ${draftName.trim()}`);
      await loadRemoteFiles(currentRemotePath);
    } catch (createError: unknown) {
      const message =
        createError instanceof Error ? createError.message : 'Unknown create-folder error';
      setError(`Create folder failed: ${message}`);
    } finally {
      setDraftName('');
      setDialogMode(null);
    }
  };

  const confirmRenameRemote = async () => {
    if (!host || !itemToRename || !draftName.trim()) return;

    try {
      await sftpService.connect(host).catch(() => undefined);
      const parent = getRemoteParentPath(itemToRename.path);
      const newPath = joinRemotePath(parent, draftName.trim());
      await sftpService.rename(host.id, itemToRename.path, newPath);
      setFeedback(`Renamed to ${draftName.trim()}`);
      await loadRemoteFiles(currentRemotePath);
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
        const remoteEntry = remoteFiles.find((file) =>
          joinRemotePath(currentRemotePath, file.name) === selectedRemote
        );
        if (remoteEntry?.type === 'directory') {
          await sftpService.deleteDirectory(host.id, selectedRemote);
        } else {
          await sftpService.deleteFile(host.id, selectedRemote);
        }
      }
      setSelectedRemotePaths([]);
      setFeedback(itemsToDelete.length === 1 ? 'Remote item deleted' : `${itemsToDelete.length} remote items deleted`);
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

  const selectedRemoteName = selectedRemotePaths.length === 1 ? selectedRemotePaths[0].split('/').pop() : null;
  const selectedLocalName = selectedLocalPaths.length === 1 ? selectedLocalPaths[0].split(/[\\/]/).pop() : null;
  const selectedLocalEntries = filteredLocalFiles.filter((file) => selectedLocalPaths.includes(file.path));
  const selectedRemoteEntries = filteredRemoteFiles.filter((file) =>
    selectedRemotePaths.includes(joinRemotePath(currentRemotePath, file.name))
  );
  const selectedLocalFilePaths = selectedLocalEntries
    .filter((file) => file.type === 'file')
    .map((file) => file.path);
  const selectedRemoteFilePaths = selectedRemoteEntries
    .filter((file) => file.type !== 'directory')
    .map((file) => joinRemotePath(currentRemotePath, file.name));
  const selectedRemoteFile = selectedRemotePaths.length === 1
    ? filteredRemoteFiles.find((file) => joinRemotePath(currentRemotePath, file.name) === selectedRemotePaths[0])
    : null;
  const selectedLocalFile = selectedLocalPaths.length === 1
    ? filteredLocalFiles.find((file) => file.path === selectedLocalPaths[0])
    : null;
  const editorLanguage = useMemo(() => (editorPath ? resolveLanguage(editorPath) : []), [editorPath]);

  return (
    <div className="sftp-view dual-pane">
      <div className="sftp-toolbar">
        <div className="sftp-toolbar-title">
          <strong>{host ? `${host.username}@${host.address}` : 'Remote host not connected'}</strong>
          <span>
            {host
              ? 'Local and remote workspace with explicit remote host selection'
              : 'Browse local files first, then choose which saved host should power the remote pane'}
          </span>
        </div>
        <div className="sftp-toolbar-actions">
          <button type="button" onClick={() => host && loadRemoteFiles(currentRemotePath)} disabled={!host}>
            <RefreshCw size={14} />
            <span>Refresh Remote</span>
          </button>
          <button type="button" onClick={() => setShowHostPicker(true)}>
            <Server size={14} />
            <span>{host ? 'Change Remote Host' : 'Choose Remote Host'}</span>
          </button>
          <button type="button" onClick={chooseLocalDirectory}>
            <HardDrive size={14} />
            <span>Choose Local Folder</span>
          </button>
        </div>
      </div>

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
            const remotePath = event.dataTransfer.getData('application/x-terminuks-remote');
            if (remotePath && currentLocalPath) {
              downloadRemoteFiles([remotePath], currentLocalPath);
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      loadLocalFiles(e.currentTarget.value);
                      setEditingPath(null);
                    } else if (e.key === 'Escape') {
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
              <button
                type="button"
                disabled={!currentLocalPath}
                onClick={() => currentLocalPath && loadLocalFiles(getLocalParentPath(currentLocalPath))}
              >
                <ArrowUp size={14} />
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
                  draggable={file.type === 'file'}
                  onDragStart={(event) =>
                    event.dataTransfer.setData('application/x-terminuks-local', file.path)
                  }
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
            const localPath = event.dataTransfer.getData('application/x-terminuks-local');
            if (localPath && host) {
              uploadLocalFiles([localPath]);
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setCurrentRemotePath(e.currentTarget.value);
                      setEditingPath(null);
                    } else if (e.key === 'Escape') {
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
                disabled={currentRemotePath === '/' || !host}
                onClick={() => setCurrentRemotePath(getRemoteParentPath(currentRemotePath))}
              >
                <ArrowUp size={14} />
              </button>
              <button type="button" disabled={!host} onClick={() => setDialogMode('create-folder')}>
                <FolderPlus size={14} />
              </button>
              <button type="button" onClick={() => setShowHostPicker(true)}>
                <Server size={14} />
              </button>
              <button
                type="button"
                disabled={selectedRemoteFilePaths.length === 0 || !host}
                onClick={() => currentLocalPath && downloadRemoteFiles(selectedRemoteFilePaths, currentLocalPath)}
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                disabled={selectedLocalFilePaths.length === 0 || !host}
                onClick={() => uploadLocalFiles(selectedLocalFilePaths)}
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
                <span>Use the server button above to pick from all saved hosts.</span>
                <button type="button" className="sftp-inline-picker-btn" onClick={() => setShowHostPicker(true)}>
                  <Server size={14} />
                  <span>Choose Remote Host</span>
                </button>
              </div>
            ) : loadingRemote ? (
              <div className="sftp-skeleton-list">{renderSkeletonRows('remote')}</div>
            ) : filteredRemoteFiles.length === 0 ? (
              <div className="workspace-empty">This remote directory is empty.</div>
            ) : filteredRemoteFiles.map((file) => {
              const filePath = joinRemotePath(currentRemotePath, file.name);
              return (
                <button
                  key={filePath}
                  type="button"
                  className={`pane-item ${selectedRemotePaths.includes(filePath) ? 'active' : ''}`}
                  draggable={file.type !== 'directory'}
                  onDragStart={(event) =>
                    event.dataTransfer.setData('application/x-terminuks-remote', filePath)
                  }
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
            })}
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
              {selectedLocalFile?.type === 'directory' && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => loadLocalFiles(selectedLocalFile.path)}
                >
                  <FolderOpen size={14} />
                  <span>Open Folder</span>
                </button>
              )}
              {selectedLocalPaths.length > 0 && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => uploadLocalFiles(selectedLocalFilePaths)}
                  disabled={selectedLocalFilePaths.length === 0}
                >
                  <Upload size={14} />
                  <span>{selectedLocalPaths.length > 1 ? 'Upload Selected' : 'Upload'}</span>
                </button>
              )}
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => chooseLocalDirectory()}
              >
                <HardDrive size={14} />
                <span>Choose Local Folder</span>
              </button>
            </>
          ) : (
            <>
              {selectedRemoteFile?.type === 'directory' && selectedRemotePaths.length === 1 && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    setCurrentRemotePath(selectedRemotePaths[0]);
                    setTimeout(() => setContextMenu(null), 10);
                  }}
                >
                  <FolderOpen size={14} />
                  <span>Open Folder</span>
                </button>
              )}
              {selectedRemoteFile?.type !== 'directory' && selectedRemotePaths.length === 1 && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    openRemoteEditor(selectedRemotePaths[0]);
                    setContextMenu(null);
                  }}
                >
                  <Pencil size={14} />
                  <span>Edit in Dialog</span>
                </button>
              )}
              {selectedRemotePaths.length === 1 && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    setDraftName(selectedRemoteName || '');
                    setItemToRename({ path: selectedRemotePaths[0], name: selectedRemoteName || '' });
                    setDialogMode('rename-remote');
                    setContextMenu(null);
                  }}
                >
                  <Type size={14} />
                  <span>Rename</span>
                </button>
              )}
              {selectedRemotePaths.length > 0 && (
                <button
                  type="button"
                  className="sftp-context-item"
                  onClick={() => {
                    if (currentLocalPath) {
                      downloadRemoteFiles(selectedRemoteFilePaths, currentLocalPath);
                    }
                    setContextMenu(null);
                  }}
                  disabled={selectedRemoteFilePaths.length === 0}
                >
                  <Download size={14} />
                  <span>{selectedRemotePaths.length > 1 ? 'Download Selected' : 'Download'}</span>
                </button>
              )}
              <button
                type="button"
                className="sftp-context-item"
                onClick={() => {
                  setDialogMode('create-folder');
                  setContextMenu(null);
                }}
              >
                <FolderPlus size={14} />
                <span>New Folder</span>
              </button>
              {selectedRemotePaths.length > 0 && (
                <button
                  type="button"
                  className="sftp-context-item danger"
                  onClick={() => {
                    setItemsToDelete([...selectedRemotePaths]);
                    setDialogMode('delete-remote');
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  <span>{selectedRemotePaths.length > 1 ? 'Delete Selected' : 'Delete'}</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {editorPath && (
        <AppDialog
          title={editorPath.split('/').pop() || 'Remote File'}
          description={editorPath}
          onClose={() => {
            setEditorPath(null);
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

      {dialogMode === 'create-folder' && (
        <AppDialog
          title="Create Remote Folder"
          description="Add a remote directory in the current path."
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
              placeholder="new-folder"
              onKeyDown={(e) => e.key === 'Enter' && confirmCreateFolder()}
            />
            <div className="sftp-dialog-actions">
              <button type="button" className="sftp-dialog-cancel" onClick={() => setDialogMode(null)}>
                Cancel
              </button>
              <button type="button" className="sftp-dialog-primary" onClick={confirmCreateFolder}>
                Create
              </button>
            </div>
          </div>
        </AppDialog>
      )}

      {dialogMode === 'rename-remote' && (
        <AppDialog
          title="Rename Remote Item"
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
              onKeyDown={(e) => e.key === 'Enter' && confirmRenameRemote()}
            />
            <div className="sftp-dialog-actions">
              <button type="button" className="sftp-dialog-cancel" onClick={() => setDialogMode(null)}>
                Cancel
              </button>
              <button type="button" className="sftp-dialog-primary" onClick={confirmRenameRemote}>
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

      {showHostPicker && (
        <SessionLauncherDialog
          mode="sftp"
          hosts={hosts}
          onClose={() => setShowHostPicker(false)}
          onSelectHost={(selectedHost) => {
            updateSession(sessionId, {
              hostId: selectedHost.id,
              title: `${selectedHost.name} SFTP`,
              status: 'idle',
              lastError: undefined,
            });
            setCurrentRemotePath('/');
            setRemoteFiles([]);
            setSelectedRemotePaths([]);
            setError(null);
            setShowHostPicker(false);
          }}
        />
      )}
    </div>
  );
};

export default SFTPView;
