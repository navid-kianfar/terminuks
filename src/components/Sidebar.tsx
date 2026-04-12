import { useEffect, useState } from 'react';
import { useHosts } from '../contexts/HostContext';
import { Plus, Search, Server, Settings, ChevronLeft, ChevronRight, Sun, Moon, Monitor } from 'lucide-react';
import HostList from './HostList';
import HostForm from './HostForm';
import SettingsView from './SettingsView';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { Host } from '../types';
import './Sidebar.css';

const Sidebar = () => {
  const { hosts, searchHosts } = useHosts();
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [showHostForm, setShowHostForm] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'hosts' | 'appearance' | 'terminal' | 'snippets'>('appearance');
  const [collapsed, setCollapsed] = useState(false);

  const toggleTheme = (nextTheme: 'light' | 'dark' | 'system') => {
    setTheme(nextTheme);
  };

  const filteredHosts = searchQuery ? searchHosts(searchQuery) : hosts;

  useEffect(() => {
    const handleCollapseSidebar = () => {
      setCollapsed(true);
    };

    window.addEventListener('terminuks:collapse-sidebar', handleCollapseSidebar);

    return () => {
      window.removeEventListener('terminuks:collapse-sidebar', handleCollapseSidebar);
    };
  }, []);

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-box">
            <Server size={24} />
          </div>
          {!collapsed && <span className="logo-text">Terminuks</span>}
        </div>
        
        <button 
          className="sidebar-border-toggle" 
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-section">
          {!collapsed && <div className="section-header">HOST GROUPS</div>}
          
          {!collapsed && (
            <div className="sidebar-search-inline">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search hosts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          <div className="sidebar-actions-compact">
            <button 
              className="add-host-btn-minimal" 
              onClick={() => setShowHostForm(true)}
              title={collapsed ? "Add Host" : ""}
            >
              <Plus size={collapsed ? 20 : 16} strokeWidth={2.5} />
              {!collapsed && <span>Add Host</span>}
            </button>
          </div>

          <HostList
            hosts={filteredHosts}
            collapsed={collapsed}
            onEditHost={(host) => {
              setEditingHost(host);
              setShowHostForm(true);
            }}
          />
        </div>

        {!collapsed && (
          <div className="sidebar-section mt-auto">
            {/*<div className="section-header">SYSTEM</div>*/}
            {/*<button */}
            {/*  className="nav-item"*/}
            {/*  onClick={() => {*/}
            {/*    setActiveSettingsTab('snippets');*/}
            {/*    setShowSettings(true);*/}
            {/*  }}*/}
            {/*>*/}
            {/*  <Folder size={18} />*/}
            {/*  <span>Snippets</span>*/}
            {/*</button>*/}
            <button 
              className="nav-item"
              onClick={() => {
                setActiveSettingsTab('appearance');
                setShowSettings(true);
              }}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div className={cn("theme-toggle-group", collapsed && "collapsed")}>
          <button 
            className={cn("theme-btn", theme === 'light' && "active")} 
            onClick={() => toggleTheme('light')}
            title="Light Mode"
          >
            <Sun size={16} />
            {!collapsed && <span>Light</span>}
          </button>
          <button 
            className={cn("theme-btn", theme === 'dark' && "active")} 
            onClick={() => toggleTheme('dark')}
            title="Dark Mode"
          >
            <Moon size={16} />
            {!collapsed && <span>Dark</span>}
          </button>
          <button 
            className={cn("theme-btn", theme === 'system' && "active")} 
            onClick={() => toggleTheme('system')}
            title="System Theme"
          >
            <Monitor size={16} />
            {!collapsed && <span>System</span>}
          </button>
        </div>
      </div>

      {showHostForm && (
        <HostForm
          host={editingHost}
          onClose={() => {
            setShowHostForm(false);
            setEditingHost(null);
          }}
          onSave={() => {
            setShowHostForm(false);
            setEditingHost(null);
          }}
        />
      )}

      {showSettings && (
        <SettingsView
          initialTab={activeSettingsTab}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default Sidebar;
