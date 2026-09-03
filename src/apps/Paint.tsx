import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle, Download, Eraser, FilePlus, FolderOpen, HardDrive, Minus, PaintBucket, Paintbrush,
  Pipette, Redo2, Save, Square, Trash2, Undo2,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { useFsStore, handleCache } from "../store/fsStore";
import { useWindowStore, registerCloseGuard } from "../store/windowStore";
import { baseName, dirName, extOf } from "../lib/fileTypes";
import FileDialog from "../components/FileDialog";

type Tool = "brush" | "eraser" | "line" | "rect" | "ellipse" | "fill" | "pick";
type DialogMode = "open" | "save" | null;
/** What should happen once a "save first?" prompt is answered. */
type PendingAction = "close" | "new" | null;

interface Drag {
  tool: Tool;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

interface ShapeStyle {
  stroke: string;
  fill: string;
  size: number;
  filled: boolean;
}

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 600;
/** Opened images are scaled into this box so one undo snapshot stays affordable. */
const MAX_DIM = 2000;
const HISTORY_LIMIT = 30;
/** Snapshots are raw pixels, so history is capped by bytes as well as by count. */
const HISTORY_BUDGET = 96 * 1024 * 1024;
const WHITE = "#ffffff";
/** Keeps a saved drawing associated with an image app instead of Notepad. */
const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "bmp", "gif", "avif"];

const PALETTE = [
  "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200", "#22b14c", "#00a2e8",
  "#3f48cc", "#a349a4", "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0",
];

const TOOLS: { id: Tool; label: string; hint: string; Icon: typeof Paintbrush }[] = [
  { id: "brush", label: "Brush", hint: "Brush — freehand (B)", Icon: Paintbrush },
  { id: "eraser", label: "Eraser", hint: "Eraser — paints with the fill colour (E)", Icon: Eraser },
  { id: "line", label: "Line", hint: "Line (L)", Icon: Minus },
  { id: "rect", label: "Rectangle", hint: "Rectangle (R)", Icon: Square },
  { id: "ellipse", label: "Ellipse", hint: "Ellipse (O)", Icon: Circle },
  { id: "fill", label: "Fill", hint: "Flood fill with the stroke colour (F)", Icon: PaintBucket },
  { id: "pick", label: "Eyedropper", hint: "Eyedropper — picks the stroke colour (I)", Icon: Pipette },
];

const SHORTCUTS: Record<string, Tool> = {
  b: "brush", e: "eraser", l: "line", r: "rect", o: "ellipse", f: "fill", i: "pick",
};

/** Transparent-style backdrop so the white page reads as a sheet of paper. */
const CHECKERBOARD = {
  backgroundColor: "#100f17",
  backgroundImage:
    "linear-gradient(45deg, rgba(255,255,255,0.035) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.035) 75%)," +
    "linear-gradient(45deg, rgba(255,255,255,0.035) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.035) 75%)",
  backgroundSize: "18px 18px",
  backgroundPosition: "0 0, 9px 9px",
};

const withImageExt = (target: string): string =>
  IMAGE_EXT.includes(extOf(target)) ? target : `${target}.png`;

