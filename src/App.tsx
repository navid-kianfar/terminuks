import { BrowserRouter as Router } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { HostProvider } from './contexts/HostContext';
import { TerminalProvider } from './contexts/TerminalContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useTheme } from './contexts/ThemeContext';
import { TransferProvider } from './contexts/TransferContext';
import TransferQueue from './components/TransferQueue';
import { SnippetProvider } from './contexts/SnippetContext';
import './App.css';

function AppContent() {
  const { theme } = useTheme();
  const isElectron = typeof window !== 'undefined' && Boolean(window.electron);

  if (!isElectron) {
    return (
      <div className="app app-blocked" data-theme={theme}>
        <div className="electron-required-card">
          <span className="electron-required-eyebrow">Electron Required</span>
          <h1>Terminuks runs as a desktop app.</h1>
          <p>
            SSH, SFTP, encrypted local storage, and the native file dialogs depend on the Electron
            bridge. Open the project with <code>pnpm dev</code> to launch the desktop shell.
          </p>
          <div className="electron-required-actions">
            <div className="electron-required-step">
              <strong>Run</strong>
              <span><code>pnpm dev</code></span>
            </div>
            <div className="electron-required-step">
              <strong>Optional UI-only work</strong>
              <span><code>pnpm dev:web</code> is for renderer styling only</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app" data-theme={theme}>
      <Sidebar />
      <MainContent />
      <TransferQueue />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <TransferProvider>
        <SnippetProvider>
          <HostProvider>
            <TerminalProvider>
              <Router>
                <AppContent />
              </Router>
            </TerminalProvider>
          </HostProvider>
        </SnippetProvider>
      </TransferProvider>
    </ThemeProvider>
  );
}

export default App;
