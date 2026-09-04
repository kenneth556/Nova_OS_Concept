import { useEffect, useMemo, useRef, useState } from "react";
import {
  ZoomIn, ZoomOut, Image as ImageIcon, FolderOpen, ChevronLeft, ChevronRight, Scan,
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

  const [path, setPath] = useState<string | null>(appData?.path ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(appData?.path));
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);

  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  /** Sibling images in the same folder, so prev/next works like a gallery. */
  const siblings = useMemo(() => {
    if (!path) return [] as string[];
    const dir = dirName(path);
    return (nodes[dir]?.children ?? [])
      .map((name) => joinPath(dir, name))
      .filter((p) => nodes[p]?.type === "file" && IMAGE_EXT.includes(extOf(p)))
      .sort((a, b) => a.localeCompare(b));
  }, [nodes, path]);

  const index = path ? siblings.indexOf(path) : -1;

  useEffect(() => {
    setWindowTitle(windowId, `${path ? baseName(path) : "Photos"} — Photos`);
  }, [windowId, path, setWindowTitle]);

  useEffect(() => {
    // Reset per-image view state and clear any stale error.
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
      // Images saved by Paint live in the virtual filesystem as data URLs.
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

    // Runs even while the read is still in flight, so the blob is never leaked.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, nodes]);

  const step = (delta: number) => {
    if (siblings.length === 0) return;
    const next = (index + delta + siblings.length) % siblings.length;
    setPath(siblings[next]);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    panRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    setOffset({ x: pan.ox + (e.clientX - pan.x), y: pan.oy + (e.clientY - pan.y) });
  };

  const endPan = () => {
    panRef.current = null;
  };

  const button = "p-2 hover:bg-white/10 rounded-md text-white/70 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="relative h-full flex flex-col bg-[#141420] text-white">
      <div className="h-12 border-b border-white/10 flex items-center px-3 gap-1 bg-white/5 shrink-0">
        <button onClick={() => setDialogOpen(true)} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-white/10 text-white/70">
          <FolderOpen size={13} /> Open
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button onClick={() => step(-1)} disabled={siblings.length < 2} aria-label="Previous image" className={button}>
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => step(1)} disabled={siblings.length < 2} aria-label="Next image" className={button}>
          <ChevronRight size={16} />
        </button>
        <span className="text-[11px] text-white/40 mx-1">
          {siblings.length > 1 && index >= 0 ? `${index + 1} / ${siblings.length}` : ""}
        </span>

        <div className="flex-1 text-center text-xs text-white/60 truncate px-2">
          {path ? baseName(path) : "No image open"}
        </div>

        <button onClick={() => setScale((s) => Math.max(0.1, s - 0.2))} aria-label="Zoom out" className={button}>
          <ZoomOut size={16} />
        </button>
        <span className="text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(5, s + 0.2))} aria-label="Zoom in" className={button}>
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
          aria-label="Reset view"
          title="Reset view"
          className={button}
        >
          <Scan size={15} />
        </button>
      </div>

      <div
        className="flex-1 overflow-hidden flex items-center justify-center p-8 bg-black/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        style={{ cursor: scale > 1 ? (panRef.current ? "grabbing" : "grab") : "default" }}
      >
        {loading ? (
          <div className="text-xs text-white/40">Opening…</div>
        ) : error ? (
          <div className="max-w-sm text-center">
            <ImageIcon size={40} className="mx-auto text-white/20 mb-3" />
            <div className="text-xs text-white/60 leading-relaxed">{error}</div>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-3 px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 font-medium"
            >
              Choose another image
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
          <div className="flex flex-col items-center gap-4 text-white/30">
            <ImageIcon size={64} className="opacity-50" />
            <p className="text-sm">No image open</p>
            <button
              onClick={() => setDialogOpen(true)}
              className="px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 text-white font-medium"
            >
              Choose an image
            </button>
          </div>
        )}
      </div>

      {dialogOpen && (
        <FileDialog
          mode="open"
          initialDir={path ? dirName(path) : "/home/user/pictures"}
          onCancel={() => setDialogOpen(false)}
          onConfirm={(chosen) => {
            setDialogOpen(false);
            setPath(chosen);
          }}
        />
      )}
    </div>
  );
}
