import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FilePlus, FolderOpen, Save, Search, WrapText, Minus, Plus, X, ChevronUp, ChevronDown, HardDrive,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { useFsStore, handleCache, readFileText } from "../store/fsStore";
import { useWindowStore, registerCloseGuard } from "../store/windowStore";
import { baseName, dirName } from "../lib/fileTypes";
import FileDialog from "../components/FileDialog";

type DialogMode = "open" | "save" | null;

export default function Notepad({ windowId, appData }: AppProps) {
  const writeFile = useFsStore((s) => s.writeFile);
  const currentPath = useFsStore((s) => s.currentPath);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);
  const setWindowAppData = useWindowStore((s) => s.setWindowAppData);
  const forceCloseWindow = useWindowStore((s) => s.forceCloseWindow);
  const openApp = useWindowStore((s) => s.openApp);

  const [path, setPath] = useState<string | null>(appData?.path ?? null);
  const [text, setText] = useState("");
  /** Content as it exists on disk / in the FS, for dirty tracking. */
  const [savedText, setSavedText] = useState("");
  const [loading, setLoading] = useState(Boolean(appData?.path));
  const [status, setStatus] = useState<{ kind: "info" | "error"; message: string } | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [closeAfterSave, setCloseAfterSave] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [fontSize, setFontSize] = useState(13);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState<string | null>(null);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const findRef = useRef<HTMLInputElement>(null);

  const dirty = text !== savedText;
  const fileName = path ? baseName(path) : "Untitled";
  const onDisk = path ? handleCache.has(path) : false;
  const saveDir = path ? dirName(path) : (appData?.dir ?? currentPath ?? "/home/user");

  /* ---------------------------------------------------------------- loading */

  useEffect(() => {
    if (!path) {
      setText("");
      setSavedText("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void readFileText(path).then(({ text: content, error }) => {
      if (cancelled) return;
      setText(content);
      setSavedText(content);
      setLoading(false);
      if (error) {
        setStatus({
          kind: "error",
          message: `Couldn't read the file from disk (${error}). Showing the cached copy.`,
        });
      } else if (!handleCache.has(path) && content === "Local file reference") {
        setStatus({
          kind: "error",
          message: "This file came from a mounted drive in a previous session. Remount the drive in File Explorer to edit it.",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  /* ------------------------------------------------------- window title sync */

  useEffect(() => {
    setWindowTitle(windowId, `${dirty ? "*" : ""}${fileName} — Notepad`);
  }, [windowId, fileName, dirty, setWindowTitle]);

  /* --------------------------------------------------------------- close guard */

  useEffect(() => {
    if (!dirty) {
      registerCloseGuard(windowId, null);
      return;
    }
    registerCloseGuard(windowId, () => {
      setPendingClose(true);
      return false; // block the close; the prompt decides what happens next
    });
    return () => registerCloseGuard(windowId, null);
  }, [windowId, dirty]);

  /* --------------------------------------------------------------------- save */

  const writeToDisk = async (targetPath: string): Promise<boolean> => {
    const handle = handleCache.get(targetPath);
    if (!handle) return true; // virtual file, nothing to do here

    try {
      let permission = await handle.queryPermission?.({ mode: "readwrite" });
      if (permission !== "granted") {
        permission = await handle.requestPermission?.({ mode: "readwrite" });
      }
      if (permission !== "granted") {
        setStatus({
          kind: "error",
          message: "Write access to this local file was denied. Use Save as to keep a copy inside NovaOS.",
        });
        return false;
      }
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return true;
    } catch (err) {
      setStatus({
        kind: "error",
        message: `Couldn't write to disk (${(err as Error).message}). Use Save as instead.`,
      });
      return false;
    }
  };

  const save = async (targetPath?: string): Promise<boolean> => {
    const target = targetPath ?? path;
    if (!target) {
      setDialog("save");
      return false;
    }
    if (!(await writeToDisk(target))) return false;

    writeFile(target, text);
    setSavedText(text);
    if (target !== path) {
      setPath(target);
      setWindowAppData(windowId, { ...(appData ?? {}), path: target });
    }
    setStatus({
      kind: "info",
      message: handleCache.has(target) ? `Saved to disk — ${target}` : `Saved — ${target}`,
    });
    return true;
  };

  // Clear the transient status line after a few seconds.
  useEffect(() => {
    if (status?.kind !== "info") return;
    const id = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(id);
  }, [status]);

  const handleDialogConfirm = async (chosen: string) => {
    const mode = dialog;
    setDialog(null);
    if (mode === "open") {
      setPath(chosen);
      setStatus(null);
      return;
    }
    const ok = await save(chosen);
    if (ok && closeAfterSave) {
      setCloseAfterSave(false);
      forceCloseWindow(windowId);
    }
  };

  /* ------------------------------------------------------------------ finding */

  const matchCount = useMemo(() => {
    if (!findQuery) return 0;
    return text.toLowerCase().split(findQuery.toLowerCase()).length - 1;
  }, [text, findQuery]);

  const findNext = useCallback(
    (backwards = false) => {
      const el = textRef.current;
      if (!el || !findQuery) return;
      const haystack = text.toLowerCase();
      const needle = findQuery.toLowerCase();

      let index: number;
      if (backwards) {
        const from = Math.max(0, (el.selectionStart ?? 0) - 1);
        index = haystack.lastIndexOf(needle, from - 1);
        if (index === -1) index = haystack.lastIndexOf(needle);
      } else {
        const from = el.selectionEnd ?? 0;
        index = haystack.indexOf(needle, from);
        if (index === -1) index = haystack.indexOf(needle);
      }

      if (index === -1) {
        setFindStatus("No matches");
        return;
      }
      setFindStatus(null);
      el.focus();
      el.setSelectionRange(index, index + needle.length);
    },
    [findQuery, text]
  );

  const openFind = () => {
    setFindOpen(true);
    requestAnimationFrame(() => findRef.current?.select());
  };

  /* --------------------------------------------------------------- shortcuts */

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "s") {
      e.preventDefault();
      if (e.shiftKey) setDialog("save");
      else void save();
    } else if ((e.ctrlKey || e.metaKey) && key === "o") {
      e.preventDefault();
      setDialog("open");
    } else if ((e.ctrlKey || e.metaKey) && key === "n") {
      e.preventDefault();
      openApp("notepad", { dir: saveDir });
    } else if ((e.ctrlKey || e.metaKey) && key === "f") {
      e.preventDefault();
      openFind();
    } else if (e.key === "Escape" && findOpen) {
      e.preventDefault();
      setFindOpen(false);
      textRef.current?.focus();
    }
  };

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setText(`${text.slice(0, start)}\t${text.slice(end)}`);
    requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
  };

  const updateCaret = () => {
    const el = textRef.current;
    if (!el) return;
    const lines = el.value.slice(0, el.selectionStart).split("\n");
    setCaret({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  const wordCount = useMemo(() => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [text]);

  /* ------------------------------------------------------------------ render */

  const toolbarButton = "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-white/10 text-white/70";

  return (
    <div
      className="relative h-full flex flex-col bg-[#15141d] text-white/85 outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/10 shrink-0">
        <button className={toolbarButton} onClick={() => openApp("notepad", { dir: saveDir })}>
          <FilePlus size={13} /> New
        </button>
        <button className={toolbarButton} onClick={() => setDialog("open")}>
          <FolderOpen size={13} /> Open
        </button>
        <button className={toolbarButton} onClick={() => void save()}>
          <Save size={13} /> Save
        </button>
        <button className={toolbarButton} onClick={() => setDialog("save")}>
          Save as
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button className={toolbarButton} onClick={openFind}>
          <Search size={13} /> Find
        </button>
        <button
          className={`${toolbarButton} ${wrap ? "text-blue-300" : ""}`}
          onClick={() => setWrap((w) => !w)}
          aria-pressed={wrap}
        >
          <WrapText size={13} /> Wrap
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            className={toolbarButton}
            onClick={() => setFontSize((s) => Math.max(10, s - 1))}
            aria-label="Decrease font size"
          >
            <Minus size={12} />
          </button>
          <span className="text-[11px] text-white/40 w-8 text-center">{fontSize}px</span>
          <button
            className={toolbarButton}
            onClick={() => setFontSize((s) => Math.min(28, s + 1))}
            aria-label="Increase font size"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {findOpen && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/10 bg-white/[0.03] shrink-0">
          <Search size={12} className="text-white/40" />
          <input
            ref={findRef}
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              setFindStatus(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                findNext(e.shiftKey);
              }
            }}
            placeholder="Find"
            aria-label="Find in file"
            className="bg-white/5 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500/60 w-48"
          />
          <button className={toolbarButton} onClick={() => findNext(true)} aria-label="Previous match">
            <ChevronUp size={13} />
          </button>
          <button className={toolbarButton} onClick={() => findNext(false)} aria-label="Next match">
            <ChevronDown size={13} />
          </button>
          <span className="text-[11px] text-white/40">
            {findStatus ?? (findQuery ? `${matchCount} match${matchCount === 1 ? "" : "es"}` : "")}
          </span>
          <button
            className={`${toolbarButton} ml-auto`}
            onClick={() => {
              setFindOpen(false);
              textRef.current?.focus();
            }}
            aria-label="Close find"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {status && (
        <div
          className={`px-3 py-1.5 text-[11px] border-b border-white/10 shrink-0 ${
            status.kind === "error" ? "bg-red-500/15 text-red-200" : "bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {status.message}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-white/40">Opening {fileName}…</div>
      ) : (
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            updateCaret();
          }}
          onKeyDown={onTextKeyDown}
          onKeyUp={updateCaret}
          onClick={updateCaret}
          onSelect={updateCaret}
          spellCheck={false}
          wrap={wrap ? "soft" : "off"}
          aria-label={`${fileName} contents`}
          placeholder="Start typing. Ctrl+S saves."
          className="flex-1 min-h-0 w-full bg-transparent outline-none resize-none px-4 py-3 font-mono leading-relaxed placeholder:text-white/20 selection:bg-blue-500/40"
          style={{
            fontSize,
            whiteSpace: wrap ? "pre-wrap" : "pre",
            overflowX: wrap ? "hidden" : "auto",
            userSelect: "text",
          }}
        />
      )}

      <div className="border-t border-white/10 px-3 py-1 text-[11px] text-white/45 flex items-center gap-3 shrink-0">
        <span>
          Ln {caret.line}, Col {caret.col}
        </span>
        <span>{text.length} chars</span>
        <span>{wordCount} words</span>
        <span className="ml-auto flex items-center gap-2 min-w-0">
          {onDisk && (
            <span className="flex items-center gap-1 text-emerald-400/80 shrink-0">
              <HardDrive size={10} /> disk
            </span>
          )}
          <span className="truncate">{path ?? "Not saved yet"}</span>
          <span className={dirty ? "text-amber-300 shrink-0" : "text-white/30 shrink-0"}>
            {dirty ? "Unsaved" : "Saved"}
          </span>
          <span className="shrink-0">UTF-8</span>
        </span>
      </div>

      {dialog && (
        <FileDialog
          mode={dialog}
          initialDir={saveDir}
          initialName={dialog === "save" ? (path ? fileName : "untitled.txt") : ""}
          onCancel={() => {
            setDialog(null);
            setCloseAfterSave(false);
          }}
          onConfirm={(chosen) => void handleDialogConfirm(chosen)}
        />
      )}

      {pendingClose && (
        <div
          className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved changes"
        >
          <div className="w-full max-w-sm bg-[#1b1a26] border border-white/10 rounded-xl shadow-2xl p-4">
            <div className="text-sm font-medium mb-1">Save changes to {fileName}?</div>
            <div className="text-xs text-white/50 mb-4">Your edits will be lost if you don't save them.</div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingClose(false)}
                className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setPendingClose(false);
                  registerCloseGuard(windowId, null);
                  forceCloseWindow(windowId);
                }}
                className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10 text-red-300"
              >
                Don't save
              </button>
              <button
                onClick={() => {
                  setPendingClose(false);
                  if (!path) {
                    setCloseAfterSave(true);
                    setDialog("save");
                    return;
                  }
                  void save().then((ok) => {
                    if (ok) forceCloseWindow(windowId);
                  });
                }}
                className="px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 text-white font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
