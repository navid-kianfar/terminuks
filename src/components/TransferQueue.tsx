import React, { useState } from 'react';
import { 
  X, 
  ChevronUp, 
  ChevronDown, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  RotateCw, 
  Trash2,
  Clock
} from 'lucide-react';
import { useTransfer, TransferTask } from '../contexts/TransferContext';
import './TransferQueue.css';

const TransferQueue: React.FC = () => {
  const { tasks, removeTask, retryTask, clearFinished } = useTransfer();
  const [isExpanded, setIsExpanded] = useState(false);

  if (tasks.length === 0) return null;

  const workingCount = tasks.filter(t => t.status === 'working' || t.status === 'queued').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  return (
    <div className={`transfer-queue ${isExpanded ? 'active' : ''}`}>
      <div 
        className="transfer-queue-header" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="transfer-queue-summary">
          <span className="transfer-queue-title">Transfers</span>
          {workingCount > 0 && <span className="transfer-badge info">{workingCount}</span>}
          {errorCount > 0 && <span className="transfer-badge danger">{errorCount}</span>}
        </div>
        <div className="transfer-queue-header-actions">
          {tasks.some(t => t.status === 'error') && (
            <button 
              type="button" 
              onClick={(e) => { 
                e.stopPropagation(); 
                tasks.filter(t => t.status === 'error').forEach(t => retryTask(t.id));
              }} 
              title="Retry all failed"
              className="text-danger"
            >
              <RotateCw size={14} />
            </button>
          )}
          {tasks.some(t => t.status === 'finished') && (
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); clearFinished(); }} 
              title="Clear completed"
            >
              <Trash2 size={14} />
            </button>
          )}
          {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </div>
      </div>

      {isExpanded && (
        <div className="transfer-queue-list">
          {tasks.map(task => (
            <div key={task.id} className={`transfer-item ${task.status}`}>
              <div className="transfer-item-icon">
                {task.status === 'finished' ? (
                  <CheckCircle2 size={16} className="text-success" />
                ) : task.status === 'error' ? (
                  <AlertCircle size={16} className="text-danger" />
                ) : task.type === 'upload' ? (
                  <Upload size={16} />
                ) : (
                  <Download size={16} />
                )}
              </div>
              
              <div className="transfer-item-details">
                <div className="transfer-item-info">
                  <span className="transfer-item-name" title={task.name}>{task.name}</span>
                  <button 
                    type="button" 
                    className="transfer-action-btn"
                    onClick={() => removeTask(task.id)}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="transfer-progress-container">
                  <div 
                    className="transfer-progress-bar" 
                    style={{ width: `${task.progress}%` }}
                  />
                </div>

                <div className="transfer-item-status">
                  <span className="status-text">
                    {task.status === 'queued' && 'Queued...'}
                    {task.status === 'working' && `${task.progress}%`}
                    {task.status === 'finished' && 'Completed'}
                    {task.status === 'error' && (task.error || 'Failed')}
                  </span>
                  
                  {task.status === 'error' && (
                    <button 
                      type="button" 
                      className="transfer-retry-btn"
                      onClick={() => retryTask(task.id)}
                    >
                      <RotateCw size={12} />
                      Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TransferQueue;
