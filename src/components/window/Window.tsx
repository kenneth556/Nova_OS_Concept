import { useRef, useState, memo, Suspense } from "react";
import { motion } from "framer-motion";
import { Minus, Square, X, Copy } from "lucide-react";
import type { WindowState } from "../../lib/types";
import { useWindowStore } from "../../store/windowStore";
import { getApp } from "../../apps/registry";
import { TASKBAR_HEIGHT } from "../../lib/constants";
import ErrorBoundary from "../ErrorBoundary";

interface Props {
  win: WindowState;
}

const SNAP_THRESHOLD = 24;

function Window({ win }: Props) {
  // Individual selectors: destructuring the whole store re-renders every window
  // on every drag frame.
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const moveWindow = useWindowStore((s) => s.moveWindow);
  const resizeWindow = useWindowStore((s) => s.resizeWindow);
  const snapWindow = useWindowStore((s) => s.snapWindow);
  const activeDesktopId = useWindowStore((s) => s.activeDesktopId);

  const app = getApp(win.appId);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [snapPreview, setSnapPreview] = useState<"left" | "right" | "top" | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number; startWX: number; startWY: number; dir: string } | null>(null);

  if (!app) return null;
  const AppComponent = app.component;
  const Icon = app.icon;

  /**
   * Windows stay mounted while minimized or parked on another desktop, so apps
   * keep their state (unsaved text, open tabs, terminal scrollback).
   */
  const hidden = win.minimized || win.desktopId !== activeDesktopId;

  const onTitleBarPointerDown = (e: React.PointerEvent) => {
    focusWindow(win.windowId);
    /*
     * Never start a drag from a window control. Capturing the pointer on the
     * title bar retargets pointerup — and the compatibility click — to the
     * title bar, so the button's own onClick would never fire.
     */
    if ((e.target as HTMLElement).closest("button")) return;
    if (win.maximized) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: win.x, origY: win.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTitleBarPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = dragRef.current.origX + dx;
    const newY = Math.max(0, dragRef.current.origY + dy);
    moveWindow(win.windowId, newX, newY);

    // detect snap zones
    const vw = window.innerWidth;
    if (e.clientY < SNAP_THRESHOLD) setSnapPreview("top");
    else if (e.clientX < SNAP_THRESHOLD) setSnapPreview("left");
    else if (e.clientX > vw - SNAP_THRESHOLD) setSnapPreview("right");
    else setSnapPreview(null);
  };

  const onTitleBarPointerUp = () => {
    if (snapPreview) {
      snapWindow(win.windowId, snapPreview);
    }
    setSnapPreview(null);
    dragRef.current = null;
  };

  const startResize = (dir: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    focusWindow(win.windowId);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: win.width,
      startH: win.height,
      startWX: win.x,
      startWY: win.y,
      dir,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const { startX, startY, startW, startH, startWX, startWY, dir } = resizeRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const minW = app.minSize?.width ?? 280;
    const minH = app.minSize?.height ?? 200;

    let width = startW;
    let height = startH;
    let x = startWX;
    let y = startWY;

    if (dir.includes("right")) width = Math.max(minW, startW + dx);
    if (dir.includes("bottom")) height = Math.max(minH, startH + dy);
    if (dir.includes("left")) {
      width = Math.max(minW, startW - dx);
      x = startWX + (startW - width);
    }
    if (dir.includes("top")) {
      height = Math.max(minH, startH - dy);
      y = startWY + (startH - height);
    }
    resizeWindow(win.windowId, width, height, x, y);
  };

  const onResizeUp = () => {
    resizeRef.current = null;
  };

  const resizeHandles = [
    { dir: "top", cls: "top-0 left-2 right-2 h-1.5 cursor-ns-resize" },
    { dir: "bottom", cls: "bottom-0 left-2 right-2 h-1.5 cursor-ns-resize" },
    { dir: "left", cls: "left-0 top-2 bottom-2 w-1.5 cursor-ew-resize" },
    { dir: "right", cls: "right-0 top-2 bottom-2 w-1.5 cursor-ew-resize" },
    { dir: "top-left", cls: "top-0 left-0 w-3 h-3 cursor-nwse-resize" },
    { dir: "top-right", cls: "top-0 right-0 w-3 h-3 cursor-nesw-resize" },
    { dir: "bottom-left", cls: "bottom-0 left-0 w-3 h-3 cursor-nesw-resize" },
    { dir: "bottom-right", cls: "bottom-0 right-0 w-3 h-3 cursor-nwse-resize" },
  ];

  const geometry = win.maximized
    ? {
        left: 0,
        top: 0,
        width: "100%",
        height: `calc(100% - ${TASKBAR_HEIGHT}px)`,
        zIndex: win.z,
      }
    : {
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.z,
      };

  return (
    <>
      {/* Aero Snap Preview Overlay */}
      {snapPreview && !hidden && (
        <div
          className="fixed pointer-events-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl transition-all duration-200"
          style={{
            top: 0,
            bottom: TASKBAR_HEIGHT,
            left: snapPreview === "right" ? "50%" : 0,
            right: snapPreview === "left" ? "50%" : 0,
            zIndex: win.z + 1,
          }}
        />
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.14 }}
        onPointerDown={() => focusWindow(win.windowId)}
        className="absolute glass-panel rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ ...geometry, display: hidden ? "none" : undefined }}
      >
        {/* resize handles */}
        {!win.maximized &&
          resizeHandles.map((h) => (
            <div
              key={h.dir}
              onPointerDown={startResize(h.dir)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              onPointerCancel={onResizeUp}
              className={`absolute z-10 ${h.cls}`}
            />
          ))}

        {/* title bar */}
        <div
          onPointerDown={onTitleBarPointerDown}
          onPointerMove={onTitleBarPointerMove}
          onPointerUp={onTitleBarPointerUp}
          onPointerCancel={onTitleBarPointerUp}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            toggleMaximize(win.windowId);
          }}
          className="glass-titlebar flex items-center justify-between px-3 h-9 shrink-0 cursor-default"
        >
          <div className="flex items-center gap-2 text-xs text-white/80 min-w-0">
            <Icon size={13} />
            <span className="truncate">{win.title}</span>
          </div>
          {/* z-20 keeps the controls above the top/corner resize strips */}
          <div className="flex items-center gap-1 relative z-20">
            <button
              onClick={() => minimizeWindow(win.windowId)}
              aria-label="Minimize"
              className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-white/60"
            >
              <Minus size={12} />
            </button>
            <button
              onClick={() => toggleMaximize(win.windowId)}
              aria-label={win.maximized ? "Restore" : "Maximize"}
              className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-white/60"
            >
              {win.maximized ? <Copy size={11} /> : <Square size={10} />}
            </button>
            <button
              onClick={() => closeWindow(win.windowId)}
              aria-label="Close"
              className="w-6 h-6 rounded-md hover:bg-red-500 flex items-center justify-center text-white/60 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {/* One app crashing must not take the OS down with it. */}
          <ErrorBoundary label={app.title} resetKey={win.appData?.path ?? win.windowId}>
            {/* Apps are code-split, so each one streams in on first open. */}
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-[11px] text-white/35">
                  Loading {app.title}…
                </div>
              }
            >
              <AppComponent windowId={win.windowId} appData={win.appData} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </motion.div>
    </>
  );
}

/*
 * Memoised so a drag only re-renders the window being dragged. The windows
 * array is rebuilt on every move, but untouched window objects keep their
 * identity, so this comparison holds.
 */
export default memo(Window);
