import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Theme, Settings } from '../types';

interface ThemeContextType {
  theme: string;
  resolvedTheme: 'dark' | 'light';
  settings: Settings;
  themes: Record<string, Theme>;
  setTheme: (themeName: string) => void;
  updateSettings: (updates: Partial<Settings>) => void;
}

const defaultThemes: Record<string, Theme> = {
  dark: {
    name: 'Dark',
    background: '#1a1a1a',
    foreground: '#ffffff',
    cursor: '#ffffff',
    colors: {
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#e5e5e5',
    },
  },
  light: {
    name: 'Light',
    background: '#ffffff',
    foreground: '#000000',
    cursor: '#000000',
    colors: {
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#e5e5e5',
    },
  },
};

const defaultSettings: Settings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: "'Fira Code', 'Courier New', monospace",
  cursorStyle: 'block',
  cursorBlink: true,
  bellStyle: 'none',
  scrollback: 1000,
  wordSeparator: ' ()[]{}"\'',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<string>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [themes] = useState<Record<string, Theme>>(defaultThemes);

  useEffect(() => {
    const loadSettings = async () => {
      if (window.electron) {
        const stored = await window.electron.store.get('settings');
        if (stored) {
          setSettings({ ...defaultSettings, ...stored });
          setThemeState(stored.theme || 'dark');
        }
      } else {
        const stored = localStorage.getItem('terminuks_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          setSettings({ ...defaultSettings, ...parsed });
          setThemeState(parsed.theme || 'dark');
        }
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const resolveTheme = () => {
      if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setResolvedTheme(isDark ? 'dark' : 'light');
      } else {
        setResolvedTheme(theme === 'light' ? 'light' : 'dark');
      }
    };

    resolveTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => resolveTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  // Apply resolved theme to html element for Tailwind and Global styles
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolvedTheme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    if (window.electron) {
      await window.electron.store.set('settings', newSettings);
    } else {
      localStorage.setItem('terminuks_settings', JSON.stringify(newSettings));
    }
  }, [settings]);

  const setTheme = useCallback((themeName: string) => {
    setThemeState(themeName);
    updateSettings({ theme: themeName });
  }, [updateSettings]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        settings,
        themes,
        setTheme,
        updateSettings,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
