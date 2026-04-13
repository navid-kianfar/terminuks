import React, { useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useHosts } from '../contexts/HostContext';
import { useSnippets } from '../contexts/SnippetContext';
import AppDialog from './AppDialog';
import SnippetForm from './SnippetForm';
import Tabs, { TabItem } from './ui/tabs';
import Button from './ui/button';
import Input from './ui/input';
import Switch from './ui/switch';
import Select from './ui/select';
import AlertDialog from './ui/alert-dialog';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Copy, Edit2, Monitor, Plus, Server, Terminal, Trash2, Wand2 } from 'lucide-react';
import { CommandSnippet } from '../types';
import './SettingsView.css';

interface SettingsViewProps {
  onClose: () => void;
  initialTab?: 'hosts' | 'appearance' | 'terminal' | 'snippets';
}

const cursorOptions = [
  { value: 'block', label: 'Block' },
  { value: 'underline', label: 'Underline' },
  { value: 'bar', label: 'Bar' },
] as const;

const bellOptions = [
  { value: 'none', label: 'None' },
  { value: 'sound', label: 'Sound' },
  { value: 'visual', label: 'Visual' },
] as const;

const fontFamilyOptions = [
  { value: "'Fira Code', 'Courier New', monospace", label: 'Fira Code' },
  { value: "'JetBrains Mono', 'Courier New', monospace", label: 'JetBrains Mono' },
  { value: "'IBM Plex Mono', 'Courier New', monospace", label: 'IBM Plex Mono' },
  { value: "'SF Mono', 'SFMono-Regular', 'Courier New', monospace", label: 'SF Mono' },
  { value: "'Cascadia Code', 'Courier New', monospace", label: 'Cascadia Code' },
  { value: "'Menlo', 'Courier New', monospace", label: 'Menlo' },
] as const;

