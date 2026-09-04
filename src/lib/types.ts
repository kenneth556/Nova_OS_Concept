import type { ComponentType, LazyExoticComponent } from "react";

export type AppId =
  | "files"
  | "calculator"
  | "notes"
  | "notepad"
  | "photos"
  | "paint"
  | "music"
  | "settings"
  | "browser"
  | "novatube"
  | "novaflix"
  | "novamusic"
  | "calendar"
  | "terminal"
  | "codeStudio"
  | "appStore"
  | "blakApp"
  | "taskManager"
  | "mediaPlayer"
  | "videoPlayer" // legacy id kept so saved windows keep resolving
  | "pdfViewer";

/**
 * Props every app receives from the window frame. Apps that don't need them can
 * still be declared as `() => JSX.Element`.
 */
export interface AppProps {
  windowId: string;
  appData?: any;
}

export interface AppDefinition {
  id: AppId;
  title: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  iconBg: string; // tailwind gradient classes for the icon tile
  /** Apps are code-split, so this is usually a `lazy()` component. */
  component: ComponentType<AppProps> | LazyExoticComponent<ComponentType<AppProps>>;
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  pinned?: boolean;
}

export interface WindowState {
  windowId: string;
  appId: AppId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  desktopId: string;
  appData?: any; // To pass data to apps when opening
  // stored so we can restore from maximize
  prevBounds?: { x: number; y: number; width: number; height: number };
}

export interface NotificationItem {
  id: string;
  app: string;
  title: string;
  body: string;
  time: string;
  iconBg: string;
  /** Epoch ms. Absent on the seeded notifications from older sessions. */
  createdAt?: number;
}
