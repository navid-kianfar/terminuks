import React, { useState } from 'react';
import AppDialog from './AppDialog';
import { CommandSnippet } from '../types';
import { useSnippets } from '../contexts/SnippetContext';

interface SnippetFormProps {
  snippet?: CommandSnippet | null;
  onClose: () => void;
}

const SnippetForm: React.FC<SnippetFormProps> = ({ snippet, onClose }) => {
  const { addSnippet, updateSnippet } = useSnippets();
  const [name, setName] = useState(snippet?.name || '');
  const [command, setCommand] = useState(snippet?.command || '');
  const [description, setDescription] = useState(snippet?.description || '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) {
      setError('Name and command are required.');
      return;
    }

    const snippetData = {
      name: name.trim(),
      command: command.trim(),
      description: description.trim() || undefined,
      tags: snippet?.tags || [],
    };

    if (snippet) {
      await updateSnippet(snippet.id, snippetData);
    } else {
      await addSnippet(snippetData);
    }
    onClose();
  };

  return (
    <AppDialog
      title={snippet ? 'Edit Snippet' : 'New Snippet'}
      description="Save a command sequence for quick execution."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="host-form-content">
        <label className="host-form-field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Docker Cleanup"
            autoFocus
          />
        </label>

        <label className="host-form-field">
          <span>Command</span>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g. docker system prune -af"
            rows={5}
            className="host-form-textarea"
          />
        </label>

        <label className="host-form-field">
          <span>Description (Optional)</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this snippet do?"
          />
        </label>

        {error && <div className="panel-alert error">{error}</div>}

        <div className="host-form-actions">
          <button type="button" className="host-form-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="host-form-submit">
            {snippet ? 'Update Snippet' : 'Save Snippet'}
          </button>
        </div>
      </form>
    </AppDialog>
  );
};

export default SnippetForm;
