import { Folder, Calculator as CalculatorIcon, StickyNote, Image, Music2, Settings2, Globe, CalendarDays, TerminalSquare, Activity, Video, FileText, NotepadText, Palette, Code2, Store, Boxes } from "lucide-react";
import type { AppDefinition } from "../lib/types";
import FileExplorer from "./FileExplorer";
import Calculator from "./Calculator";
import Notes from "./Notes";
import Notepad from "./Notepad";
import Photos from "./Photos";
import Paint from "./Paint";
import Music from "./Music";
import Settings from "./Settings";
import Browser from "./Browser";
import Calendar from "./Calendar";
import Terminal from "./Terminal";
import CodeStudio from "./CodeStudio";
import AppStore from "./AppStore";
import BlakApp from "./BlakApp";
import TaskManager from "./TaskManager";
import MediaPlayer from "./MediaPlayer";
import PdfViewer from "./PdfViewer";

/** Windows saved before an app was renamed still carry the old id. */
const LEGACY_APP_IDS: Record<string, string> = {
  videoPlayer: "mediaPlayer",
};

export const APPS: AppDefinition[] = [
  {
    id: "files",
    title: "File Explorer",
    icon: Folder,
    iconBg: "bg-blue-500",
    component: FileExplorer,
    defaultSize: { width: 720, height: 480 },
    minSize: { width: 480, height: 320 },
    pinned: true,
  },
  {
    id: "browser",
    title: "Browser",
    icon: Globe,
    iconBg: "bg-sky-500",
    component: Browser,
    defaultSize: { width: 900, height: 600 },
    minSize: { width: 420, height: 320 },
    pinned: true,
  },
  {
    id: "notepad",
    title: "Notepad",
    icon: NotepadText,
    iconBg: "bg-slate-500",
    component: Notepad,
    defaultSize: { width: 660, height: 480 },
    minSize: { width: 360, height: 260 },
    pinned: true,
  },
  {
    id: "notes",
    title: "Notes",
    icon: StickyNote,
    iconBg: "bg-yellow-500",
    component: Notes,
    defaultSize: { width: 680, height: 460 },
    pinned: true,
  },
  {
    id: "codeStudio",
    title: "Code Studio",
    icon: Code2,
    iconBg: "bg-emerald-600",
    component: CodeStudio,
    defaultSize: { width: 900, height: 620 },
    minSize: { width: 560, height: 380 },
    pinned: true,
  },
  {
    id: "appStore",
    title: "App Store",
    icon: Store,
    iconBg: "bg-violet-500",
    component: AppStore,
    defaultSize: { width: 820, height: 560 },
    minSize: { width: 520, height: 360 },
    pinned: true,
  },
  {
    id: "paint",
    title: "Paint",
    icon: Palette,
    iconBg: "bg-orange-500",
    component: Paint,
    defaultSize: { width: 840, height: 600 },
    minSize: { width: 480, height: 380 },
    pinned: true,
  },
  {
    id: "photos",
    title: "Photos",
    icon: Image,
    iconBg: "bg-fuchsia-500",
    component: Photos,
    defaultSize: { width: 760, height: 520 },
    pinned: true,
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: CalendarDays,
    iconBg: "bg-red-500",
    component: Calendar,
    defaultSize: { width: 560, height: 480 },
    pinned: true,
  },
  {
    id: "music",
    title: "Music",
    icon: Music2,
    iconBg: "bg-pink-500",
    component: Music,
    defaultSize: { width: 800, height: 520 },
    pinned: true,
  },
  {
    id: "calculator",
    title: "Calculator",
    icon: CalculatorIcon,
    iconBg: "bg-indigo-500",
    component: Calculator,
    defaultSize: { width: 340, height: 520 },
    minSize: { width: 300, height: 460 },
    pinned: true,
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings2,
    iconBg: "bg-gray-500",
    component: Settings,
    defaultSize: { width: 700, height: 520 },
    pinned: true,
  },
  {
    id: "terminal",
    title: "Terminal",
    icon: TerminalSquare,
    iconBg: "bg-black",
    component: Terminal,
    defaultSize: { width: 600, height: 400 },
    pinned: true,
  },
  {
    id: "taskManager",
    title: "Task Manager",
    icon: Activity,
    iconBg: "bg-teal-500",
    component: TaskManager,
    defaultSize: { width: 500, height: 400 },
    minSize: { width: 350, height: 300 },
    pinned: false,
  },
  {
    id: "blakApp",
    title: "BLAK app",
    icon: Boxes,
    iconBg: "bg-indigo-500",
    component: BlakApp,
    defaultSize: { width: 520, height: 420 },
    minSize: { width: 280, height: 200 },
    pinned: false,
  },
  {
    id: "mediaPlayer",
    title: "Media Player",
    icon: Video,
    iconBg: "bg-purple-500",
    component: MediaPlayer,
    defaultSize: { width: 720, height: 520 },
    minSize: { width: 380, height: 300 },
    pinned: false,
  },
  {
    id: "pdfViewer",
    title: "PDF Viewer",
    icon: FileText,
    iconBg: "bg-orange-500",
    component: PdfViewer,
    defaultSize: { width: 700, height: 800 },
    pinned: false,
  },
];

export const getApp = (id: string) => {
  const resolved = LEGACY_APP_IDS[id] ?? id;
  return APPS.find((a) => a.id === resolved);
};
