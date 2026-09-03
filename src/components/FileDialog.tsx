import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, Folder, FileText, HardDrive } from "lucide-react";
import { useFsStore, handleCache } from "../store/fsStore";
import { joinPath } from "../lib/fileTypes";

interface Props {
  mode: "open" | "save";
  initialDir: string;
  initialName?: string;
  onCancel: () => void;
  onConfirm: (path: string) => void;
}

/**
 * System open/save dialog over the virtual filesystem. Rendered inside the
 * calling app's window, so the parent needs `relative` positioning.
 */
export default function FileDialog({ mode, initialDir, initialName, onCancel, onConfirm }: Props) {
  const nodes = useFsStore((s) => s.nodes);
  const [dir, setDir] = useState(() => (nodes[initialDir]?.type === "dir" ? initialDir : "/home/user"));
  const [name, setName] = useState(initialName ?? "");
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus something inside the dialog so Escape/Enter reach the handler.
    if (mode === "save") nameRef.current?.select();
    else rootRef.current?.focus();
  }, [mode]);

  const { folders, files } = useMemo(() => {
    const children = nodes[dir]?.children ?? [];
    const resolved = children
      .map((child) => ({ name: child, node: nodes[joinPath(dir, child)] }))
      .filter((entry) => Boolean(entry.node));
    return {
      folders: resolved.filter((e) => e.node.type === "dir").sort((a, b) => a.name.localeCompare(b.name)),
      files: resolved.filter((e) => e.node.type === "file").sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [nodes, dir]);

  const segments = dir.split("/").filter(Boolean);

  const goUp = () => {
    if (dir === "/") return;
    const parts = dir.split("/").filter(Boolean);
    parts.pop();
    setDir(parts.length ? `/${parts.join("/")}` : "/");
  };

  const submit = (targetName = name) => {
    const trimmed = targetName.trim();
    if (!trimmed) return;
    const path = joinPath(dir, trimmed);
    if (mode === "save" && nodes[path] && confirmOverwrite !== path) {
      setConfirmOverwrite(path);
      return;
    }
    if (mode === "open" && nodes[path]?.type !== "file") return;
    onConfirm(path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-6 outline-none"
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "open" ? "Open file" : "Save file"}
    >
      <div className="w-full max-w-lg max-h-full flex flex-col bg-[#1b1a26] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm font-medium">
          {mode === "open" ? "Open" : "Save as"}
        </div>

        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 text-xs">
          <button
            onClick={goUp}
            aria-label="Up one level"
            className="p-1 rounded hover:bg-white/10 text-white/60 disabled:opacity-30"
            disabled={dir === "/"}
          >
            <ChevronUp size={14} />
          </button>
          <button onClick={() => setDir("/")} className="px-1.5 py-0.5 rounded hover:bg-white/10 text-white/60">
            <HardDrive size={12} />
          </button>
          {segments.map((seg, i) => (
            <button
              key={`${seg}-${i}`}
              onClick={() => setDir(`/${segments.slice(0, i + 1).join("/")}`)}
              className="px-1.5 py-0.5 rounded hover:bg-white/10 text-white/70 truncate max-w-[140px]"
            >
              {seg}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-[180px] max-h-[300px] overflow-y-auto p-1.5">
          {folders.length === 0 && files.length === 0 && (
            <div className="text-xs text-white/40 p-4 text-center">This folder is empty</div>
          )}
          {folders.map((entry) => (
            <button
              key={entry.name}
              onDoubleClick={() => setDir(joinPath(dir, entry.name))}
              onClick={() => setDir(joinPath(dir, entry.name))}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs hover:bg-white/10"
            >
              <Folder size={14} className="text-yellow-400 shrink-0" />
              <span className="truncate">{entry.name}</span>
            </button>
          ))}
          {files.map((entry) => {
            const path = joinPath(dir, entry.name);
            const selected = name === entry.name;
            return (
              <button
                key={entry.name}
                onClick={() => setName(entry.name)}
                onDoubleClick={() => submit(entry.name)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs ${
                  selected ? "bg-blue-500/30 ring-1 ring-blue-500/40" : "hover:bg-white/10"
                }`}
              >
                <FileText size={14} className="text-white/60 shrink-0" />
                <span className="truncate flex-1">{entry.name}</span>
                {handleCache.has(path) && (
                  <span className="text-[10px] text-emerald-400/80 shrink-0">on disk</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-white/10 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="file-dialog-name" className="text-xs text-white/50 shrink-0">
              File name
            </label>
            <input
              id="file-dialog-name"
              ref={nameRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setConfirmOverwrite(null);
              }}
              placeholder="untitled.txt"
              className="flex-1 bg-white/5 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500/60 placeholder:text-white/25"
            />
          </div>
          {confirmOverwrite && (
            <div className="text-[11px] text-amber-300">
              {confirmOverwrite.split("/").pop()} already exists. Save again to replace it.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={() => submit()}
              disabled={!name.trim()}
              className="px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:hover:bg-blue-500 text-white font-medium"
            >
              {mode === "open" ? "Open" : confirmOverwrite ? "Replace" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
