import { useEffect, useMemo, useRef, useState } from "react";
import {
  ZoomIn, ZoomOut, Image as ImageIcon, FolderOpen, ChevronLeft, ChevronRight, Scan,
  LayoutGrid, Paintbrush, X, Search,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { handleCache, useFsStore } from "../store/fsStore";
import { useWindowStore } from "../store/windowStore";
import { baseName, dirName, extOf, joinPath } from "../lib/fileTypes";
import FileDialog from "../components/FileDialog";

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"];

export default function Photos({ windowId, appData }: AppProps) {
  const nodes = useFsStore((s) => s.nodes);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);
  const openApp = useWindowStore((s) => s.openApp);

  const [path, setPath] = useState<string | null>(appData?.path ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(appData?.path));
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"grid" | "preview">("grid");
  const [search, setSearch] = useState("");

  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const imagePaths = useMemo(() => {
    const results: string[] = [];
    for (const [nodePath, node] of Object.entries(nodes)) {
      if (node.type === "file" && IMAGE_EXT.includes(extOf(nodePath))) {
        if (!search || baseName(nodePath).toLowerCase().includes(search.toLowerCase())) {
          results.push(nodePath);
        }
      }
    }
    return results.sort((a, b) => a.localeCompare(b));
  }, [nodes, search]);

  const folderImages = useMemo(() => {
    if (!path) return [] as string[];
    const dir = dirName(path);
    return (nodes[dir]?.children ?? [])
      .map((name) => joinPath(dir, name))
      .filter((p) => nodes[p]?.type === "file" && IMAGE_EXT.includes(extOf(p)))
      .sort((a, b) => a.localeCompare(b));
  }, [nodes, path]);

  const currentIndex = path ? folderImages.indexOf(path) : -1;

  useEffect(() => {
    setWindowTitle(windowId, `${path ? baseName(path) : "Photos"} — Photos`);
  }, [windowId, path, setWindowTitle]);

  useEffect(() => {
    setError(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setImageUrl(null);

    if (!path) {
      setLoading(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);

    const handle = handleCache.get(path);
    const content = nodes[path]?.content ?? "";

    if (handle) {
      void (async () => {
        try {
          const file = await handle.getFile();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(file);
          setImageUrl(objectUrl);
        } catch (err) {
          if (!cancelled) setError(`Couldn't read the file (${(err as Error).message}).`);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    } else if (/^(data:image|https?:)/.test(content)) {
      setImageUrl(content);
      setLoading(false);
    } else if (!nodes[path]) {
      setError("That file no longer exists.");
      setLoading(false);
    } else {
      setError(
        "This file came from a mounted drive in an earlier session. Remount the drive in File Explorer to view it."
      );
      setLoading(false);
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, nodes]);

  const step = (delta: number) => {
    if (folderImages.length === 0) return;
    const next = (currentIndex + delta + folderImages.length) % folderImages.length;
    setPath(folderImages[next]);
  };

  const openInPaint = () => {
    if (!path) return;
    openApp("paint", { path });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    panRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.x;
    const dy = e.clientY - panRef.current.y;
    setOffset({ x: panRef.current.ox + dx, y: panRef.current.oy + dy });
  };

  const onPointerUp = () => {
    panRef.current = null;
  };

  const buttonClass = "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] hover:bg-white/10 text-white/70 transition";

  return (
    <div className="relative h-full flex flex-col bg-[#141420] text-white">
      <div className="h-12 border-b border-white/10 flex items-center px-3 gap-1 bg-white/5 shrink-0">
        <button onClick={() => setView("grid")} className={`${buttonClass} ${view === "grid" ? "bg-white/10 text-white" : ""}`}>
          <LayoutGrid size={14} /> Gallery
        </button>
        <button onClick={() => setDialogOpen(true)} className={buttonClass}>
          <FolderOpen size={14} /> Open
        </button>

        {view === "preview" && (
          <>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button onClick={() => step(-1)} disabled={folderImages.length < 2} aria-label="Previous image" className={buttonClass}>
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => step(1)} disabled={folderImages.length < 2} aria-label="Next image" className={buttonClass}>
              <ChevronRight size={16} />
            </button>
            <span className="text-[11px] text-white/40 mx-1">
              {folderImages.length > 1 && currentIndex >= 0 ? `${currentIndex + 1} / ${folderImages.length}` : ""}
            </span>
            <div className="flex-1 text-center text-xs text-white/60 truncate px-2">
              {path ? baseName(path) : "No image open"}
            </div>
            <button onClick={() => setScale((s) => Math.max(0.1, s - 0.2))} aria-label="Zoom out" className={buttonClass}>
              <ZoomOut size={16} />
            </button>
            <span className="text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((s) => Math.min(5, s + 0.2))} aria-label="Zoom in" className={buttonClass}>
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => {
                setScale(1);
                setOffset({ x: 0, y: 0 });
              }}
              aria-label="Reset view"
              title="Reset view"
              className={buttonClass}
            >
              <Scan size={15} />
            </button>
            <button onClick={openInPaint} className={buttonClass} title="Open in Paint">
              <Paintbrush size={14} /> Edit
            </button>
            <button
              onClick={() => {
                setScale(1);
                setOffset({ x: 0, y: 0 });
                setView("grid");
              }}
              className={buttonClass}
            >
              <X size={14} />
            </button>
          </>
        )}

        {view === "grid" && (
          <>
            <div className="flex-1" />
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search photos..."
                className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/20 w-44"
              />
            </div>
          </>
        )}
      </div>

      {view === "grid" ? (
        <div className="flex-1 overflow-y-auto p-4">
          {imagePaths.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/30 gap-3">
              <ImageIcon size={48} className="opacity-50" />
              <p className="text-sm">No images found</p>
              <button onClick={() => setDialogOpen(true)} className="px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 text-white font-medium">
                Open an image
              </button>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {imagePaths.map((imgPath) => (
                <button
                  key={imgPath}
                  onClick={() => {
                    setPath(imgPath);
                    setView("preview");
                  }}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/[0.07] hover:border-white/20 transition"
                >
                    <img
                    src={(() => {
                      const content = nodes[imgPath]?.content ?? "";
                      if (content.startsWith("data:image")) return content;
                      if (content.startsWith("http")) return content;
                      return "";
                    })()}
                    alt={baseName(imgPath)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <div className="text-[11px] text-white/90 truncate">{baseName(imgPath)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex-1 overflow-hidden flex items-center justify-center p-8 bg-black/50"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: scale > 1 ? (panRef.current ? "grabbing" : "grab") : "default" }}
        >
          {loading ? (
            <div className="text-xs text-white/40">Opening…</div>
          ) : error ? (
            <div className="max-w-sm text-center">
              <ImageIcon size={40} className="mx-auto text-white/20 mb-3" />
              <div className="text-xs text-white/60 leading-relaxed">{error}</div>
              <button
                onClick={() => {
                  setView("grid");
                  setError(null);
                }}
                className="mt-3 px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 font-medium"
              >
                Back to gallery
              </button>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={path ? baseName(path) : "Image"}
              draggable={false}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/30">
              <ImageIcon size={48} className="opacity-50" />
              <p className="text-sm">Unable to preview</p>
              <button onClick={() => setView("grid")} className="px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15 text-white/70">
                Back to gallery
              </button>
            </div>
          )}
        </div>
      )}

      {dialogOpen && (
        <FileDialog
          mode="open"
          initialDir={path ? dirName(path) : "/home/user/pictures"}
          onCancel={() => setDialogOpen(false)}
          onConfirm={(chosen) => {
            setDialogOpen(false);
            setPath(chosen);
            setView("preview");
          }}
        />
      )}
    </div>
  );
}
