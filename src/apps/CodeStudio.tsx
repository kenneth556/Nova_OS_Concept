import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Hammer, Package, Save, FilePlus, FolderOpen, ChevronUp, Folder, FileCode2, Trash2,
  CircleAlert, CircleCheck, Download,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { useFsStore } from "../store/fsStore";
import { useWindowStore } from "../store/windowStore";
import { useBlakStore, serializePackage, type BlakPackage } from "../store/blakStore";
import { tokenize } from "../blak/lexer";
import { parse } from "../blak/parser";
import { analyze } from "../blak/interpreter";
import { BlakError } from "../blak/types";
import { BLAK_SAMPLES, STARTER_TEMPLATE } from "../blak/samples";
import { baseName, dirName, joinPath } from "../lib/fileTypes";
import FileDialog from "../components/FileDialog";

const PROJECTS_DIR = "/home/user/projects";

const KEYWORDS = ["app", "window", "if", "else", "for", "in", "repeat", "return", "on", "component", "use", "permission", "true", "false", "and", "or", "not"];
const BUILTINS = ["text", "button", "input", "image", "box", "card", "column", "row", "show", "notify", "open", "browser", "copy", "theme", "save", "folder", "read", "get", "post", "size", "title", "resizable", "text_size", "rounded", "click"];

const TOKEN_RE = new RegExp(
  [
    "(#[^\\n]*|//[^\\n]*)",
    "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*')",
    "\\b(\\d+(?:\\.\\d+)?)\\b",
    `\\b(${KEYWORDS.join("|")})\\b`,
    `\\b(${BUILTINS.join("|")})\\b`,
  ].join("|"),
  "g"
);

/** Colourises one line without touching innerHTML. */
function highlight(line: string, lineKey: number) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;

  for (let match = TOKEN_RE.exec(line); match; match = TOKEN_RE.exec(line)) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    const [, comment, str, num, keyword, builtin] = match;
    const className = comment
      ? "text-white/30 italic"
      : str
        ? "text-emerald-300"
        : num
          ? "text-amber-300"
          : keyword
            ? "text-fuchsia-300"
            : builtin
              ? "text-sky-300"
              : undefined;
    parts.push(
      <span key={`${lineKey}-${match.index}`} className={className}>
        {match[0]}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length > 0 ? parts : [" "];
}

type Message = { kind: "error" | "info" | "success"; text: string };

