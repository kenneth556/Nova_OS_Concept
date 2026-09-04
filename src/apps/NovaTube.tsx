import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  Play, House, Flame, ListVideo, Clock, ThumbsUp, Share2, Search, Plus, X, ChevronLeft,
  Trash2, Video, HardDrive, Bell, BellRing, Upload, Link2, TriangleAlert, LoaderCircle,
  Menu, FolderOpen, CircleCheck,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { handleCache, useFsStore } from "../store/fsStore";
import { useWindowStore } from "../store/windowStore";
import { useContextMenuStore } from "../store/contextMenuStore";
import type { ContextMenuItem } from "../store/contextMenuStore";
import {
  fetchYouTubeMetadata, localVideoId, parseYouTubeId, useNovatubeStore,
  youtubeEmbedUrl, youtubeThumbnailUrl, youtubeWatchUrl,
} from "../store/novatubeStore";
import type { NovaVideo } from "../store/novatubeStore";
import { baseName, dirName, extOf } from "../lib/fileTypes";
import FileDialog from "../components/FileDialog";

type Section = "home" | "trending" | "subscriptions" | "library" | "history" | "liked" | "local";
type Chip = "all" | "youtube" | "local" | "recent";
type IconType = ComponentType<{ size?: number; className?: string }>;

const VIDEO_EXT = ["mp4", "webm", "mkv", "mov", "m4v", "avi"];

/** Channel name given to anything pulled in from the filesystem. */
const LOCAL_CHANNEL = "Local files";

/*
 * There is no responsive breakpoint infrastructure in this shell: a window is
 * resized independently of the viewport, so media queries would measure the
 * wrong box. A ResizeObserver on the root element drives these instead.
 */
const SIDEBAR_MIN = 700; // under this the sidebar collapses to icons
const RAIL_MIN = 900; // under this "Up next" moves below the player
const COMPACT_MIN = 560; // under this the top bar drops its button labels

const RECENT_LIMIT = 12;
const RAIL_LIMIT = 12;
const FS_SCAN_LIMIT = 40;

/** Seconds of playback between writes to the persisted store. */
const PROGRESS_STEP = 5;

const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;

const NAV: Array<{ id: Section; label: string; icon: IconType }> = [
  { id: "home", label: "Home", icon: House },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "subscriptions", label: "Subscriptions", icon: Bell },
  { id: "library", label: "Library", icon: ListVideo },
  { id: "history", label: "History", icon: Clock },
  { id: "liked", label: "Liked", icon: ThumbsUp },
  { id: "local", label: "Local files", icon: HardDrive },
];

const CHIPS: Array<{ id: Chip; label: string }> = [
  { id: "all", label: "All" },
  { id: "youtube", label: "YouTube" },
  { id: "local", label: "Local" },
  { id: "recent", label: "Recently added" },
];

const SECTION_COPY: Record<Section, { title: string; subtitle: string }> = {
  home: { title: "Home", subtitle: "Everything in your library, newest first" },
  trending: { title: "Trending", subtitle: "Ranked by the plays NovaTube recorded on this machine" },
  subscriptions: { title: "Subscriptions", subtitle: "Videos from the channels you subscribed to" },
  library: { title: "Library", subtitle: "Every video you have, A to Z" },
  history: { title: "History", subtitle: "What you played, most recent first" },
  liked: { title: "Liked", subtitle: "Everything you gave a thumbs up" },
  local: { title: "Local files", subtitle: "Videos that live in the NovaOS filesystem" },
};

const pill =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs hover:bg-white/10 text-white/70 transition disabled:opacity-40 disabled:hover:bg-transparent";
const pillPrimary =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white text-black font-medium hover:bg-white/90 transition disabled:opacity-40";
const iconButton = "p-1.5 rounded-full hover:bg-white/10 text-white/60 transition shrink-0";

/* ------------------------------------------------------------------ helpers */

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

const AVATAR_COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500",
  "bg-teal-500", "bg-sky-500", "bg-indigo-500", "bg-fuchsia-500",
];

const CARD_GRADIENTS = [
  "from-red-600/70 to-orange-500/50",
  "from-indigo-600/70 to-sky-500/50",
  "from-emerald-600/70 to-teal-500/50",
  "from-fuchsia-600/70 to-rose-500/50",
  "from-amber-600/70 to-red-500/50",
  "from-sky-600/70 to-violet-500/50",
];

/** Same channel always gets the same colour, so avatars feel like identities. */
const avatarColor = (key: string) => AVATAR_COLORS[hashString(key) % AVATAR_COLORS.length];
const cardGradient = (key: string) => CARD_GRADIENTS[hashString(key) % CARD_GRADIENTS.length];

const formatDuration = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
};

