import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { NotificationItem } from "../lib/types";
import { throttledLocalStorage } from "../lib/persistStorage";

export type BootStage = "booting" | "lock" | "desktop";

interface QuickSettingsState {
  wifi: boolean;
  bluetooth: boolean;
  darkMode: boolean;
  airplaneMode: boolean;
  doNotDisturb: boolean;
  brightness: number;
  volume: number;
  wallpaper: string;
  accentColor: string;
}

interface SystemStore {
  stage: BootStage;
  bootProgressLabel: string;
  setStage: (s: BootStage) => void;
  setBootLabel: (label: string) => void;

  now: Date;
  tick: () => void;

  startMenuOpen: boolean;
  toggleStartMenu: () => void;
  closeStartMenu: () => void;

  notificationCenterOpen: boolean;
  toggleNotificationCenter: () => void;
  closeNotificationCenter: () => void;

  quickSettingsOpen: boolean;
  toggleQuickSettings: () => void;
  closeQuickSettings: () => void;

  quickSettings: QuickSettingsState;
  setQuickSetting: <K extends keyof QuickSettingsState>(key: K, value: QuickSettingsState[K]) => void;

  notifications: NotificationItem[];
  /** Anything in the OS can raise a notification. Returns the new id. */
  addNotification: (n: { app: string; title: string; body: string; iconBg?: string }) => string;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;

  searchOpen: boolean;
  toggleSearch: () => void;
  closeSearch: () => void;
}

export const useSystemStore = create<SystemStore>()(
  persist(
    (set) => ({
      stage: "booting",
      bootProgressLabel: "Initializing system",
  setStage: (stage) => set({ stage }),
  setBootLabel: (bootProgressLabel) => set({ bootProgressLabel }),

  now: new Date(),
  tick: () => set({ now: new Date() }),

  startMenuOpen: false,
  toggleStartMenu: () =>
    set((s) => ({
      startMenuOpen: !s.startMenuOpen,
      notificationCenterOpen: false,
      quickSettingsOpen: false,
      searchOpen: false,
    })),
  closeStartMenu: () => set({ startMenuOpen: false }),

  notificationCenterOpen: false,
  toggleNotificationCenter: () =>
    set((s) => ({
      notificationCenterOpen: !s.notificationCenterOpen,
      startMenuOpen: false,
      quickSettingsOpen: false,
      searchOpen: false,
    })),
  closeNotificationCenter: () => set({ notificationCenterOpen: false }),

  quickSettingsOpen: false,
  toggleQuickSettings: () =>
    set((s) => ({
      quickSettingsOpen: !s.quickSettingsOpen,
      startMenuOpen: false,
      notificationCenterOpen: false,
      searchOpen: false,
    })),
  closeQuickSettings: () => set({ quickSettingsOpen: false }),

  quickSettings: {
    wifi: true,
    bluetooth: true,
    darkMode: true,
    airplaneMode: false,
    doNotDisturb: false,
    brightness: 80,
    volume: 65,
    wallpaper: "/wallpapers/neon_glass.png",
    accentColor: "#3b82f6",
  },
  setQuickSetting: (key, value) =>
    set((s) => ({ quickSettings: { ...s.quickSettings, [key]: value } })),

  notifications: [
    { id: "n1", app: "System", title: "Welcome to NovaOS", body: "Open the App Store to install BLAK apps.", time: "now", iconBg: "bg-indigo-500", createdAt: Date.now() },
  ],
  addNotification: ({ app, title, body, iconBg }) => {
    const id = `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      notifications: [
        { id, app, title, body, time: "now", iconBg: iconBg ?? "bg-indigo-500", createdAt: Date.now() },
        ...s.notifications,
      ].slice(0, 50),
    }));
    return id;
  },
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  clearNotifications: () => set({ notifications: [] }),

  searchOpen: false,
  toggleSearch: () =>
    set((s) => ({
      searchOpen: !s.searchOpen,
      startMenuOpen: false,
      notificationCenterOpen: false,
      quickSettingsOpen: false,
    })),
  closeSearch: () => set({ searchOpen: false }),
}),
    {
      name: "novaos-system-store",
      storage: createJSONStorage(() => throttledLocalStorage),
      partialize: (state) => {
        // Transient shell state is deliberately not persisted: the clock, the
        // boot stage, and which flyout happened to be open.
        const {
          now: _now,
          stage: _stage,
          bootProgressLabel: _label,
          startMenuOpen: _start,
          notificationCenterOpen: _notifications,
          quickSettingsOpen: _quick,
          searchOpen: _search,
          ...rest
        } = state as any;
        return rest;
      },
    }
  )
);
