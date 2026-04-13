import { useCallback, useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { resolveLanguage } from '../utils/editor-utils';
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
import { sftpService } from '../services/sftp';
import { useHosts } from '../contexts/HostContext';
import { useTransfer } from '../contexts/TransferContext';
import { useTheme } from '../contexts/ThemeContext';
import AppDialog from './AppDialog';
import AlertDialog from './ui/alert-dialog';
import Button from './ui/button';
import './SSHWorkspace.css';

interface SSHWorkspaceProps {
  hostId: string;
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

interface ContextMenuState {
  pane: 'local' | 'remote';
  x: number;
  y: number;
  itemPath: string | null;
}

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

const renderSkeletonRows = (prefix: string) =>
  Array.from({ length: 8 }, (_, index) => (
    <div key={`${prefix}-${index}`} className="workspace-skeleton-row">
      <span className="workspace-skeleton-icon" />
      <span className="workspace-skeleton-line" />
    </div>
  ));

const SSHWorkspace = ({ hostId }: SSHWorkspaceProps) => {
  const { getHost } = useHosts();
  const { resolvedTheme } = useTheme();
  const host = getHost(hostId);
  const [currentRemotePath, setCurrentRemotePath] = useState('/');
  const [currentLocalPath, setCurrentLocalPath] = useState<string | null>(null);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFileItem[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFileItem[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [, setStatus] = useState<string>('Remote workspace ready');
  const [selectedRemotePath, setSelectedRemotePath] = useState<string | null>(null);
  const [selectedLocalPath, setSelectedLocalPath] = useState<string | null>(null);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [editorPane, setEditorPane] = useState<'local' | 'remote' | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editingPath, setEditingPath] = useState<'local' | 'remote' | null>(null);
  const [dialogMode, setDialogMode] = useState<
    null | 'file' | 'folder' | 'local-file' | 'local-folder' | 'delete' | 'rename' | 'rename-local'
  >(null);
  const [draftName, setDraftName] = useState('');
  const [itemToRename, setItemToRename] = useState<{ path: string; name: string } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{
    path: string;
    name: string;
    type: 'file' | 'directory' | 'link';
  } | null>(null);
  const [localFilter, setLocalFilter] = useState('');
  const [remoteFilter, setRemoteFilter] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const { addTransfer } = useTransfer();

  const selectedRemoteFile = useMemo(
    () =>
      remoteFiles.find(
        (file) => joinRemotePath(currentRemotePath, file.name) === selectedRemotePath
      ),
    [currentRemotePath, remoteFiles, selectedRemotePath]
  );

  const selectedLocalFile = useMemo(
    () => localFiles.find((file) => file.path === selectedLocalPath),
    [localFiles, selectedLocalPath]
  );

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

  const loadRemoteDirectory = useCallback(
    async (path: string) => {
      if (!host) {
        return;
      }

      setLoadingRemote(true);
      try {
        await sftpService.connect(host).catch(() => undefined);
        const listedFiles = await sftpService.listFiles(host.id, path);
        setRemoteFiles(
          listedFiles.map((file) => ({
            name: file.name,
            type: normalizeRemoteType(file.type),
            size: file.size,
            modifyTime: file.modifyTime,
          }))
        );
        setStatus(`Browsing ${path}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load workspace';
        setStatus(message);
        setRemoteFiles([]);
      } finally {
        setLoadingRemote(false);
      }
    },
    [host]
  );

  const loadLocalDirectory = useCallback(async (path: string) => {
    if (!window.electron) {
      return;
    }

    setLoadingLocal(true);
    try {
      const entries = await window.electron.localfs.list(path);
      setCurrentLocalPath(path);
      setLocalFiles(entries);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load local files';
      setStatus(message);
      setLocalFiles([]);
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  useEffect(() => {
    loadRemoteDirectory(currentRemotePath);
  }, [currentRemotePath, loadRemoteDirectory]);

  useEffect(() => {
    if (!window.electron || currentLocalPath) {
      return;
    }

    window.electron.localfs
      .home()
      .then((homePath) => {
        if (homePath) {
          loadLocalDirectory(homePath);
        }
      })
      .catch(() => undefined);
  }, [currentLocalPath, loadLocalDirectory]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.workspace-context-menu')) return;
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
        detail.hostId === hostId &&
        getRemoteParentPath(detail.remotePath) === currentRemotePath
      ) {
        loadRemoteDirectory(currentRemotePath);
      }

      if (
        detail.type === 'download' &&
        currentLocalPath &&
        getLocalParentPath(detail.localPath) === currentLocalPath
      ) {
        loadLocalDirectory(currentLocalPath);
      }
    };

    window.addEventListener('terminuks:transfer-finished', handleTransferFinished as EventListener);
    return () =>
      window.removeEventListener(
        'terminuks:transfer-finished',
        handleTransferFinished as EventListener
      );
  }, [currentLocalPath, currentRemotePath, hostId, loadLocalDirectory, loadRemoteDirectory]);

  const openRemoteFile = async (remotePath: string) => {
    if (!host) {
      return;
    }

    setEditorLoading(true);
    try {
      const content = await sftpService.readFile(host.id, remotePath);
      setEditorPane('remote');
      setEditorPath(remotePath);
      setEditorContent(content);
      setDirty(false);
      setStatus(`Opened ${remotePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open file';
      setStatus(message);
    } finally {
      setEditorLoading(false);
    }
  };

  const openLocalFile = async (localPath: string) => {
    if (!window.electron) {
      return;
    }

    setEditorLoading(true);
    try {
      const content = await window.electron.localfs.readFile(localPath);
      setEditorPane('local');
      setEditorPath(localPath);
      setEditorContent(content);
      setDirty(false);
      setStatus(`Opened ${localPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open local file';
      setStatus(message);
    } finally {
      setEditorLoading(false);
    }
  };

  const chooseLocalDirectory = async () => {
    if (!window.electron) {
      setStatus('Electron app is required for local file browsing.');
      return;
    }

    const result = await window.electron.dialog.openDirectory();
    if (!result.canceled && result.filePaths[0]) {
      loadLocalDirectory(result.filePaths[0]);
    }
  };

  const handleRemoteClick = (file: RemoteFileItem) => {
    const remotePath = joinRemotePath(currentRemotePath, file.name);
    setSelectedRemotePath(remotePath);
  };

  const handleRemoteDoubleClick = (file: RemoteFileItem) => {
    const remotePath = joinRemotePath(currentRemotePath, file.name);
    setSelectedRemotePath(remotePath);
    if (file.type === 'directory') {
      setCurrentRemotePath(remotePath);
      return;
    }

    openRemoteFile(remotePath);
  };

  const handleLocalClick = (file: LocalFileItem) => {
    setSelectedLocalPath(file.path);
  };

  const handleLocalDoubleClick = (file: LocalFileItem) => {
    if (file.type === 'directory') {
      loadLocalDirectory(file.path);
      setSelectedLocalPath(null);
      return;
    }

    openLocalFile(file.path);
  };

  const uploadLocalFile = useCallback(
    async (localPath: string) => {
      if (!host) return;

      const fileName = localPath.split(/[\\/]/).pop() || 'upload';
      const remotePath = joinRemotePath(currentRemotePath, fileName);

      addTransfer({
        name: fileName,
        type: 'upload',
        hostId: host.id,
        remotePath,
        localPath,
      });

      setStatus(`Added ${fileName} to transfer queue`);
    },
    [host, currentRemotePath, addTransfer]
  );

  const downloadRemoteFile = useCallback(
    async (remotePath: string) => {
      if (!host || !window.electron) return;

      const fileName = remotePath.split('/').pop() || 'download';
      const targetPath = currentLocalPath
        ? `${currentLocalPath}/${fileName}`
        : (await window.electron.dialog.saveFile({ defaultPath: fileName })).filePath;

      if (!targetPath) return;

      addTransfer({
        name: fileName,
        type: 'download',
        hostId: host.id,
        remotePath,
        localPath: targetPath,
      });

      setStatus(`Added ${fileName} to transfer queue`);
    },
    [host, currentLocalPath, addTransfer]
  );

  const saveFile = async () => {
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
          await loadLocalDirectory(currentLocalPath);
        }
      } else {
        if (!host) {
          return;
        }
        await sftpService.writeFile(host.id, editorPath, editorContent);
        await loadRemoteDirectory(currentRemotePath);
      }
      setDirty(false);
      setStatus(`Saved ${editorPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save file';
      setStatus(message);
    }
  };

  const submitDialog = async () => {
    if (
      !host &&
      (dialogMode === 'file' ||
        dialogMode === 'folder' ||
        dialogMode === 'delete' ||
        dialogMode === 'rename')
    ) {
      return;
    }

    try {
      if (dialogMode === 'file' && draftName.trim()) {
        const targetPath = joinRemotePath(currentRemotePath, draftName.trim());
        await sftpService.writeFile(host.id, targetPath, '');
        await loadRemoteDirectory(currentRemotePath);
        await openRemoteFile(targetPath);
        setStatus(`Created ${targetPath}`);
      }

      if (dialogMode === 'folder' && draftName.trim()) {
        const targetPath = joinRemotePath(currentRemotePath, draftName.trim());
        await sftpService.createDirectory(host.id, targetPath);
        await loadRemoteDirectory(currentRemotePath);
        setStatus(`Created ${targetPath}`);
      }

      if (dialogMode === 'local-file' && currentLocalPath && draftName.trim()) {
        const targetPath = joinLocalPath(currentLocalPath, draftName.trim());
        await window.electron?.localfs.createFile(targetPath);
        await loadLocalDirectory(currentLocalPath);
        await openLocalFile(targetPath);
        setStatus(`Created ${targetPath}`);
      }

      if (dialogMode === 'local-folder' && currentLocalPath && draftName.trim()) {
        const targetPath = joinLocalPath(currentLocalPath, draftName.trim());
        await window.electron?.localfs.createDirectory(targetPath);
        await loadLocalDirectory(currentLocalPath);
        setStatus(`Created ${targetPath}`);
      }

      if (dialogMode === 'delete' && itemToDelete) {
        if (itemToDelete.type === 'directory') {
          await sftpService.deleteDirectory(host.id, itemToDelete.path);
        } else {
          await sftpService.deleteFile(host.id, itemToDelete.path);
        }
        if (editorPath === itemToDelete.path) {
          setEditorPath(null);
          setEditorContent('');
          setDirty(false);
        }
        setSelectedRemotePath(null);
        await loadRemoteDirectory(currentRemotePath);
        setStatus(`Deleted ${itemToDelete.name}`);
      }

      if (dialogMode === 'rename' && itemToRename && draftName.trim()) {
        const parent = getRemoteParentPath(itemToRename.path);
        const newPath = joinRemotePath(parent, draftName.trim());
        await sftpService.rename(host.id, itemToRename.path, newPath);
        await loadRemoteDirectory(currentRemotePath);
        setStatus(`Renamed to ${draftName.trim()}`);
      }

      if (dialogMode === 'rename-local' && itemToRename && draftName.trim()) {
        const parent = getLocalParentPath(itemToRename.path);
        const newPath = joinLocalPath(parent, draftName.trim());
        await window.electron?.localfs.rename(itemToRename.path, newPath);
        if (editorPane === 'local' && editorPath === itemToRename.path) {
          setEditorPath(newPath);
        }
        setSelectedLocalPath(newPath);
        if (currentLocalPath) {
          await loadLocalDirectory(currentLocalPath);
        }
        setStatus(`Renamed to ${draftName.trim()}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote action failed';
      setStatus(message);
    } finally {
      setDraftName('');
      setDialogMode(null);
    }
  };

  const openContextMenu = (
    event: React.MouseEvent,
    pane: 'local' | 'remote',
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

  const languageExtension = useMemo(
    () => (editorPath ? resolveLanguage(editorPath) : []),
    [editorPath]
  );
  const contextLocalFile =
    contextMenu?.pane === 'local' && contextMenu.itemPath
      ? (localFiles.find((file) => file.path === contextMenu.itemPath) ?? null)
      : null;
  const contextRemoteFile =
    contextMenu?.pane === 'remote' && contextMenu.itemPath
      ? (remoteFiles.find(
          (file) => joinRemotePath(currentRemotePath, file.name) === contextMenu.itemPath
        ) ?? null)
      : null;

  return (
    <div className="ssh-workspace">
      <div className="ssh-workspace-pane">
        <div className="ssh-workspace-header">
          <div className="pane-path-container">
            <span className="workspace-eyebrow">Local</span>
            {editingPath === 'local' ? (
              <input
                type="text"
                autoFocus
                className="pane-path-input"
                defaultValue={currentLocalPath || ''}
                onBlur={() => setEditingPath(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadLocalDirectory(e.currentTarget.value);
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
          <div className="workspace-header-actions">
            <button
              type="button"
              className="workspace-icon-btn"
              onClick={chooseLocalDirectory}
              title="Choose local folder"
            >
              <HardDrive size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              disabled={!currentLocalPath}
              onClick={() => currentLocalPath && loadLocalDirectory(currentLocalPath)}
              title="Refresh local folder"
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              disabled={!currentLocalPath}
              onClick={() =>
                currentLocalPath && loadLocalDirectory(getLocalParentPath(currentLocalPath))
              }
              title="Up"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              disabled={!currentLocalPath}
              onClick={() => setDialogMode('local-file')}
              title="New local file"
            >
              <FilePlus2 size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              disabled={!currentLocalPath}
              onClick={() => setDialogMode('local-folder')}
              title="New local folder"
            >
              <FolderPlus size={14} />
            </button>
          </div>
        </div>

        <div className="workspace-pane-filter">
          <Search size={14} />
          <input
            type="text"
            value={localFilter}
            onChange={(event) => setLocalFilter(event.target.value)}
            placeholder="Filter local files"
          />
        </div>

        <div
          className="workspace-file-list"
          onClick={() => setSelectedLocalPath(null)}
          onContextMenu={(event) => openContextMenu(event, 'local', null)}
        >
          {loadingLocal ? (
            <div className="workspace-skeleton-list">{renderSkeletonRows('ssh-local')}</div>
          ) : currentLocalPath ? (
            filteredLocalFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                className={`workspace-file-item ${selectedLocalPath === file.path ? 'active' : ''}`}
                draggable={file.type === 'file'}
                onDragStart={(event) =>
                  event.dataTransfer.setData('application/x-terminuks-local', file.path)
                }
                onClick={(event) => {
                  event.stopPropagation();
                  handleLocalClick(file);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  handleLocalDoubleClick(file);
                }}
                onContextMenu={(event) =>
                  openContextMenu(event, 'local', file.path, () => {
                    if (selectedLocalPath !== file.path) {
                      setSelectedLocalPath(file.path);
                    }
                  })
                }
              >
                <span className="workspace-file-icon">
                  {file.type === 'directory' ? <Folder size={15} /> : <File size={15} />}
                </span>
                <span className="workspace-file-name">{file.name}</span>
              </button>
            ))
          ) : (
            <div className="workspace-empty">Choose a local folder to start browsing.</div>
          )}
        </div>
      </div>

      <div
        className="ssh-workspace-pane"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const localPath = event.dataTransfer.getData('application/x-terminuks-local');
          if (localPath) {
            uploadLocalFile(localPath);
          }
        }}
      >
        <div className="ssh-workspace-header">
          <div className="pane-path-container">
            <span className="workspace-eyebrow">Remote</span>
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
          <div className="workspace-header-actions">
            <button
              type="button"
              className="workspace-icon-btn"
              onClick={() => loadRemoteDirectory(currentRemotePath)}
              title="Refresh remote folder"
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              disabled={currentRemotePath === '/'}
              onClick={() => setCurrentRemotePath(getRemoteParentPath(currentRemotePath))}
              title="Up"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              onClick={() => setDialogMode('file')}
              title="New file"
            >
              <FilePlus2 size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              onClick={() => setDialogMode('folder')}
              title="New folder"
            >
              <FolderPlus size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              disabled={!selectedRemotePath}
              onClick={() => selectedRemotePath && downloadRemoteFile(selectedRemotePath)}
              title="Download"
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              disabled={!selectedLocalPath}
              onClick={() => selectedLocalPath && uploadLocalFile(selectedLocalPath)}
              title="Upload"
            >
              <Upload size={14} />
            </button>
            <button
              type="button"
              className="workspace-icon-btn"
              disabled={!selectedRemotePath}
              onClick={() => {
                if (selectedRemotePath) {
                  setItemToDelete({
                    path: selectedRemotePath,
                    name: selectedRemotePath.split('/').pop() || 'item',
                    type: selectedRemoteFile?.type || 'file',
                  });
                  setDialogMode('delete');
                }
              }}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="workspace-pane-filter">
          <Search size={14} />
          <input
            type="text"
            value={remoteFilter}
            onChange={(event) => setRemoteFilter(event.target.value)}
            placeholder="Filter remote files"
          />
        </div>

        <div
          className="workspace-file-list"
          onClick={() => setSelectedRemotePath(null)}
          onContextMenu={(event) => openContextMenu(event, 'remote', null)}
        >
          {loadingRemote ? (
            <div className="workspace-skeleton-list">{renderSkeletonRows('ssh-remote')}</div>
          ) : filteredRemoteFiles.length === 0 ? (
            <div className="workspace-empty">This directory is empty.</div>
          ) : (
            filteredRemoteFiles.map((file) => {
              const itemPath = joinRemotePath(currentRemotePath, file.name);
              return (
                <button
                  key={itemPath}
                  type="button"
                  className={`workspace-file-item ${selectedRemotePath === itemPath ? 'active' : ''}`}
                  draggable={file.type !== 'directory'}
                  onDragStart={(event) =>
                    event.dataTransfer.setData('application/x-terminuks-remote', itemPath)
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoteClick(file);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    handleRemoteDoubleClick(file);
                  }}
                  onContextMenu={(event) =>
                    openContextMenu(event, 'remote', itemPath, () => {
                      if (selectedRemotePath !== itemPath) {
                        setSelectedRemotePath(itemPath);
                      }
                    })
                  }
                >
                  <span className="workspace-file-icon">
                    {file.type === 'directory' ? <Folder size={15} /> : <Server size={15} />}
                  </span>
                  <span className="workspace-file-name">{file.name}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="workspace-footer">
          {selectedRemotePath
            ? 'Right-click for options. Double-click files to edit.'
            : 'Select a file or folder. Right-click for options.'}
        </div>
      </div>

      {contextMenu && (
        <div
          className="workspace-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.pane === 'local' ? (
            <>
              {contextLocalFile?.type === 'directory' && (
                <button
                  type="button"
                  className="workspace-context-item"
                  onClick={() => {
                    loadLocalDirectory(contextLocalFile.path);
                    setContextMenu(null);
                  }}
                >
                  <FolderOpen size={14} />
                  <span>Open Folder</span>
                </button>
              )}
              {contextLocalFile?.type === 'file' && contextMenu.itemPath && (
                <button
                  type="button"
                  className="workspace-context-item"
                  onClick={() => {
                    openLocalFile(contextMenu.itemPath!);
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
                  className="workspace-context-item"
                  onClick={() => {
                    const name =
                      contextLocalFile?.name || contextMenu.itemPath.split(/[\\/]/).pop() || '';
                    setDraftName(name);
                    setItemToRename({ path: contextMenu.itemPath, name });
                    setDialogMode('rename-local');
                    setContextMenu(null);
                  }}
                >
                  <Type size={14} />
                  <span>Rename</span>
                </button>
              )}
              {contextLocalFile?.type === 'file' && contextMenu.itemPath && (
                <button
                  type="button"
                  className="workspace-context-item"
                  onClick={() => {
                    uploadLocalFile(contextMenu.itemPath!);
                    setContextMenu(null);
                  }}
                >
                  <Upload size={14} />
                  <span>Upload</span>
                </button>
              )}
              <button
                type="button"
                className="workspace-context-item"
                onClick={() => {
                  if (currentLocalPath) {
                    loadLocalDirectory(currentLocalPath);
                  }
                  setContextMenu(null);
                }}
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                className="workspace-context-item"
                onClick={() => {
                  setDialogMode('local-file');
                  setContextMenu(null);
                }}
              >
                <FilePlus2 size={14} />
                <span>New File</span>
              </button>
              <button
                type="button"
                className="workspace-context-item"
                onClick={() => {
                  setDialogMode('local-folder');
                  setContextMenu(null);
                }}
              >
                <FolderPlus size={14} />
                <span>New Folder</span>
              </button>
              <button
                type="button"
                className="workspace-context-item"
                onClick={() => {
                  chooseLocalDirectory();
                  setContextMenu(null);
                }}
              >
                <HardDrive size={14} />
                <span>Choose Folder</span>
              </button>
            </>
          ) : (
            <>
              {selectedRemoteFile?.type === 'directory' && (
                <button
                  type="button"
                  className="workspace-context-item"
                  onClick={() => {
                    if (selectedRemotePath) {
                      setCurrentRemotePath(selectedRemotePath);
                    }
                    setContextMenu(null);
                  }}
                >
                  <FolderOpen size={14} />
                  <span>Open Folder</span>
                </button>
              )}
              {selectedRemoteFile?.type !== 'directory' && selectedRemotePath && (
                <button
                  type="button"
                  className="workspace-context-item"
                  onClick={() => {
                    openRemoteFile(selectedRemotePath);
                    setContextMenu(null);
                  }}
                >
                  <Pencil size={14} />
                  <span>Edit in Dialog</span>
                </button>
              )}
              {selectedRemotePath && (
                <button
                  type="button"
                  className="workspace-context-item"
                  onClick={() => {
                    const name = selectedRemotePath.split('/').pop() || '';
                    setDraftName(name);
                    setItemToRename({ path: selectedRemotePath, name });
                    setDialogMode('rename');
                    setContextMenu(null);
                  }}
                >
                  <Type size={14} />
                  <span>Rename</span>
                </button>
              )}
              {selectedRemotePath && (
                <button
                  type="button"
                  className="workspace-context-item"
                  onClick={() => {
                    downloadRemoteFile(selectedRemotePath);
                    setContextMenu(null);
                  }}
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>
              )}
              <button
                type="button"
                className="workspace-context-item"
                onClick={() => {
                  setDialogMode('file');
                  setContextMenu(null);
                }}
              >
                <FilePlus2 size={14} />
                <span>New File</span>
              </button>
              <button
                type="button"
                className="workspace-context-item"
                onClick={() => {
                  setDialogMode('folder');
                  setContextMenu(null);
                }}
              >
                <FolderPlus size={14} />
                <span>New Folder</span>
              </button>
              {selectedRemotePath && (
                <button
                  type="button"
                  className="workspace-context-item danger"
                  onClick={() => {
                    setItemToDelete({
                      path: selectedRemotePath,
                      name: selectedRemotePath.split('/').pop() || 'item',
                      type: selectedRemoteFile?.type || 'file',
                    });
                    setDialogMode('delete');
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
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
          size="wide"
          containToParent
          bodyClassName="app-dialog-body-flush"
          headerActions={
            <Button
              type="button"
              variant="outline"
              onClick={saveFile}
              disabled={!dirty || editorLoading}
            >
              <Save size={14} />
              Save
            </Button>
          }
          onClose={() => {
            setEditorPath(null);
            setEditorPane(null);
            setDirty(false);
          }}
        >
          <div className="workspace-editor-modal">
            {editorLoading ? (
              <div className="workspace-editor-loading">{renderSkeletonRows('ssh-editor')}</div>
            ) : (
              <CodeMirror
                key={`${resolvedTheme}-${editorPath}`}
                value={editorContent}
                height="68vh"
                theme={resolvedTheme === 'light' ? 'light' : 'dark'}
                extensions={
                  Array.isArray(languageExtension) ? languageExtension : [languageExtension]
                }
                onChange={(value) => {
                  setEditorContent(value);
                  setDirty(true);
                }}
              />
            )}
          </div>
        </AppDialog>
      )}

      <AlertDialog
        open={dialogMode === 'delete' && Boolean(itemToDelete)}
        title="Delete Selection"
        description="This action removes the selected remote item."
        onClose={() => {
          setDialogMode(null);
          setItemToDelete(null);
        }}
        onConfirm={submitDialog}
      >
        <p className="workspace-dialog-copy">
          Delete <code>{itemToDelete?.name || 'this item'}</code>?
        </p>
      </AlertDialog>

      {(dialogMode === 'file' ||
        dialogMode === 'folder' ||
        dialogMode === 'local-file' ||
        dialogMode === 'local-folder' ||
        dialogMode === 'rename' ||
        dialogMode === 'rename-local') && (
        <AppDialog
          title={
            dialogMode === 'file'
              ? 'Create File'
              : dialogMode === 'folder'
                ? 'Create Folder'
                : dialogMode === 'local-file'
                  ? 'Create Local File'
                  : dialogMode === 'local-folder'
                    ? 'Create Local Folder'
                    : dialogMode === 'rename-local'
                      ? 'Rename Local Item'
                      : 'Rename Item'
          }
          description={
            dialogMode === 'rename'
              ? 'Enter a new name for the remote item.'
              : dialogMode === 'rename-local'
                ? 'Enter a new name for the local item.'
                : dialogMode === 'local-file' || dialogMode === 'local-folder'
                  ? 'Choose the local name to create in the current directory.'
                  : 'Choose the remote name to create in the current directory.'
          }
          onClose={() => {
            setDialogMode(null);
            setDraftName('');
            setItemToRename(null);
          }}
        >
          <div className="workspace-dialog-actions">
            <input
              type="text"
              autoFocus
              value={draftName}
              placeholder={
                dialogMode === 'file' || dialogMode === 'local-file' ? 'config.json' : 'new-folder'
              }
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitDialog()}
            />
            <div className="workspace-dialog-buttons">
              <button
                type="button"
                className="workspace-ghost-btn"
                onClick={() => setDialogMode(null)}
              >
                Cancel
              </button>
              <button type="button" className="workspace-primary-btn" onClick={submitDialog}>
                {dialogMode === 'rename' || dialogMode === 'rename-local' ? 'Rename' : 'Create'}
              </button>
            </div>
          </div>
        </AppDialog>
      )}
    </div>
  );
};

export default SSHWorkspace;