const relativeTime = (timestamp: number) => {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  if (days < 30) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (days < 365) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

/** Real local play count. Nothing here is ever invented. */
const viewsLabel = (views: number) =>
  views === 0 ? "No views yet" : `${views.toLocaleString()} view${views === 1 ? "" : "s"}`;

const watchedFraction = (video: NovaVideo) => {
  if (!video.progressSeconds) return 0;
  if (!video.durationSeconds) return 0.08; // watched, length unknown
  return Math.min(1, video.progressSeconds / video.durationSeconds);
};

/**
 * Decodes an early frame of a local video into a small JPEG data URL, plus the
 * real duration. Resolves null for anything the browser can't decode — the only
 * failure that matters, because the card then keeps its gradient placeholder.
 */
const captureVideoFrame = (
  element: HTMLVideoElement,
  src: string
): Promise<{ dataUrl: string; duration: number } | null> =>
  new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const finish = (value: { dataUrl: string; duration: number } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeEventListener("loadeddata", onLoadedData);
      element.removeEventListener("seeked", onSeeked);
      element.removeEventListener("error", onError);
      resolve(value);
    };

    const draw = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = THUMB_WIDTH;
        canvas.height = THUMB_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) {
          finish(null);
          return;
        }
        context.drawImage(element, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
        finish({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), duration: element.duration });
      } catch {
        // Undecodable frame, or a tainted canvas: fall back to the gradient.
        finish(null);
      }
    };

    const onLoadedData = () => {
      const duration = element.duration;
      const target = Number.isFinite(duration) ? Math.min(2, duration * 0.1) : 0;
      // Seeking fires "seeked"; frame zero is already decoded by "loadeddata".
      if (target > 0.05) element.currentTime = target;
      else draw();
    };
    const onSeeked = () => draw();
    const onError = () => finish(null);

    element.addEventListener("loadeddata", onLoadedData);
    element.addEventListener("seeked", onSeeked);
    element.addEventListener("error", onError);

    element.muted = true;
    element.preload = "auto";
    element.src = src;
    timer = window.setTimeout(() => finish(null), 8000);
    element.load();
  });

/* -------------------------------------------------------------- small parts */

function LogoMark() {
  return (
    <span className="w-7 h-5 rounded-md bg-red-600 flex items-center justify-center shrink-0">
      <Play size={10} className="text-white fill-white ml-[1px]" />
    </span>
  );
}

function ChannelAvatar({ channel, size = 20 }: { channel: string; size?: number }) {
  const initial = channel.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 rounded-full flex items-center justify-center font-semibold text-white ${avatarColor(channel)}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.46)) }}
    >
      {initial}
    </span>
  );
}

