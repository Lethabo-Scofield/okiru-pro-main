import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f5f5f5', fontFamily: 'Inter, sans-serif', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
          <h1 style={{ color: '#ef4444', marginBottom: 16 }}>Application Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#fca5a5' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#888', fontSize: 12, marginTop: 8 }}>{this.state.error.stack}</pre>
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