const hexToRgb = (hex: string): [number, number, number] => {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const value = parseInt(full, 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const toPngBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

/** Colour under the cursor, or null when the point is off the surface. */
const pickColor = (ctx: CanvasRenderingContext2D, x: number, y: number): string | null => {
  const { width, height } = ctx.canvas;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return toHex(r, g, b);
};

/**
 * Flood fill from one pixel outwards. The tolerance lets the fill cross the
 * anti-aliased edge of an earlier stroke instead of stopping one pixel short.
 * Returns false when the area already had the fill colour, so the caller can
 * skip recording an undo entry.
 */
const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number, hex: string): boolean => {
  const { width, height } = ctx.canvas;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return false;

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const [fr, fg, fb] = hexToRgb(hex);

  const origin = (startY * width + startX) * 4;
  const sr = data[origin];
  const sg = data[origin + 1];
  const sb = data[origin + 2];
  const sa = data[origin + 3];
  if (sr === fr && sg === fg && sb === fb && sa === 255) return false;

  const tolerance = 24;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  // Marking on push keeps every pixel in the stack at most once.
  const push = (index: number) => {
    if (seen[index]) return;
    seen[index] = 1;
    stack.push(index);
  };

  push(startY * width + startX);
  while (stack.length > 0) {
    const index = stack.pop() as number;
    const p = index * 4;
    if (
      Math.abs(data[p] - sr) > tolerance ||
      Math.abs(data[p + 1] - sg) > tolerance ||
      Math.abs(data[p + 2] - sb) > tolerance ||
      Math.abs(data[p + 3] - sa) > tolerance
    ) {
      continue;
    }
    data[p] = fr;
    data[p + 1] = fg;
    data[p + 2] = fb;
    data[p + 3] = 255;

    const column = index % width;
    if (column > 0) push(index - 1);
    if (column < width - 1) push(index + 1);
    if (index >= width) push(index - width);
    if (index + width < seen.length) push(index + width);
  }

  ctx.putImageData(image, 0, 0);
  return true;
};

const stampDot = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, size / 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const strokeSegment = (
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  color: string, size: number
) => {
  ctx.save();
  ctx.lineWidth = Math.max(1, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
};

/** Used for both the live preview and the committed shape, so they always match. */
const drawShape = (
  ctx: CanvasRenderingContext2D,
  tool: Tool,
  x0: number, y0: number, x1: number, y1: number,
  style: ShapeStyle
) => {
  ctx.save();
  ctx.lineWidth = Math.max(1, style.size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = style.stroke;
  ctx.fillStyle = style.fill;

  if (tool === "line") {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  } else if (tool === "rect") {
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    if (style.filled) ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  } else if (tool === "ellipse") {
    ctx.beginPath();
    ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
    if (style.filled) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};

export default function Paint({ windowId, appData }: AppProps) {
  const writeFile = useFsStore((s) => s.writeFile);
  const nodes = useFsStore((s) => s.nodes);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);
  const setWindowAppData = useWindowStore((s) => s.setWindowAppData);
  const forceCloseWindow = useWindowStore((s) => s.forceCloseWindow);

  const [path, setPath] = useState<string | null>(appData?.path ?? null);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [tool, setTool] = useState<Tool>("brush");
  const [strokeColor, setStrokeColor] = useState("#111111");
  /** Doubles as the background colour: shape fills and the eraser both use it. */
  const [fillColor, setFillColor] = useState(WHITE);
  const [brushSize, setBrushSize] = useState(6);
  const [filled, setFilled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(Boolean(appData?.path));
  const [status, setStatus] = useState<{ kind: "info" | "error"; message: string } | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [afterSave, setAfterSave] = useState<PendingAction>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  /** Path whose pixels are on the canvas, so unrelated FS writes can't reload it. */
  const loadedPathRef = useRef<string | null | undefined>(undefined);
  /** Save target waiting for a second confirmation after we appended `.png`. */
  const overwriteRef = useRef<string | null>(null);

  const fileName = path ? baseName(path) : "Untitled";
  const onDisk = path ? handleCache.has(path) : false;
  const missing = path ? !nodes[path] : false;
  const saveDir = path ? dirName(path) : (appData?.dir ?? "/home/user/pictures");
  const toolLabel = TOOLS.find((t) => t.id === tool)?.label ?? tool;

  /* ------------------------------------------------------------------ surface */

  const committed = () => canvasRef.current?.getContext("2d") ?? null;
  const overlay = () => previewRef.current?.getContext("2d") ?? null;
  const shapeStyle = (): ShapeStyle => ({ stroke: strokeColor, fill: fillColor, size: brushSize, filled });

  /** Sizes both canvases to match and paints the committed one white. */
  const resetSurface = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    const preview = previewRef.current;
    if (!canvas || !preview) return null;

    // Setting width/height also clears the bitmap, which is what we want here.
    canvas.width = width;
    canvas.height = height;
    preview.width = width;
    preview.height = height;
    setSize({ width, height });

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, width, height);
    return ctx;
  }, []);

  /* ------------------------------------------------------------------ history */

  const syncHistory = () => {
    setUndoDepth(undoRef.current.length);
    setRedoDepth(redoRef.current.length);
  };

  const resetHistory = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    setUndoDepth(0);
    setRedoDepth(0);
  }, []);

  /** Entry cap shrinks as the surface grows so memory stays bounded. */
  const historyLimit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return HISTORY_LIMIT;
    const bytes = Math.max(1, canvas.width * canvas.height * 4);
    return Math.max(3, Math.min(HISTORY_LIMIT, Math.floor(HISTORY_BUDGET / bytes)));
  };

  /**
   * Runs a mutation against the committed surface with an undo snapshot taken
   * first. A mutation that returns false is treated as a no-op and leaves the
   * history untouched.
   */
  const commit = (mutate: (ctx: CanvasRenderingContext2D) => boolean | void) => {
    const ctx = committed();
    if (!ctx) return;
    const before = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (mutate(ctx) === false) return;

    undoRef.current.push(before);
    while (undoRef.current.length > historyLimit()) undoRef.current.shift();
    redoRef.current = [];
    syncHistory();
    setDirty(true);
  };

  const swapHistory = (from: ImageData[], to: ImageData[]) => {
    const ctx = committed();
    if (!ctx || from.length === 0) return;
    const snapshot = from.pop() as ImageData;
    to.push(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height));
    while (to.length > historyLimit()) to.shift();
    ctx.putImageData(snapshot, 0, 0);
    syncHistory();
    // The surface no longer matches what was written, so treat it as unsaved.
    setDirty(true);
  };

  const undo = () => swapHistory(undoRef.current, redoRef.current);
  const redo = () => swapHistory(redoRef.current, undoRef.current);

  /* ------------------------------------------------------------------ loading */

  useEffect(() => {
    // Reload only when the file being edited changes. Unrelated filesystem
    // writes — including our own saves — must not wipe the surface or history.
    if (loadedPathRef.current === path) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    const finish = (message?: { kind: "info" | "error"; message: string }) => {
      loadedPathRef.current = path;
      resetHistory();
      setDirty(false);
      setLoading(false);
      if (message) setStatus(message);
    };

    if (!path) {
      resetSurface(DEFAULT_WIDTH, DEFAULT_HEIGHT);
      finish();
      return;
    }

    setLoading(true);
    setStatus(null);

    const draw = (src: string) => {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        const natural = Math.max(image.naturalWidth || DEFAULT_WIDTH, image.naturalHeight || DEFAULT_HEIGHT);
        const scale = Math.min(1, MAX_DIM / natural);
        const width = Math.max(1, Math.round((image.naturalWidth || DEFAULT_WIDTH) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || DEFAULT_HEIGHT) * scale));
        const ctx = resetSurface(width, height);
        ctx?.drawImage(image, 0, 0, width, height);
        // Decoding is done, so the blob can go now rather than at cleanup.
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        finish(
          scale < 1
            ? { kind: "info", message: `Scaled to ${width} × ${height} so editing stays responsive.` }
            : undefined
        );
      };
      image.onerror = () => {
        if (cancelled) return;
        resetSurface(DEFAULT_WIDTH, DEFAULT_HEIGHT);
        finish({ kind: "error", message: `Couldn't decode ${baseName(path)} as an image.` });
      };
      image.src = src;
    };

    const stored = nodes[path]?.content;
    const handle = handleCache.get(path);

    if (handle) {
      // Mounted from the real disk, so read the actual bytes.
      void (async () => {
        try {
          const file = await handle.getFile();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(file);
          draw(objectUrl);
        } catch (err) {
          if (cancelled) return;
          resetSurface(DEFAULT_WIDTH, DEFAULT_HEIGHT);
          finish({ kind: "error", message: `Couldn't read the file (${(err as Error).message}).` });
        }
      })();
    } else if (stored?.startsWith("data:image")) {
      draw(stored);
    } else {
      resetSurface(DEFAULT_WIDTH, DEFAULT_HEIGHT);
      finish({
        kind: "error",
        message: nodes[path]
          ? `${baseName(fileName)} isn't an image NovaOS can open. If it came from a mounted drive in an earlier session, remount the drive in File Explorer.`
          : "That file no longer exists.",
      });
    }

    // Runs even while the read is in flight, so the blob is never leaked.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, nodes, fileName, resetSurface, resetHistory]);

  /* ------------------------------------------------------- window title sync */

  useEffect(() => {
    setWindowTitle(windowId, `${dirty ? "*" : ""}${fileName} — Paint`);
  }, [windowId, fileName, dirty, setWindowTitle]);

  /* --------------------------------------------------------------- close guard */

  useEffect(() => {
    if (!dirty) {
      registerCloseGuard(windowId, null);
      return;
    }
    registerCloseGuard(windowId, () => {
      setPending("close");
      return false; // block the close; the prompt decides what happens next
    });
    return () => registerCloseGuard(windowId, null);
  }, [windowId, dirty]);

  /* ---------------------------------------------------------------- focus/status */

  useEffect(() => {
    // Keyboard shortcuts live on the root, so it needs focus from the start.
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    if (status?.kind !== "info") return;
    const id = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(id);
  }, [status]);

  /* --------------------------------------------------------------------- save */

  const writeToDisk = async (targetPath: string, canvas: HTMLCanvasElement): Promise<boolean> => {
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
      const blob = await toPngBlob(canvas);
      if (!blob) {
        setStatus({ kind: "error", message: "Couldn't encode the canvas as a PNG." });
        return false;
      }
      const writable = await handle.createWritable();
      await writable.write(blob);
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
    const canvas = canvasRef.current;
    if (!canvas) return false;
    if (!(await writeToDisk(target, canvas))) return false;

    // The virtual filesystem only stores strings, so the PNG goes in as a data URL.
    writeFile(target, canvas.toDataURL("image/png"));
    setDirty(false);
    if (target !== path) {
      // Claim the path first so the loader doesn't read back what we just wrote.
      loadedPathRef.current = target;
      setPath(target);
      setWindowAppData(windowId, { ...(appData ?? {}), path: target });
    }
    setStatus({
      kind: "info",
      message: handleCache.has(target) ? `Saved to disk — ${target}` : `Saved — ${target}`,
    });
    return true;
  };

  /* ------------------------------------------------------------------ actions */

  const newDrawing = () => {
    resetSurface(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    resetHistory();
    setDirty(false);
    setStatus(null);
    loadedPathRef.current = null;
    setPath(null);
    setWindowAppData(windowId, { ...(appData ?? {}), path: undefined });
  };

  const requestNew = () => {
    if (dirty) setPending("new");
    else newDrawing();
  };

  const clearCanvas = () => {
    commit((ctx) => {
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    });
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = withImageExt(fileName);
    link.click();
  };

  const runPending = (action: PendingAction) => {
    if (action === "close") {
      registerCloseGuard(windowId, null);
      forceCloseWindow(windowId);
    } else if (action === "new") {
      newDrawing();
    }
  };

  const closeDialog = () => {
    setDialog(null);
    overwriteRef.current = null;
    rootRef.current?.focus();
  };

  const handleDialogConfirm = async (chosen: string) => {
    if (dialog === "open") {
      closeDialog();
      setStatus(null);
      setPath(chosen);
      return;
    }

    const target = withImageExt(chosen);
    if (target !== chosen && nodes[target] && overwriteRef.current !== target) {
      // We appended `.png`, so the dialog's own overwrite prompt never ran.
      overwriteRef.current = target;
      setStatus({ kind: "error", message: `${baseName(target)} already exists. Save again to replace it.` });
      return;
    }

    closeDialog();
    const ok = await save(target);
    if (!ok) return;
    const next = afterSave;
    setAfterSave(null);
    runPending(next);
  };

  /* ----------------------------------------------------------------- drawing */

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    // The surface can be laid out at a different CSS size than its pixel size.
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const ctx = committed();
    if (!ctx) return;

    // Capture keeps the gesture alive when the pointer leaves the canvas.
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = canvasPoint(e);

    if (tool === "pick") {
      const picked = pickColor(ctx, Math.floor(x), Math.floor(y));
      if (picked) {
        setStrokeColor(picked);
        setStatus({ kind: "info", message: `Picked ${picked}` });
      }
      return;
    }

    if (tool === "fill") {
      commit((target) => floodFill(target, Math.floor(x), Math.floor(y), strokeColor));
      return;
    }

    if (tool === "brush" || tool === "eraser") {
      const color = tool === "eraser" ? fillColor : strokeColor;
      // Snapshot once here: the whole stroke undoes as a single step.
      commit((target) => stampDot(target, x, y, color, brushSize));
    }

    dragRef.current = { tool, pointerId: e.pointerId, startX: x, startY: y, lastX: x, lastY: y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = canvasPoint(e);
    const ix = Math.round(x);
    const iy = Math.round(y);
    // Same object when the integer position is unchanged, so the toolbar doesn't
    // re-render on every sub-pixel move.
    setCursor((current) => (current && current.x === ix && current.y === iy ? current : { x: ix, y: iy }));

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.tool === "brush" || drag.tool === "eraser") {
      const ctx = committed();
      if (!ctx) return;
      const color = drag.tool === "eraser" ? fillColor : strokeColor;
      strokeSegment(ctx, drag.lastX, drag.lastY, x, y, color, brushSize);
    } else {
      // Shapes are previewed on the transparent overlay and committed on release.
      const ctx = overlay();
      if (!ctx) return;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      drawShape(ctx, drag.tool, drag.startX, drag.startY, x, y, shapeStyle());
    }

    drag.lastX = x;
    drag.lastY = y;
  };

  /** Pointerup and pointercancel share this so a cancelled gesture can't stick. */
  const endStroke = () => {
    const drag = dragRef.current;
    dragRef.current = null;

    const preview = overlay();
    if (preview) preview.clearRect(0, 0, preview.canvas.width, preview.canvas.height);
    if (!drag) return;
    if (drag.tool === "brush" || drag.tool === "eraser") return; // already on the surface

    // A click with no drag would commit a zero-size shape and a useless entry.
    if (drag.lastX === drag.startX && drag.lastY === drag.startY) return;

    const style = shapeStyle();
    commit((ctx) => drawShape(ctx, drag.tool, drag.startX, drag.startY, drag.lastX, drag.lastY, style));
  };

  /* --------------------------------------------------------------- shortcuts */

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (dialog || pending) return; // the prompt owns the keyboard while it is up
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (mod && key === "s") {
      e.preventDefault();
      if (e.shiftKey) setDialog("save");
      else void save();
    } else if (mod && key === "o") {
      e.preventDefault();
      setDialog("open");
    } else if (mod && key === "n") {
      e.preventDefault();
      requestNew();
    } else if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && key === "y") {
      e.preventDefault();
      redo();
    } else if (!mod && SHORTCUTS[key]) {
      e.preventDefault();
      setTool(SHORTCUTS[key]);
    }
  };

  /* ------------------------------------------------------------------ render */

  const toolbarButton = "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-white/10 text-white/70";
  const toolbarRow = "flex items-center gap-1 px-2 py-1.5 border-b border-white/10 shrink-0";
  const divider = "w-px h-4 bg-white/10 mx-1";

  return (
    <div
      ref={rootRef}
      className="relative h-full flex flex-col bg-[#15141d] text-white/85 outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className={toolbarRow}>
        <button className={toolbarButton} onClick={requestNew} title="New drawing (Ctrl+N)">
          <FilePlus size={13} /> New
        </button>
        <button className={toolbarButton} onClick={() => setDialog("open")} title="Open an image (Ctrl+O)">
          <FolderOpen size={13} /> Open
        </button>
        <button className={toolbarButton} onClick={() => void save()} title="Save (Ctrl+S)">
          <Save size={13} /> Save
        </button>
        <button className={toolbarButton} onClick={() => setDialog("save")} title="Save as (Ctrl+Shift+S)">
          Save as
        </button>

        <div className={divider} />
        <button
          className={`${toolbarButton} disabled:opacity-30 disabled:hover:bg-transparent`}
          onClick={undo}
          disabled={undoDepth === 0}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={13} />
        </button>
        <button
          className={`${toolbarButton} disabled:opacity-30 disabled:hover:bg-transparent`}
          onClick={redo}
          disabled={redoDepth === 0}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={13} />
        </button>

        <div className={divider} />
        <button className={toolbarButton} onClick={clearCanvas} title="Fill the whole canvas with white">
          <Trash2 size={13} /> Clear
        </button>

        <button className={`${toolbarButton} ml-auto`} onClick={download} title="Download a PNG to your computer">
          <Download size={13} /> Download
        </button>
      </div>

      <div className={toolbarRow}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`${toolbarButton} ${tool === t.id ? "bg-white/10 text-white" : ""}`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            title={t.hint}
          >
            <t.Icon size={13} />
          </button>
        ))}

        <div className={divider} />
        <button
          onClick={() => setFilled((f) => !f)}
          className={`${toolbarButton} ${filled ? "bg-white/10 text-white" : ""}`}
          aria-pressed={filled}
          title="Fill rectangles and ellipses with the fill colour"
        >
          Fill shapes
        </button>

        <div className={divider} />
        <label className="flex items-center gap-2 text-[11px] text-white/45">
          Size
          <input
            type="range"
            min={1}
            max={60}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            aria-label="Brush size"
            className="w-28 accent-blue-500"
          />
          <span className="w-9 tabular-nums text-white/70">{brushSize}px</span>
        </label>
      </div>

      <div className={`${toolbarRow} flex-wrap`}>
        <label className="flex items-center gap-1.5 text-[11px] text-white/45">
          Stroke
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            aria-label="Stroke colour"
            className="w-7 h-6 bg-transparent rounded cursor-pointer"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-white/45 ml-1">
          Fill
          <input
            type="color"
            value={fillColor}
            onChange={(e) => setFillColor(e.target.value)}
            aria-label="Fill colour"
            className="w-7 h-6 bg-transparent rounded cursor-pointer"
          />
        </label>
        <button
          className={`${toolbarButton} ml-1`}
          onClick={() => {
            setStrokeColor(fillColor);
            setFillColor(strokeColor);
          }}
          title="Swap the stroke and fill colours"
        >
          Swap
        </button>

        <div className={divider} />
        {PALETTE.map((color) => (
          <button
            key={color}
            onClick={() => setStrokeColor(color)}
            onContextMenu={(e) => {
              e.preventDefault();
              setFillColor(color);
            }}
            style={{ backgroundColor: color }}
            className="w-5 h-5 rounded border border-white/15 hover:ring-2 hover:ring-white/30 shrink-0"
            aria-label={`Set stroke colour to ${color}`}
            title={`${color} — click for stroke, right-click for fill`}
          />
        ))}
      </div>

      {status && (
        <div
          className={`px-3 py-1.5 text-[11px] border-b border-white/10 shrink-0 ${
            status.kind === "error" ? "bg-red-500/15 text-red-200" : "bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="relative flex-1 min-h-0 overflow-auto flex p-5" style={CHECKERBOARD}>
        {/* Auto margins centre the sheet without clipping it once it overflows. */}
        <div
          className="relative m-auto shrink-0 ring-1 ring-black/50 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
          style={{ width: size.width, height: size.height }}
        >
          <canvas
            ref={canvasRef}
            width={DEFAULT_WIDTH}
            height={DEFAULT_HEIGHT}
            className="absolute inset-0 block bg-white"
            aria-hidden="true"
          />
          {/* Transparent overlay: in-progress shapes live here until release. */}
          <canvas
            ref={previewRef}
            width={DEFAULT_WIDTH}
            height={DEFAULT_HEIGHT}
            className="absolute inset-0 block touch-none cursor-crosshair"
            aria-label={`${fileName} drawing surface`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={() => {
              if (!dragRef.current) setCursor(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#15141d]/70 text-xs text-white/60">
            Opening {fileName}…
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-1 text-[11px] text-white/45 flex items-center gap-3 shrink-0">
        <span className="tabular-nums w-24">{cursor ? `${cursor.x}, ${cursor.y} px` : "—"}</span>
        <span className="tabular-nums">
          {size.width} × {size.height}
        </span>
        <span>{toolLabel}</span>
        <span className="ml-auto flex items-center gap-2 min-w-0">
          {onDisk && (
            <span className="flex items-center gap-1 text-emerald-400/80 shrink-0">
              <HardDrive size={10} /> disk
            </span>
          )}
          {missing && <span className="text-amber-300 shrink-0">file removed</span>}
          <span className="truncate">{path ?? "Not saved yet"}</span>
          <span className={dirty ? "text-amber-300 shrink-0" : "text-white/30 shrink-0"}>
            {dirty ? "Unsaved" : "Saved"}
          </span>
          <span className="shrink-0">PNG</span>
        </span>
      </div>

      {dialog && (
        <FileDialog
          mode={dialog}
          initialDir={saveDir}
          initialName={dialog === "save" ? (path ? fileName : "untitled.png") : ""}
          onCancel={() => {
            closeDialog();
            setAfterSave(null);
          }}
          onConfirm={(chosen) => void handleDialogConfirm(chosen)}
        />
      )}

      {pending && (
        <div
          className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved changes"
        >
          <div className="w-full max-w-sm bg-[#1b1a26] border border-white/10 rounded-xl shadow-2xl p-4">
            <div className="text-sm font-medium mb-1">Save changes to {fileName}?</div>
            <div className="text-xs text-white/50 mb-4">
              Your drawing will be lost if you don't save it.
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setPending(null);
                  rootRef.current?.focus();
                }}
                className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = pending;
                  setPending(null);
                  runPending(action);
                }}
                className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10 text-red-300"
              >
                Don't save
              </button>
              <button
                onClick={() => {
                  const action = pending;
                  setPending(null);
                  if (!path) {
                    setAfterSave(action);
                    setDialog("save");
                    return;
                  }
                  void save().then((ok) => {
                    if (ok) runPending(action);
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
