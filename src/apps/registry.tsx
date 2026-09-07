import { Folder, Calculator as CalculatorIcon, StickyNote, Image, Music2, Settings2, Globe, CalendarDays, TerminalSquare, Activity, Video, FileText, NotepadText, Palette, Code2, Store, Boxes, SquarePlay, Clapperboard, AudioLines } from "lucide-react";
import type { AppDefinition } from "../lib/types";
import {
  FileExplorer, Calculator, Notes, Notepad, Photos, Paint, Music, Settings, Browser, NovaTube,
  NovaFlix, NovaMusic,
  Calendar, Terminal, CodeStudio, AppStore, BlakApp, TaskManager, MediaPlayer, PdfViewer,
} from "./lazyApps";

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
    store: {
      tagline: "Browse files and folders",
      description:
        "Navigate your NovaOS filesystem with breadcrumbs, drag-select, copy/paste, and context menus. Mount local drives, filter by name, and open files in their default app.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.7,
      reviews: 215,
      highlights: [
        "Breadcrumb navigation and quick access",
        "Drag-to-select, copy, cut, paste",
        "Mount local folders from your PC",
        "Context menus and keyboard shortcuts",
      ],
    },
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
    store: {
      tagline: "Web browser",
      description:
        "A tabbed browser with address/search bar, bookmarks, history, find-in-page, and a downloads list. Internal NovaOS pages render natively; external sites load in a sandboxed frame with a fallback for blocked sites.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.6,
      reviews: 241,
      highlights: [
        "Tabbed browsing with session state",
        "Address, nav and search bar",
        "Find-in-page and bookmarks",
        "Downloads manager",
      ],
    },
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
    store: {
      tagline: "Plain text editor",
      description:
        "A lightweight text editor with find/replace, font resizing, word wrap, tab insertion, and dirty-file guards. Opens any plain text file from the NovaOS filesystem.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.3,
      reviews: 187,
      highlights: [
        "Find and replace with match count",
        "Font size and word wrap controls",
        "Dirty-file close guard",
        "Ctrl+S / Ctrl+O / Ctrl+F shortcuts",
      ],
    },
  },
  {
    id: "notes",
    title: "Notes",
    icon: StickyNote,
    iconBg: "bg-yellow-500",
    component: Notes,
    defaultSize: { width: 680, height: 460 },
    minSize: { width: 480, height: 320 },
    pinned: true,
    store: {
      tagline: "Quick notes and ideas",
      description:
        "A lightweight note-taking app with a sidebar list, search, timestamps, and disk export. Create, edit, and delete notes — your work is saved automatically.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.3,
      reviews: 145,
      highlights: [
        "Sidebar with search",
        "Auto-save with timestamps",
        "Save notes to disk",
        "Delete notes",
      ],
    },
  },
  {
    id: "novatube",
    title: "NovaTube",
    icon: SquarePlay,
    iconBg: "bg-red-600",
    component: NovaTube,
    defaultSize: { width: 1000, height: 660 },
    minSize: { width: 420, height: 340 },
    pinned: true,
    installable: true,
    store: {
      tagline: "Video platform",
      description:
        "Watch real YouTube videos and your own video files in one place. Paste a link and NovaTube resolves the title and channel, or point it at a file on your disk and it captures a thumbnail and remembers where you stopped.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.5,
      reviews: 128,
      highlights: [
        "Real YouTube playback through the embed player",
        "Local video files with generated thumbnails",
        "Subscriptions, history, liked videos and watch progress",
        "Search across your library",
      ],
    },
  },
  {
    id: "novaflix",
    title: "NovaFlix",
    icon: Clapperboard,
    iconBg: "bg-red-700",
    component: NovaFlix,
    defaultSize: { width: 1040, height: 680 },
    minSize: { width: 460, height: 360 },
    pinned: true,
    installable: true,
    store: {
      tagline: "Movies and series",
      description:
        "A streaming front end for the Internet Archive's public-domain film library, plus anything in your own filesystem. Twelve classics are ready to play, and the live search reaches the rest of the archive.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.8,
      reviews: 96,
      highlights: [
        "Twelve public-domain films ready to stream",
        "Live Internet Archive search for thousands more",
        "Continue watching, My List and resume-where-you-left-off",
        "Plays your own video files too",
      ],
    },
  },
  {
    id: "novamusic",
    title: "NovaMusic",
    icon: AudioLines,
    iconBg: "bg-green-600",
    component: NovaMusic,
    defaultSize: { width: 1020, height: 680 },
    minSize: { width: 480, height: 420 },
    pinned: true,
    installable: true,
    store: {
      tagline: "Music streaming",
      description:
        "Playlists, a real queue, shuffle and repeat, streaming restored public-domain recordings from the Internet Archive alongside the audio files on your disk. Volume follows the system setting.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.6,
      reviews: 84,
      highlights: [
        "Seven restored recordings to start with",
        "Live Internet Archive audio search",
        "Playlists, queue, shuffle and repeat",
        "Liked songs and real play counts",
      ],
    },
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
    store: {
      tagline: "BLAK code editor",
      description:
        "Write, run, and debug BLAK programs. Includes syntax highlighting, a file sidebar, console output, and live error reporting.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.8,
      reviews: 167,
      highlights: [
        "BLAK syntax highlighting",
        "Live run/debug output",
        "File sidebar and tabs",
        "Error reporting with line numbers",
      ],
    },
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
    store: {
      tagline: "Bitmap drawing",
      description:
        "Draw with brushes, shapes, an eraser, and a colour picker. Adjust brush size, fill shapes, undo/redo, clear the canvas, and export your work as PNG.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.2,
      reviews: 132,
      highlights: [
        "Brush, eraser, and shape tools",
        "Color picker and size slider",
        "Undo and redo",
        "Export to PNG",
      ],
    },
  },
  {
    id: "photos",
    title: "Photos",
    icon: Image,
    iconBg: "bg-fuchsia-500",
    component: Photos,
    defaultSize: { width: 760, height: 520 },
    minSize: { width: 480, height: 360 },
    pinned: true,
    store: {
      tagline: "Photo gallery",
      description:
        "Browse images in a masonry grid, preview them full-screen, and open any image in Paint for quick edits. Includes zoom, pan, and keyboard navigation.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.1,
      reviews: 98,
      highlights: [
        "Masonry photo grid",
        "Full-screen preview with zoom",
        "Open in Paint for editing",
        "Keyboard navigation",
      ],
    },
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: CalendarDays,
    iconBg: "bg-red-500",
    component: Calendar,
    defaultSize: { width: 560, height: 480 },
    minSize: { width: 400, height: 360 },
    pinned: true,
    store: {
      tagline: "Events and reminders",
      description:
        "A monthly calendar with event creation, reminders, and colour-coded categories. Click any day to add an event, set a reminder, and view your upcoming schedule.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.5,
      reviews: 112,
      highlights: [
        "Monthly grid view",
        "Event creation with reminders",
        "Colour-coded categories",
        "Upcoming events list",
      ],
    },
  },
  {
    id: "music",
    title: "Music",
    icon: Music2,
    iconBg: "bg-pink-500",
    component: Music,
    defaultSize: { width: 800, height: 520 },
    minSize: { width: 480, height: 360 },
    pinned: true,
    store: {
      tagline: "Local audio player",
      description:
        "Play audio files from your NovaOS filesystem with a queue, play/pause, next/previous, shuffle, repeat modes, volume, and seekable progress.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.2,
      reviews: 89,
      highlights: [
        "Queue and playback controls",
        "Shuffle and repeat modes",
        "Volume and seekable progress",
        "Plays local audio files",
      ],
    },
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
    store: {
      tagline: "Basic and scientific math",
      description:
        "A dual-mode calculator with a standard keypad and a scientific panel for trigonometry, logs, powers, and constants. Every calculation is saved to a history list you can review or clear.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.4,
      reviews: 156,
      highlights: [
        "Standard and scientific modes",
        "History panel with past calculations",
        "Trigonometry, logarithms, and constants",
        "Keyboard-friendly layout",
      ],
    },
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings2,
    iconBg: "bg-gray-500",
    component: Settings,
    defaultSize: { width: 700, height: 520 },
    minSize: { width: 520, height: 380 },
    pinned: true,
    store: {
      tagline: "System preferences",
      description:
        "Tune NovaOS to your taste: dark mode, accent colour, sound, notifications, and quick settings.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.4,
      reviews: 178,
      highlights: [
        "Dark mode and accent colours",
        "Sound and notifications",
        "Quick settings panel",
        "About and system info",
      ],
    },
  },
  {
    id: "terminal",
    title: "Terminal",
    icon: TerminalSquare,
    iconBg: "bg-black",
    component: Terminal,
    defaultSize: { width: 600, height: 400 },
    minSize: { width: 420, height: 300 },
    pinned: true,
    store: {
      tagline: "Command line shell",
      description:
        "A fully capable NovaOS shell with cd, ls, cat, mkdir, touch, rm, mv, cp, echo, wc, whoami, date, and neofetch. Features command history, tab completion, and colour prompts.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.9,
      reviews: 203,
      highlights: [
        "Full filesystem navigation",
        "Command history with arrow keys",
        "Tab completion for paths",
        "neofetch system info",
      ],
    },
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
    store: {
      tagline: "System monitor",
      description:
        "See running apps, memory usage, CPU load with history, and network speed. End tasks and inspect NovaOS internals.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.3,
      reviews: 89,
      highlights: [
        "Running apps and memory usage",
        "CPU history graph",
        "Network speed indicator",
        "End task support",
      ],
    },
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
    store: {
      tagline: "Video playback",
      description:
        "Play local video files with play/pause, seek, volume, and full-screen support.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 4.0,
      reviews: 64,
      highlights: [
        "Play local video files",
        "Play, pause, seek controls",
        "Volume and full-screen",
        "Simple, distraction-free UI",
      ],
    },
  },
  {
    id: "pdfViewer",
    title: "PDF Viewer",
    icon: FileText,
    iconBg: "bg-orange-500",
    component: PdfViewer,
    defaultSize: { width: 700, height: 800 },
    minSize: { width: 500, height: 600 },
    pinned: false,
    store: {
      tagline: "PDF document viewer",
      description:
        "Open and read PDF documents with page navigation and zoom controls.",
      version: "1.0.0",
      author: "NovaOS",
      rating: 3.9,
      reviews: 52,
      highlights: [
        "Open PDF files",
        "Page navigation",
        "Zoom in and out",
        "Clean reading layout",
      ],
    },
  },
];

export const getApp = (id: string) => {
  const resolved = LEGACY_APP_IDS[id] ?? id;
  return APPS.find((a) => a.id === resolved);
};

/** Apps that ship with the OS and can never be removed. */
export const BUNDLED_APPS = APPS.filter((a) => !a.installable);

/** Apps the App Store offers as downloads. */
export const INSTALLABLE_APPS = APPS.filter((a) => a.installable);

/**
 * What the taskbar, Start menu and search are allowed to show: everything
 * bundled, plus whatever the user installed.
 */
export const availableApps = (installed: string[]): AppDefinition[] =>
  APPS.filter((a) => !a.installable || installed.includes(a.id));
