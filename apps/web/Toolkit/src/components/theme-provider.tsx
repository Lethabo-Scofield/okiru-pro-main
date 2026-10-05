import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

const lightCssVars: Record<string, string> = {
  '--ef-bg': '#ffffff',
  '--ef-bg-alt': '#f5f5f7',
  '--ef-card': '#ffffff',
  '--ef-card-hover': '#f0f0f2',
  '--ef-surface': '#ffffff',
  '--ef-surface-hover': '#f0f0f2',
  '--ef-border': 'rgba(0,0,0,0.08)',
  '--ef-border-light': 'rgba(0,0,0,0.04)',
  '--ef-border-med': '#e5e5ea',
  '--ef-border-heavy': '#d1d1d6',
  '--ef-text': '#1d1d1f',
  '--ef-text-secondary': '#3a3a3c',
  '--ef-text-muted': '#636366',
  '--ef-text-dim': '#8e8e93',
  '--ef-text-faint': '#c7c7cc',
  '--ef-input-bg': '#ffffff',
  '--ef-input-border': '#d1d1d6',
  '--ef-overlay': '#ffffff',
}

const darkCssVars: Record<string, string> = lightCssVars

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(storageKey) as Theme | null;
      if (stored === "light" || stored === "system") return stored;
      if (stored === "dark") {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Private mode / blocked site data. Fall through to the default.
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    let resolvedTheme = theme
    if (theme === "system") {
      resolvedTheme = "light"
    }

    root.classList.add(resolvedTheme)

    const vars = resolvedTheme === "dark" ? darkCssVars : lightCssVars
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }, [theme])

  const value = {
    theme,
    setTheme: (t: Theme) => {
      localStorage.setItem(storageKey, t)
      setTheme(t)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
