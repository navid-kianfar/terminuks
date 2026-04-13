import { useHosts } from '../contexts/HostContext';
import { DualPaneSFTPWorkspace } from './SFTPView';

interface SSHWorkspaceProps {
  hostId: string;
}

const SSHWorkspace = ({ hostId }: SSHWorkspaceProps) => {
  const { getHost } = useHosts();
  const host = getHost(hostId);

  return <DualPaneSFTPWorkspace host={host} variant="embedded" />;
};

export default SSHWorkspace;
