import { Server, Terminal } from 'lucide-react';
import './EmptyState.css';

interface EmptyStateProps {
  message?: string;
}

const EmptyState = ({ message }: EmptyStateProps) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Server size={64} />
      </div>
      <h2>No Host Selected</h2>
      <p>{message || 'Select a host from the sidebar to get started'}</p>
      <div className="empty-state-features">
        <div className="feature">
          <Terminal size={24} />
          <span>SSH Terminal</span>
        </div>
        <div className="feature">
          <Server size={24} />
          <span>SFTP File Transfer</span>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;

