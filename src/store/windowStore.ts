import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppId, WindowState } from "../lib/types";
import { APPS } from "../apps/registry";
import { TASKBAR_HEIGHT } from "../lib/constants";
import { throttledLocalStorage } from "../lib/persistStorage";
import { isAppInstalled } from "./installStore";

interface WindowStore {
  windows: WindowState[];
  topZ: number;
  desktops: string[];
  activeDesktopId: string;
  addDesktop: () => void;
  switchDesktop: (id: string) => void;
  removeDesktop: (id: string) => void;
  openApp: (appId: AppId, appData?: any) => void;
  closeWindow: (windowId: string) => void;
  /** Closes without consulting the app's unsaved-changes guard. */
  forceCloseWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  toggleMaximize: (windowId: string) => void;
  moveWindow: (windowId: string, x: number, y: number) => void;
  resizeWindow: (windowId: string, width: number, height: number, x?: number, y?: number) => void;
  snapWindow: (windowId: string, side: "left" | "right" | "top") => void;
  setWindowTitle: (windowId: string, title: string) => void;
  setWindowAppData: (windowId: string, appData: any) => void;
}

let idCounter = 0;
/** Window ids must stay unique against ids restored from a previous session. */
const nextWindowId = (appId: AppId) =>
  `${appId}-${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/**
 * Apps can veto their own close (unsaved changes). Guards live outside the
 * store because they are closures over component state, not serialisable data.
 */
const closeGuards = new Map<string, () => boolean>();

export const registerCloseGuard = (windowId: string, guard: (() => boolean) | null) => {
  if (guard) closeGuards.set(windowId, guard);
  else closeGuards.delete(windowId);
};

const Z_BASE = 10;
/**
 * z-index has to stay well under the shell's layers (context menu 100, Alt-Tab
 * 200, taskbar 9999). `topZ` used to grow forever and was persisted, so after
 * enough clicks windows painted over the OS chrome. Once the counter reaches
 * the ceiling every window is renumbered in place, preserving stacking order.
 */
const Z_CEILING = 90;

/** Raises one window to the front, compacting z-indexes when they get high. */
const raise = (windows: WindowState[], topZ: number, windowId: string) => {
  const nextZ = topZ + 1;
  if (nextZ < Z_CEILING) {
    return {
      windows: windows.map((w) =>
        w.windowId === windowId ? { ...w, z: nextZ, minimized: false } : w
      ),
      topZ: nextZ,
    };
  }

  const order = [...windows]
    .sort((a, b) => (a.windowId === windowId ? 1 : b.windowId === windowId ? -1 : a.z - b.z))
    .map((w) => w.windowId);
  const rank = new Map(order.map((id, index) => [id, Z_BASE + index]));
  return {
    windows: windows.map((w) => ({
      ...w,
      z: rank.get(w.windowId) ?? Z_BASE,
      minimized: w.windowId === windowId ? false : w.minimized,
    })),
    topZ: Z_BASE + order.length,
  };
};

export const useWindowStore = create<WindowStore>()(
  persist(
    (set, get) => ({
      windows: [],
      topZ: Z_BASE,
      desktops: ["Desktop 1"],
      activeDesktopId: "Desktop 1",

      addDesktop: () =>
        set((s) => {
          const used = new Set(s.desktops);
          let n = s.desktops.length + 1;
          while (used.has(`Desktop ${n}`)) n++;
          const name = `Desktop ${n}`;
          return { desktops: [...s.desktops, name], activeDesktopId: name };
        }),
      switchDesktop: (id) => set({ activeDesktopId: id }),
      removeDesktop: (id) =>
        set((s) => {
          if (s.desktops.length === 1) return s;
          const remaining = s.desktops.filter((d) => d !== id);
          const fallback = remaining[0];
          return {
            desktops: remaining,
            activeDesktopId: s.activeDesktopId === id ? fallback : s.activeDesktopId,
            // never orphan windows on a desktop that no longer exists
            windows: s.windows.map((w) => (w.desktopId === id ? { ...w, desktopId: fallback } : w)),
          };
        }),

      openApp: (appId, appData) => {
        const { windows, activeDesktopId } = get();
        const sameApp = windows.filter((w) => w.appId === appId && w.desktopId === activeDesktopId);
        const path: string | undefined = appData?.path;

        // Re-use a window when it is already showing this exact file, or when the
        // app was launched with no payload at all.
        const existing = path
          ? sameApp.find((w) => w.appData?.path === path)
          : appData
            ? undefined
            : sameApp[0];

        if (existing) {
          get().focusWindow(existing.windowId);
          return;
        }

        const app = APPS.find((a) => a.id === appId);
        if (!app) return;
        // An uninstalled app must not be launchable from a stale reference.
        if (app.installable && !isAppInstalled(app.id)) return;

        const offset = (windows.length % 6) * 28;
        const newWindow: WindowState = {
          windowId: nextWindowId(appId),
          appId,
          title: app.title,
          x: 140 + offset,
          y: 90 + offset,
          width: app.defaultSize.width,
          height: app.defaultSize.height,
          z: 0, // set inside the updater so two launches in one tick can't tie
          minimized: false,
          maximized: false,
          desktopId: activeDesktopId,
          appData,
        };

        set((s) => {
          const withNew = [...s.windows, newWindow];
          return raise(withNew, s.topZ, newWindow.windowId);
        });
      },

      closeWindow: (windowId) => {
        const guard = closeGuards.get(windowId);
        if (guard && !guard()) return; // app is showing its own "discard changes?" prompt
        get().forceCloseWindow(windowId);
      },

      forceCloseWindow: (windowId) => {
        closeGuards.delete(windowId);
        set((s) => ({ windows: s.windows.filter((w) => w.windowId !== windowId) }));
      },

      focusWindow: (windowId) =>
        set((s) => {
          const target = s.windows.find((w) => w.windowId === windowId);
          if (!target) return s;
          // Avoid a store write (and a localStorage write) on every click.
          if (target.z === s.topZ && !target.minimized) return s;
          return raise(s.windows, s.topZ, windowId);
        }),

      minimizeWindow: (windowId) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.windowId === windowId ? { ...w, minimized: true } : w)),
        })),

      toggleMaximize: (windowId) =>
        set((s) => ({
          windows: s.windows.map((w) => {
            if (w.windowId !== windowId) return w;
            if (w.maximized) {
              const prev = w.prevBounds ?? { x: 140, y: 90, width: w.width, height: w.height };
              return { ...w, maximized: false, ...prev, prevBounds: undefined };
            }
            return {
              ...w,
              maximized: true,
              prevBounds: { x: w.x, y: w.y, width: w.width, height: w.height },
            };
          }),
        })),

      moveWindow: (windowId, x, y) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.windowId === windowId ? { ...w, x, y } : w)),
        })),

      resizeWindow: (windowId, width, height, x, y) =>
        set((s) => ({
          windows: s.windows.map((w) =>
            w.windowId === windowId ? { ...w, width, height, x: x ?? w.x, y: y ?? w.y } : w
          ),
        })),

      snapWindow: (windowId, side) =>
        set((s) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight - TASKBAR_HEIGHT;
          return {
            windows: s.windows.map((w) => {
              if (w.windowId !== windowId) return w;
              const prevBounds = w.prevBounds ?? {
                x: w.x,
                y: w.y,
                width: w.width,
                height: w.height,
              };
              if (side === "left")
                return { ...w, x: 0, y: 0, width: vw / 2, height: vh, maximized: false, prevBounds };
              if (side === "right")
                return {
                  ...w,
                  x: vw / 2,
                  y: 0,
                  width: vw / 2,
                  height: vh,
                  maximized: false,
                  prevBounds,
                };
              return { ...w, x: 0, y: 0, width: vw, height: vh, maximized: true, prevBounds };
            }),
          };
        }),

      setWindowTitle: (windowId, title) =>
        set((s) => {
          const target = s.windows.find((w) => w.windowId === windowId);
          if (!target || target.title === title) return s; // keep effects from looping
          return {
            windows: s.windows.map((w) => (w.windowId === windowId ? { ...w, title } : w)),
          };
        }),

      setWindowAppData: (windowId, appData) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.windowId === windowId ? { ...w, appData } : w)),
        })),
    }),
    {
      name: "novaos-window-store",
      storage: createJSONStorage(() => throttledLocalStorage),
    }
  )
);
