import { createContext, useContext, useEffect } from 'react';

type Theme = 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', toggleTheme: () => {}, isDark: true });

const cssVars: Record<string, string> = {
  '--ef-bg': '#000000',
  '--ef-bg-alt': '#0a0a0a',
  '--ef-card': '#1c1c1e',
  '--ef-card-hover': '#2c2c2e',
  '--ef-surface': '#1c1c1e',
  '--ef-surface-hover': '#2c2c2e',
  '--ef-border': 'rgba(255,255,255,0.06)',
  '--ef-border-light': 'rgba(255,255,255,0.04)',
  '--ef-border-med': '#2c2c2e',
  '--ef-border-heavy': '#3a3a3c',
  '--ef-text': '#f5f5f7',
  '--ef-text-secondary': '#d1d1d6',
  '--ef-text-muted': '#8e8e93',
  '--ef-text-dim': '#636366',
  '--ef-text-faint': '#48484a',
  '--ef-input-bg': '#1c1c1e',
  '--ef-input-border': '#2c2c2e',
  '--ef-overlay': '#1c1c1e',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'dark', toggleTheme: () => {}, isDark: true }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
