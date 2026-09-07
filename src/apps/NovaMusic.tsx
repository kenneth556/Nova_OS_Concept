import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AudioLines, Check, Clock, FolderOpen, Globe, Heart, House, Library, ListMusic, LoaderCircle,
  Music, Pause, Pencil, Play, Plus, Repeat, Repeat1, Search, Shuffle, SkipBack, SkipForward,
  Trash2, TriangleAlert, Volume2, VolumeX, X,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { handleCache, useFsStore } from "../store/fsStore";
import { useSystemStore } from "../store/systemStore";
import { useWindowStore } from "../store/windowStore";
import { useContextMenuStore } from "../store/contextMenuStore";
import type { ContextMenuItem } from "../store/contextMenuStore";
import {
  archiveArtworkUrl, archiveAudioUrl, fetchArchiveTrack, localTrackId, searchArchiveAudio,
  useNovamusicStore,
} from "../store/novamusicStore";
import type { ArchiveResult, RepeatMode, Track } from "../store/novamusicStore";
import { baseName, extOf } from "../lib/fileTypes";
import FileDialog from "../components/FileDialog";

type IconType = ComponentType<{ size?: number; className?: string }>;
type SearchStatus = "idle" | "loading" | "done" | "error";

type View =
  | { kind: "home" }
  | { kind: "search" }
  | { kind: "library" }
  | { kind: "liked" }
  | { kind: "playlist"; id: string }
  | { kind: "genre"; genre: string };

/** Everything the list view needs, whatever it is a list of. */
interface Collection {
  kicker: string;
  title: string;
  trackIds: string[];
  gradient: string;
  artwork?: string;
  icon: IconType;
  /** Set only for real playlists, which can be renamed, deleted and added to. */
  playlistId?: string;
}

/*
 * A window is resized independently of the viewport, so media queries would
 * measure the wrong box. A ResizeObserver on the root drives these instead.
 */
const SIDEBAR_MIN = 760; // under this the sidebar collapses to icons
const COMPACT_MIN = 620; // under this the album column and volume slider go

const AUDIO_EXT = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"];
const LOCAL_ARTIST = "Local file";
const MUSIC_DIR = "/home/user/music";

/** Seconds of drift before the seek bar re-renders. */
const PROGRESS_STEP = 0.25;
const SEEK_STEP = 5;
const SEARCH_DEBOUNCE = 400;
const HOME_ROW_LIMIT = 10;
const QUICK_PICK_LIMIT = 6;
const LIBRARY_SEARCH_LIMIT = 30;

const NAV: Array<{ view: View; label: string; icon: IconType }> = [
  { view: { kind: "home" }, label: "Home", icon: House },
  { view: { kind: "search" }, label: "Search", icon: Search },
  { view: { kind: "library" }, label: "Your Library", icon: Library },
];

const TILE_GRADIENTS = [
  "from-emerald-500/80 to-teal-800/70",
  "from-indigo-500/80 to-violet-800/70",
  "from-rose-500/80 to-orange-700/70",
  "from-sky-500/80 to-blue-800/70",
  "from-amber-500/80 to-red-700/70",
  "from-fuchsia-500/80 to-purple-800/70",
];

/** Liked Songs keeps its own tile so it reads as pinned, not as one more list. */
const LIKED_GRADIENT = "from-indigo-400 to-indigo-100/40";
const LIBRARY_GRADIENT = "from-neutral-500/70 to-neutral-800/70";

const iconButton =
  "p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/55";
const pill =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] text-white/70 hover:bg-white/10 transition disabled:opacity-40";
const pillGreen =
  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-semibold bg-green-500 text-black hover:bg-green-400 transition disabled:opacity-40";

/* ------------------------------------------------------------------ helpers */

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

/** The same key always gets the same tile, so lists feel like fixed objects. */
const tileGradient = (key: string) => TILE_GRADIENTS[hashString(key) % TILE_GRADIENTS.length];

const formatTime = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
};

