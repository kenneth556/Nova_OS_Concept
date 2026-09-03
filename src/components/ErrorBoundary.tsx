import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { TriangleAlert, RotateCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Shown in the fallback so the user knows what died. */
  label: string;
  /** Full-screen treatment for the shell-level boundary. */
  variant?: "window" | "shell";
  /** Changing this value resets the boundary, e.g. a new file path. */
  resetKey?: string | number;
}

interface State {
  error: Error | null;
  info: string | null;
  resetKey: string | number | undefined;
}

/**
 * Keeps one crashing app from taking down the whole OS. Windows each get their
 * own boundary, and the shell root gets a last-resort one.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, info: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // A new resetKey means the caller wants a fresh attempt.
    if (props.resetKey !== state.resetKey) {
      return { error: null, info: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[NovaOS] ${this.props.label} crashed:`, error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  private reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    const { error, info } = this.state;
    const { children, label, variant = "window" } = this.props;
    if (!error) return children;

    return (
      <div
        className={`${
          variant === "shell" ? "fixed inset-0 z-[10000]" : "h-full"
        } flex items-center justify-center bg-[#15141d] text-white/85 p-6 overflow-auto`}
        role="alert"
      >
        <div className="max-w-md w-full">
          <div className="flex items-center gap-2 mb-2">
            <TriangleAlert size={18} className="text-amber-400 shrink-0" />
            <span className="text-sm font-medium">{label} stopped working</span>
          </div>
          <p className="text-xs text-white/50 leading-relaxed mb-3">
            {variant === "shell"
              ? "Something in the shell threw an error. Your files are saved; reloading restores the desktop."
              : "The rest of NovaOS is still running. You can restart just this app."}
          </p>
          <pre
            className="text-[11px] font-mono text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mb-3 whitespace-pre-wrap max-h-40 overflow-auto"
            style={{ userSelect: "text" }}
          >
            {error.message || String(error)}
          </pre>
          <div className="flex items-center gap-2">
            <button
              onClick={this.reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 text-white font-medium"
            >
              <RotateCw size={12} /> Restart {variant === "shell" ? "shell" : "app"}
            </button>
            {variant === "shell" && (
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10"
              >
                Reload NovaOS
              </button>
            )}
          </div>
          {info && (
            <details className="mt-3">
              <summary className="text-[11px] text-white/35 cursor-pointer">Component stack</summary>
              <pre
                className="mt-1 text-[10px] font-mono text-white/40 whitespace-pre-wrap max-h-40 overflow-auto"
                style={{ userSelect: "text" }}
              >
                {info}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
