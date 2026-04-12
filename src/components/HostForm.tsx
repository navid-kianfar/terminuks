import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useHosts } from '../contexts/HostContext';
import { Key, Lock } from 'lucide-react';
import { Host } from '../types';
import Select from './ui/select';
import ColorPicker from './ui/color-picker';
import AppDialog from './AppDialog';
import './HostForm.css';

interface HostFormProps {
  onClose: () => void;
  onSave: () => void;
  host?: Host | null;
}

const hostColors = [
  '#3b82f6',
  '#2563eb',
  '#06b6d4',
  '#10b981',
  '#22c55e',
  '#84cc16',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#64748b',
];

const HostForm = ({ onClose, onSave, host }: HostFormProps) => {
  const { addHost, updateHost } = useHosts();
  const defaultColor = host?.color || '#3b82f6';
  const [formData, setFormData] = useState({
    name: host?.name || '',
    address: host?.address || '',
    port: host?.port || 22,
    username: host?.username || '',
    authMethod: host?.authMethod || ('password' as 'password' | 'key' | 'keyFile'),
    password: host?.password || '',
    keyPath: host?.keyPath || '',
    keyData: host?.keyData || '',
    passphrase: host?.passphrase || '',
    group: host?.group || '',
    notes: host?.notes || '',
    color: defaultColor,
  });
  const [error, setError] = useState<string | null>(null);

  const getGeneratedColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hostColors[Math.abs(hash) % hostColors.length];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.address || !formData.username) {
      setError('Name, address, and username are required.');
      return;
    }

    if (formData.authMethod === 'password' && !formData.password) {
      setError('Password authentication requires a password.');
      return;
    }

    if (formData.authMethod === 'key' && !formData.keyData) {
      setError('Private key authentication requires pasted key data.');
      return;
    }

    if (formData.authMethod === 'keyFile' && !formData.keyPath) {
      setError('Private key file authentication requires a key file.');
      return;
    }

    const payload = {
      name: formData.name,
      address: formData.address,
      port: formData.port,
      username: formData.username,
      authMethod: formData.authMethod,
      password: formData.authMethod === 'password' ? formData.password : undefined,
      keyPath: formData.authMethod === 'keyFile' ? formData.keyPath : undefined,
      keyData: formData.authMethod === 'key' ? formData.keyData : undefined,
      passphrase: formData.passphrase || undefined,
      group: formData.group || undefined,
      notes: formData.notes || undefined,
      color: formData.color || getGeneratedColor(formData.name),
    };

    setError(null);
    if (host) {
      updateHost(host.id, payload);
    } else {
      addHost(payload);
    }

    onSave();
  };

  const handleKeyFileSelect = async () => {
    if (window.electron) {
      const result = await window.electron.dialog.openFile();
      if (!result.canceled && result.filePaths.length > 0) {
        setFormData({ ...formData, keyPath: result.filePaths[0] });
      }
    }
  };

  const formContent = (
    <AppDialog 
      title={host ? 'Edit Host' : 'Add New Host'} 
      description={host ? `Editing ${host.name}` : "Create a new connection profile."}
      onClose={onClose}
      size="default"
    >
      <form onSubmit={handleSubmit} className="host-form-container">
        {error && (
          <div className="host-form-error">
            {error}
          </div>
        )}
        
        <div className="form-group">
          <label>Host Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Production API"
            required
            autoFocus
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="1.2.3.4"
              required
            />
          </div>

          <div className="form-group">
            <label>Port</label>
            <input
              type="text"
              inputMode="numeric"
              value={String(formData.port)}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/\D/g, '');
                setFormData({
                  ...formData,
                  port: sanitized ? Math.min(Number(sanitized), 65535) : 22,
                });
              }}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            placeholder="root"
            required
          />
        </div>

        <div className="form-group">
          <label>Authentication</label>
          <Select
            value={formData.authMethod}
            onChange={(value) =>
              setFormData({
                ...formData,
                authMethod: value,
              })
            }
            options={[
              { value: 'password', label: 'Password' },
              { value: 'key', label: 'Private Key (Paste)' },
              { value: 'keyFile', label: 'Private Key (File)' },
            ]}
          />
        </div>

        {formData.authMethod === 'password' && (
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              required
            />
          </div>
        )}

        {formData.authMethod === 'key' && (
          <div className="form-group">
            <label>Private Key</label>
            <textarea
              value={formData.keyData}
              onChange={(e) => setFormData({ ...formData, keyData: e.target.value })}
              placeholder="-----BEGIN RSA PRIVATE KEY-----..."
              rows={5}
              required
            />
          </div>
        )}

        {formData.authMethod === 'keyFile' && (
          <div className="form-group">
            <label>Private Key File</label>
            <div className="file-input-group">
              <input
                type="text"
                value={formData.keyPath}
                readOnly
                placeholder="Select key file"
              />
              <button 
                type="button" 
                onClick={handleKeyFileSelect} 
                className="browse-btn"
              >
                <Key size={14} />
                Browse
              </button>
            </div>
          </div>
        )}

        {(formData.authMethod === 'key' || formData.authMethod === 'keyFile') && (
          <div className="form-group">
            <label>Passphrase (Optional)</label>
            <input
              type="password"
              value={formData.passphrase}
              onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
              placeholder="Key passphrase if encrypted"
            />
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Group (Optional)</label>
            <input
              type="text"
              value={formData.group}
              onChange={(e) => setFormData({ ...formData, group: e.target.value })}
              placeholder="Production, Development, etc."
            />
          </div>
          <div className="form-group">
            <label>Color</label>
            <div className="host-color-field">
              <ColorPicker
                value={formData.color}
                colors={hostColors}
                onChange={(color) => setFormData({ ...formData, color })}
              />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Notes (Optional)</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes about this host"
            rows={2}
          />
        </div>

        <div className="form-actions">
          <button 
            type="button" 
            className="cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="save-btn"
          >
            <Lock size={14} />
            {host ? 'Update Profile' : 'Create Profile'}
          </button>
        </div>
      </form>
    </AppDialog>
  );

  return createPortal(formContent, document.body);
};

export default HostForm;
