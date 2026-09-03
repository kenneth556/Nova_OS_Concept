import { useState, useRef, type KeyboardEvent } from "react";
import {
  ChevronLeft, ChevronRight, Home, Search, Folder, FileText,
  Download, Image as ImageIcon, Music2, Video, Star, HardDrive, Network, Monitor,
  Trash2, NotepadText, FolderPlus, FilePlus
} from "lucide-react";
import { useFsStore, handleCache } from "../store/fsStore";
import { useContextMenuStore } from "../store/contextMenuStore";
import { useWindowStore } from "../store/windowStore";
import { useClipboardStore } from "../store/clipboardStore";
import { appForFile, baseName, dirName } from "../lib/fileTypes";

const quickAccess = [
  { name: "Desktop", icon: Monitor, path: "/home/user/desktop" },
  { name: "Downloads", icon: Download, path: "/home/user/downloads" },
  { name: "Documents", icon: Folder, path: "/home/user/documents" },
  { name: "Pictures", icon: ImageIcon, path: "/home/user/pictures" },
  { name: "Music", icon: Music2, path: "/home/user/music" },
  { name: "Videos", icon: Video, path: "/home/user/videos" },
];

export default function FileExplorer() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const { nodes, currentPath, setCurrentPath, createDir, createFile, deleteNode, uniquePath } = useFsStore();
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const openApp = useWindowStore((s) => s.openApp);
  const { setClipboard, clearClipboard, files: clipboardFiles, action: clipboardAction } = useClipboardStore();
  const [isMounting, setIsMounting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  
  const [dragStart, setDragStart] = useState<{ cx: number, cy: number, sx: number, sy: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ cx: number, cy: number, sx: number, sy: number } | null>(null);

  const currentNode = nodes[currentPath];
  const childrenNames = (currentNode?.children || []).filter(n => n.toLowerCase().includes(query.toLowerCase()));

  const resolve = (name: string) => currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;

  const currentFolders = childrenNames.filter(n => nodes[resolve(n)]?.type === "dir");
  const currentFiles = childrenNames.filter(n => nodes[resolve(n)]?.type === "file");
  const allItems = [...currentFolders, ...currentFiles];

  const goUp = () => {
    if (currentPath === "/") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath("/" + (parts.length > 0 ? parts.join("/") : ""));
  };

  const handleMountDrive = async () => {
    try {
      if (!("showDirectoryPicker" in window)) {
        alert("Your browser does not support the File System Access API.");
        return;
      }
      setIsMounting(true);
      const handle = await (window as any).showDirectoryPicker({
        mode: "read",
      });

      const syncDir = async (dirHandle: any, path: string, depth = 0) => {
        if (depth > 3) return;
        if (!nodes[path]) createDir(path);
        
        for await (const entry of dirHandle.values()) {
          const entryPath = path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
          if (entry.kind === "file") {
            createFile(entryPath, "Local file reference");
            handleCache.set(entryPath, entry);
          } else if (entry.kind === "directory") {
            createDir(entryPath);
            await syncDir(entry, entryPath, depth + 1);
          }
        }
      };

      await syncDir(handle, `/home/user/${handle.name}`);
      setCurrentPath(`/home/user/${handle.name}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsMounting(false);
    }
  };

  const handleFileOpen = (filePath: string) => {
    openApp(appForFile(filePath), { path: filePath });
  };

  const newFolder = () => {
    const path = uniquePath(currentPath, "New folder");
    createDir(path);
    setSelected(new Set([baseName(path)]));
  };

  const newTextFile = () => {
    // Notepad opens empty and saves into this folder, which doubles as the
    // "name your file" step since the filesystem has no inline rename yet.
    openApp("notepad", { dir: currentPath });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const sx = e.clientX - rect.left + containerRef.current!.scrollLeft;
    const sy = e.clientY - rect.top + containerRef.current!.scrollTop;
    
    setDragStart({ cx: e.clientX, cy: e.clientY, sx, sy });
    setDragCurrent({ cx: e.clientX, cy: e.clientY, sx, sy });
    setSelected(new Set());
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const sx = e.clientX - rect.left + containerRef.current!.scrollLeft;
    const sy = e.clientY - rect.top + containerRef.current!.scrollTop;
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
      setClipboard(Array.from(selected).map(resolve), "copy");
    } else if (e.ctrlKey && e.key === "x") {
      e.preventDefault();
      setClipboard(Array.from(selected).map(resolve), "cut");
    } else if (e.ctrlKey && e.key === "v") {
      e.preventDefault();
      const copied: string[] = [];
      clipboardFiles.forEach((src) => {
        const name = src.split('/').pop();
        if (!name) return;
        const node = nodes[src];
        if (node?.type !== "file") return; // folder copy isn't implemented yet
        const cutting = clipboardAction === "cut";
        if (cutting && dirName(src) === currentPath) return; // moving onto itself
        // Keep the original name when it's free, otherwise fall back to "name (2)".
        const dest = cutting && !nodes[resolve(name)] ? resolve(name) : uniquePath(currentPath, name);
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
      Array.from(selected).forEach((s) => deleteNode(resolve(s)));
      setSelected(new Set());
    }
  };

  return (
    <div 
      className="h-full flex flex-col bg-[#1e1e2e] text-white/80 select-none outline-none focus:outline-none" 
      tabIndex={-1} 
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <button onClick={goUp} aria-label="Up one level" className="p-1.5 rounded hover:bg-white/10 text-white/50"><ChevronLeft size={15} /></button>
        <button aria-label="Forward" disabled className="p-1.5 rounded text-white/20"><ChevronRight size={15} /></button>
        <button onClick={() => setCurrentPath("/home/user")} aria-label="Home" className="p-1.5 rounded hover:bg-white/10 text-white/50"><Home size={14} /></button>
        <div className="flex-1 flex items-center gap-1 text-xs text-white/50 px-2 truncate">
          <span className="text-white">{currentPath}</span>
        </div>
        <button
          onClick={newTextFile}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-white/10 text-white/60"
        >
          <FilePlus size={13} /> New file
        </button>
        <button
          onClick={newFolder}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-white/10 text-white/60"
        >
          <FolderPlus size={13} /> New folder
        </button>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1">
          <Search size={12} className="text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Filter items in this folder"
            className="bg-transparent text-xs outline-none placeholder:text-white/30 w-28"
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-44 border-r border-white/10 p-2 overflow-y-auto">
          <div className="text-[11px] uppercase text-white/30 px-2 py-1">Quick Access</div>
          {quickAccess.map((q) => (
            <button
              key={q.name}
              onClick={() => setCurrentPath(q.path)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-white/5 ${
                currentPath === q.path ? "bg-white/10 text-white" : "text-white/70"
              }`}
            >
              <q.icon size={14} /> {q.name}
            </button>
          ))}
          <div className="text-[11px] uppercase text-white/30 px-2 py-1 mt-3">This PC</div>
          <button 
            onClick={handleMountDrive}
            disabled={isMounting}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-white/70"
          >
            <HardDrive size={14} className={isMounting ? "animate-pulse" : ""} /> 
            {isMounting ? "Mounting..." : "Mount Local Drive"}
          </button>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-white/70">
            <Network size={14} /> Network
          </button>
        </div>

        <div 
          className="flex-1 overflow-y-auto p-4 relative" 
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onContextMenu={(e) => {
            // Without this the desktop's own menu leaks through the window.
            e.preventDefault();
            e.stopPropagation();
            setSelected(new Set());
            openMenu(e.clientX, e.clientY, [
              { label: "New folder", icon: FolderPlus, onClick: newFolder },
              { label: "New text document", icon: FilePlus, onClick: newTextFile },
              { divider: true, label: "", onClick: () => {} },
              { label: "Paste", onClick: () => onKeyDown({ key: "v", ctrlKey: true, preventDefault: ()=>{} } as any) },
              { label: "Select all", onClick: () => setSelected(new Set(allItems)) },
            ]);
          }}
        >
          {dragStart && dragCurrent && (
            <div 
              className="absolute bg-blue-500/30 border border-blue-500/50 pointer-events-none"
              style={{
                left: Math.min(dragStart.sx, dragCurrent.sx),
                top: Math.min(dragStart.sy, dragCurrent.sy),
                width: Math.abs(dragCurrent.sx - dragStart.sx),
                height: Math.abs(dragCurrent.sy - dragStart.sy),
              }}
            />
          )}
          <div className="grid grid-cols-5 gap-3">
            {currentFolders.map((f) => (
              <button
                key={f}
                ref={(el) => { if (el) itemRefs.current.set(f, el); else itemRefs.current.delete(f); }}
                onDoubleClick={() => setCurrentPath(resolve(f))}
                onClick={(e) => {
                  const newSet = e.ctrlKey ? new Set(selected) : new Set<string>();
                  newSet.add(f);
                  setSelected(newSet);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!selected.has(f)) setSelected(new Set([f]));
                  openMenu(e.clientX, e.clientY, [
                    { label: "Open", icon: Folder, onClick: () => setCurrentPath(resolve(f)) },
                    { divider: true, label: "", onClick: () => {} },
                    { label: "Cut", onClick: () => setClipboard(Array.from(selected).map(resolve), "cut") },
                    { label: "Copy", onClick: () => setClipboard(Array.from(selected).map(resolve), "copy") },
                    { label: "Paste", onClick: () => onKeyDown({ key: "v", ctrlKey: true, preventDefault: ()=>{} } as any) },
                    { label: "Delete", icon: Trash2, onClick: () => Array.from(selected).forEach(s => deleteNode(resolve(s))) },
                  ]);
                }}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg ${
                  selected.has(f) ? "bg-blue-500/30 ring-1 ring-blue-500/50" : "hover:bg-white/5"
                }`}
              >
                <Folder size={40} className="text-yellow-500 fill-yellow-500/20" />
                <span className="text-xs text-center break-all">{f}</span>
              </button>
            ))}
            {currentFiles.map((file) => (
              <button
                key={file}
                ref={(el) => { if (el) itemRefs.current.set(file, el); else itemRefs.current.delete(file); }}
                onDoubleClick={() => handleFileOpen(resolve(file))}
                onClick={(e) => {
                  const newSet = e.ctrlKey ? new Set(selected) : new Set<string>();
                  newSet.add(file);
                  setSelected(newSet);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!selected.has(file)) setSelected(new Set([file]));
                  openMenu(e.clientX, e.clientY, [
                    { label: "Open", icon: FileText, onClick: () => handleFileOpen(resolve(file)) },
                    { label: "Open with Notepad", icon: NotepadText, onClick: () => openApp("notepad", { path: resolve(file) }) },
                    { divider: true, label: "", onClick: () => {} },
                    { label: "Cut", onClick: () => setClipboard(Array.from(selected).map(resolve), "cut") },
                    { label: "Copy", onClick: () => setClipboard(Array.from(selected).map(resolve), "copy") },
                    { label: "Paste", onClick: () => onKeyDown({ key: "v", ctrlKey: true, preventDefault: ()=>{} } as any) },
                    { label: "Delete", icon: Trash2, onClick: () => Array.from(selected).forEach(s => deleteNode(resolve(s))) },
                  ]);
                }}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg ${
                  selected.has(file) ? "bg-blue-500/30 ring-1 ring-blue-500/50" : "hover:bg-white/5"
                }`}
              >
                <FileText size={40} className="text-white/80" />
                <span className="text-xs text-center break-all">{file}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-1.5 text-[11px] text-white/40 flex justify-between">
        <span>{childrenNames.length} items</span>
        <span>{selected.size > 0 ? `${selected.size} items selected` : <span className="flex items-center gap-1"><Star size={10}/> NovaOS Files</span>}</span>
      </div>
    </div>
  );
}
