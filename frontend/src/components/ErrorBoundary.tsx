import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertIcon } from "./Icons";

interface Props {
  children: ReactNode;
  /** Rendered instead of the children after an error. `reset` tries the children again. */
  fallback: (reset: () => void, error: Error) => ReactNode;
  /** When this value changes (e.g. the spec was edited), the boundary tries the children again. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  resetKey: unknown;
}

/** Keeps a rendering error in one part of the UI from blanking the whole page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Caught a rendering error", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.reset, this.state.error) : this.props.children;
  }
}

function CrashNotice({ title, error, onRetry }: { title: string; error: Error; onRetry: () => void }) {
  return (
    <div className="notice notice--error notice--center" role="alert">
      <AlertIcon />
      <div>
        <p className="notice__title">{title}</p>
        <p>{error.message || "An unexpected error occurred."}</p>
        <button type="button" className="btn btn--ghost btn--sm notice__action" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

/** Stands in for the whole canvas panel. */
export function CanvasCrash({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <main className="stage" aria-labelledby="canvas-heading">
      <div className="stage__toolbar">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">02</span>
          <h2 id="canvas-heading" className="panel__title" tabIndex={-1}>Canvas</h2>
          <span className="chip chip--error">Error</span>
        </div>
      </div>
      <div className="stage__canvas">
        <div className="sheet sheet--empty">
          <div className="empty-canvas">
            <CrashNotice title="Couldn’t draw the flat" error={error} onRetry={onRetry} />
          </div>
        </div>
      </div>
    </main>
  );
}

/** Stands in for the whole properties panel. */
export function PanelCrash({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <aside className="panel panel--right" aria-labelledby="props-heading">
      <div className="panel__header">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">03</span>
          <h2 id="props-heading" className="panel__title">Properties</h2>
        </div>
      </div>
      <div className="panel__body">
        <CrashNotice title="Couldn’t show the properties" error={error} onRetry={onRetry} />
      </div>
    </aside>
  );
}
