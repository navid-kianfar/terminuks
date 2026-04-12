import { useMemo, useState } from 'react';
import { Folder, Terminal, X } from 'lucide-react';
import { useTerminal } from '../contexts/TerminalContext';
import { useHosts } from '../contexts/HostContext';
import { sshService } from '../services/ssh';
import { sftpService } from '../services/sftp';
import SessionLauncherDialog from './SessionLauncherDialog';
import './TabBar.css';

const TabBar = () => {
  const { sessions, activeSessionId, setActiveSession, removeSession, addSession } = useTerminal();
  const { hosts, selectHost } = useHosts();
  const [launcherMode, setLauncherMode] = useState<null | 'terminal'>(null);

  const sessionLabels = useMemo(
    () =>
      Object.fromEntries(
        sessions.map((session) => {
          const host = session.hostId ? hosts.find((item) => item.id === session.hostId) : undefined;
          const subtitle =
            session.type === 'local'
              ? 'Local shell'
              : host
                ? `${host.username}@${host.address}`
                : 'Choose remote host';
          return [session.id, subtitle];
        })
      ),
    [hosts, sessions]
  );

  const handleCloseTab = async (event: React.MouseEvent, sessionId: string) => {
    event.stopPropagation();
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    if (session.hostId) {
      const siblingSessions = sessions.filter((item) => item.id !== sessionId);
      const hostSessionsOfSameType = siblingSessions.filter(
        (item) => item.hostId === session.hostId && item.type === session.type
      );

      if (session.type === 'ssh') {
        if (session.streamId) {
          await sshService.closeShell(session.hostId, session.streamId);
        }
        if (hostSessionsOfSameType.length === 0) {
          await sshService.disconnect(session.hostId);
        }
      }

      if (session.type === 'sftp' && hostSessionsOfSameType.length === 0) {
        await sftpService.disconnect(session.hostId);
      }
    }

    removeSession(sessionId);
  };

  const createTerminalSession = (hostId: string, hostName: string) => {
    addSession({
      hostId,
      title: `${hostName} Terminal`,
      type: 'ssh',
    });
  };

  const createLocalSession = () => {
    addSession({
      title: 'Local Terminal',
      type: 'local',
      status: 'connected',
    });
  };

  const createSftpSession = () => {
    addSession({
      title: 'New SFTP',
      type: 'sftp',
      status: 'idle',
    });
  };

  return (
    <>
      <div className="tab-bar">
        <div className="tab-bar-tabs">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`tab ${activeSessionId === session.id ? 'active' : ''}`}
              onClick={() => {
                setActiveSession(session.id);
                if (session.hostId) {
                  const host = hosts.find((item) => item.id === session.hostId) || null;
                  selectHost(host);
                }
              }}
            >
              {session.type === 'sftp' ? <Folder size={14} /> : <Terminal size={14} />}
              <span className={`tab-status tab-status-${session.status || 'idle'}`} />
              <div className="tab-copy">
                <strong>{session.title}</strong>
                <span>{sessionLabels[session.id]}</span>
              </div>
              <button className="tab-close" onClick={(event) => handleCloseTab(event, session.id)}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="tab-bar-actions">
          <button
            className="tab-action-btn"
            onClick={() => setLauncherMode('terminal')}
            title="New Terminal"
          >
            <Terminal size={16} />
            <span>New Terminal</span>
          </button>
          <button className="tab-action-btn" onClick={createSftpSession} title="New SFTP">
            <Folder size={16} />
            <span>New SFTP</span>
          </button>
        </div>
      </div>

      {launcherMode === 'terminal' && (
        <SessionLauncherDialog
          mode="terminal"
          hosts={hosts}
          onClose={() => setLauncherMode(null)}
          onSelectLocal={() => {
            createLocalSession();
            setLauncherMode(null);
          }}
          onSelectHost={(host) => {
            createTerminalSession(host.id, host.name);
            selectHost(host);
            setLauncherMode(null);
          }}
        />
      )}
    </>
  );
};

export default TabBar;
