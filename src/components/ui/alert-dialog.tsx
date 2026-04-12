import { ReactNode } from 'react';
import Button from './button';
import AppDialog from '../AppDialog';
import './ui.css';

interface AlertDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}

const AlertDialog = ({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  children,
}: AlertDialogProps) => {
  if (!open) {
    return null;
  }

  return (
    <AppDialog
      title={title}
      description={description}
      onClose={onClose}
      bodyClassName="app-dialog-body-alert"
    >
      <div className="ui-alert-dialog">
        <div className="ui-alert-dialog-copy">
          {children}
        </div>
        <div className="ui-alert-dialog-actions">
          <Button variant="outline" className="ui-alert-cancel" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" className="ui-alert-delete" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
};

export default AlertDialog;