const SettingsView: React.FC<SettingsViewProps> = ({ onClose, initialTab = 'appearance' }) => {
  const { settings, themes, setTheme, updateSettings } = useTheme();
  const { hosts, deleteHost, duplicateHost } = useHosts();
  const { snippets, deleteSnippet } = useSnippets();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editingSnippet, setEditingSnippet] = useState<CommandSnippet | null>(null);
  const [showSnippetForm, setShowSnippetForm] = useState(false);
  const [hostPendingDelete, setHostPendingDelete] = useState<string | null>(null);
  const [snippetPendingDelete, setSnippetPendingDelete] = useState<string | null>(null);
  const currentFontValue = useMemo(() => {
    const knownOption = fontFamilyOptions.find((option) => option.value === settings.fontFamily);
    return knownOption?.value || fontFamilyOptions[0].value;
  }, [settings.fontFamily]);

  const tabItems = useMemo<TabItem<NonNullable<SettingsViewProps['initialTab']>>[]>(
    () => [
      {
        value: 'hosts',
        label: 'Hosts',
        description: 'Saved connection profiles and quick cleanup',
        icon: <Server size={16} />,
      },
      {
        value: 'appearance',
        label: 'Appearance',
        description: 'Theme, fonts, and the visual shell',
        icon: <Monitor size={16} />,
      },
      {
        value: 'terminal',
        label: 'Terminal',
        description: 'Cursor, bells, scrollback, and text behavior',
        icon: <Terminal size={16} />,
      },
      {
        value: 'snippets',
        label: 'Snippets',
        description: 'Reusable commands for active terminal sessions',
        icon: <Wand2 size={16} />,
      },
    ],
    []
  );

  const handleNumberChange =
    (key: 'fontSize' | 'scrollback') => (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.target.value.replace(/\D/g, ''));
      if (!Number.isNaN(nextValue) && nextValue > 0) {
        updateSettings({ [key]: nextValue });
      }
    };

  return (
    <AppDialog
      title="Settings"
      description="The current app shell, terminal, snippets, and host profiles all live here now."
      onClose={onClose}
      size="wide"
    >
      <div className="settings-shell">
        <Tabs items={tabItems} value={activeTab} onValueChange={setActiveTab}>
          {activeTab === 'hosts' && (
            <Card className="settings-panel">
              <CardHeader>
                <div className="settings-heading-row">
                  <div>
                    <CardTitle>Saved Hosts</CardTitle>
                    <CardDescription>
                      These are the profiles available to the new terminal and SFTP pickers.
                    </CardDescription>
                  </div>
                  <Badge>{hosts.length} profiles</Badge>
                </div>
              </CardHeader>
              <CardContent className="settings-hosts-list">
                {hosts.length === 0 ? (
                  <div className="settings-empty-card">
                    <strong>No hosts saved yet</strong>
                    <span>
                      Add a host from the sidebar, then it will appear in the session pickers.
                    </span>
                  </div>
                ) : (
                  hosts.map((host) => (
                    <div key={host.id} className="settings-host-row">
                      <div className="settings-host-meta">
                        <strong>{host.name}</strong>
                        <span>
                          {host.username}@{host.address}:{host.port}
                        </span>
                        {host.group && <Badge>{host.group}</Badge>}
                      </div>
                      <div className="settings-inline-actions">
                        <Button size="sm" variant="outline" onClick={() => duplicateHost(host.id)}>
                          <Copy size={14} />
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setHostPendingDelete(host.id)}
                        >
                          <Trash2 size={14} />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'appearance' && (
            <div className="settings-stack">
              <Card className="settings-panel">
                <CardHeader>
                  <CardTitle>Theme Direction</CardTitle>
                  <CardDescription>
                    Switch the global shell theme and keep terminal fonts in sync with the rest of
                    the UI.
                  </CardDescription>
                </CardHeader>
                <CardContent className="settings-form-grid">
                  <label className="ui-field">
                    <span className="ui-field-label">Theme</span>
                    <Select
                      value={settings.theme}
                      onChange={setTheme}
                      options={[
                        ...Object.entries(themes).map(([key, theme]) => ({
                          value: key,
                          label: theme.name,
                        })),
                        { value: 'system', label: 'System' },
                      ]}
                    />
                  </label>
                  <label className="ui-field">
                    <span className="ui-field-label">Terminal font size</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={String(settings.fontSize)}
                      onChange={handleNumberChange('fontSize')}
                    />
                  </label>
                  <label className="ui-field settings-form-span">
                    <span className="ui-field-label">Terminal font family</span>
                    <Select
                      value={currentFontValue}
                      onChange={(value) => updateSettings({ fontFamily: value })}
                      options={fontFamilyOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                  </label>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'terminal' && (
            <Card className="settings-panel">
              <CardHeader>
                <CardTitle>Terminal Behavior</CardTitle>
                <CardDescription>
                  Fine-tune cursor behavior, search ergonomics, and shell history handling.
                </CardDescription>
              </CardHeader>
              <CardContent className="settings-form-grid">
                <label className="ui-field">
                  <span className="ui-field-label">Cursor style</span>
                  <Select
                    value={settings.cursorStyle}
                    onChange={(value) =>
                      updateSettings({
                        cursorStyle: value as typeof settings.cursorStyle,
                      })
                    }
                    options={cursorOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                </label>
                <label className="ui-field">
                  <span className="ui-field-label">Bell style</span>
                  <Select
                    value={settings.bellStyle}
                    onChange={(value) =>
                      updateSettings({ bellStyle: value as typeof settings.bellStyle })
                    }
                    options={bellOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                </label>
                <label className="ui-field">
                  <span className="ui-field-label">Scrollback lines</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={String(settings.scrollback)}
                    onChange={handleNumberChange('scrollback')}
                  />
                </label>
                <label className="ui-field settings-form-span">
                  <span className="ui-field-label">Word separator</span>
                  <Input
                    type="text"
                    value={settings.wordSeparator}
                    onChange={(event) => updateSettings({ wordSeparator: event.target.value })}
                  />
                </label>
                <div className="settings-toggle-card settings-form-span">
                  <div>
                    <strong>Cursor blink</strong>
                    <span>Keep the caret animated while the shell is focused.</span>
                  </div>
                  <Switch
                    checked={settings.cursorBlink}
                    onCheckedChange={(checked) => updateSettings({ cursorBlink: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'snippets' && (
            <Card className="settings-panel">
              <CardHeader>
                <div className="settings-heading-row">
                  <div>
                    <CardTitle>Command Snippets</CardTitle>
                    <CardDescription>
                      Reusable commands that can be fired into whichever terminal tab is active.
                    </CardDescription>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditingSnippet(null);
                      setShowSnippetForm(true);
                    }}
                  >
                    <Plus size={16} />
                    New Snippet
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="settings-snippet-grid">
                {snippets.length === 0 ? (
                  <div className="settings-empty-card">
                    <strong>No snippets yet</strong>
                    <span>Create one to keep common SSH commands within reach.</span>
                  </div>
                ) : (
                  snippets.map((snippet) => (
                    <div key={snippet.id} className="settings-snippet-card">
                      <div className="settings-snippet-copy">
                        <strong>{snippet.name}</strong>
                        {snippet.description && <span>{snippet.description}</span>}
                      </div>
                      <code>{snippet.command}</code>
                      <div className="settings-inline-actions">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingSnippet(snippet);
                            setShowSnippetForm(true);
                          }}
                        >
                          <Edit2 size={14} />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setSnippetPendingDelete(snippet.id)}
                        >
                          <Trash2 size={14} />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </Tabs>
      </div>

      {showSnippetForm && (
        <SnippetForm
          snippet={editingSnippet}
          onClose={() => {
            setShowSnippetForm(false);
            setEditingSnippet(null);
          }}
        />
      )}
      <AlertDialog
        open={Boolean(hostPendingDelete)}
        title="Delete Host"
        description="This removes the saved connection profile from local storage."
        onClose={() => setHostPendingDelete(null)}
        onConfirm={() => {
          if (hostPendingDelete) {
            deleteHost(hostPendingDelete);
          }
          setHostPendingDelete(null);
        }}
      >
        <p>
          Delete{' '}
          <code className="settings-inline-code">
            {hosts.find((host) => host.id === hostPendingDelete)?.name || 'this host'}
          </code>
          ?
        </p>
      </AlertDialog>
      <AlertDialog
        open={Boolean(snippetPendingDelete)}
        title="Delete Snippet"
        description="This permanently removes the saved command snippet."
        onClose={() => setSnippetPendingDelete(null)}
        onConfirm={() => {
          if (snippetPendingDelete) {
            deleteSnippet(snippetPendingDelete);
          }
          setSnippetPendingDelete(null);
        }}
      >
        <p>
          Delete{' '}
          <code className="settings-inline-code">
            {snippets.find((snippet) => snippet.id === snippetPendingDelete)?.name ||
              'this snippet'}
          </code>
          ?
        </p>
      </AlertDialog>
    </AppDialog>
  );
};

export default SettingsView;
