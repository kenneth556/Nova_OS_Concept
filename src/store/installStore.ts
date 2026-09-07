import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { throttledLocalStorage } from "../lib/persistStorage";
import { useWindowStore } from "./windowStore";

/**
 * Which non-bundled native apps the user has installed from the App Store.
 *
 * Bundled apps aren't listed here — they're always available. Only apps marked
 * `installable` in the registry are gated on this.
 */
interface InstallStore {
  installed: string[];
  install: (id: string) => void;
  uninstall: (id: string) => void;
  isInstalled: (id: string) => boolean;
}

/**
 * These three shipped bundled with the OS before they became downloads. Anyone
 * who already has data for one of them keeps it installed, rather than having
 * an app they were using vanish from the taskbar.
 */
const MIGRATION_HINTS: Record<string, string> = {
  novatube: "novatube-store",
  novaflix: "novaflix-store",
  novamusic: "novamusic-store",
};

const previouslyUsedApps = (): string[] => {
  const found: string[] = [];
  try {
    for (const [appId, storageKey] of Object.entries(MIGRATION_HINTS)) {
      if (window.localStorage.getItem(storageKey) !== null) found.push(appId);
    }
  } catch {
    /* storage can be blocked entirely */
  }
  return found;
};

export const useInstallStore = create<InstallStore>()(
  persist(
    (set, get) => ({
      installed: previouslyUsedApps(),

      install: (id) =>
        set((s) => (s.installed.includes(id) ? s : { installed: [...s.installed, id] })),

      uninstall: (id) => {
        // Leaving windows open for an app that no longer exists would strand
        // them: no taskbar button, no way back.
        const windows = useWindowStore.getState().windows.filter((w) => w.appId === id);
        for (const win of windows) useWindowStore.getState().forceCloseWindow(win.windowId);
        set((s) => ({ installed: s.installed.filter((existing) => existing !== id) }));
      },

      isInstalled: (id) => get().installed.includes(id),
    }),
    {
      name: "novaos-install-store",
      version: 1,
      storage: createJSONStorage(() => throttledLocalStorage),
    }
  )
);

/** Non-reactive check, for stores and other non-component callers. */
export const isAppInstalled = (id: string): boolean =>
  useInstallStore.getState().installed.includes(id);
