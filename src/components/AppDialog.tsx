import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import './AppDialog.css';

interface AppDialogProps {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'default' | 'wide';
  headerActions?: ReactNode;
  bodyClassName?: string;
  containToParent?: boolean;
}

const AppDialog = ({
  title,
  description,
  children,
  onClose,
  size = 'default',
  headerActions,
  bodyClassName,
  containToParent = false,
}: AppDialogProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={`app-dialog-overlay ${containToParent ? 'app-dialog-overlay-contained' : ''}`}
      onClick={onClose}
    >
      <div className={`app-dialog app-dialog-${size}`} onClick={(event) => event.stopPropagation()}>
        <div className="app-dialog-header">
          <div>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <div className="app-dialog-header-actions">
            {headerActions}
            <button type="button" className="app-dialog-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={`app-dialog-body ${bodyClassName || ''}`.trim()}>{children}</div>
      </div>
    </div>
  );
};

export default AppDialog;