/** Thumbnail with a deterministic gradient fallback for anything that 404s. */
function VideoThumb({ video }: { video: NovaVideo }) {
  const [failed, setFailed] = useState(false);
  const src = video.source === "youtube" ? youtubeThumbnailUrl(video.id, "mq") : video.thumbnail;

  if (!src || failed) {
    return (
      <span
        className={`absolute inset-0 bg-gradient-to-br ${cardGradient(video.id)} flex items-center justify-center`}
      >
        <Video size={20} className="text-white/70" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

interface CardProps {
  video: NovaVideo;
  subtitle: string;
  onPlay: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

function VideoCard({ video, subtitle, onPlay, onContextMenu }: CardProps) {
  const fraction = watchedFraction(video);
  const duration = formatDuration(video.durationSeconds);

  return (
    <button
      onClick={onPlay}
      onContextMenu={onContextMenu}
      aria-label={`Play ${video.title}`}
      className="group text-left outline-none"
    >
      <span className="relative block aspect-video rounded-xl overflow-hidden bg-white/5 transition duration-200 group-hover:scale-[1.02] group-focus-visible:ring-2 group-focus-visible:ring-red-500/70">
        <VideoThumb video={video} />

        <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <span className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
            <Play size={16} className="text-white fill-white ml-[2px]" />
          </span>
        </span>

        {video.source === "local" && (
          <span className="absolute top-1.5 left-1.5 bg-black/75 text-[10px] px-1 rounded flex items-center gap-1 text-white/80">
            <HardDrive size={9} /> local
          </span>
        )}

        {duration && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-[10px] px-1 rounded tabular-nums text-white">
            {duration}
          </span>
        )}

        {fraction > 0 && (
          <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/25">
            <span className="block h-full bg-red-600" style={{ width: `${fraction * 100}%` }} />
          </span>
        )}
      </span>

      <span className="block mt-2.5">
        <span className="block text-[13px] leading-snug text-white/90 line-clamp-2">{video.title}</span>
        <span className="flex items-center gap-1.5 mt-1.5">
          <ChannelAvatar channel={video.channel} size={16} />
          <span className="text-[11px] text-white/45 truncate">{video.channel}</span>
        </span>
        <span className="block text-[11px] text-white/35 mt-0.5 truncate">{subtitle}</span>
      </span>
    </button>
  );
}

function RailRow({ video, onPlay, onContextMenu }: Omit<CardProps, "subtitle">) {
  const duration = formatDuration(video.durationSeconds);
  const fraction = watchedFraction(video);

  return (
    <button
      onClick={onPlay}
      onContextMenu={onContextMenu}
      aria-label={`Play ${video.title}`}
      className="w-full flex gap-2.5 p-1.5 rounded-xl hover:bg-white/5 transition text-left"
    >
      <span className="relative block w-24 shrink-0 aspect-video rounded-lg overflow-hidden bg-white/5">
        <VideoThumb video={video} />
        {duration && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[10px] px-1 rounded tabular-nums text-white">
            {duration}
          </span>
        )}
        {fraction > 0 && (
          <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/25">
            <span className="block h-full bg-red-600" style={{ width: `${fraction * 100}%` }} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] leading-snug text-white/85 line-clamp-2">{video.title}</span>
        <span className="block text-[10px] text-white/40 truncate mt-1">{video.channel}</span>
        <span className="block text-[10px] text-white/30 truncate">{viewsLabel(video.views)}</span>
      </span>
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: IconType;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-14">
      <span className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
        <Icon size={24} className="text-white/35" />
      </span>
      <div className="text-sm text-white/75 mb-1">{title}</div>
      <div className="text-xs text-white/45 max-w-sm leading-relaxed">{body}</div>
      {children && <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- the app */

export default function NovaTube({ windowId, appData }: AppProps) {
  const videos = useNovatubeStore((s) => s.videos);
  const history = useNovatubeStore((s) => s.history);
  const subscriptions = useNovatubeStore((s) => s.subscriptions);
  const addVideo = useNovatubeStore((s) => s.addVideo);
  const removeVideo = useNovatubeStore((s) => s.removeVideo);
  const recordView = useNovatubeStore((s) => s.recordView);
  const setProgress = useNovatubeStore((s) => s.setProgress);
  const toggleLike = useNovatubeStore((s) => s.toggleLike);
  const toggleSubscribe = useNovatubeStore((s) => s.toggleSubscribe);
  const setThumbnail = useNovatubeStore((s) => s.setThumbnail);
  const setDuration = useNovatubeStore((s) => s.setDuration);
  const clearHistory = useNovatubeStore((s) => s.clearHistory);

  const nodes = useFsStore((s) => s.nodes);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const [section, setSection] = useState<Section>("home");
  const [chip, setChip] = useState<Chip>("all");
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [watchId, setWatchId] = useState<string | null>(null);

  const [width, setWidth] = useState(0);
  /** null follows the measured width; true/false is an explicit user choice. */
  const [sidebarOverride, setSidebarOverride] = useState<boolean | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [localSrc, setLocalSrc] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [captureTick, setCaptureTick] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const savedProgressRef = useRef(0);
  const attemptedThumbsRef = useRef<Set<string>>(new Set());
  const openedPathRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const video = useMemo(() => videos.find((v) => v.id === watchId) ?? null, [videos, watchId]);
  const videoTitle = video?.title;
  const localPath = video && video.source === "local" ? video.path ?? null : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ------------------------------------------------------- window title sync */

  useEffect(() => {
    setWindowTitle(windowId, `${videoTitle ?? "NovaTube"} — NovaTube`);
  }, [windowId, videoTitle, setWindowTitle]);

  /* ------------------------------------------------------------- measurement */

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    // Windows resize independently of the viewport, so the layout measures its
    // own box instead of relying on media queries.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const autoCollapsed = width > 0 && width < SIDEBAR_MIN;
  const iconsOnly = sidebarOverride ?? autoCollapsed;
  const railBeside = width === 0 || width >= RAIL_MIN;
  const compact = width > 0 && width < COMPACT_MIN;

  /* ------------------------------------------------------------ transient UI */

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  /* --------------------------------------------------------------- playback */

  const openVideo = (id: string) => {
    setWatchId(id);
    recordView(id);
    setCopied(false);
    savedProgressRef.current = 0;
  };

  /** A file opened from File Explorer or the desktop plays straight away. */
  useEffect(() => {
    const path: string | undefined = appData?.path;
    if (!path || openedPathRef.current === path) return;
    openedPathRef.current = path;
    const id = addVideo({
      id: localVideoId(path),
      source: "local",
      title: baseName(path),
      channel: LOCAL_CHANNEL,
      path,
    });
    recordView(id);
    setWatchId(id);
    setSection("local");
  }, [appData?.path, addVideo, recordView]);

  // Object URL for the local player. Copied from MediaPlayer: the url is
  // declared before the async read so the cleanup can revoke it even while the
  // read is still in flight.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setLocalSrc(null);
    setLocalError(null);

    if (!localPath) return;

    const handle = handleCache.get(localPath);
    if (!handle) {
      setLocalError(
        nodes[localPath]
          ? "This file came from a mounted drive in an earlier session. Remount the drive in File Explorer to play it."
          : "That file no longer exists."
      );
      return;
    }

    void (async () => {
      try {
        const file = await handle.getFile();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file);
        setLocalSrc(objectUrl);
      } catch (err) {
        if (!cancelled) setLocalError(`Couldn't read the file (${(err as Error).message}).`);
      }
    })();

    // Runs even if the read is still in flight, so the blob is never leaked.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [localPath, nodes]);

  const onLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!video) return;
    const element = event.currentTarget;
    setDuration(video.id, element.duration);

    const resumeAt = video.progressSeconds ?? 0;
    // Resume, unless we're near the end: restarting beats dropping the viewer
    // onto the credits.
    if (resumeAt > 3 && Number.isFinite(element.duration) && resumeAt < element.duration - 5) {
      element.currentTime = resumeAt;
      savedProgressRef.current = resumeAt;
    } else {
      savedProgressRef.current = 0;
    }
  };

  const onTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!video) return;
    const seconds = event.currentTarget.currentTime;
    // timeupdate fires several times a second; only every PROGRESS_STEP seconds
    // of real playback reaches the persisted store.
    if (Math.abs(seconds - savedProgressRef.current) < PROGRESS_STEP) return;
    savedProgressRef.current = seconds;
    setProgress(video.id, seconds);
  };

  const flushProgress = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!video) return;
    const seconds = event.currentTarget.currentTime;
    savedProgressRef.current = seconds;
    setProgress(video.id, seconds);
  };

  const onEnded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!video) return;
    const element = event.currentTarget;
    savedProgressRef.current = element.duration;
    setProgress(video.id, element.duration);
  };

  /* --------------------------------------------- local thumbnail extraction */

  /**
   * The next local video that still needs a thumbnail. Derived as an id string
   * so a progress write (which replaces the `videos` array) can't restart a
   * capture that is already running.
   */
  const pendingThumbId = useMemo(() => {
    // Bumped after each attempt settles, which is what re-runs this search;
    // `attemptedThumbsRef` is a ref and therefore not reactive on its own.
    void captureTick;
    const target = videos.find(
      (v) =>
        v.source === "local" &&
        Boolean(v.path) &&
        !v.thumbnail &&
        !attemptedThumbsRef.current.has(v.id)
    );
    return target?.id ?? null;
  }, [videos, captureTick]);

  useEffect(() => {
    if (!pendingThumbId) return;
    const target = useNovatubeStore.getState().videos.find((v) => v.id === pendingThumbId);
    const path = target?.path;
    if (!path) return;
    const handle = handleCache.get(path);
    // No live handle means there are no bytes to decode; the gradient stands in.
    if (!handle) return;

    attemptedThumbsRef.current.add(pendingThumbId);

    let objectUrl: string | null = null;
    let cancelled = false;
    const element = document.createElement("video");

    void (async () => {
      try {
        const file = await handle.getFile();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file);
        const frame = await captureVideoFrame(element, objectUrl);
        if (cancelled || !frame) return;
        setThumbnail(pendingThumbId, frame.dataUrl);
        setDuration(pendingThumbId, frame.duration);
      } catch {
        // A codec the browser can't decode keeps the gradient placeholder.
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;
        element.removeAttribute("src");
        element.load();
        if (!cancelled) setCaptureTick((tick) => tick + 1);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    };
  }, [pendingThumbId, setThumbnail, setDuration]);

  /* ------------------------------------------------------------------ lists */

  const countByChannel = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of videos) map.set(item.channel, (map.get(item.channel) ?? 0) + 1);
    return map;
  }, [videos]);

  const watchedAt = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) if (!map.has(entry.videoId)) map.set(entry.videoId, entry.watchedAt);
    return map;
  }, [history]);

  const historyVideos = useMemo(() => {
    const seen = new Set<string>();
    const result: NovaVideo[] = [];
    for (const entry of history) {
      if (seen.has(entry.videoId)) continue;
      seen.add(entry.videoId);
      const found = videos.find((v) => v.id === entry.videoId);
      if (found) result.push(found);
    }
    return result;
  }, [history, videos]);

  const counts = useMemo<Record<Section, number>>(
    () => ({
      home: videos.length,
      trending: videos.filter((v) => v.views > 0).length,
      subscriptions: videos.filter((v) => subscriptions.includes(v.channel)).length,
      library: videos.length,
      history: historyVideos.length,
      liked: videos.filter((v) => v.liked).length,
      local: videos.filter((v) => v.source === "local").length,
    }),
    [videos, subscriptions, historyVideos]
  );

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;

  const baseList = useMemo<NovaVideo[]>(() => {
    const newestFirst = (list: NovaVideo[]) => [...list].sort((a, b) => b.addedAt - a.addedAt);

    if (searching) {
      return newestFirst(
        videos.filter(
          (v) => v.title.toLowerCase().includes(needle) || v.channel.toLowerCase().includes(needle)
        )
      );
    }
    if (channelFilter) return newestFirst(videos.filter((v) => v.channel === channelFilter));

    switch (section) {
      case "trending":
        return videos
          .filter((v) => v.views > 0)
          .sort((a, b) => b.views - a.views || b.addedAt - a.addedAt);
      case "subscriptions":
        return newestFirst(videos.filter((v) => subscriptions.includes(v.channel)));
      case "library":
        return [...videos].sort((a, b) => a.title.localeCompare(b.title));
      case "history":
        return historyVideos;
      case "liked":
        return newestFirst(videos.filter((v) => v.liked));
      case "local":
        return newestFirst(videos.filter((v) => v.source === "local"));
      default:
        return newestFirst(videos);
    }
  }, [videos, subscriptions, historyVideos, section, channelFilter, searching, needle]);

  const list = useMemo<NovaVideo[]>(() => {
    if (chip === "youtube") return baseList.filter((v) => v.source === "youtube");
    if (chip === "local") return baseList.filter((v) => v.source === "local");
    if (chip === "recent")
      return [...baseList].sort((a, b) => b.addedAt - a.addedAt).slice(0, RECENT_LIMIT);
    return baseList;
  }, [baseList, chip]);

  const upNext = useMemo<NovaVideo[]>(() => {
    if (!video) return [];
    const current = video;
    return videos
      .filter((v) => v.id !== current.id)
      .sort((a, b) => {
        const rankA = a.channel === current.channel ? 0 : 1;
        const rankB = b.channel === current.channel ? 0 : 1;
        return rankA - rankB || b.addedAt - a.addedAt;
      })
      .slice(0, RAIL_LIMIT);
  }, [videos, video]);

  /** Video files the filesystem knows about that aren't in the library yet. */
  const fsCandidates = useMemo(() => {
    const known = new Set(videos.filter((v) => v.path).map((v) => v.path));
    return Object.entries(nodes)
      .filter(
        ([path, node]) =>
          node.type === "file" && VIDEO_EXT.includes(extOf(path)) && !known.has(path)
      )
      .map(([path]) => path)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, FS_SCAN_LIMIT);
  }, [nodes, videos]);

  /* ---------------------------------------------------------------- actions */

  const selectSection = (next: Section) => {
    setSection(next);
    setChannelFilter(null);
    setQuery("");
    setWatchId(null);
  };

  const selectChannel = (channel: string) => {
    setChannelFilter(channel);
    setQuery("");
    setWatchId(null);
  };

  const openAdd = () => {
    setAddOpen(true);
    setAddError(null);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddError(null);
    setAddInput("");
  };

  const submitYouTube = async () => {
    const id = parseYouTubeId(addInput);
    if (!id) {
      setAddError("That isn't a YouTube link or an 11-character video id.");
      return;
    }

    const existing = videos.find((v) => v.id === id);
    if (existing) {
      closeAdd();
      setNotice({ kind: "info", message: `"${existing.title}" is already in your library.` });
      openVideo(existing.id);
      return;
    }

    setAddBusy(true);
    setAddError(null);
    const meta = await fetchYouTubeMetadata(id);
    if (!mountedRef.current) return;
    setAddBusy(false);

    addVideo({
      id,
      source: "youtube",
      title: meta?.title ?? id,
      channel: meta?.channel ?? "Unknown channel",
    });
    closeAdd();
    setNotice(
      meta
        ? { kind: "info", message: `Added "${meta.title}".` }
        : {
            kind: "error",
            message: `Added ${id}, but the title lookup failed. Rename it by re-adding it later.`,
          }
    );
    openVideo(id);
  };

  const addLocalPath = (path: string) => {
    const ext = extOf(path);
    if (ext && !VIDEO_EXT.includes(ext)) {
      setNotice({
        kind: "error",
        message: `"${baseName(path)}" isn't a video format NovaTube recognises.`,
      });
      return;
    }
    addVideo({
      id: localVideoId(path),
      source: "local",
      title: baseName(path),
      channel: LOCAL_CHANNEL,
      path,
    });
    setSection("local");
    setChannelFilter(null);
    setQuery("");
    setWatchId(null);
    setNotice({ kind: "info", message: `Added "${baseName(path)}" to your library.` });
  };

  const remove = (id: string) => {
    removeVideo(id);
    setWatchId((current) => (current === id ? null : current));
    setNotice({ kind: "info", message: "Removed from your library." });
  };

  const copyLink = (target: NovaVideo) => {
    const link = target.source === "youtube" ? youtubeWatchUrl(target.id) : target.path ?? "";
    if (!link || !navigator.clipboard) {
      setNotice({ kind: "error", message: "This browser wouldn't give NovaTube the clipboard." });
      return;
    }
    void navigator.clipboard
      .writeText(link)
      .then(() => setCopied(true))
      .catch(() =>
        setNotice({ kind: "error", message: "The clipboard write was blocked by the browser." })
      );
  };

  const openCardMenu = (event: React.MouseEvent, item: NovaVideo) => {
    // Without this the desktop's own menu leaks through the window.
    event.preventDefault();
    event.stopPropagation();
    const items: ContextMenuItem[] = [
      { label: "Play", icon: Play, onClick: () => openVideo(item.id) },
      { label: item.liked ? "Unlike" : "Like", icon: ThumbsUp, onClick: () => toggleLike(item.id) },
    ];
    if (item.source === "youtube") {
      items.push({ label: "Copy link", icon: Link2, onClick: () => copyLink(item) });
    }
    items.push({ divider: true, label: "", onClick: () => {} });
    items.push({ label: "Remove", icon: Trash2, onClick: () => remove(item.id) });
    openMenu(event.clientX, event.clientY, items);
  };

  const cardSubtitle = (item: NovaVideo) => {
    if (section === "history" && !searching && !channelFilter) {
      const at = watchedAt.get(item.id);
      if (at) return `${viewsLabel(item.views)} · watched ${relativeTime(at)}`;
    }
    return `${viewsLabel(item.views)} · ${relativeTime(item.addedAt)}`;
  };

  /* ----------------------------------------------------------------- render */

  const chipLabel = CHIPS.find((c) => c.id === chip)?.label ?? "All";
  const sectionLabel = NAV.find((n) => n.id === section)?.label ?? "Home";
  const backLabel = searching ? "results" : channelFilter ? channelFilter : sectionLabel;

  const heading = searching
    ? { title: `Results for “${query.trim()}”`, subtitle: "Every video in your library is searched" }
    : channelFilter
      ? {
          title: channelFilter,
          subtitle: `${countByChannel.get(channelFilter) ?? 0} video${
            (countByChannel.get(channelFilter) ?? 0) === 1 ? "" : "s"
          } in your library · ${subscriptions.includes(channelFilter) ? "subscribed" : "not subscribed"}`,
        }
      : SECTION_COPY[section];

  const renderEmpty = () => {
    if (searching) {
      return (
        <EmptyState
          icon={Search}
          title={`Nothing matches “${query.trim()}”`}
          body="Search covers titles and channel names. Clear it to browse, or paste a YouTube link to add something new."
        >
          <button className={pillPrimary} onClick={openAdd} aria-label="Add video">
            <Plus size={13} /> Add video
          </button>
          <button className={pill} onClick={() => setQuery("")}>
            <X size={12} /> Clear search
          </button>
        </EmptyState>
      );
    }
    if (chip !== "all") {
      return (
        <EmptyState
          icon={Video}
          title="Nothing here matches that filter"
          body={`The “${chipLabel}” chip is hiding everything in ${heading.title}. Switch back to All to see the rest.`}
        >
          <button className={pillPrimary} onClick={() => setChip("all")}>
            Show all
          </button>
        </EmptyState>
      );
    }
    if (channelFilter) {
      return (
        <EmptyState
          icon={Video}
          title={`Nothing from ${channelFilter} left`}
          body="Every video from this channel has been removed from your library."
        >
          <button className={pillPrimary} onClick={() => selectSection("home")}>
            <House size={13} /> Back to Home
          </button>
        </EmptyState>
      );
    }

    switch (section) {
      case "trending":
        return (
          <EmptyState
            icon={Flame}
            title="Nothing has been watched yet"
            body="Trending ranks by the plays NovaTube records on this machine, so it stays empty until you actually watch something. No invented numbers."
          >
            <button className={pillPrimary} onClick={() => selectSection("home")}>
              <House size={13} /> Browse Home
            </button>
          </EmptyState>
        );
      case "subscriptions":
        return (
          <EmptyState
            icon={Bell}
            title="No subscriptions yet"
            body="Open any video and press Subscribe. Subscribed channels get listed in the sidebar and their videos collect here."
          >
            <button className={pillPrimary} onClick={() => selectSection("home")}>
              <House size={13} /> Browse Home
            </button>
          </EmptyState>
        );
      case "history":
        return (
          <EmptyState
            icon={Clock}
            title="No watch history"
            body="Everything you play lands here, along with where you stopped, so a half-watched local video can pick up where it left off."
          >
            <button className={pillPrimary} onClick={() => selectSection("home")}>
              <House size={13} /> Browse Home
            </button>
          </EmptyState>
        );
      case "liked":
        return (
          <EmptyState
            icon={ThumbsUp}
            title="Nothing liked yet"
            body="Press Like while watching, or right-click any card and choose Like. Liked videos gather here."
          >
            <button className={pillPrimary} onClick={() => selectSection("home")}>
              <House size={13} /> Browse Home
            </button>
          </EmptyState>
        );
      case "local":
        return (
          <EmptyState
            icon={HardDrive}
            title="No local videos yet"
            body="Add a video file from the NovaOS filesystem. Mount a real folder in File Explorer first and NovaTube can decode it, grab a thumbnail and play it for real."
          >
            <button className={pillPrimary} onClick={() => setDialogOpen(true)} aria-label="Add local file">
              <FolderOpen size={13} /> Choose a video file
            </button>
          </EmptyState>
        );
      default:
        return (
          <EmptyState
            icon={Video}
            title="Your library is empty"
            body="NovaTube starts with six videos, but you removed them all. Paste a YouTube link, or bring in a video file from the filesystem."
          >
            <button className={pillPrimary} onClick={openAdd} aria-label="Add video">
              <Plus size={13} /> Add video
            </button>
            <button className={pill} onClick={() => setDialogOpen(true)}>
              <Upload size={13} /> Add local file
            </button>
          </EmptyState>
        );
    }
  };

  const sidebar = (
    <nav
      aria-label="NovaTube sections"
      className={`shrink-0 border-r border-white/10 overflow-y-auto overflow-x-hidden py-2 ${
        iconsOnly ? "w-[56px] px-1.5" : "w-[200px] px-2"
      }`}
    >
      {NAV.map((item) => {
        const active = !searching && !channelFilter && section === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => selectSection(item.id)}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            title={iconsOnly ? item.label : undefined}
            className={`relative w-full flex items-center rounded-xl text-xs mb-0.5 transition ${
              iconsOnly ? "justify-center py-2.5" : "gap-3 px-3 py-2"
            } ${active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5"}`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-red-600" />
            )}
            <Icon size={16} className={active ? "text-red-500" : ""} />
            {!iconsOnly && <span className="truncate">{item.label}</span>}
            {!iconsOnly && counts[item.id] > 0 && (
              <span className="ml-auto text-[10px] text-white/30 tabular-nums">{counts[item.id]}</span>
            )}
          </button>
        );
      })}

      <div className="h-px bg-white/10 my-2 mx-2" />

      {!iconsOnly && (
        <div className="text-[10px] uppercase tracking-wide text-white/30 px-3 py-1">
          Subscriptions
        </div>
      )}
      {subscriptions.length === 0
        ? !iconsOnly && (
            <div className="text-[11px] text-white/30 px-3 pb-2 leading-relaxed">
              No channels yet. Subscribe while watching and they show up here.
            </div>
          )
        : subscriptions.map((channel) => {
            const active = channelFilter === channel;
            return (
              <button
                key={channel}
                onClick={() => selectChannel(channel)}
                aria-label={`Videos from ${channel}`}
                aria-current={active ? "page" : undefined}
                title={iconsOnly ? channel : undefined}
                className={`w-full flex items-center rounded-xl text-xs mb-0.5 transition ${
                  iconsOnly ? "justify-center py-2" : "gap-2.5 px-3 py-2"
                } ${active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5"}`}
              >
                <ChannelAvatar channel={channel} size={22} />
                {!iconsOnly && <span className="truncate flex-1 text-left">{channel}</span>}
                {!iconsOnly && (
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {countByChannel.get(channel) ?? 0}
                  </span>
                )}
              </button>
            );
          })}
    </nav>
  );

  const browse = (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-[#0f0f14]/95 backdrop-blur">
        <div className="flex items-center gap-2 overflow-x-auto">
          {CHIPS.map((entry) => {
            const active = chip === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => setChip(entry.id)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
                  active
                    ? "bg-white text-black font-medium"
                    : "bg-white/[0.07] text-white/70 hover:bg-white/10"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto shrink-0 text-[11px] text-white/30 tabular-nums whitespace-nowrap">
          {list.length} video{list.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="px-4 pb-8">
        <div className="flex items-end justify-between gap-3 pb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-white/90 truncate">{heading.title}</h2>
            <div className="text-[11px] text-white/40 truncate">{heading.subtitle}</div>
          </div>
          {section === "history" && !searching && !channelFilter && history.length > 0 && (
            <button
              onClick={clearHistory}
              className={`${pill} shrink-0 text-red-300 hover:bg-red-500/15`}
            >
              <Trash2 size={12} /> Clear history
            </button>
          )}
        </div>

        {list.length === 0 ? (
          renderEmpty()
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
          >
            {list.map((item) => (
              <VideoCard
                key={item.id}
                video={item}
                subtitle={cardSubtitle(item)}
                onPlay={() => openVideo(item.id)}
                onContextMenu={(event) => openCardMenu(event, item)}
              />
            ))}
          </div>
        )}

        {section === "local" && !searching && !channelFilter && (
          <div className="mt-8 border-t border-white/10 pt-4">
            <div className="text-xs font-medium text-white/70">Video files in the filesystem</div>
            <div className="text-[11px] text-white/40 mt-0.5 mb-2.5 leading-relaxed">
              Files NovaTube can see but hasn't added yet. Anything marked “on disk” has a live
              handle from File Explorer, so it can really be decoded and played.
            </div>
            {fsCandidates.length === 0 ? (
              <div className="text-[11px] text-white/30 leading-relaxed">
                Nothing left to add. Mount a folder from your machine in File Explorer, or drop a
                video into /home/user/videos.
              </div>
            ) : (
              <div className="space-y-0.5">
                {fsCandidates.map((path) => (
                  <div
                    key={path}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/5 transition"
                  >
                    <HardDrive size={13} className="text-white/30 shrink-0" />
                    <span
                      className="text-[11px] text-white/60 truncate flex-1"
                      style={{ userSelect: "text" }}
                    >
                      {path}
                    </span>
                    {handleCache.has(path) && (
                      <span className="text-[10px] text-emerald-400/80 shrink-0">on disk</span>
                    )}
                    <button
                      onClick={() => addLocalPath(path)}
                      className={`${pill} shrink-0`}
                      aria-label={`Add ${baseName(path)}`}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const watch = video && (
    <div className={`p-4 ${railBeside ? "flex gap-5" : "flex flex-col gap-5"}`}>
      <div className="flex-1 min-w-0">
        <button onClick={() => setWatchId(null)} className={`${pill} mb-2.5 -ml-1`}>
          <ChevronLeft size={14} /> Back to {backLabel}
        </button>

        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden ring-1 ring-white/10">
          {video.source === "youtube" ? (
            <iframe
              key={video.id}
              src={youtubeEmbedUrl(video.id)}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 w-full h-full border-none"
            />
          ) : localError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
              <TriangleAlert size={26} className="text-amber-400 mb-2" />
              <div className="text-xs text-white/60 max-w-sm leading-relaxed">{localError}</div>
            </div>
          ) : localSrc ? (
            <video
              key={video.id}
              src={localSrc}
              poster={video.thumbnail}
              controls
              autoPlay
              className="absolute inset-0 w-full h-full bg-black"
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onPause={flushProgress}
              onEnded={onEnded}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <LoaderCircle size={20} className="text-white/40 animate-spin" />
            </div>
          )}
        </div>

        <h1 className="text-lg font-medium leading-snug mt-3" style={{ userSelect: "text" }}>
          {video.title}
        </h1>

        <div className="flex items-center gap-3 flex-wrap mt-2.5">
          <ChannelAvatar channel={video.channel} size={36} />
          <div className="min-w-0">
            <div className="text-sm text-white/90 truncate" style={{ userSelect: "text" }}>
              {video.channel}
            </div>
            <div className="text-[11px] text-white/40">
              {countByChannel.get(video.channel) ?? 0} video
              {(countByChannel.get(video.channel) ?? 0) === 1 ? "" : "s"} in your library
            </div>
          </div>

          <button
            onClick={() => toggleSubscribe(video.channel)}
            aria-pressed={subscriptions.includes(video.channel)}
            className={
              subscriptions.includes(video.channel)
                ? "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white/10 text-white/70 hover:bg-white/15 transition"
                : pillPrimary
            }
          >
            {subscriptions.includes(video.channel) ? (
              <>
                <BellRing size={13} /> Subscribed
              </>
            ) : (
              <>
                <Bell size={13} /> Subscribe
              </>
            )}
          </button>

          <div className="ml-auto flex items-center gap-1 flex-wrap">
            <button
              onClick={() => toggleLike(video.id)}
              aria-pressed={video.liked}
              className={`${pill} ${video.liked ? "text-white bg-white/10" : ""}`}
            >
              <ThumbsUp size={13} className={video.liked ? "fill-current" : ""} />
              {video.liked ? "Liked" : "Like"}
            </button>
            <button onClick={() => copyLink(video)} className={pill}>
              {copied ? (
                <>
                  <CircleCheck size={13} className="text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Share2 size={13} /> Share
                </>
              )}
            </button>
            <button
              onClick={() => remove(video.id)}
              className={`${pill} text-red-300 hover:bg-red-500/15`}
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>

        <div
          className="mt-3 rounded-xl bg-white/[0.04] border border-white/5 p-3.5 text-xs leading-relaxed text-white/60"
          style={{ userSelect: "text" }}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-white/80 font-medium mb-1.5">
            <span>{viewsLabel(video.views)}</span>
            <span className="text-white/25">·</span>
            <span>added {relativeTime(video.addedAt)}</span>
            <span className="text-white/25">·</span>
            <span className="flex items-center gap-1">
              {video.source === "youtube" ? (
                <>
                  <Link2 size={11} /> YouTube
                </>
              ) : (
                <>
                  <HardDrive size={11} /> Local file
                </>
              )}
            </span>
            {video.durationSeconds ? (
              <>
                <span className="text-white/25">·</span>
                <span className="tabular-nums">{formatDuration(video.durationSeconds)}</span>
              </>
            ) : null}
          </div>

          {video.source === "youtube" ? (
            <div>
              Streamed through the youtube-nocookie.com player. NovaTube keeps only the video id,
              the plays it counted here, and whether you liked it.
            </div>
          ) : (
            <div>
              Decoded on this machine from the file handle NovaOS holds for it.
              <div className="font-mono text-[11px] text-white/45 break-all mt-1">{video.path}</div>
            </div>
          )}

          {video.source === "local" && video.progressSeconds ? (
            <div className="mt-1.5 text-white/45">
              Stopped at <span className="tabular-nums">{formatDuration(video.progressSeconds)}</span>
              , and playback resumes there.
            </div>
          ) : null}
        </div>
      </div>

      <aside className={railBeside ? "w-[300px] shrink-0" : "w-full"} aria-label="Up next">
        <div className="text-xs font-medium text-white/70 px-1.5 mb-1.5">Up next</div>
        {upNext.length === 0 ? (
          <div className="text-[11px] text-white/35 px-1.5 leading-relaxed">
            Nothing else in your library yet. Add a YouTube link or a local file and it queues up
            here.
          </div>
        ) : (
          <div className="space-y-0.5">
            {upNext.map((item) => (
              <RailRow
                key={item.id}
                video={item}
                onPlay={() => openVideo(item.id)}
                onContextMenu={(event) => openCardMenu(event, item)}
              />
            ))}
          </div>
        )}
      </aside>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="relative h-full flex flex-col bg-[#0f0f14] text-white/85 overflow-hidden"
      // Keeps the desktop's own context menu from leaking through the window.
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <header className="sticky top-0 z-20 shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#0f0f14]/95 backdrop-blur">
        <button
          onClick={() => setSidebarOverride(!iconsOnly)}
          aria-label="Toggle sidebar"
          aria-pressed={!iconsOnly}
          className={iconButton}
        >
          <Menu size={16} />
        </button>

        <button
          onClick={() => selectSection("home")}
          aria-label="NovaTube home"
          className="flex items-center gap-1.5 shrink-0"
        >
          <LogoMark />
          {!compact && (
            <span className="text-[15px] font-semibold tracking-tight text-white">NovaTube</span>
          )}
        </button>

        <div className="flex-1 flex justify-center min-w-0 px-1">
          <div className="flex items-center w-full max-w-md bg-white/[0.06] border border-white/10 rounded-full pl-3.5 pr-0.5 focus-within:border-white/25 transition">
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setChannelFilter(null);
                setWatchId(null);
              }}
              // Let the browser's own menu through here, so right-click paste works.
              onContextMenu={(event) => event.stopPropagation()}
              placeholder="Search NovaTube"
              aria-label="Search videos"
              className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-white/30 py-1.5"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className={iconButton}
              >
                <X size={12} />
              </button>
            )}
            <button
              onClick={() => searchRef.current?.focus()}
              aria-label="Search"
              className={iconButton}
            >
              <Search size={14} />
            </button>
          </div>
        </div>

        <button onClick={openAdd} aria-label="Add video" className={`${pillPrimary} shrink-0`}>
          <Plus size={13} /> {!compact && "Add video"}
        </button>
        <button
          onClick={() => setDialogOpen(true)}
          aria-label="Add local file"
          className={`${pill} shrink-0`}
        >
          <Upload size={13} /> {!compact && "Add local file"}
        </button>
      </header>

      {addOpen && (
        <div className="shrink-0 px-3 py-2.5 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-white/40 shrink-0" />
            <input
              autoFocus
              value={addInput}
              onChange={(event) => {
                setAddInput(event.target.value);
                setAddError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitYouTube();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closeAdd();
                }
              }}
              // Right-click paste is the whole point of this field.
              onContextMenu={(event) => event.stopPropagation()}
              placeholder="Paste a YouTube link, or an 11-character video id"
              aria-label="YouTube link or video id"
              className="flex-1 min-w-0 bg-white/5 rounded-full px-3 py-1.5 text-xs outline-none placeholder:text-white/25 focus:ring-1 focus:ring-red-500/50"
            />
            <button
              onClick={() => void submitYouTube()}
              disabled={addBusy || !addInput.trim()}
              aria-label="Add this video"
              className={`${pillPrimary} shrink-0`}
            >
              {addBusy ? (
                <LoaderCircle size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              Add
            </button>
            <button onClick={closeAdd} aria-label="Close add video" className={iconButton}>
              <X size={13} />
            </button>
          </div>
          <div className="text-[10px] text-white/35 mt-1.5 pl-6 leading-relaxed">
            Titles are resolved through noembed.com, which means the link leaves your machine. If
            that lookup fails the video id is used as the title instead.
          </div>
          {addError && <div className="text-[11px] text-red-300 mt-1 pl-6">{addError}</div>}
        </div>
      )}

      {notice && (
        <div
          className={`px-3 py-1.5 text-[11px] border-b border-white/10 shrink-0 ${
            notice.kind === "error" ? "bg-red-500/15 text-red-200" : "bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {notice.message}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {sidebar}
        <main className="flex-1 min-w-0 overflow-y-auto">{watch || browse}</main>
      </div>

      {dialogOpen && (
        <FileDialog
          mode="open"
          initialDir={video?.path ? dirName(video.path) : "/home/user/videos"}
          onCancel={() => setDialogOpen(false)}
          onConfirm={(chosen) => {
            setDialogOpen(false);
            addLocalPath(chosen);
          }}
        />
      )}
    </div>
  );
}
