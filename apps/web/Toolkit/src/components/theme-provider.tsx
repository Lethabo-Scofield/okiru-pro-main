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
  theme: "dark",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

const darkCssVars: Record<string, string> = {
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
}

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

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    let resolvedTheme = theme
    if (theme === "system") {
      resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
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
