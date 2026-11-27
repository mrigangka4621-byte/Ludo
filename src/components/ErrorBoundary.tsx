import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Top-level error boundary so unexpected render exceptions never drop players
 * to a blank screen — offers an immediate 1-tap reload that automatically rejoins
 * any active online room via sessionStorage.
 */
export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error interrupted the display.',
    };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Handled cleanly by fallback UI
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen w-full flex items-center justify-center p-6"
          style={{ backgroundColor: '#0A2558', color: '#FFFFFF' }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 text-center space-y-4 shadow-2xl"
            style={{
              backgroundColor: '#0C2D63',
              border: '2px solid #FACC15',
            }}
          >
            <h1 className="font-display font-extrabold text-2xl text-yellow-300">
              Match Display Paused
            </h1>
            <p className="text-sm text-blue-100 leading-relaxed">
              Something interrupted the screen, but your live room session is safe. Tap below to
              jump straight back into your game.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl font-display font-extrabold text-base shadow-lg transition-transform active:scale-95"
              style={{
                backgroundColor: '#FACC15',
                color: '#0B1C3D',
              }}
            >
              Reconnect to Match
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
