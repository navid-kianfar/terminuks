import { useEffect } from 'react';
import { useHosts } from '../contexts/HostContext';
import { useTerminal } from '../contexts/TerminalContext';
import TerminalView from './TerminalView';
import SFTPView from './SFTPView';
import EmptyState from './EmptyState';
import TabBar from './TabBar';
import './MainContent.css';

const MainContent = () => {
  const { getHost, selectHost } = useHosts();
  const { sessions, activeSessionId, setActiveSession } = useTerminal();
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) || sessions[sessions.length - 1];

  useEffect(() => {
    if (activeSession && activeSession.id !== activeSessionId) {
      setActiveSession(activeSession.id);
    }
  }, [activeSession, activeSessionId, setActiveSession]);

  useEffect(() => {
    if (!activeSession?.hostId) {
      return;
    }

    const host = getHost(activeSession.hostId) || null;
    if (host) {
      selectHost(host);
    }
  }, [activeSession?.hostId, getHost, selectHost]);

  return (
    <div className="main-content">
      <TabBar />
      <div className="main-content-area">
        {activeSession ? (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`session-view ${session.id === activeSession.id ? 'active' : 'hidden'}`}
            >
              {session.type === 'sftp' ? (
                <SFTPView sessionId={session.id} />
              ) : (
                <TerminalView sessionId={session.id} />
              )}
            </div>
          ))
        ) : (
          <EmptyState message="Create a new terminal or SFTP tab to get started." />
        )}
      </div>
    </div>
  );
};

export default MainContent;