const formatTotal = (seconds: number) => {
  const total = Math.round(seconds);
  if (total <= 0) return "no duration yet";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} hr ${m} min`;
  if (m > 0) return `${m} min ${s} sec`;
  return `${s} sec`;
};

const countLabel = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const repeatLabel = (mode: RepeatMode) =>
  mode === "one" ? "Repeat one track" : mode === "all" ? "Repeat the queue" : "Repeat off";

/** Album column text. Never invented: it falls back to where the audio comes from. */
const albumLabel = (track: Track) =>
  track.album || track.genre || (track.source === "local" ? LOCAL_ARTIST : "Public domain");

/* -------------------------------------------------------------- small parts */

/**
 * Artwork with a deterministic gradient fallback. Archive item images are plain
 * `<img>` sources, so a 404 or a blocked request just shows the gradient.
 */
function CoverArt({
  src,
  seed,
  icon: Icon = Music,
  iconSize = 18,
  gradient,
}: {
  src?: string;
  seed: string;
  icon?: IconType;
  iconSize?: number;
  gradient?: string;
}) {
  // Tracked by URL rather than a boolean so a later, working src still renders.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = src && failedSrc !== src ? src : null;

  if (!usable) {
    return (
      <span
        aria-hidden="true"
        className={`w-full h-full bg-gradient-to-br ${gradient ?? tileGradient(seed)} flex items-center justify-center`}
      >
        <Icon size={iconSize} className="text-white/80" />
      </span>
    );
  }
  return (
    <img
      src={usable}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailedSrc(usable)}
      className="w-full h-full object-cover"
    />
  );
}

interface TrackRowProps {
  track: Track;
  index: number;
  columns: string;
  showAlbum: boolean;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  onToggleLike: () => void;
  onMenu: (event: React.MouseEvent) => void;
}

function TrackRow({
  track, index, columns, showAlbum, active, playing, onPlay, onToggleLike, onMenu,
}: TrackRowProps) {
  return (
    <div
      className={`group grid items-center gap-3 px-3 py-1.5 rounded-md transition ${
        active ? "bg-white/[0.06]" : "hover:bg-white/[0.07]"
      }`}
      style={{ gridTemplateColumns: columns }}
      onClick={onPlay}
      onContextMenu={onMenu}
    >
      <button
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
        aria-label={`Play ${track.title}`}
        className="relative w-6 h-6 flex items-center justify-center rounded-full outline-none text-white/45 focus-visible:ring-2 focus-visible:ring-green-400/70"
      >
        {active ? (
          <AudioLines
            size={13}
            className={`text-green-400 group-hover:opacity-0 group-focus-within:opacity-0 ${playing ? "animate-pulse" : ""}`}
          />
        ) : (
          <span className="text-[12px] tabular-nums group-hover:opacity-0 group-focus-within:opacity-0">
            {index + 1}
          </span>
        )}
        <Play
          size={12}
          className="absolute fill-current text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition"
        />
      </button>

      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded shrink-0 overflow-hidden bg-white/5">
          <CoverArt src={track.artworkUrl} seed={track.id} iconSize={14} />
        </span>
        <span className="min-w-0">
          <span
            className={`block text-[13px] truncate ${active ? "text-green-400" : "text-white/90"}`}
          >
            {track.title}
          </span>
          <span className="block text-[11px] text-white/45 truncate">
            {track.artist}
            {track.plays > 0 && (
              <span className="text-white/25"> · {countLabel(track.plays, "play")}</span>
            )}
          </span>
        </span>
      </div>

      {showAlbum && (
        <span className="text-[11px] text-white/45 truncate">{albumLabel(track)}</span>
      )}

      <button
        onClick={(event) => {
          event.stopPropagation();
          onToggleLike();
        }}
        aria-label={
          track.liked ? `Remove ${track.title} from Liked Songs` : `Add ${track.title} to Liked Songs`
        }
        aria-pressed={track.liked}
        className={`p-1 rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 ${
          track.liked
            ? "text-green-400"
            : "text-white/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-white"
        }`}
      >
        <Heart size={14} className={track.liked ? "fill-current" : ""} />
      </button>

      <span className="text-[11px] text-white/40 tabular-nums text-right">
        {track.durationSeconds ? formatTime(track.durationSeconds) : "—"}
      </span>
    </div>
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
    <div className="flex flex-col items-center text-center px-8 py-12">
      <span className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
        <Icon size={24} className="text-white/35" />
      </span>
      <div className="text-sm text-white/75 mb-1">{title}</div>
      <div className="text-xs text-white/45 max-w-sm leading-relaxed">{body}</div>
      {children && (
        <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">{children}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- the app */

export default function NovaMusic({ windowId, appData }: AppProps) {
  const tracks = useNovamusicStore((s) => s.tracks);
  const playlists = useNovamusicStore((s) => s.playlists);
  const queue = useNovamusicStore((s) => s.queue);
  const queueIndex = useNovamusicStore((s) => s.queueIndex);
  const currentTrackId = useNovamusicStore((s) => s.currentTrackId);
  const shuffle = useNovamusicStore((s) => s.shuffle);
  const repeat = useNovamusicStore((s) => s.repeat);
  const recentlyPlayed = useNovamusicStore((s) => s.recentlyPlayed);
  const addTrack = useNovamusicStore((s) => s.addTrack);
  const removeTrack = useNovamusicStore((s) => s.removeTrack);
  const toggleLike = useNovamusicStore((s) => s.toggleLike);
  const recordPlay = useNovamusicStore((s) => s.recordPlay);
  const setTrackDuration = useNovamusicStore((s) => s.setDuration);
  const createPlaylist = useNovamusicStore((s) => s.createPlaylist);
  const renamePlaylist = useNovamusicStore((s) => s.renamePlaylist);
  const deletePlaylist = useNovamusicStore((s) => s.deletePlaylist);
  const addToPlaylist = useNovamusicStore((s) => s.addToPlaylist);
  const removeFromPlaylist = useNovamusicStore((s) => s.removeFromPlaylist);
  const playQueue = useNovamusicStore((s) => s.playQueue);
  const nextInQueue = useNovamusicStore((s) => s.next);
  const previousInQueue = useNovamusicStore((s) => s.previous);
  const setShuffle = useNovamusicStore((s) => s.setShuffle);
  const cycleRepeat = useNovamusicStore((s) => s.cycleRepeat);
  const clearQueue = useNovamusicStore((s) => s.clearQueue);

  const nodes = useFsStore((s) => s.nodes);
  // The system volume slider in Quick Settings drives real playback volume.
  const systemVolume = useSystemStore((s) => s.quickSettings.volume);
  const setQuickSetting = useSystemStore((s) => s.setQuickSetting);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const [view, setView] = useState<View>({ kind: "home" });
  const [width, setWidth] = useState(0);

  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<ArchiveResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ kind: "info" | "error"; message: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  // Mute is a system setting, so the taskbar speaker and this button are one control.
  const muted = useSystemStore((s) => s.quickSettings.muted);
  const [localSrc, setLocalSrc] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Whether the user wants audio: survives the src swap between tracks. */
  const playIntentRef = useRef(false);
  /** The last id counted as a play, so a resume isn't a second play. */
  const countedRef = useRef<string | null>(null);
  const lastTickRef = useRef(0);
  const mountedRef = useRef(true);
  const openedPathRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ------------------------------------------------------------ measurement */

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  // Space and the arrow keys are scoped to the root, so it takes focus up front.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const iconsOnly = width > 0 && width < SIDEBAR_MIN;
  const compact = width > 0 && width < COMPACT_MIN;
  const rowColumns = compact
    ? "24px minmax(0,1fr) 28px 46px"
    : "24px minmax(0,1fr) minmax(0,26%) 28px 46px";

  /* ------------------------------------------------------------------ lists */

  const byId = useMemo(() => {
    const map = new Map<string, Track>();
    for (const track of tracks) map.set(track.id, track);
    return map;
  }, [tracks]);

  const currentTrack = currentTrackId ? byId.get(currentTrackId) ?? null : null;

  const libraryIds = useMemo(
    () => [...tracks].sort((a, b) => b.addedAt - a.addedAt).map((t) => t.id),
    [tracks]
  );

  const likedIds = useMemo(
    () =>
      tracks
        .filter((t) => t.liked)
        .sort((a, b) => b.addedAt - a.addedAt)
        .map((t) => t.id),
    [tracks]
  );

  const recentTracks = useMemo(() => {
    const result: Track[] = [];
    for (const id of recentlyPlayed) {
      const track = byId.get(id);
      if (track) result.push(track);
    }
    return result;
  }, [recentlyPlayed, byId]);

  /** Genres in use, most populated first. Only real tags, never guessed. */
  const genreGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const track of [...tracks].sort((a, b) => b.addedAt - a.addedAt)) {
      const genre = track.genre?.trim();
      if (!genre) continue;
      const list = map.get(genre);
      if (list) list.push(track.id);
      else map.set(genre, [track.id]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [tracks]);

  const libraryMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return tracks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(needle) ||
          t.artist.toLowerCase().includes(needle) ||
          (t.album ?? "").toLowerCase().includes(needle) ||
          (t.genre ?? "").toLowerCase().includes(needle)
      )
      .slice(0, LIBRARY_SEARCH_LIMIT);
  }, [tracks, query]);

  const knownIdentifiers = useMemo(() => {
    const set = new Set<string>();
    for (const track of tracks) if (track.identifier) set.add(track.identifier);
    return set;
  }, [tracks]);

  const collection = useMemo<Collection | null>(() => {
    if (view.kind === "liked") {
      return {
        kicker: "Playlist",
        title: "Liked Songs",
        trackIds: likedIds,
        gradient: LIKED_GRADIENT,
        icon: Heart,
      };
    }
    if (view.kind === "library") {
      return {
        kicker: "Collection",
        title: "Your Library",
        trackIds: libraryIds,
        gradient: LIBRARY_GRADIENT,
        icon: Library,
      };
    }
    if (view.kind === "playlist") {
      const playlist = playlists.find((p) => p.id === view.id);
      if (!playlist) return null;
      const firstWithArt = playlist.trackIds
        .map((id) => byId.get(id))
        .find((track) => Boolean(track?.artworkUrl));
      return {
        kicker: "Playlist",
        title: playlist.name,
        trackIds: playlist.trackIds,
        gradient: tileGradient(playlist.id),
        artwork: firstWithArt?.artworkUrl,
        icon: ListMusic,
        playlistId: playlist.id,
      };
    }
    if (view.kind === "genre") {
      const found = genreGroups.find(([name]) => name === view.genre);
      return {
        kicker: "Genre",
        title: view.genre,
        trackIds: found ? found[1] : [],
        gradient: tileGradient(view.genre),
        icon: Music,
      };
    }
    return null;
  }, [view, likedIds, libraryIds, playlists, byId, genreGroups]);

  const collectionTracks = useMemo(() => {
    if (!collection) return [];
    const result: Track[] = [];
    for (const id of collection.trackIds) {
      const track = byId.get(id);
      if (track) result.push(track);
    }
    return result;
  }, [collection, byId]);

  /** What Play starts when nothing is loaded yet. */
  const contextIds = collection ? collection.trackIds : libraryIds;

  /* ----------------------------------------------------------- window title */

  const nowPlayingTitle = currentTrack?.title;
  const nowPlayingArtist = currentTrack?.artist;

  useEffect(() => {
    setWindowTitle(
      windowId,
      playing && nowPlayingTitle
        ? `${nowPlayingTitle} · ${nowPlayingArtist ?? "Unknown artist"} — NovaMusic`
        : "NovaMusic"
    );
  }, [windowId, playing, nowPlayingTitle, nowPlayingArtist, setWindowTitle]);

  /* ------------------------------------------------------------ transient UI */

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setDeleteArmed(null);
  }, [view]);

  /* ---------------------------------------------------------- local playback */

  const localPath = currentTrack && currentTrack.source === "local" ? currentTrack.path ?? null : null;

  // Copied from MediaPlayer: the url is declared before the async read so the
  // cleanup can revoke it even while the read is still in flight.
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

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [localPath, nodes]);

  const playbackSrc = !currentTrack
    ? null
    : currentTrack.source === "archive"
      ? currentTrack.identifier && currentTrack.file
        ? archiveAudioUrl(currentTrack.identifier, currentTrack.file)
        : null
      : localSrc;

  /* --------------------------------------------------------- audio element */

  /** play() rejects when autoplay is blocked or the src was replaced mid-load. */
  const attemptPlay = (element: HTMLAudioElement) => {
    void element.play().catch((err: unknown) => {
      const name = (err as Error)?.name;
      if (name === "AbortError") return; // a newer track took over
      if (mountedRef.current) {
        setPlaybackError("The browser blocked playback. Press play again to start it.");
      }
    });
  };

  // A new src means a fresh element state; the play intent carries over.
  useEffect(() => {
    setPosition(0);
    setDuration(0);
    setBuffered(0);
    setPlaybackError(null);
    lastTickRef.current = 0;

    const element = audioRef.current;
    if (!element) return;
    if (!playbackSrc) {
      // React drops the src attribute, which on its own does not stop the
      // resource that is already loaded.
      element.pause();
      setPlaying(false);
      return;
    }
    if (!playIntentRef.current) return;
    attemptPlay(element);
  }, [playbackSrc]);

  useEffect(() => {
    // A fresh selection is a fresh play, even if it is the same track again.
    countedRef.current = null;
    if (currentTrackId) return;
    playIntentRef.current = false;
    audioRef.current?.pause();
    setPlaying(false);
  }, [currentTrackId]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, systemVolume / 100));
    element.muted = muted;
  }, [systemVolume, muted, playbackSrc]);

  const effectiveDuration = duration || currentTrack?.durationSeconds || 0;

  const onAudioPlay = () => {
    setPlaying(true);
    playIntentRef.current = true;
    const id = currentTrackId;
    if (id && countedRef.current !== id) {
      countedRef.current = id;
      recordPlay(id);
    }
  };

  const onTimeUpdate = () => {
    const element = audioRef.current;
    if (!element) return;
    const seconds = element.currentTime;
    // timeupdate fires several times a second; the bar only needs quarter seconds.
    if (seconds > 0 && Math.abs(seconds - lastTickRef.current) < PROGRESS_STEP) return;
    lastTickRef.current = seconds;
    setPosition(seconds);
  };

  const onProgress = () => {
    const element = audioRef.current;
    if (!element || element.buffered.length === 0) return;
    setBuffered(element.buffered.end(element.buffered.length - 1));
  };

  const onLoadedMetadata = () => {
    const element = audioRef.current;
    if (!element) return;
    const value = element.duration;
    if (!Number.isFinite(value) || value <= 0) return;
    setDuration(value);
    // The element's own duration is the real one, for local files and streams alike.
    if (currentTrackId) setTrackDuration(currentTrackId, value);
  };

  const onAudioError = () => {
    const failure = audioRef.current?.error;
    // Swapping the src aborts the old load; that is not a failure worth showing.
    if (!failure || failure.code === MediaError.MEDIA_ERR_ABORTED) return;
    setPlaying(false);
    setPlaybackError(
      failure.code === MediaError.MEDIA_ERR_NETWORK
        ? "The stream stopped: the network dropped mid-track."
        : failure.code === MediaError.MEDIA_ERR_DECODE
          ? "The browser couldn't decode this audio."
          : "This audio isn't playable in this browser."
    );
  };

  /* ------------------------------------------------------------- transport */

  const startTracks = (ids: string[], index = 0) => {
    const previous = currentTrackId;
    const started = playQueue(ids, index);
    if (!started) return;
    playIntentRef.current = true;
    if (started === previous) {
      // Same track: the src never changes, so restart it here.
      const element = audioRef.current;
      if (element) {
        element.currentTime = 0;
        lastTickRef.current = 0;
        setPosition(0);
        countedRef.current = null;
        attemptPlay(element);
      }
    }
  };

  const togglePlay = () => {
    const element = audioRef.current;
    if (!currentTrackId || !element) {
      if (contextIds.length > 0) startTracks(contextIds, 0);
      return;
    }
    // No src means the local file couldn't be read; the banner already says so.
    if (!playbackSrc) return;
    if (element.paused) {
      playIntentRef.current = true;
      attemptPlay(element);
    } else {
      playIntentRef.current = false;
      element.pause();
    }
  };

  const seekTo = (seconds: number) => {
    const element = audioRef.current;
    if (!element || effectiveDuration <= 0) return;
    const clamped = Math.min(effectiveDuration, Math.max(0, seconds));
    try {
      element.currentTime = clamped;
    } catch {
      // Not seekable yet: the position stays where it was.
      return;
    }
    lastTickRef.current = clamped;
    setPosition(clamped);
  };

  const seekBy = (delta: number) => seekTo(position + delta);

  const goNext = () => {
    const element = audioRef.current;
    const move = nextInQueue();
    if (move === "restart" && element) {
      element.currentTime = 0;
      lastTickRef.current = 0;
      setPosition(0);
      countedRef.current = null;
      if (playIntentRef.current) attemptPlay(element);
    } else if (move === "stopped") {
      playIntentRef.current = false;
      element?.pause();
      setPlaying(false);
    }
    // "advanced" changes the src, and the effect above starts it.
  };

  const goPrevious = () => {
    const element = audioRef.current;
    // Spotify's rule: past the first few seconds, "previous" restarts the track.
    if (element && element.currentTime > 3) {
      seekTo(0);
      return;
    }
    const move = previousInQueue();
    if (move === "restart" && element) {
      element.currentTime = 0;
      lastTickRef.current = 0;
      setPosition(0);
      if (playIntentRef.current) attemptPlay(element);
    }
  };

  const onEnded = () => {
    const element = audioRef.current;
    const move = nextInQueue();
    if (move === "restart" && element) {
      element.currentTime = 0;
      lastTickRef.current = 0;
      setPosition(0);
      countedRef.current = null;
      attemptPlay(element);
    } else if (move === "stopped") {
      playIntentRef.current = false;
      setPlaying(false);
      setPosition(effectiveDuration);
    }
  };

  const canStep = queue.length > 0 && Boolean(currentTrackId);
  const canGoNext =
    canStep && (shuffle || repeat !== "off" || queueIndex < queue.length - 1);

  /* --------------------------------------------------------------- keyboard */

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    // Typing in the search or rename field must stay typing.
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      seekBy(SEEK_STEP);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekBy(-SEEK_STEP);
    } else if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      setQuickSetting("muted", !muted);
    } else if (event.key === "Escape" && queueOpen) {
      event.preventDefault();
      setQueueOpen(false);
    }
  };

  /* ------------------------------------------------------- live archive search */

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setRemote([]);
      setSearchStatus("idle");
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setSearchStatus("loading");
    setSearchError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const results = await searchArchiveAudio(needle);
          if (cancelled) return;
          setRemote(results);
          setSearchStatus("done");
        } catch (err) {
          if (cancelled) return;
          setRemote([]);
          setSearchStatus("error");
          setSearchError((err as Error).message);
        }
      })();
    }, SEARCH_DEBOUNCE);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const addFromArchive = async (result: ArchiveResult) => {
    setResolving(result.identifier);
    try {
      const draft = await fetchArchiveTrack(result.identifier);
      if (!mountedRef.current) return;
      if (!draft) {
        setNotice({
          kind: "error",
          message: `"${result.title}" has no MP3 with a readable length, so nothing here can play it.`,
        });
        return;
      }
      const id = addTrack({
        ...draft,
        // The search doc's creator is usually the better artist credit.
        artist: draft.artist === "Unknown artist" ? result.creator : draft.artist,
      });
      setNotice({ kind: "info", message: `Added "${draft.title}" to your library.` });
      // Queue the rest of the library behind it so "next" still goes somewhere.
      startTracks([id, ...libraryIds.filter((entry) => entry !== id)], 0);
    } catch (err) {
      if (mountedRef.current) setNotice({ kind: "error", message: (err as Error).message });
    } finally {
      if (mountedRef.current) setResolving(null);
    }
  };

  /* ------------------------------------------------------------ local files */

  const addLocalPath = (path: string) => {
    const ext = extOf(path);
    if (ext && !AUDIO_EXT.includes(ext)) {
      setNotice({
        kind: "error",
        message: `"${baseName(path)}" isn't an audio format NovaMusic recognises.`,
      });
      return;
    }
    const name = baseName(path);
    const id = addTrack({
      id: localTrackId(path),
      source: "local",
      title: name.replace(/\.[^.]+$/, "") || name,
      artist: LOCAL_ARTIST,
      path,
    });
    setNotice({ kind: "info", message: `Added "${name}".` });
    setView({ kind: "library" });
    startTracks([id, ...libraryIds.filter((entry) => entry !== id)], 0);
  };

  /** A file opened from File Explorer or the desktop plays straight away. */
  useEffect(() => {
    const path: string | undefined = appData?.path;
    if (!path || openedPathRef.current === path) return;
    openedPathRef.current = path;
    const id = addTrack({
      id: localTrackId(path),
      source: "local",
      title: baseName(path).replace(/\.[^.]+$/, "") || baseName(path),
      artist: LOCAL_ARTIST,
      path,
    });
    playIntentRef.current = true;
    playQueue([id], 0);
    setView({ kind: "library" });
  }, [appData?.path, addTrack, playQueue]);

  /* --------------------------------------------------------------- playlists */

  const onNewPlaylist = () => {
    const id = createPlaylist(`My playlist #${playlists.length + 1}`);
    setView({ kind: "playlist", id });
    const created = useNovamusicStore.getState().playlists.find((p) => p.id === id);
    setRenameValue(created?.name ?? "");
    setRenamingId(id);
  };

  const commitRename = () => {
    if (renamingId) renamePlaylist(renamingId, renameValue);
    setRenamingId(null);
  };

  const openTrackMenu = (event: React.MouseEvent, track: Track, playlistId?: string) => {
    // Without this the desktop's own menu leaks through the window.
    event.preventDefault();
    event.stopPropagation();

    const items: ContextMenuItem[] = [
      { label: "Play", icon: Play, onClick: () => startTracks([track.id], 0) },
      {
        label: track.liked ? "Remove from Liked Songs" : "Save to Liked Songs",
        icon: Heart,
        onClick: () => toggleLike(track.id),
      },
    ];

    for (const playlist of playlists) {
      if (playlist.trackIds.includes(track.id)) continue;
      items.push({
        label: `Add to ${playlist.name}`,
        icon: Plus,
        onClick: () => {
          addToPlaylist(playlist.id, track.id);
          setNotice({ kind: "info", message: `Added to ${playlist.name}.` });
        },
      });
    }

    items.push({ divider: true, label: "", onClick: () => {} });
    if (playlistId) {
      items.push({
        label: "Remove from this playlist",
        icon: X,
        onClick: () => removeFromPlaylist(playlistId, track.id),
      });
    }
    items.push({
      label: "Remove from library",
      icon: Trash2,
      onClick: () => removeTrack(track.id),
    });

    openMenu(event.clientX, event.clientY, items);
  };

  const renderRows = (list: Track[], playlistId?: string) => (
    <div className="mt-1.5">
      {list.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index}
          columns={rowColumns}
          showAlbum={!compact}
          active={track.id === currentTrackId}
          playing={playing}
          onPlay={() => startTracks(list.map((entry) => entry.id), index)}
          onToggleLike={() => toggleLike(track.id)}
          onMenu={(event) => openTrackMenu(event, track, playlistId)}
        />
      ))}
    </div>
  );

  const tableHeader = (
    <div
      className="grid items-center gap-3 px-3 pb-1.5 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40"
      style={{ gridTemplateColumns: rowColumns }}
    >
      <span className="text-center">#</span>
      <span>Title</span>
      {!compact && <span>Album / Genre</span>}
      <span aria-hidden="true" />
      <span className="flex justify-end">
        <Clock size={12} />
      </span>
    </div>
  );

  /* ------------------------------------------------------------------ views */

  const openLibrary = () => setView({ kind: "library" });

  const homeView = (
    <div className="px-5 pb-8 pt-5">
      <h1 className="text-2xl font-bold tracking-tight text-white">{greeting()}</h1>
      <p className="text-[11px] text-white/40 mt-1 leading-relaxed max-w-xl">
        NovaMusic ships with seven public-domain 78rpm transfers streamed straight from the Internet
        Archive. Play counts below are the ones this machine recorded — nothing here is invented.
      </p>

      <div
        className="grid gap-2 mt-4"
        style={{ gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))" }}
      >
        {[
          {
            key: "liked",
            label: "Liked Songs",
            sub: countLabel(likedIds.length, "song"),
            gradient: LIKED_GRADIENT,
            icon: Heart as IconType,
            artwork: undefined as string | undefined,
            ids: likedIds,
            open: () => setView({ kind: "liked" }),
          },
          ...playlists.slice(0, QUICK_PICK_LIMIT).map((playlist) => ({
            key: playlist.id,
            label: playlist.name,
            sub: countLabel(playlist.trackIds.length, "song"),
            gradient: tileGradient(playlist.id),
            icon: ListMusic as IconType,
            artwork: playlist.trackIds
              .map((id) => byId.get(id))
              .find((track) => Boolean(track?.artworkUrl))?.artworkUrl,
            ids: playlist.trackIds,
            open: () => setView({ kind: "playlist", id: playlist.id }),
          })),
          ...recentTracks.slice(0, 3).map((track) => ({
            key: `recent-${track.id}`,
            label: track.title,
            sub: track.artist,
            gradient: tileGradient(track.id),
            icon: Music as IconType,
            artwork: track.artworkUrl,
            ids: [track.id],
            open: openLibrary,
          })),
        ].map((pick) => (
          <div
            key={pick.key}
            className="group relative flex items-center gap-3 rounded-md bg-white/[0.06] hover:bg-white/[0.11] transition overflow-hidden"
          >
            <button
              onClick={pick.open}
              aria-label={`Open ${pick.label}`}
              className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
            />
            <span className="relative w-14 h-14 shrink-0 overflow-hidden pointer-events-none">
              <CoverArt
                src={pick.artwork}
                seed={pick.key}
                gradient={pick.gradient}
                icon={pick.icon}
                iconSize={18}
              />
            </span>
            <span className="relative min-w-0 flex-1 pointer-events-none">
              <span className="block text-[12px] font-semibold text-white/90 truncate">
                {pick.label}
              </span>
              <span className="block text-[10px] text-white/40 truncate">{pick.sub}</span>
            </span>
            <button
              onClick={() => startTracks(pick.ids, 0)}
              disabled={pick.ids.length === 0}
              aria-label={`Play ${pick.label}`}
              className="relative mr-3 w-9 h-9 rounded-full bg-green-500 text-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-green-400 transition disabled:hidden outline-none"
            >
              <Play size={15} className="fill-current ml-[1px]" />
            </button>
          </div>
        ))}
      </div>

      <h2 className="text-base font-bold text-white mt-7 mb-0.5">Recently played</h2>
      <div className="text-[11px] text-white/35 mb-3">
        Filled in by real playback on this machine, newest first.
      </div>
      {recentTracks.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Nothing played yet"
          body="Play anything and it lands here, along with the play count NovaMusic keeps for it."
        >
          <button className={pillGreen} onClick={() => startTracks(libraryIds, 0)}>
            <Play size={12} className="fill-current" /> Play your library
          </button>
        </EmptyState>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
        >
          {recentTracks.slice(0, HOME_ROW_LIMIT).map((track) => (
            <button
              key={track.id}
              onClick={() => startTracks([track.id, ...libraryIds.filter((id) => id !== track.id)], 0)}
              onContextMenu={(event) => openTrackMenu(event, track)}
              aria-label={`Play ${track.title}`}
              className="group text-left p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
            >
              <span className="relative block aspect-square rounded overflow-hidden bg-white/5">
                <CoverArt src={track.artworkUrl} seed={track.id} iconSize={26} />
                <span className="absolute bottom-1.5 right-1.5 w-9 h-9 rounded-full bg-green-500 text-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition">
                  <Play size={15} className="fill-current ml-[1px]" />
                </span>
              </span>
              <span className="block mt-2 text-[12px] font-semibold text-white/90 truncate">
                {track.title}
              </span>
              <span className="block text-[11px] text-white/40 truncate">{track.artist}</span>
              <span className="block text-[10px] text-white/25 mt-0.5">
                {track.plays > 0 ? countLabel(track.plays, "play") : "not played yet"}
              </span>
            </button>
          ))}
        </div>
      )}

      {genreGroups.length > 0 && (
        <>
          <h2 className="text-base font-bold text-white mt-7 mb-3">By genre</h2>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
          >
            {genreGroups.map(([genre, ids]) => (
              <button
                key={genre}
                onClick={() => setView({ kind: "genre", genre })}
                aria-label={`Open ${genre}`}
                className="text-left p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
              >
                <span className="block aspect-square rounded overflow-hidden">
                  <CoverArt seed={genre} icon={Music} iconSize={26} />
                </span>
                <span className="block mt-2 text-[12px] font-semibold text-white/90 truncate">
                  {genre}
                </span>
                <span className="block text-[11px] text-white/40">
                  {countLabel(ids.length, "song")}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const searchView = (
    <div className="px-5 pb-8 pt-5">
      <div className="flex items-center gap-2 w-full max-w-md bg-white/[0.08] border border-white/10 rounded-full pl-3.5 pr-1 focus-within:border-white/30 transition">
        <Search size={15} className="text-white/40 shrink-0" />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Let the browser's own menu through, so right-click paste works.
          onContextMenu={(event) => event.stopPropagation()}
          placeholder="Songs, artists, anything on the Internet Archive"
          aria-label="Search your library and the Internet Archive"
          className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-white/30 py-2"
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
            <X size={13} />
          </button>
        )}
      </div>

      {query.trim().length < 2 ? (
        <EmptyState
          icon={Search}
          title="Search your library and the Internet Archive"
          body="Two characters is enough. Library matches show first; the live results below come from archive.org's audio collections, preferring the George Blood 78rpm archive because those items are one song each with a real artist credit."
        />
      ) : (
        <>
          <h2 className="text-sm font-bold text-white mt-6 mb-1">In your library</h2>
          {libraryMatches.length === 0 ? (
            <div className="text-[11px] text-white/35 leading-relaxed">
              Nothing in your library matches “{query.trim()}”.
            </div>
          ) : (
            <>
              {tableHeader}
              {renderRows(libraryMatches)}
            </>
          )}

          <div className="flex items-center gap-2 mt-7 mb-1">
            <Globe size={14} className="text-white/40" />
            <h2 className="text-sm font-bold text-white">From the Internet Archive</h2>
            {searchStatus === "loading" && (
              <LoaderCircle size={13} className="text-white/40 animate-spin" />
            )}
          </div>
          <div className="text-[11px] text-white/35 mb-3 leading-relaxed">
            Live results from archive.org. Adding one reads the item metadata to find a playable MP3,
            then streams it straight from the Archive.
          </div>

          {searchStatus === "error" ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <TriangleAlert size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-100/80 leading-relaxed">
                {searchError ?? "The search failed."} The Archive may be unreachable from here —
                your library still works offline.
              </div>
            </div>
          ) : remote.length === 0 && searchStatus === "done" ? (
            <div className="text-[11px] text-white/35 leading-relaxed">
              The Archive returned no audio items for “{query.trim()}”.
            </div>
          ) : (
            <div className="space-y-0.5">
              {remote.map((result) => {
                const known = knownIdentifiers.has(result.identifier);
                const busy = resolving === result.identifier;
                return (
                  <div
                    key={result.identifier}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-white/[0.06] transition"
                  >
                    <span className="w-10 h-10 rounded shrink-0 overflow-hidden bg-white/5">
                      <CoverArt
                        src={archiveArtworkUrl(result.identifier)}
                        seed={result.identifier}
                        iconSize={14}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-white/90 truncate">{result.title}</span>
                      <span className="block text-[11px] text-white/40 truncate">
                        {result.creator}
                        {result.year ? ` · ${result.year}` : ""}
                      </span>
                    </span>
                    <button
                      onClick={() => void addFromArchive(result)}
                      disabled={busy || known}
                      aria-label={known ? `${result.title} is already in your library` : `Add ${result.title}`}
                      className={known ? `${pill} text-green-400` : pillGreen}
                    >
                      {busy ? (
                        <LoaderCircle size={12} className="animate-spin" />
                      ) : known ? (
                        <Check size={12} />
                      ) : (
                        <Plus size={12} />
                      )}
                      {known ? "In library" : busy ? "Resolving" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );

  const collectionPlaying =
    playing && Boolean(currentTrackId) && collection
      ? collection.trackIds.includes(currentTrackId as string)
      : false;

  const collectionTotalSeconds = collectionTracks.reduce(
    (sum, track) => sum + (track.durationSeconds ?? 0),
    0
  );
  const collectionPlays = collectionTracks.reduce((sum, track) => sum + track.plays, 0);
  const hasArchiveTracks = collectionTracks.some((track) => track.source === "archive");
  // Only the `from-*` half of the tile gradient: two `to-*` classes on one
  // element would fight over stylesheet order instead of class order.
  const headerGradient = collection ? collection.gradient.split(" ")[0] : "from-white/10";

  const collectionView = collection && (
    <div className="pb-8">
      <div
        className={`flex items-end gap-5 px-5 pt-6 pb-4 bg-gradient-to-b ${headerGradient} to-transparent`}
      >
        <span
          className={`${compact ? "w-24 h-24" : "w-[136px] h-[136px]"} rounded shrink-0 overflow-hidden shadow-2xl bg-white/5`}
        >
          <CoverArt
            src={collection.artwork}
            seed={collection.title}
            gradient={collection.gradient}
            icon={collection.icon}
            iconSize={compact ? 30 : 44}
          />
        </span>
        <div className="min-w-0 pb-1">
          <span className="block text-[10px] uppercase tracking-wider text-white/70">
            {collection.kicker}
          </span>
          <h1
            className={`${compact ? "text-2xl" : "text-4xl"} font-bold tracking-tight text-white leading-tight truncate`}
            style={{ userSelect: "text" }}
          >
            {collection.title}
          </h1>
          <span className="block text-[12px] text-white/70 mt-2">
            {countLabel(collection.trackIds.length, "song")} · {formatTotal(collectionTotalSeconds)}
            {collectionPlays > 0 ? ` · ${countLabel(collectionPlays, "play")} recorded here` : ""}
          </span>
          {hasArchiveTracks && (
            <span className="block text-[11px] text-white/45 mt-0.5">
              public domain · Internet Archive
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-3">
        <button
          onClick={() =>
            collectionPlaying ? togglePlay() : startTracks(collection.trackIds, 0)
          }
          disabled={collection.trackIds.length === 0}
          aria-label={
            collectionPlaying ? `Pause ${collection.title}` : `Play ${collection.title}`
          }
          className="w-14 h-14 rounded-full bg-green-500 text-black flex items-center justify-center shadow-xl hover:bg-green-400 hover:scale-105 transition disabled:opacity-40 disabled:hover:scale-100"
        >
          {collectionPlaying ? (
            <Pause size={22} className="fill-current" />
          ) : (
            <Play size={22} className="fill-current ml-1" />
          )}
        </button>

        <button
          onClick={() => setShuffle(!shuffle)}
          aria-label="Shuffle"
          aria-pressed={shuffle}
          className={`p-2 rounded-full transition ${
            shuffle ? "text-green-400 bg-green-500/10" : "text-white/50 hover:text-white"
          }`}
        >
          <Shuffle size={18} />
        </button>

        {collection.playlistId && (
          <div className="flex items-center gap-1 ml-auto">
            {renamingId === collection.playlistId ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onContextMenu={(event) => event.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setRenamingId(null);
                  }
                }}
                aria-label="Playlist name"
                className="bg-white/10 rounded-full px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-green-400/60"
              />
            ) : (
              <button
                onClick={() => {
                  setRenameValue(collection.title);
                  setRenamingId(collection.playlistId ?? null);
                }}
                aria-label="Rename playlist"
                className={iconButton}
              >
                <Pencil size={15} />
              </button>
            )}
            <button
              onClick={() => {
                const id = collection.playlistId;
                if (!id) return;
                if (deleteArmed !== id) {
                  setDeleteArmed(id);
                  return;
                }
                deletePlaylist(id);
                setView({ kind: "home" });
              }}
              aria-label={
                deleteArmed === collection.playlistId
                  ? "Confirm deleting this playlist"
                  : "Delete playlist"
              }
              className={
                deleteArmed === collection.playlistId
                  ? `${pill} text-red-300 bg-red-500/15`
                  : iconButton
              }
            >
              <Trash2 size={15} />
              {deleteArmed === collection.playlistId && "Delete for real?"}
            </button>
          </div>
        )}
      </div>

      <div className="px-3">
        {collectionTracks.length === 0 ? (
          <EmptyState
            icon={collection.icon}
            title={
              view.kind === "liked" ? "No liked songs yet" : `${collection.title} is empty`
            }
            body={
              view.kind === "liked"
                ? "Press the heart on any row, or right-click a song and save it. Liked songs collect here."
                : "Right-click any song in your library to add it here, or pull something new in from the Internet Archive."
            }
          >
            <button className={pillGreen} onClick={openLibrary}>
              <Library size={12} /> Your library
            </button>
            <button className={pill} onClick={() => setView({ kind: "search" })}>
              <Search size={12} /> Search the Archive
            </button>
          </EmptyState>
        ) : (
          <>
            {tableHeader}
            {renderRows(collectionTracks, collection.playlistId)}
          </>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- sidebar */

  const navButtonClass = (active: boolean) =>
    `w-full flex items-center rounded-md text-[12px] font-semibold transition ${
      iconsOnly ? "justify-center py-2.5" : "gap-3.5 px-3 py-2"
    } ${active ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`;

  const sidebar = (
    <nav
      aria-label="NovaMusic navigation"
      className={`shrink-0 flex flex-col gap-2 ${iconsOnly ? "w-[62px]" : "w-[210px]"}`}
    >
      <div className="rounded-lg bg-[#121218] p-1.5 shrink-0">
        {NAV.map((item) => {
          const active = view.kind === item.view.kind;
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => {
                setView(item.view);
                if (item.view.kind === "search") {
                  window.setTimeout(() => searchRef.current?.focus(), 0);
                }
              }}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={iconsOnly ? item.label : undefined}
              className={navButtonClass(active)}
            >
              <Icon size={17} />
              {!iconsOnly && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg bg-[#121218] flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-2 py-2 shrink-0">
          {!iconsOnly && (
            <span className="flex items-center gap-2 px-1 text-[12px] font-semibold text-white/60">
              <ListMusic size={15} /> Playlists
            </span>
          )}
          <button onClick={onNewPlaylist} aria-label="New playlist" className={iconButton}>
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-1.5">
          <button
            onClick={() => setView({ kind: "liked" })}
            aria-label="Liked Songs"
            aria-current={view.kind === "liked" ? "page" : undefined}
            title={iconsOnly ? "Liked Songs" : undefined}
            className={`w-full flex items-center gap-2.5 p-1.5 rounded-md transition ${
              view.kind === "liked" ? "bg-white/10" : "hover:bg-white/5"
            } ${iconsOnly ? "justify-center" : ""}`}
          >
            <span
              className={`w-9 h-9 rounded shrink-0 overflow-hidden bg-gradient-to-br ${LIKED_GRADIENT} flex items-center justify-center`}
            >
              <Heart size={15} className="fill-white text-white" />
            </span>
            {!iconsOnly && (
              <span className="min-w-0 text-left">
                <span className="block text-[12px] text-white/90 truncate">Liked Songs</span>
                <span className="block text-[10px] text-white/40">
                  Playlist · {countLabel(likedIds.length, "song")}
                </span>
              </span>
            )}
          </button>

          {playlists.map((playlist) => {
            const active = view.kind === "playlist" && view.id === playlist.id;
            const artwork = playlist.trackIds
              .map((id) => byId.get(id))
              .find((track) => Boolean(track?.artworkUrl))?.artworkUrl;
            return (
              <button
                key={playlist.id}
                onClick={() => setView({ kind: "playlist", id: playlist.id })}
                aria-label={playlist.name}
                aria-current={active ? "page" : undefined}
                title={iconsOnly ? playlist.name : undefined}
                className={`w-full flex items-center gap-2.5 p-1.5 rounded-md transition ${
                  active ? "bg-white/10" : "hover:bg-white/5"
                } ${iconsOnly ? "justify-center" : ""}`}
              >
                <span className="w-9 h-9 rounded shrink-0 overflow-hidden bg-white/5">
                  <CoverArt
                    src={artwork}
                    seed={playlist.id}
                    icon={ListMusic}
                    iconSize={14}
                  />
                </span>
                {!iconsOnly && (
                  <span className="min-w-0 text-left">
                    <span className="block text-[12px] text-white/90 truncate">{playlist.name}</span>
                    <span className="block text-[10px] text-white/40">
                      Playlist · {countLabel(playlist.trackIds.length, "song")}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-white/5 p-1.5">
          <button
            onClick={() => setDialogOpen(true)}
            aria-label="Add from your files"
            title={iconsOnly ? "Add from your files" : undefined}
            className={`w-full flex items-center rounded-md text-[11px] text-white/60 hover:text-white hover:bg-white/5 transition ${
              iconsOnly ? "justify-center py-2" : "gap-2.5 px-2.5 py-2"
            }`}
          >
            <FolderOpen size={15} />
            {!iconsOnly && <span className="truncate">Add from your files</span>}
          </button>
        </div>
      </div>
    </nav>
  );

  /* ------------------------------------------------------------ queue panel */

  const queuePanel = (
    <aside
      aria-label="Play queue"
      className="absolute right-2 top-2 bottom-2 w-[264px] z-20 rounded-lg bg-[#141419] border border-white/10 shadow-2xl flex flex-col"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 shrink-0">
        <ListMusic size={14} className="text-white/50" />
        <span className="text-[12px] font-semibold text-white/85">Queue</span>
        <button
          onClick={clearQueue}
          disabled={queue.length === 0}
          className={`${pill} ml-auto`}
          aria-label="Clear the queue"
        >
          Clear
        </button>
        <button onClick={() => setQueueOpen(false)} aria-label="Close queue" className={iconButton}>
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {queue.length === 0 ? (
          <div className="text-[11px] text-white/35 p-3 leading-relaxed">
            The queue is empty. Play a playlist, a genre or your library and every track lines up
            here.
          </div>
        ) : (
          queue.map((id, index) => {
            const track = byId.get(id);
            if (!track) return null;
            const active = id === currentTrackId;
            return (
              <button
                key={`${id}-${index}`}
                onClick={() => startTracks(queue, index)}
                aria-label={`Play ${track.title}`}
                aria-current={active ? "true" : undefined}
                className={`w-full flex items-center gap-2.5 p-1.5 rounded-md text-left transition ${
                  active ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <span className="w-8 h-8 rounded shrink-0 overflow-hidden bg-white/5">
                  <CoverArt src={track.artworkUrl} seed={track.id} iconSize={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[12px] truncate ${active ? "text-green-400" : "text-white/85"}`}
                  >
                    {track.title}
                  </span>
                  <span className="block text-[10px] text-white/40 truncate">{track.artist}</span>
                </span>
                {index === queueIndex && (
                  <AudioLines size={13} className="text-green-400 shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );

  /* ------------------------------------------------------------ player bar */

  const progressFraction = effectiveDuration > 0 ? Math.min(1, position / effectiveDuration) : 0;
  const bufferedFraction = effectiveDuration > 0 ? Math.min(1, buffered / effectiveDuration) : 0;
  const barMessage = localError ?? playbackError;

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = (event.clientX - rect.left) / rect.width;
    seekTo(effectiveDuration * Math.min(1, Math.max(0, fraction)));
  };

  const openCurrentContext = () => {
    if (!currentTrack) return;
    const owner = playlists.find((p) => p.trackIds.includes(currentTrack.id));
    if (owner) setView({ kind: "playlist", id: owner.id });
    else if (currentTrack.liked) setView({ kind: "liked" });
    else openLibrary();
  };

  const playerBar = (
    <footer
      className="shrink-0 border-t border-white/10 bg-[#0c0c11] px-3 py-2 flex items-center gap-3"
      aria-label="Player"
    >
      <div
        className={`flex items-center gap-2.5 min-w-0 ${compact ? "w-[112px]" : "w-[210px]"} shrink-0`}
      >
        <span className="w-12 h-12 rounded shrink-0 overflow-hidden bg-white/5">
          <CoverArt
            src={currentTrack?.artworkUrl}
            seed={currentTrack?.id ?? "novamusic"}
            iconSize={16}
          />
        </span>
        <div className="min-w-0 flex-1">
          {currentTrack ? (
            <>
              <button
                onClick={openCurrentContext}
                className="block max-w-full text-left text-[12px] text-white/90 truncate hover:underline outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 rounded"
                aria-label={`Show where ${currentTrack.title} lives`}
              >
                {currentTrack.title}
              </button>
              <div className="text-[11px] text-white/45 truncate">{currentTrack.artist}</div>
            </>
          ) : (
            <>
              <div className="text-[12px] text-white/55">Nothing playing</div>
              <div className="text-[11px] text-white/30 truncate">
                {libraryIds.length > 0 ? "Pick a song to start" : "Your library is empty"}
              </div>
            </>
          )}
        </div>
        {currentTrack && !compact && (
          <button
            onClick={() => toggleLike(currentTrack.id)}
            aria-label={
              currentTrack.liked
                ? `Remove ${currentTrack.title} from Liked Songs`
                : `Add ${currentTrack.title} to Liked Songs`
            }
            aria-pressed={currentTrack.liked}
            className={`p-1.5 rounded-full shrink-0 transition ${
              currentTrack.liked ? "text-green-400" : "text-white/45 hover:text-white"
            }`}
          >
            <Heart size={15} className={currentTrack.liked ? "fill-current" : ""} />
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShuffle(!shuffle)}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            className={`p-1.5 rounded-full transition ${
              shuffle ? "text-green-400" : "text-white/50 hover:text-white"
            }`}
          >
            <Shuffle size={15} />
          </button>
          <button
            onClick={goPrevious}
            disabled={!canStep}
            aria-label="Previous track"
            className={iconButton}
          >
            <SkipBack size={16} className="fill-current" />
          </button>
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition shrink-0"
          >
            {playing ? (
              <Pause size={16} className="fill-current" />
            ) : (
              <Play size={16} className="fill-current ml-[1px]" />
            )}
          </button>
          <button
            onClick={goNext}
            disabled={!canGoNext}
            aria-label="Next track"
            className={iconButton}
          >
            <SkipForward size={16} className="fill-current" />
          </button>
          <button
            onClick={cycleRepeat}
            aria-label={repeatLabel(repeat)}
            aria-pressed={repeat !== "off"}
            className={`relative p-1.5 rounded-full transition ${
              repeat === "off" ? "text-white/50 hover:text-white" : "text-green-400"
            }`}
          >
            {repeat === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
            {repeat !== "off" && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-400" />
            )}
          </button>
        </div>

        <div className="w-full max-w-[520px] flex items-center gap-2">
          <span className="text-[10px] text-white/40 tabular-nums w-9 text-right shrink-0">
            {formatTime(position)}
          </span>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(effectiveDuration)}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`${formatTime(position)} of ${formatTime(effectiveDuration)}`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              seekFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons > 0) seekFromPointer(event);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                event.stopPropagation();
                seekBy(SEEK_STEP);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                event.stopPropagation();
                seekBy(-SEEK_STEP);
              } else if (event.key === "Home") {
                event.preventDefault();
                event.stopPropagation();
                seekTo(0);
              } else if (event.key === "End") {
                event.preventDefault();
                event.stopPropagation();
                seekTo(effectiveDuration);
              }
            }}
            className="group relative flex-1 h-4 flex items-center cursor-pointer outline-none"
          >
            <span className="relative w-full h-1 rounded-full bg-white/15 overflow-hidden">
              <span
                className="absolute inset-y-0 left-0 bg-white/20"
                style={{ width: `${bufferedFraction * 100}%` }}
              />
              <span
                className="absolute inset-y-0 left-0 bg-white group-hover:bg-green-400 transition-colors"
                style={{ width: `${progressFraction * 100}%` }}
              />
            </span>
            <span
              className="absolute w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition"
              style={{ left: `calc(${progressFraction * 100}% - 6px)` }}
            />
          </div>
          <span className="text-[10px] text-white/40 tabular-nums w-9 shrink-0">
            {formatTime(effectiveDuration)}
          </span>
        </div>
      </div>

      <div
        className={`flex items-center gap-1 justify-end shrink-0 ${compact ? "" : "w-[180px]"}`}
      >
        <button
          onClick={() => setQueueOpen((open) => !open)}
          aria-label="Queue"
          aria-pressed={queueOpen}
          className={`p-1.5 rounded-full transition ${
            queueOpen ? "text-green-400" : "text-white/50 hover:text-white"
          }`}
        >
          <ListMusic size={16} />
        </button>
        <button
          onClick={() => setQuickSetting("muted", !muted)}
          aria-label={muted || systemVolume === 0 ? "Unmute" : "Mute"}
          className={iconButton}
        >
          {muted || systemVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        {!compact && (
          <input
            type="range"
            min={0}
            max={100}
            value={systemVolume}
            onChange={(event) => {
              // This is the OS volume: Quick Settings and NovaMusic share it.
              setQuickSetting("volume", Number(event.target.value));
              setQuickSetting("muted", false);
            }}
            aria-label="Volume"
            className="w-20 accent-green-500 cursor-pointer"
          />
        )}
      </div>
    </footer>
  );

  /* ----------------------------------------------------------------- render */

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      // Keeps the desktop's own context menu from leaking through the window.
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="relative h-full flex flex-col bg-[#0a0a0e] text-white/85 overflow-hidden outline-none"
    >
      <div className="relative flex-1 min-h-0 flex gap-2 p-2">
        {sidebar}

        <main
          ref={mainRef}
          className="flex-1 min-w-0 overflow-y-auto rounded-lg bg-gradient-to-b from-[#17171f] via-[#101015] to-[#0b0b10]"
        >
          {(notice || barMessage) && (
            <div className="sticky top-0 z-10 px-3 pt-3 space-y-1.5">
              {notice && (
                <div
                  className={`px-3 py-1.5 rounded-md text-[11px] ${
                    notice.kind === "error"
                      ? "bg-red-500/15 text-red-200"
                      : "bg-green-500/15 text-green-200"
                  }`}
                >
                  {notice.message}
                </div>
              )}
              {barMessage && (
                <div className="flex items-start gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 text-amber-100/85 text-[11px]">
                  <TriangleAlert size={13} className="shrink-0 mt-0.5 text-amber-400" />
                  <span className="leading-relaxed">{barMessage}</span>
                </div>
              )}
            </div>
          )}

          {view.kind === "home"
            ? homeView
            : view.kind === "search"
              ? searchView
              : collectionView || (
                  <EmptyState
                    icon={ListMusic}
                    title="That playlist is gone"
                    body="It was deleted. Pick another one from the sidebar."
                  >
                    <button className={pillGreen} onClick={() => setView({ kind: "home" })}>
                      <House size={12} /> Home
                    </button>
                  </EmptyState>
                )}
        </main>

        {queueOpen && queuePanel}
      </div>

      {playerBar}

      {/*
        One element for the whole app. Its src is derived from the store's
        currentTrackId: archive tracks stream cross-origin without CORS (ranged
        requests answer 206, so the seek bar works), local files play from an
        object URL. Volume comes from the OS.
      */}
      <audio
        ref={audioRef}
        src={playbackSrc ?? undefined}
        preload="metadata"
        onPlay={onAudioPlay}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onProgress={onProgress}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onError={onAudioError}
      />

      {dialogOpen && (
        <FileDialog
          mode="open"
          initialDir={MUSIC_DIR}
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
