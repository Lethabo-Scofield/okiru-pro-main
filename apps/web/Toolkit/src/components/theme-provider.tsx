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

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>("dark")

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add("dark")

    Object.entries(darkCssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }, [])

  const value = {
    theme: "dark" as Theme,
    setTheme: (t: Theme) => {
      localStorage.setItem(storageKey, "dark")
      setTheme("dark")
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
