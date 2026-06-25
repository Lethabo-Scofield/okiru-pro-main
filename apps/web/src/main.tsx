import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";

// A lazily-imported chunk failing to load almost always means a stale tab after a
// deploy (the hashed chunk it references no longer exists). Auto-reload ONCE to pull
// the current index.html + chunks; a short cooldown prevents reload loops if a deploy
// is genuinely broken (then the ErrorBoundary UI shows instead).
const CHUNK_ERROR_RE = /dynamically imported module|importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk \d+ failed/i;

function reloadOnceForStaleChunk(): boolean {
  try {
    const KEY = "okiru:chunk-reload-at";
    const last = Number(sessionStorage.getItem(KEY) || "0");
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    window.location.reload();
    return true;
  }
  return false;
}

// Vite emits this when its preload helper can't fetch a dynamic-import chunk.
window.addEventListener("vite:preloadError", (event) => {
  (event as Event).preventDefault?.();
  reloadOnceForStaleChunk();
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Backstop: if a chunk-load error bubbled to render, self-heal via one reload.
    if (CHUNK_ERROR_RE.test(error.message) && reloadOnceForStaleChunk()) return;
    console.error("[ErrorBoundary] Uncaught render error", { error: error.message, stack: error.stack, componentStack: info.componentStack });
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message: error.message, stack: error.stack, componentStack: info.componentStack, url: window.location.href, timestamp: new Date().toISOString() }),
    }).catch(() => {});
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f5f5f5', fontFamily: 'Inter, sans-serif', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
          <h1 style={{ color: '#ef4444', marginBottom: 16 }}>Application Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#fca5a5' }}>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
