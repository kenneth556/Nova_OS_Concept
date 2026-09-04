import { useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlert, Terminal as TerminalIcon, ChevronDown, ChevronUp } from "lucide-react";
import type { AppProps } from "../lib/types";
import { tokenize } from "../blak/lexer";
import { parse } from "../blak/parser";
import { BlakRuntime } from "../blak/interpreter";
import { createBlakHost } from "../blak/host";
import BlakUi from "../blak/Renderer";
import { BlakError } from "../blak/types";
import { useBlakStore } from "../store/blakStore";
import { useFsStore } from "../store/fsStore";
import { useWindowStore } from "../store/windowStore";
import { baseName } from "../lib/fileTypes";

const slugFolder = (name: string) =>
  `/home/user/apps/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app"}`;

/**
 * Runs a BLAK program in a real OS window. The source can come from an
 * installed app, a `.blk` file, or straight from Code Studio's Run button.
 */
export default function BlakApp({ windowId, appData }: AppProps) {
  const installId: string | undefined = appData?.installId;
  const filePath: string | undefined = appData?.path;
  const inlineSource: string | undefined = appData?.source;
  const windowName: string | undefined = appData?.windowName;

  const installed = useBlakStore((s) => s.apps.find((a) => a.id === installId));
  const fileContent = useFsStore((s) => (filePath ? s.nodes[filePath]?.content : undefined));
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);
  const openApp = useWindowStore((s) => s.openApp);

  const source = installed?.source ?? inlineSource ?? fileContent ?? "";
  const declaredName = installed?.name ?? (filePath ? baseName(filePath) : appData?.appName ?? "BLAK app");
  const granted: string[] | null = installed ? installed.granted : null;

  const [version, setVersion] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(true);
  const runtimeRef = useRef<BlakRuntime | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(0);

  useEffect(() => {
    if (!source.trim()) {
      runtimeRef.current = null;
      setFatal("There's no BLAK source to run.");
      setRuntimeReady((n) => n + 1);
      return;
    }

    let runtime: BlakRuntime | null = null;
    try {
      const ast = parse(tokenize(source));
      const host = createBlakHost({
        appName: declaredName,
        dataDir: slugFolder(declaredName),
        onOpenWindow: (name) =>
          openApp("blakApp", { ...(appData ?? {}), windowName: name, appName: declaredName }),
        onChange: () => setVersion((v) => v + 1),
      });
      runtime = new BlakRuntime(ast, host, () => setVersion((v) => v + 1));
      runtime.start();
      // start() trusts the program's own `permission` lines; the installer's
      // decision wins, so narrow the host down to what the user approved.
      if (granted) {
        host.permissions = new Set(granted.filter((p) => runtime!.permissions.has(p)));
      }
      runtimeRef.current = runtime;
      setFatal(null);
    } catch (err) {
      runtimeRef.current = null;
      const message = err instanceof BlakError && err.line
        ? `Line ${err.line}: ${err.message}`
        : String((err as Error)?.message ?? err);
      setFatal(message);
    }
    setRuntimeReady((n) => n + 1);

    return () => {
      runtime?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, declaredName, granted?.join(","), windowName]);

  const runtime = runtimeRef.current;

  const built = useMemo(() => {
    if (!runtime) return null;
    return runtime.buildWindow(windowName);
    // rebuilt whenever the runtime asks (version) or the program changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, runtimeReady, version, windowName]);

  const title = built?.spec?.title ?? declaredName;

  useEffect(() => {
    setWindowTitle(windowId, `${title} — BLAK`);
  }, [windowId, title, setWindowTitle]);

  const runtimeError = runtime?.error ?? null;
  const logs = runtime ? [...runtime.buildLog, ...runtime.eventLog] : [];

  return (
    <div className="h-full flex flex-col bg-[#16151f] text-white/85">
      {fatal && (
        <div className="m-3 p-3 rounded-lg bg-red-500/15 border border-red-500/25 text-xs text-red-200 flex gap-2">
          <TriangleAlert size={14} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-medium mb-0.5">This app couldn't start</div>
            <div className="leading-relaxed" style={{ userSelect: "text" }}>{fatal}</div>
          </div>
        </div>
      )}

      {!fatal && runtimeError && (
        <div className="m-3 p-3 rounded-lg bg-amber-500/15 border border-amber-500/25 text-xs text-amber-100 flex gap-2">
          <TriangleAlert size={14} className="shrink-0 mt-0.5" />
          <div style={{ userSelect: "text" }}>
            {runtimeError.line ? `Line ${runtimeError.line}: ` : ""}
            {runtimeError.message}
          </div>
        </div>
      )}

      {!fatal && built && !built.spec && (
        <div className="p-4 text-xs text-white/50">
          This program doesn't declare a window yet. Add one:
          <pre className="mt-2 p-2 rounded bg-black/30 text-[11px] text-white/70" style={{ userSelect: "text" }}>
{`window "Main" {
    text "Hello"
}`}
          </pre>
        </div>
      )}

      {built && built.spec && runtime && (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
          <BlakUi
            nodes={built.nodes}
            runtime={runtime}
            dataDir={slugFolder(declaredName)}
            onOpenUrl={(url) => openApp("browser", { startUrl: url })}
          />
        </div>
      )}

      {logs.length > 0 && (
        <div className="border-t border-white/10 shrink-0">
          <button
            onClick={() => setShowOutput((v) => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/50 hover:bg-white/5"
          >
            <TerminalIcon size={11} /> Output ({logs.length})
            {showOutput ? <ChevronDown size={11} className="ml-auto" /> : <ChevronUp size={11} className="ml-auto" />}
          </button>
          {showOutput && (
            <div
              className="max-h-32 overflow-y-auto px-3 pb-2 font-mono text-[11px] text-white/70 space-y-0.5"
              style={{ userSelect: "text" }}
            >
              {logs.map((line, i) => (
                <div key={`${i}-${line}`}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
