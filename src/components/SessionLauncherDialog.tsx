import { useMemo, useState } from 'react';
import { Folder, Search, Server, Terminal } from 'lucide-react';
import { Host } from '../types';
import AppDialog from './AppDialog';
import Button from './ui/button';
import Input from './ui/input';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import './SessionLauncherDialog.css';

interface SessionLauncherDialogProps {
  mode: 'terminal' | 'sftp';
  hosts: Host[];
  onClose: () => void;
  onSelectHost: (host: Host) => void;
  onSelectLocal?: () => void;
}

const SessionLauncherDialog = ({
  mode,
  hosts,
  onClose,
  onSelectHost,
  onSelectLocal,
}: SessionLauncherDialogProps) => {
  const [query, setQuery] = useState('');

  const filteredHosts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return hosts;
    }

    return hosts.filter((host) =>
      [host.name, host.address, host.username, host.group, ...(host.tags || [])]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized))
    );
  }, [hosts, query]);

  const isTerminal = mode === 'terminal';

  return (
    <AppDialog
      title={isTerminal ? 'New Terminal' : 'Connect Remote Host'}
      description={
        isTerminal
          ? 'Open a local terminal or reconnect to any saved host without changing the sidebar first.'
          : 'Pick which saved host should power the remote side of this SFTP workspace.'
      }
      onClose={onClose}
      size="default"
      containToParent
    >
      <div className="session-launcher">
        <div className="session-launcher-search">
          <Search size={16} />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isTerminal ? 'Filter hosts or search by address' : 'Filter available hosts'}
          />
        </div>

        {isTerminal && onSelectLocal && (
          <Card className="session-launcher-local">
            <CardHeader>
              <div className="session-launcher-heading">
                <div>
                  <CardTitle>Local Terminal</CardTitle>
                  <CardDescription>
                    Open a local shell tab without binding it to a saved SSH host.
                  </CardDescription>
                </div>
                <Badge>Preview</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="primary" onClick={onSelectLocal}>
                <Terminal size={16} />
                Open Local Terminal
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="session-launcher-results">
          {filteredHosts.length === 0 ? (
            <div className="session-launcher-empty">
              <strong>No matching hosts</strong>
              <span>Try a different name, group, username, or address.</span>
            </div>
          ) : (
            filteredHosts.map((host) => (
              <button
                key={host.id}
                type="button"
                className="session-launcher-host"
                onClick={() => onSelectHost(host)}
              >
                <div className="session-launcher-host-icon">
                  {isTerminal ? <Terminal size={16} /> : <Folder size={16} />}
                </div>
                <div className="session-launcher-host-copy">
                  <strong>{host.name}</strong>
                  <span>
                    {host.username}@{host.address}:{host.port}
                  </span>
                </div>
                {host.group && <Badge>{host.group}</Badge>}
                <div className="session-launcher-host-action">
                  <Server size={14} />
                  <span>{isTerminal ? 'SSH Terminal' : 'Remote SFTP'}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </AppDialog>
  );
};

export default SessionLauncherDialog;
