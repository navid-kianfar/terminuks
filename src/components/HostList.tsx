import { useHosts } from '../contexts/HostContext';
import { useTerminal } from '../contexts/TerminalContext';
import { Host } from '../types';
import { Server, Trash2, Edit2, MoreVertical, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AlertDialog from './ui/alert-dialog';
import { cn } from '../lib/utils';
import './HostList.css';

interface HostListProps {
  hosts: Host[];
  collapsed?: boolean;
  onEditHost: (host: Host) => void;
}

const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

const HostList = ({ hosts, collapsed, onEditHost }: HostListProps) => {
  const { selectHost, selectedHost, deleteHost, duplicateHost } = useHosts();
  const { sessions, addSession, setActiveSession } = useTerminal();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [hostPendingDelete, setHostPendingDelete] = useState<Host | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const hostListRef = useRef<HTMLDivElement>(null);

  const toggleMenu = (hostId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuOpen === hostId) {
      setMenuOpen(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
      setMenuOpen(hostId);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;

    const handleAction = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      // If we clicked inside the menu portal, let the portal handle it
      if (target.closest('.portal-menu')) {
        return;
      }
      // If we clicked the trigger button, let its toggle handle it
      if (hostListRef.current?.contains(target)) {
        return;
      }
      // Otherwise close
      setMenuOpen(null);
    };

    document.addEventListener('pointerdown', handleAction);
    window.addEventListener('scroll', () => setMenuOpen(null), true);
    
    return () => {
      document.removeEventListener('pointerdown', handleAction);
      window.removeEventListener('scroll', () => setMenuOpen(null), true);
    };
  }, [menuOpen]);

  // Initialize all groups as expanded
  useEffect(() => {
    const groups = new Set(hosts.map(h => h.group || 'Ungrouped'));
    setExpandedGroups(groups);
  }, [hosts]); // Update when hosts change

  const getInitials = (name: string) => {
    return name
      .split(/[\s_-]/)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  };

  const toggleGroup = (group: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(group)) {
      newExpanded.delete(group);
    } else {
      newExpanded.add(group);
    }
    setExpandedGroups(newExpanded);
  };

  const handleHostClick = (host: Host) => {
    selectHost(host);
    setMenuOpen(null);
  };

  const handleHostDoubleClick = (host: Host) => {
    selectHost(host);
    const hostSessions = sessions.filter((session) => session.hostId === host.id);
    const existingSshSession = hostSessions.find((session) => session.type === 'ssh');
    if (existingSshSession) {
      setActiveSession(existingSshSession.id);
    } else {
      addSession({
        hostId: host.id,
        title: `${host.name} - Terminal`,
        type: 'ssh',
      });
    }
  };

  const handleDelete = (e: React.MouseEvent, hostId: string) => {
    e.stopPropagation();
    const host = hosts.find((item) => item.id === hostId) || null;
    setHostPendingDelete(host);
    setMenuOpen(null);
  };

  const groupedHosts = hosts.reduce((acc, host) => {
    const group = host.group || 'Ungrouped';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(host);
    return acc;
  }, {} as Record<string, Host[]>);

  if (hosts.length === 0) {
    return (
        <div className="host-list-empty">
          <Server size={48} />
          <p>No hosts yet</p>
          <span>Click Add Host to get started</span>
        </div>
      );
  }

  return (
    <div className={cn("host-list", collapsed && "collapsed-list")} ref={hostListRef}>
      {Object.entries(groupedHosts).map(([group, groupHosts]) => {
        const isExpanded = expandedGroups.has(group);
        return (
          <div key={group} className="host-group">
            {!collapsed && (
              <div 
                className="host-group-header" 
                onClick={() => toggleGroup(group)}
              >
                <div className="header-left">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="group-name">{group} ({groupHosts.length})</span>
                </div>
              </div>
            )}
            
            {isExpanded && groupHosts.map((host) => (
              <div
                key={host.id}
                className={cn(
                  "host-item",
                  selectedHost?.id === host.id && "active",
                  !collapsed && "indented"
                )}
                onClick={() => handleHostClick(host)}
                onDoubleClick={() => handleHostDoubleClick(host)}
                title={collapsed ? host.name : "Double-click to connect"}
              >
                <div className="host-item-content">
                  {collapsed ? (
                    <div 
                      className="host-avatar" 
                      style={{ backgroundColor: host.color || getAvatarColor(host.name) }}
                    >
                      {getInitials(host.name)}
                    </div>
                  ) : (
                    <div
                      className="host-item-icon"
                      style={
                        host.color
                          ? {
                              backgroundColor: `${host.color}1f`,
                              color: host.color,
                            }
                          : undefined
                      }
                    >
                      <Server size={14} />
                    </div>
                  )}
                  {!collapsed && (
                    <div className="host-item-info">
                      <div className="host-item-name">{host.name}</div>
                    </div>
                  )}
                </div>
                {!collapsed && (
                  <div className="host-item-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="host-item-menu"
                      onClick={(e) => toggleMenu(host.id, e)}
                      onMouseDown={(e) => e.stopPropagation()}
                      type="button"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {menuOpen === host.id && menuPosition && createPortal(
                      <div 
                        className="sftp-context-menu portal-menu"
                        style={{ 
                          position: 'fixed',
                          top: `${menuPosition.top}px`,
                          right: `${menuPosition.right}px`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="sftp-context-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditHost(host);
                          }}
                        >
                          <Edit2 size={12} />
                          <span>Edit</span>
                        </button>
                        <button
                          className="sftp-context-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateHost(host.id);
                          }}
                        >
                          <Copy size={12} />
                          <span>Duplicate</span>
                        </button>
                        <button
                          className="sftp-context-item danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(e, host.id);
                          }}
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </div>,
                      document.body
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      <AlertDialog
        open={Boolean(hostPendingDelete)}
          title="Delete Host"
          description="This removes the saved connection profile from local storage."
          onClose={() => setHostPendingDelete(null)}
          onConfirm={() => {
            if (hostPendingDelete) {
              deleteHost(hostPendingDelete.id);
            }
            setHostPendingDelete(null);
          }}
      >
          <p className="host-dialog-copy">
            Delete <code>{hostPendingDelete?.name || 'this host'}</code>?
          </p>
      </AlertDialog>
    </div>
  );
};

export default HostList;