export default function CodeStudio({ windowId, appData }: AppProps) {
  const nodes = useFsStore((s) => s.nodes);
  const writeFile = useFsStore((s) => s.writeFile);
  const deleteNode = useFsStore((s) => s.deleteNode);
  const ensureDir = useFsStore((s) => s.ensureDir);
  const uniquePath = useFsStore((s) => s.uniquePath);
  const openApp = useWindowStore((s) => s.openApp);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);
  const install = useBlakStore((s) => s.install);

  const [dir, setDir] = useState<string>(() => (appData?.path ? dirName(appData.path) : PROJECTS_DIR));
  const [path, setPath] = useState<string | null>(appData?.path ?? null);
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [dialog, setDialog] = useState<"open" | "save" | null>(null);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const dirty = code !== savedCode;
  const fileName = path ? baseName(path) : "untitled.blk";

  useEffect(() => {
    ensureDir(PROJECTS_DIR);
  }, [ensureDir]);

  // Load the selected file.
  useEffect(() => {
    if (!path) {
      setCode(STARTER_TEMPLATE);
      setSavedCode("");
      return;
    }
    const content = useFsStore.getState().nodes[path]?.content ?? "";
    setCode(content);
    setSavedCode(content);
    setMessages([]);
  }, [path]);

  useEffect(() => {
    setWindowTitle(windowId, `${dirty ? "*" : ""}${fileName} — Code Studio`);
  }, [windowId, fileName, dirty, setWindowTitle]);

  const entries = useMemo(() => {
    const children = nodes[dir]?.children ?? [];
    const resolved = children
      .map((name) => ({ name, node: nodes[joinPath(dir, name)] }))
      .filter((entry) => Boolean(entry.node));
    return {
      folders: resolved.filter((e) => e.node.type === "dir").sort((a, b) => a.name.localeCompare(b.name)),
      files: resolved.filter((e) => e.node.type === "file").sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [nodes, dir]);

  const lines = useMemo(() => code.split("\n"), [code]);

  /* ------------------------------------------------------------------ actions */

  const say = (message: Message) => setMessages((prev) => [message, ...prev].slice(0, 40));

  const compile = () => {
    try {
      const ast = parse(tokenize(code));
      return { ast, info: analyze(ast), error: null as BlakError | null };
    } catch (err) {
      const error = err instanceof BlakError ? err : new BlakError(String((err as Error)?.message ?? err));
      return { ast: null, info: null, error };
    }
  };

  const reportError = (error: BlakError) => {
    say({ kind: "error", text: `${error.line ? `Line ${error.line}: ` : ""}${error.message}` });
    if (error.line) jumpToLine(error.line);
  };

  const jumpToLine = (line: number) => {
    const el = textRef.current;
    if (!el) return;
    const target = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
    el.focus();
    el.setSelectionRange(target, target);
    updateCaret();
  };

  const save = (target?: string): string | null => {
    const destination = target ?? path;
    if (!destination) {
      setDialog("save");
      return null;
    }
    writeFile(destination, code);
    setSavedCode(code);
    if (destination !== path) {
      setPath(destination);
      setDir(dirName(destination));
    }
    return destination;
  };

  const run = () => {
    const { info, error } = compile();
    if (error || !info) {
      if (error) reportError(error);
      return;
    }
    if (info.windows.length === 0) {
      say({ kind: "error", text: `"${info.name}" has no window, so there's nothing to show yet.` });
      return;
    }
    save();
    say({ kind: "success", text: `Running "${info.name}"` });
    openApp("blakApp", { source: code, appName: info.name, runId: Date.now() });
  };

  const build = () => {
    const { info, error } = compile();
    if (error || !info) {
      if (error) reportError(error);
      return;
    }
    const saved = save();
    say({
      kind: "success",
      text: `Built "${info.name}" — ${info.windows.length} window${info.windows.length === 1 ? "" : "s"}${
        info.permissions.length ? `, permissions: ${info.permissions.join(", ")}` : ", no permissions"
      }${saved ? ` — saved to ${saved}` : ""}`,
    });
  };

  const buildPackage = (): BlakPackage | null => {
    const { info, error } = compile();
    if (error || !info) {
      if (error) reportError(error);
      return null;
    }
    return {
      blak: 1,
      name: info.name,
      version: "1.0.0",
      author: "You",
      description: `${info.name}, written in BLAK.`,
      icon: "📦",
      color: "bg-indigo-500",
      permissions: info.permissions,
      source: code,
    };
  };

  const packageApp = () => {
    const pkg = buildPackage();
    if (!pkg) return;
    save();
    const target = uniquePath(dir, `${pkg.name}.blak`);
    writeFile(target, serializePackage(pkg));
    say({ kind: "success", text: `Packaged to ${target}. Install it from the App Store or hit Install.` });
  };

  const installApp = () => {
    const pkg = buildPackage();
    if (!pkg) return;
    install(pkg, pkg.permissions);
    say({
      kind: "success",
      text: `Installed "${pkg.name}". It's in the Start menu${
        pkg.permissions.length ? ` with permissions: ${pkg.permissions.join(", ")}` : ""
      }.`,
    });
  };

  const newFile = () => {
    const target = uniquePath(dir, "untitled.blk");
    writeFile(target, STARTER_TEMPLATE);
    setPath(target);
  };

  const updateCaret = () => {
    const el = textRef.current;
    if (!el) return;
    const upto = el.value.slice(0, el.selectionStart).split("\n");
    setCaret({ line: upto.length, col: upto[upto.length - 1].length + 1 });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "s") {
      e.preventDefault();
      save();
    } else if ((e.ctrlKey || e.metaKey) && key === "enter") {
      e.preventDefault();
      run();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget as HTMLTextAreaElement;
      if (el.tagName !== "TEXTAREA") return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      setCode(`${code.slice(0, start)}    ${code.slice(end)}`);
      requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
    }
  };

  const syncScroll = () => {
    const el = textRef.current;
    if (!el) return;
    if (overlayRef.current) {
      overlayRef.current.scrollTop = el.scrollTop;
      overlayRef.current.scrollLeft = el.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
  };

  /* ------------------------------------------------------------------- render */

  const toolbarButton = "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-white/10 text-white/70";

  return (
    <div className="relative h-full flex flex-col bg-[#14131c] text-white/85">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10 shrink-0">
        <button className={`${toolbarButton} bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30`} onClick={run}>
          <Play size={12} /> Run
        </button>
        <button className={toolbarButton} onClick={build}>
          <Hammer size={12} /> Build
        </button>
        <button className={toolbarButton} onClick={packageApp}>
          <Package size={12} /> Package
        </button>
        <button className={toolbarButton} onClick={installApp}>
          <Download size={12} /> Install
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button className={toolbarButton} onClick={() => save()}>
          <Save size={12} /> Save
        </button>
        <button className={toolbarButton} onClick={() => setDialog("open")}>
          <FolderOpen size={12} /> Open
        </button>
        <select
          value=""
          onChange={(e) => {
            const sample = BLAK_SAMPLES.find((s) => s.slug === e.target.value);
            if (sample) {
              setCode(sample.source);
              say({ kind: "info", text: `Loaded the "${sample.name}" template into the editor.` });
            }
          }}
          aria-label="Insert a template"
          className="ml-auto bg-white/5 rounded-md px-2 py-1 text-[11px] outline-none"
        >
          <option value="">Templates…</option>
          {BLAK_SAMPLES.map((sample) => (
            <option key={sample.slug} value={sample.slug} className="bg-[#1b1a26]">
              {sample.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* project files */}
        <div className="w-48 border-r border-white/10 flex flex-col shrink-0">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10">
            <button
              onClick={() => setDir(dirName(dir))}
              disabled={dir === "/"}
              aria-label="Up one folder"
              className="p-1 rounded hover:bg-white/10 text-white/50 disabled:opacity-30"
            >
              <ChevronUp size={13} />
            </button>
            <span className="text-[11px] text-white/50 truncate flex-1">{dir}</span>
            <button onClick={newFile} aria-label="New BLAK file" className="p-1 rounded hover:bg-white/10 text-white/50">
              <FilePlus size={13} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {entries.folders.map((entry) => (
              <button
                key={entry.name}
                onClick={() => setDir(joinPath(dir, entry.name))}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-white/10 text-white/70"
              >
                <Folder size={12} className="text-yellow-400 shrink-0" />
                <span className="truncate">{entry.name}</span>
              </button>
            ))}
            {entries.files.map((entry) => {
              const entryPath = joinPath(dir, entry.name);
              const isBlak = entry.name.endsWith(".blk") || entry.name.endsWith(".blak");
              return (
                <div
                  key={entry.name}
                  className={`group flex items-center gap-1.5 px-2 py-1 rounded text-[11px] ${
                    entryPath === path ? "bg-blue-500/25 text-white" : "hover:bg-white/10 text-white/60"
                  }`}
                >
                  <FileCode2 size={12} className={isBlak ? "text-sky-300 shrink-0" : "text-white/40 shrink-0"} />
                  <button onClick={() => setPath(entryPath)} className="truncate flex-1 text-left">
                    {entry.name}
                  </button>
                  <button
                    onClick={() => {
                      deleteNode(entryPath);
                      if (entryPath === path) setPath(null);
                    }}
                    aria-label={`Delete ${entry.name}`}
                    className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-300"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
            {entries.folders.length === 0 && entries.files.length === 0 && (
              <div className="text-[11px] text-white/30 p-2">Empty folder</div>
            )}
          </div>
        </div>

        {/* editor */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 relative flex font-mono text-[12.5px] leading-[1.55]">
            <div
              ref={gutterRef}
              className="w-11 shrink-0 overflow-hidden text-right pr-2 py-2 text-white/25 select-none bg-black/20"
            >
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <div className="relative flex-1 min-w-0">
              <div
                ref={overlayRef}
                aria-hidden="true"
                className="absolute inset-0 overflow-hidden whitespace-pre px-3 py-2 pointer-events-none"
              >
                {lines.map((line, i) => (
                  <div key={i}>{highlight(line, i)}</div>
                ))}
              </div>
              <textarea
                ref={textRef}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  updateCaret();
                }}
                onKeyDown={onKeyDown}
                onKeyUp={updateCaret}
                onClick={updateCaret}
                onScroll={syncScroll}
                spellCheck={false}
                wrap="off"
                aria-label="BLAK source code"
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white outline-none resize-none px-3 py-2 whitespace-pre overflow-auto selection:bg-blue-500/40"
                style={{ userSelect: "text", fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit" }}
              />
            </div>
          </div>

          {/* output */}
          <div className="h-28 shrink-0 border-t border-white/10 overflow-y-auto bg-black/20">
            {messages.length === 0 ? (
              <div className="text-[11px] text-white/30 px-3 py-2">
                Press Run to open your app as a real window. Ctrl+Enter also runs.
              </div>
            ) : (
              messages.map((message, i) => (
                <div
                  key={`${i}-${message.text}`}
                  className={`flex items-start gap-1.5 px-3 py-1 text-[11px] ${
                    message.kind === "error" ? "text-red-300" : message.kind === "success" ? "text-emerald-300" : "text-white/60"
                  }`}
                  style={{ userSelect: "text" }}
                >
                  {message.kind === "error" ? (
                    <CircleAlert size={11} className="mt-0.5 shrink-0" />
                  ) : (
                    <CircleCheck size={11} className="mt-0.5 shrink-0" />
                  )}
                  <span>{message.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-3 py-1 text-[11px] text-white/45 flex items-center gap-3 shrink-0">
        <span>BLAK</span>
        <span>
          Ln {caret.line}, Col {caret.col}
        </span>
        <span>{lines.length} lines</span>
        <span className="ml-auto truncate">{path ?? "Not saved yet"}</span>
        <span className={dirty ? "text-amber-300" : "text-white/30"}>{dirty ? "Unsaved" : "Saved"}</span>
      </div>

      {dialog && (
        <FileDialog
          mode={dialog}
          initialDir={dir}
          initialName={dialog === "save" ? fileName : ""}
          onCancel={() => setDialog(null)}
          onConfirm={(chosen) => {
            setDialog(null);
            if (dialog === "open") setPath(chosen);
            else save(chosen);
          }}
        />
      )}
    </div>
  );
}
