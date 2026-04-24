import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
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
