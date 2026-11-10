import { createContext, useContext, useEffect } from 'react';

type Theme = 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggleTheme: () => {}, isDark: false });

const cssVars: Record<string, string> = {
  '--ef-bg': '#ffffff',
  '--ef-bg-alt': '#f4f4f5',
  '--ef-card': '#ffffff',
  '--ef-card-hover': '#f4f4f5',
  '--ef-surface': '#ffffff',
  '--ef-surface-hover': '#f4f4f5',
  '--ef-border': '#d4d4d8',
  '--ef-border-light': '#e4e4e7',
  '--ef-border-med': '#a1a1aa',
  '--ef-border-heavy': '#71717a',
  '--ef-text': '#18181b',
  '--ef-text-secondary': '#3f3f46',
  '--ef-text-muted': '#71717a',
  '--ef-text-dim': '#a1a1aa',
  '--ef-text-faint': '#d4d4d8',
  '--ef-input-bg': '#ffffff',
  '--ef-input-border': '#d4d4d8',
  '--ef-overlay': '#ffffff',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => {}, isDark: false }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
