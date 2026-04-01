import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[var(--bg-root)] text-[var(--text-main)] p-8">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <p className="text-[var(--text-muted)] mb-4">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-[var(--accent-green)] text-[var(--bg-panel)] rounded-lg font-bold"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
