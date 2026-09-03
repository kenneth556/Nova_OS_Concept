import { useState, useRef, type KeyboardEvent } from "react";
import { Monitor, Folder, Trash2, Settings as SettingsIcon, Image, FileText, NotepadText, FolderPlus, FilePlus } from "lucide-react";
import { useWindowStore } from "../../store/windowStore";
import { useSystemStore } from "../../store/systemStore";
import { useContextMenuStore } from "../../store/contextMenuStore";
import { useFsStore, handleCache } from "../../store/fsStore";
import { useClipboardStore } from "../../store/clipboardStore";
import { appForFile, dirName } from "../../lib/fileTypes";
import WindowManager from "../window/WindowManager";

const DESKTOP_DIR = "/home/user/desktop";

const systemShortcuts = [
  { id: "this-pc", label: "This PC", icon: Monitor, action: "files" as const, type: "system" },
  { id: "files", label: "Files", icon: Folder, action: "files" as const, type: "system" },
  { id: "settings", label: "Settings", icon: SettingsIcon, action: "settings" as const, type: "system" },
  { id: "trash", label: "Trash", icon: Trash2, action: null, type: "system" },
];

export default function Desktop() {
  const openApp = useWindowStore((s) => s.openApp);
  const wallpaper = useSystemStore((s) => s.quickSettings.wallpaper);
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const nodes = useFsStore((s) => s.nodes);
  const createFile = useFsStore((s) => s.createFile);
  const createDir = useFsStore((s) => s.createDir);
  const deleteNode = useFsStore((s) => s.deleteNode);
  const uniquePath = useFsStore((s) => s.uniquePath);
  const setCurrentPath = useFsStore((s) => s.setCurrentPath);
  const { setClipboard, clearClipboard, files: clipboardFiles, action: clipboardAction } = useClipboardStore();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  
  const [dragStart, setDragStart] = useState<{ cx: number, cy: number, sx: number, sy: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ cx: number, cy: number, sx: number, sy: number } | null>(null);

  const desktopNode = nodes[DESKTOP_DIR];
  const childrenNames = desktopNode?.children || [];

  const resolve = (name: string) => `${DESKTOP_DIR}/${name}`;

  const currentFolders = childrenNames.filter(n => nodes[resolve(n)]?.type === "dir");
  const currentFiles = childrenNames.filter(n => nodes[resolve(n)]?.type === "file");

  const allItems = [...systemShortcuts.map(s => s.id), ...childrenNames.map(resolve)];

  const handleFileOpen = (filePath: string) => {
    openApp(appForFile(filePath), { path: filePath });
  };

  const openFolder = (folderPath: string) => {
    setCurrentPath(folderPath);
    openApp("files");
  };

  const newFolder = () => createDir(uniquePath(DESKTOP_DIR, "New folder"));
  const newTextFile = () => openApp("notepad", { dir: DESKTOP_DIR });

  const handleDesktopContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      { label: "New folder", icon: FolderPlus, onClick: newFolder },
      { label: "New text document", icon: FilePlus, onClick: newTextFile },
      { divider: true, label: "", onClick: () => {} },
      { label: "Paste", onClick: () => onKeyDown({ key: "v", ctrlKey: true, preventDefault: ()=>{} } as any) },
      { label: "Select all", onClick: () => setSelected(new Set(allItems)) },
      { divider: true, label: "", onClick: () => {} },
      { label: "Personalize", icon: Image, onClick: () => openApp("settings") },
    ]);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('.glass-panel')) return; // ignore clicks on windows
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    
    setDragStart({ cx: e.clientX, cy: e.clientY, sx, sy });
    setDragCurrent({ cx: e.clientX, cy: e.clientY, sx, sy });
    setSelected(new Set());
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    setDragCurrent({ cx: e.clientX, cy: e.clientY, sx, sy });

    const minCx = Math.min(dragStart.cx, e.clientX);
    const maxCx = Math.max(dragStart.cx, e.clientX);
    const minCy = Math.min(dragStart.cy, e.clientY);
    const maxCy = Math.max(dragStart.cy, e.clientY);

    const newSelected = new Set<string>();
    itemRefs.current.forEach((el, id) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.left < maxCx && r.right > minCx && r.top < maxCy && r.bottom > minCy) {
        newSelected.add(id);
      }
    });
    setSelected(newSelected);
  };

  const onPointerUp = () => {
    setDragStart(null);
    setDragCurrent(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "a") {
      e.preventDefault();
      setSelected(new Set(allItems));
    } else if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      // Filter out system shortcuts before copying
      const toCopy = Array.from(selected).filter(id => !systemShortcuts.find(s => s.id === id));
      if (toCopy.length > 0) setClipboard(toCopy, "copy");
    } else if (e.ctrlKey && e.key === "x") {
      e.preventDefault();
      const toCopy = Array.from(selected).filter(id => !systemShortcuts.find(s => s.id === id));
      if (toCopy.length > 0) setClipboard(toCopy, "cut");
    } else if (e.ctrlKey && e.key === "v") {
      e.preventDefault();
      const copied: string[] = [];
      clipboardFiles.forEach((src) => {
        const name = src.split('/').pop();
        if (!name) return;
        const node = nodes[src];
        if (node?.type !== "file") return; // folder copy isn't implemented yet
        const cutting = clipboardAction === "cut";
        if (cutting && dirName(src) === DESKTOP_DIR) return; // moving onto itself
        const dest = cutting && !nodes[resolve(name)] ? resolve(name) : uniquePath(DESKTOP_DIR, name);
        if (dest === src) return;
        createFile(dest, node.content || "");
        const handle = handleCache.get(src);
        if (handle) handleCache.set(dest, handle);
        copied.push(src);
      });
      if (clipboardAction === "cut") {
        copied.forEach((src) => deleteNode(src));
        clearClipboard();
      }
    } else if (e.key === "Delete") {
      e.preventDefault();
      Array.from(selected).forEach((s) => {
        if (!systemShortcuts.find(sys => sys.id === s)) {
          deleteNode(s);
        }
      });
      setSelected(new Set());
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={handleDesktopContextMenu}
      style={{
        background: wallpaper 
          ? `url('${wallpaper}') center/cover no-repeat`
          : "radial-gradient(circle at 20% 20%, rgba(88, 60, 190, 0.55), transparent 45%)," +
            "radial-gradient(circle at 75% 15%, rgba(60, 100, 200, 0.4), transparent 40%)," +
            "radial-gradient(circle at 60% 70%, rgba(140, 60, 170, 0.45), transparent 50%)," +
            "linear-gradient(160deg, #0a0b16 0%, #12111f 45%, #1a1330 100%)",
      }}
    >
      <div className="absolute -top-32 -left-20 w-[520px] h-[520px] rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="absolute top-1/3 right-0 w-[420px] h-[420px] rounded-full bg-fuchsia-600/20 blur-[110px]" />

      {dragStart && dragCurrent && (
        <div 
          className="absolute bg-blue-500/30 border border-blue-500/50 pointer-events-none z-40"
          style={{
            left: Math.min(dragStart.sx, dragCurrent.sx),
            top: Math.min(dragStart.sy, dragCurrent.sy),
            width: Math.abs(dragCurrent.sx - dragStart.sx),
            height: Math.abs(dragCurrent.sy - dragStart.sy),
          }}
        />
      )}

      <div className="absolute top-6 left-6 flex flex-col flex-wrap gap-5 max-h-[80%]">
        {systemShortcuts.map((s) => (
          <button
            key={s.id}
            ref={(el) => { if (el) itemRefs.current.set(s.id, el); else itemRefs.current.delete(s.id); }}
            onDoubleClick={() => s.action && openApp(s.action)}
            onClick={(e) => {
              const newSet = e.ctrlKey ? new Set(selected) : new Set<string>();
              newSet.add(s.id);
              setSelected(newSet);
            }}
            className={`w-20 flex flex-col items-center gap-1.5 p-2 rounded-lg z-10 ${
              selected.has(s.id) ? "bg-blue-500/30 ring-1 ring-blue-500/50" : "hover:bg-white/5"
            }`}
          >
            <s.icon size={30} className="text-white drop-shadow" />
            <span className="text-[11px] text-white text-center leading-tight drop-shadow">{s.label}</span>
          </button>
        ))}

        {currentFolders.map((f) => {
          const id = resolve(f);
          return (
            <button
              key={id}
              ref={(el) => { if (el) itemRefs.current.set(id, el); else itemRefs.current.delete(id); }}
              onDoubleClick={() => openFolder(id)}
              onClick={(e) => {
                const newSet = e.ctrlKey ? new Set(selected) : new Set<string>();
                newSet.add(id);
                setSelected(newSet);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!selected.has(id)) setSelected(new Set([id]));
                openMenu(e.clientX, e.clientY, [
                  { label: "Open", icon: Folder, onClick: () => openFolder(id) },
                  { divider: true, label: "", onClick: () => {} },
                  { label: "Cut", onClick: () => setClipboard(Array.from(selected).filter(i=>!systemShortcuts.find(s=>s.id===i)), "cut") },
                  { label: "Copy", onClick: () => setClipboard(Array.from(selected).filter(i=>!systemShortcuts.find(s=>s.id===i)), "copy") },
                  { label: "Delete", icon: Trash2, onClick: () => Array.from(selected).forEach(s => !systemShortcuts.find(sys=>sys.id===s) && deleteNode(s)) },
                ]);
              }}
              className={`w-20 flex flex-col items-center gap-1.5 p-2 rounded-lg z-10 ${
                selected.has(id) ? "bg-blue-500/30 ring-1 ring-blue-500/50" : "hover:bg-white/5"
              }`}
            >
              <Folder size={30} className="text-yellow-400 fill-yellow-400/20 drop-shadow" />
              <span className="text-[11px] text-white text-center leading-tight drop-shadow break-all">{f}</span>
            </button>
          );
        })}

        {currentFiles.map((file) => {
          const id = resolve(file);
          return (
            <button
              key={id}
              ref={(el) => { if (el) itemRefs.current.set(id, el); else itemRefs.current.delete(id); }}
              onDoubleClick={() => handleFileOpen(id)}
              onClick={(e) => {
                const newSet = e.ctrlKey ? new Set(selected) : new Set<string>();
                newSet.add(id);
                setSelected(newSet);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!selected.has(id)) setSelected(new Set([id]));
                openMenu(e.clientX, e.clientY, [
                  { label: "Open", icon: FileText, onClick: () => handleFileOpen(id) },
                  { label: "Open with Notepad", icon: NotepadText, onClick: () => openApp("notepad", { path: id }) },
                  { divider: true, label: "", onClick: () => {} },
                  { label: "Cut", onClick: () => setClipboard(Array.from(selected).filter(i=>!systemShortcuts.find(s=>s.id===i)), "cut") },
                  { label: "Copy", onClick: () => setClipboard(Array.from(selected).filter(i=>!systemShortcuts.find(s=>s.id===i)), "copy") },
                  { label: "Delete", icon: Trash2, onClick: () => Array.from(selected).forEach(s => !systemShortcuts.find(sys=>sys.id===s) && deleteNode(s)) },
                ]);
              }}
              className={`w-20 flex flex-col items-center gap-1.5 p-2 rounded-lg z-10 ${
                selected.has(id) ? "bg-blue-500/30 ring-1 ring-blue-500/50" : "hover:bg-white/5"
              }`}
            >
              <FileText size={30} className="text-white/80 drop-shadow" />
              <span className="text-[11px] text-white text-center leading-tight drop-shadow break-all">{file}</span>
            </button>
          );
        })}
      </div>

      <WindowManager />
    </div>
  );
}
