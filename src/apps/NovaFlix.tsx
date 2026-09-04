import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Plus, Check, Info, ChevronLeft, ChevronRight, ArrowLeft, X, Search, Globe,
  Trash2, LoaderCircle, TriangleAlert, Film, Tv, HardDrive, FolderOpen,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { handleCache, useFsStore } from "../store/fsStore";
import { useWindowStore } from "../store/windowStore";
import { useContextMenuStore } from "../store/contextMenuStore";
import type { ContextMenuItem } from "../store/contextMenuStore";
import {
  GENRES, archivePosterUrl, archiveStreamUrl, continueWatching, fetchArchiveTitle,
  localTitleId, searchArchive, useNovaflixStore, watchedFraction,
} from "../store/novaflixStore";
import type { ArchiveSearchResult, Episode, NewTitle, NovaTitle } from "../store/novaflixStore";
import { baseName, dirName, extOf } from "../lib/fileTypes";
import FileDialog from "../components/FileDialog";

const VIDEO_EXT = ["mp4", "webm", "mkv", "mov", "m4v", "avi"];

/*
 * There is no responsive breakpoint infrastructure in this shell: a window is
 * resized independently of the viewport, so media queries would measure the
 * wrong box. A ResizeObserver on the root element drives this instead.
 */
const COMPACT_MIN = 700; // under this the billboard shrinks and cards get small

const CARD_WIDTH = 168;
const CARD_WIDTH_COMPACT = 116;
/** Posters are 2:3, the shape archive.org's own item images are closest to. */
const POSTER_RATIO = 1.5;

const HERO_HEIGHT = 380;
const HERO_HEIGHT_COMPACT = 230;

/** Seconds of playback between writes to the persisted store. */
const PROGRESS_STEP = 5;
/** Below this a resume isn't worth it; within this of the end, start over. */
const RESUME_MIN = 10;
const RESUME_TAIL = 60;

const POSTER_W = 300;
const POSTER_H = 450;

const ARCHIVE_ROWS = 24;

const PROVENANCE = "Public domain or Creative Commons · Internet Archive";

type Playing = { titleId: string; episodeId?: string };
type Notice = { kind: "info" | "error"; message: string };

const heroButton =
  "flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-semibold transition disabled:opacity-40";
const ghostButton =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/20 text-white/85 transition disabled:opacity-40";
const iconButton = "p-1.5 rounded-full hover:bg-white/10 text-white/60 transition shrink-0";

/* ------------------------------------------------------------------ helpers */

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

const CARD_GRADIENTS = [
  "from-red-900/80 to-red-600/40",
  "from-indigo-900/80 to-sky-700/40",
  "from-emerald-900/80 to-teal-700/40",
  "from-fuchsia-900/80 to-rose-700/40",
  "from-amber-900/80 to-orange-700/40",
  "from-slate-800/90 to-slate-600/50",
];

/** The same title always gets the same placeholder, so it reads as identity. */
const cardGradient = (key: string) => CARD_GRADIENTS[hashString(key) % CARD_GRADIENTS.length];

/** `1:18:20` style, for the player and episode rows. */
const formatDuration = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
};

/** `1h 18m` style, the way a streaming service prints a runtime. */
const formatRuntime = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/** The runtime NovaFlix can prove: the movie's, or the first episode's. */
const titleRuntime = (title: NovaTitle) =>
  title.durationSeconds ?? title.episodes?.[0]?.durationSeconds;

const episodesOfSeason = (title: NovaTitle | null, season: number): Episode[] =>
  (title?.episodes ?? [])
    .filter((episode) => episode.season === season)
    .sort((a, b) => a.episode - b.episode);

const stripExtension = (name: string) => name.replace(/\.[^./]+$/, "") || name;

/**
 * Decodes an early frame of a local video into a portrait JPEG data URL, plus
 * the real duration. The frame is centre-cropped to the poster shape rather
 * than squashed into it. Resolves null for anything the browser can't decode —
 * the only failure that matters, because the card then keeps its gradient.
 *
 * This works because the source is a blob URL from the user's own file: a
 * cross-origin archive.org stream would taint the canvas, which is exactly why
 * archive posters are plain <img> tags instead.
 */
const capturePosterFrame = (
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
        canvas.width = POSTER_W;
        canvas.height = POSTER_H;
        const context = canvas.getContext("2d");
        if (!context) {
          finish(null);
          return;
        }
        const vw = element.videoWidth || POSTER_W;
        const vh = element.videoHeight || POSTER_H;
        const scale = Math.max(POSTER_W / vw, POSTER_H / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        context.drawImage(element, (POSTER_W - dw) / 2, (POSTER_H - dh) / 2, dw, dh);
        finish({ dataUrl: canvas.toDataURL("image/jpeg", 0.72), duration: element.duration });
      } catch {
        // Undecodable frame, or a tainted canvas: fall back to the gradient.
        finish(null);
      }
    };

    const onLoadedData = () => {
      const duration = element.duration;
      // A tenth of the way in avoids black leader frames and studio cards.
      const target = Number.isFinite(duration) ? Math.min(20, duration * 0.1) : 0;
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
    timer = window.setTimeout(() => finish(null), 9000);
    element.load();
  });

/* -------------------------------------------------------------- small parts */

function Wordmark({ compact }: { compact: boolean }) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span
        className="w-6 h-6 rounded-[5px] flex items-center justify-center shrink-0"
        style={{ background: "#e50914" }}
      >
        <Play size={12} className="text-white fill-white ml-[1px]" />
      </span>
      {!compact && (
        <span
          className="text-[15px] font-extrabold tracking-[0.08em] uppercase"
          style={{ color: "#e50914" }}
        >
          NovaFlix
        </span>
      )}
    </span>
  );
}

/**
 * Poster image with a deterministic gradient fallback. archive.org serves these
 * as ordinary JPEGs, so no CORS is involved; a 404 or a rate limit is a normal
 * outcome and the gradient takes over.
 */
function Poster({ src, seed }: { src?: string; seed: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={`absolute inset-0 bg-gradient-to-br ${cardGradient(seed)} flex items-center justify-center`}
      >
        <Film size={18} className="text-white/60" />
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
  title: NovaTitle;
  width: number;
  showProgress?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

function PosterCard({ title, width, showProgress, onOpen, onPlay, onContextMenu }: CardProps) {
  const fraction = showProgress ? watchedFraction(title) : 0;
  const runtime = formatRuntime(titleRuntime(title));

  return (
    <div
      className="group/card relative shrink-0 hover:z-10"
      style={{ width }}
      onContextMenu={onContextMenu}
    >
      <div
        className="relative rounded-md overflow-hidden bg-white/[0.06] ring-1 ring-white/5 transition duration-200 group-hover/card:scale-[1.06] group-hover/card:ring-white/20"
        style={{ height: Math.round(width * POSTER_RATIO) }}
      >
        <Poster src={title.posterUrl} seed={title.id} />

        <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/90 to-transparent" />

        <span className="absolute inset-x-0 bottom-0 p-1.5">
          <span className="block text-[11px] leading-tight font-medium text-white line-clamp-2">
            {title.title}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-white/55 mt-0.5 tabular-nums">
            {title.year ? <span>{title.year}</span> : null}
            {title.year && runtime ? <span className="text-white/25">·</span> : null}
            {runtime ? <span>{runtime}</span> : null}
          </span>
        </span>

        {title.source === "local" && (
          <span className="absolute top-1 left-1 flex items-center gap-1 bg-black/75 text-[9px] px-1 py-0.5 rounded text-white/80">
            <HardDrive size={8} /> your files
          </span>
        )}
        {title.kind === "series" && (
          <span className="absolute top-1 right-1 flex items-center gap-1 bg-black/75 text-[9px] px-1 py-0.5 rounded text-white/80">
            <Tv size={8} /> {title.episodes?.length ?? 0}
          </span>
        )}

        {fraction > 0 && (
          <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/25">
            <span className="block h-full bg-red-600" style={{ width: `${fraction * 100}%` }} />
          </span>
        )}

        <button
          onClick={onOpen}
          aria-label={`More about ${title.title}`}
          className="absolute inset-0 w-full h-full outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded-md"
        />
        <button
          onClick={onPlay}
          aria-label={`Play ${title.title}`}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 transition outline-none"
        >
          <Play size={16} className="fill-current ml-[2px]" />
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  heading: string;
  caption?: string;
  titles: NovaTitle[];
  width: number;
  showProgress?: boolean;
  onOpen: (title: NovaTitle) => void;
  onPlay: (title: NovaTitle) => void;
  onContextMenu: (event: React.MouseEvent, title: NovaTitle) => void;
  trailing?: React.ReactNode;
}

function Row({
  heading, caption, titles, width, showProgress, onOpen, onPlay, onContextMenu, trailing,
}: RowProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  const nudge = (direction: 1 | -1) => {
    const element = stripRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(240, element.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section className="group/row relative mt-5 first:mt-3">
      <div className="px-4 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold text-white/90">{heading}</h2>
        {caption && <span className="text-[10px] text-white/35 truncate">{caption}</span>}
      </div>

      <div className="relative overflow-hidden">
        {/* The negative bottom margin clips the horizontal scrollbar the shell
            styles globally; the padding leaves room for the hover scale. */}
        <div
          ref={stripRef}
          className="flex gap-2 overflow-x-auto px-4 pt-3 pb-4 -mb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {titles.map((title) => (
            <PosterCard
              key={title.id}
              title={title}
              width={width}
              showProgress={showProgress}
              onOpen={() => onOpen(title)}
              onPlay={() => onPlay(title)}
              onContextMenu={(event) => onContextMenu(event, title)}
            />
          ))}
          {trailing}
        </div>

        <button
          onClick={() => nudge(-1)}
          aria-label={`Scroll ${heading} left`}
          className="absolute left-0 top-3 bottom-6 w-9 flex items-center justify-center bg-gradient-to-r from-black/85 to-transparent text-white/80 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => nudge(1)}
          aria-label={`Scroll ${heading} right`}
          className="absolute right-0 top-3 bottom-6 w-9 flex items-center justify-center bg-gradient-to-l from-black/85 to-transparent text-white/80 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}

function GenreChips({ genres }: { genres: string[] }) {
  if (genres.length === 0) {
    return <span className="text-[10px] text-white/30">No genre tags on this item</span>;
  }
  return (
    <>
      {genres.map((genre) => (
        <span
          key={genre}
          className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-white/70 whitespace-nowrap"
        >
          {genre}
        </span>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- the app */

export default function NovaFlix({ windowId, appData }: AppProps) {
  const titles = useNovaflixStore((s) => s.titles);
  const addTitle = useNovaflixStore((s) => s.addTitle);
  const removeTitle = useNovaflixStore((s) => s.removeTitle);
  const toggleMyList = useNovaflixStore((s) => s.toggleMyList);
  const setProgress = useNovaflixStore((s) => s.setProgress);
  const setDuration = useNovaflixStore((s) => s.setDuration);
  const markWatched = useNovaflixStore((s) => s.markWatched);
  const clearProgress = useNovaflixStore((s) => s.clearProgress);
  const setPoster = useNovaflixStore((s) => s.setPoster);

  const nodes = useFsStore((s) => s.nodes);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const [playing, setPlaying] = useState<Playing | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [season, setSeason] = useState(1);
  const [query, setQuery] = useState("");

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveResults, setArchiveResults] = useState<ArchiveSearchResult[] | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [seriesPrompt, setSeriesPrompt] = useState<NewTitle | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [width, setWidth] = useState(0);
  const [heroFailed, setHeroFailed] = useState(false);

  const [localSrc, setLocalSrc] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [captureTick, setCaptureTick] = useState(0);

  /** Chosen once per mount, so the billboard rotates every time it opens. */
  const [heroSeed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedProgressRef = useRef(0);
  const mountedRef = useRef(true);
  const openedPathRef = useRef<string | null>(null);
  const attemptedPostersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ------------------------------------------------------------- measurement */

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

  const compact = width > 0 && width < COMPACT_MIN;
  const cardWidth = compact ? CARD_WIDTH_COMPACT : CARD_WIDTH;
  const heroHeight = compact ? HERO_HEIGHT_COMPACT : HERO_HEIGHT;

  /* ------------------------------------------------------------- selections */

  const current = useMemo(
    () => titles.find((t) => t.id === playing?.titleId) ?? null,
    [titles, playing]
  );
  const currentEpisode = useMemo(
    () => current?.episodes?.find((e) => e.id === playing?.episodeId) ?? null,
    [current, playing]
  );
  const detail = useMemo(() => titles.find((t) => t.id === detailId) ?? null, [titles, detailId]);

  const currentName = current?.title;
  const currentEpisodeName = currentEpisode?.title;

  useEffect(() => {
    const label = currentName
      ? currentEpisodeName
        ? `${currentName} · ${currentEpisodeName}`
        : currentName
      : "NovaFlix";
    setWindowTitle(windowId, `${label} — NovaFlix`);
  }, [windowId, currentName, currentEpisodeName, setWindowTitle]);

  /* ------------------------------------------------------------ transient UI */

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    // Seasons are per-title, so the selector resets with the overlay.
    const target = useNovaflixStore.getState().titles.find((t) => t.id === detailId);
    setSeason(target?.episodes?.[0]?.season ?? 1);
  }, [detailId]);

  /* -------------------------------------------------------------- local file */

  const localPath = current && current.source === "local" ? current.path ?? null : null;

  // Object URL for a local film. Copied from MediaPlayer: the url is declared
  // before the async read so the cleanup can revoke it even while the read is
  // still in flight.
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

  /**
   * The next local title that still needs a poster. Derived as an id string so
   * a progress write (which replaces the `titles` array) can't restart a
   * capture that is already running.
   */
  const pendingPosterId = useMemo(() => {
    // Bumped after each attempt settles, which is what re-runs this search;
    // `attemptedPostersRef` is a ref and therefore not reactive on its own.
    void captureTick;
    const target = titles.find(
      (t) =>
        t.source === "local" &&
        Boolean(t.path) &&
        !t.posterUrl &&
        !attemptedPostersRef.current.has(t.id)
    );
    return target?.id ?? null;
  }, [titles, captureTick]);

  useEffect(() => {
    if (!pendingPosterId) return;
    const target = useNovaflixStore.getState().titles.find((t) => t.id === pendingPosterId);
    const path = target?.path;
    if (!path) return;
    const handle = handleCache.get(path);
    // No live handle means there are no bytes to decode; the gradient stands in.
    if (!handle) return;

    attemptedPostersRef.current.add(pendingPosterId);

    let objectUrl: string | null = null;
    let cancelled = false;
    const element = document.createElement("video");

    void (async () => {
      try {
        const file = await handle.getFile();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file);
        const frame = await capturePosterFrame(element, objectUrl);
        if (cancelled || !frame) return;
        setPoster(pendingPosterId, frame.dataUrl);
        setDuration(pendingPosterId, frame.duration);
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
  }, [pendingPosterId, setPoster, setDuration]);

  /* ------------------------------------------------------------------- lists */

  const catalogue = useMemo(() => [...titles].sort((a, b) => b.addedAt - a.addedAt), [titles]);
  const resume = useMemo(() => continueWatching(titles), [titles]);
  const myList = useMemo(
    () => titles.filter((t) => t.inMyList).sort((a, b) => b.addedAt - a.addedAt),
    [titles]
  );
  /** Real signal only: what has actually been played here, then newest. */
  const trending = useMemo(
    () =>
      [...titles].sort(
        (a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0) || b.addedAt - a.addedAt
      ),
    [titles]
  );
  const byGenre = useMemo(
    () =>
      GENRES.map((genre) => ({
        genre,
        items: titles
          .filter((t) => t.genres.includes(genre))
          .sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
      })).filter((entry) => entry.items.length > 0),
    [titles]
  );
  const fromFiles = useMemo(
    () => titles.filter((t) => t.source === "local").sort((a, b) => b.addedAt - a.addedAt),
    [titles]
  );

  const featured = useMemo(() => {
    const pool = titles.filter((t) => t.source === "archive" && Boolean(t.posterUrl));
    const source = pool.length > 0 ? pool : titles;
    if (source.length === 0) return null;
    return source[heroSeed % source.length];
  }, [titles, heroSeed]);

  const featuredId = featured?.id;
  useEffect(() => {
    setHeroFailed(false);
  }, [featuredId]);

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const searchHits = useMemo(() => {
    if (!needle) return [];
    return catalogue.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        t.genres.some((genre) => genre.toLowerCase().includes(needle)) ||
        String(t.year ?? "").includes(needle) ||
        (t.synopsis ?? "").toLowerCase().includes(needle)
    );
  }, [catalogue, needle]);

  const localSeedPath = useMemo(
    () => titles.find((t) => t.source === "local" && t.path)?.path,
    [titles]
  );

  /* ---------------------------------------------------------------- playback */

  const playTitle = (title: NovaTitle, episode?: Episode) => {
    const chosen =
      episode ??
      (title.kind === "series"
        ? episodesOfSeason(title, title.episodes?.[0]?.season ?? 1)[0]
        : undefined);
    savedProgressRef.current = 0;
    setPlaybackError(null);
    markWatched(title.id);
    setDetailId(null);
    setPlaying({ titleId: title.id, episodeId: chosen?.id });
  };

  /**
   * Removing a playing <video> fires no `pause`, so the last few seconds are
   * flushed here instead — every route out of the player goes through this.
   * Memoised on `playing`, which only changes when the viewer opens or leaves
   * something, so the Escape listener isn't re-bound on every progress write.
   */
  const closePlayer = useCallback(() => {
    const element = videoRef.current;
    const id = playing?.titleId;
    if (element && id && Number.isFinite(element.currentTime)) {
      setProgress(id, element.currentTime);
    }
    setPlaying(null);
    setPlaybackError(null);
    savedProgressRef.current = 0;
  }, [playing, setProgress]);

  // Escape backs out of the deepest layer that's open. FileDialog owns the key
  // while it's up, so this stays out of the way then.
  useEffect(() => {
    if (dialogOpen) return;
    if (!playing && !detailId && !archiveOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (playing) closePlayer();
      else if (detailId) setDetailId(null);
      else setArchiveOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, playing, detailId, archiveOpen, closePlayer]);

  const playbackSrc = useMemo(() => {
    if (!current) return null;
    if (current.source === "local") return localSrc;
    const file = currentEpisode?.file ?? current.file ?? current.episodes?.[0]?.file;
    return file ? archiveStreamUrl(current.id, file) : null;
  }, [current, currentEpisode, localSrc]);

  const onLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!current) return;
    const element = event.currentTarget;
    // The real runtime always wins over the seeded one.
    setDuration(current.id, element.duration, currentEpisode?.id);

    const resumeAt = current.progressSeconds ?? 0;
    // Series progress is stored on the title rather than per episode, so only a
    // movie resumes; and never within a minute of the end, where restarting
    // beats dropping the viewer onto the credits.
    if (
      current.kind === "movie" &&
      resumeAt > RESUME_MIN &&
      Number.isFinite(element.duration) &&
      resumeAt < element.duration - RESUME_TAIL
    ) {
      element.currentTime = resumeAt;
      savedProgressRef.current = resumeAt;
    } else {
      savedProgressRef.current = 0;
    }
  };

  const onTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!current) return;
    const seconds = event.currentTarget.currentTime;
    // timeupdate fires several times a second; only every PROGRESS_STEP seconds
    // of real playback reaches the persisted store.
    if (Math.abs(seconds - savedProgressRef.current) < PROGRESS_STEP) return;
    savedProgressRef.current = seconds;
    setProgress(current.id, seconds);
  };

  const flushProgress = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!current) return;
    const seconds = event.currentTarget.currentTime;
    savedProgressRef.current = seconds;
    setProgress(current.id, seconds);
  };

  const onEnded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!current) return;
    const element = event.currentTarget;
    // Parking the playhead at the end is what drops it out of Continue Watching.
    savedProgressRef.current = element.duration;
    setProgress(current.id, element.duration);
  };

  /** A file opened from File Explorer or the desktop plays straight away. */
  useEffect(() => {
    const path: string | undefined = appData?.path;
    if (!path || openedPathRef.current === path) return;
    openedPathRef.current = path;
    const id = addTitle({
      id: localTitleId(path),
      kind: "movie",
      source: "local",
      title: stripExtension(baseName(path)),
      genres: [],
      path,
    });
    markWatched(id);
    savedProgressRef.current = 0;
    setPlaying({ titleId: id });
  }, [appData?.path, addTitle, markWatched]);

  /* ----------------------------------------------------------------- actions */

  const addLocalPath = (path: string) => {
    const ext = extOf(path);
    if (ext && !VIDEO_EXT.includes(ext)) {
      setNotice({
        kind: "error",
        message: `"${baseName(path)}" isn't a video format NovaFlix recognises.`,
      });
      return;
    }
    const name = stripExtension(baseName(path));
    const id = addTitle({
      id: localTitleId(path),
      kind: "movie",
      source: "local",
      title: name,
      genres: [],
      path,
    });
    setQuery("");
    setArchiveOpen(false);
    setDetailId(id);
    setNotice({ kind: "info", message: `Added "${name}" from your files.` });
  };

  const remove = (id: string) => {
    removeTitle(id);
    setDetailId((value) => (value === id ? null : value));
    setPlaying((value) => (value?.titleId === id ? null : value));
    setNotice({ kind: "info", message: "Removed from your catalogue." });
  };

  const runArchiveSearch = async () => {
    const raw = archiveQuery.trim();
    if (!raw) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const results = await searchArchive(raw, { rows: ARCHIVE_ROWS });
      if (!mountedRef.current) return;
      setArchiveResults(results);
      if (results.length === 0) {
        setArchiveError(`archive.org returned no films for “${raw}”.`);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setArchiveResults([]);
      setArchiveError(
        `The search failed (${(err as Error).message}). archive.org may be unreachable from here.`
      );
    } finally {
      if (mountedRef.current) setArchiveBusy(false);
    }
  };

  const addFromArchive = async (result: ArchiveSearchResult) => {
    const existing = titles.find((t) => t.id === result.identifier);
    if (existing) {
      setNotice({ kind: "info", message: `“${existing.title}” is already in your catalogue.` });
      setDetailId(existing.id);
      return;
    }

    setResolvingId(result.identifier);
    try {
      const draft = await fetchArchiveTitle(result.identifier);
      if (!mountedRef.current) return;
      if (!draft) {
        setNotice({
          kind: "error",
          message: `“${result.title}” has no MP4 with a runtime, so NovaFlix can't play it.`,
        });
        return;
      }

      // The search index sometimes carries a year the item metadata omits.
      const merged: NewTitle = {
        ...draft,
        title: draft.title || result.title,
        year: draft.year ?? result.year,
      };

      if (merged.episodes && merged.episodes.length > 1) {
        // Several video files of different lengths: the user decides whether
        // that is a series or one film, because NovaFlix can't know.
        setSeriesPrompt(merged);
        return;
      }

      const id = addTitle({ ...merged, episodes: undefined });
      setNotice({ kind: "info", message: `Added “${merged.title}” to your catalogue.` });
      setDetailId(id);
    } catch (err) {
      if (mountedRef.current) {
        setNotice({
          kind: "error",
          message: `Couldn't read that item's metadata (${(err as Error).message}).`,
        });
      }
    } finally {
      if (mountedRef.current) setResolvingId(null);
    }
  };

  const resolveSeriesPrompt = (asSeries: boolean) => {
    const draft = seriesPrompt;
    setSeriesPrompt(null);
    if (!draft) return;
    const id = asSeries
      ? addTitle({ ...draft, kind: "series" })
      : addTitle({ ...draft, episodes: undefined });
    setNotice({
      kind: "info",
      message: asSeries
        ? `Added “${draft.title}” with ${draft.episodes?.length ?? 0} episodes.`
        : `Added “${draft.title}” as a single film.`,
    });
    setDetailId(id);
  };

  const openCardMenu = (event: React.MouseEvent, title: NovaTitle) => {
    // Without this the desktop's own menu leaks through the window.
    event.preventDefault();
    event.stopPropagation();
    const items: ContextMenuItem[] = [
      { label: "Play", icon: Play, onClick: () => playTitle(title) },
      { label: "More info", icon: Info, onClick: () => setDetailId(title.id) },
      {
        label: title.inMyList ? "Remove from My List" : "Add to My List",
        icon: title.inMyList ? Check : Plus,
        onClick: () => toggleMyList(title.id),
      },
    ];
    if (title.progressSeconds) {
      items.push({
        label: "Clear watch progress",
        icon: X,
        onClick: () => clearProgress(title.id),
      });
    }
    items.push({ divider: true, label: "", onClick: () => {} });
    items.push({ label: "Remove from catalogue", icon: Trash2, onClick: () => remove(title.id) });
    openMenu(event.clientX, event.clientY, items);
  };

  /* ------------------------------------------------------------------ render */

  const hero = featured && (
    <section
      className="relative shrink-0 w-full overflow-hidden flex flex-col justify-end"
      // A minimum rather than a fixed height: in a narrow window the copy is
      // allowed to push the billboard taller instead of being clipped.
      style={{ minHeight: heroHeight }}
      aria-label="Featured title"
    >
      {featured.posterUrl && !heroFailed ? (
        <img
          src={featured.posterUrl}
          alt=""
          draggable={false}
          onError={() => setHeroFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${cardGradient(featured.id)}`} />
      )}

      {/* Netflix's billboard scrim: dark on the left where the copy sits. */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#08080c] via-[#08080c]/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#08080c] to-transparent" />

      <div
        className="relative px-4 pt-10 pb-6"
        style={{ maxWidth: compact ? "100%" : "60%" }}
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-red-500 font-semibold mb-1.5">
          <Film size={11} /> Featured film
        </div>

        <h1
          className={`font-extrabold leading-[1.05] tracking-tight text-white ${
            compact ? "text-2xl" : "text-4xl"
          }`}
          style={{ userSelect: "text" }}
        >
          {featured.title}
        </h1>

        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {featured.year ? (
            <span className="text-xs text-white/75 tabular-nums font-medium">{featured.year}</span>
          ) : null}
          {titleRuntime(featured) ? (
            <span className="text-xs text-white/50 tabular-nums">
              {formatRuntime(titleRuntime(featured))}
            </span>
          ) : null}
          <GenreChips genres={featured.genres} />
        </div>

        {featured.synopsis && (
          <p
            className={`text-xs leading-relaxed text-white/70 mt-2 ${
              compact ? "line-clamp-2" : "line-clamp-3"
            }`}
            style={{ userSelect: "text" }}
          >
            {featured.synopsis}
          </p>
        )}

        <div className="text-[10px] text-white/35 mt-2">{PROVENANCE}</div>

        <div className="flex items-center gap-2 flex-wrap mt-3">
          <button
            onClick={() => playTitle(featured)}
            className={`${heroButton} bg-white text-black hover:bg-white/85`}
          >
            <Play size={15} className="fill-current" /> Play
          </button>
          <button
            onClick={() => toggleMyList(featured.id)}
            aria-pressed={featured.inMyList}
            className={`${heroButton} bg-white/15 text-white hover:bg-white/25`}
          >
            {featured.inMyList ? <Check size={15} /> : <Plus size={15} />} My List
          </button>
          <button
            onClick={() => setDetailId(featured.id)}
            className={`${heroButton} bg-white/10 text-white/85 hover:bg-white/20`}
          >
            <Info size={15} /> More info
          </button>
        </div>
      </div>
    </section>
  );

  const rows = (
    <div className="pb-8">
      {resume.length > 0 && (
        <Row
          heading="Continue Watching"
          caption="where you actually stopped"
          titles={resume}
          width={cardWidth}
          showProgress
          onOpen={(title) => setDetailId(title.id)}
          onPlay={(title) => playTitle(title)}
          onContextMenu={openCardMenu}
        />
      )}

      <Row
        heading="Trending Now"
        caption="ranked by what's been played on this machine"
        titles={trending}
        width={cardWidth}
        showProgress
        onOpen={(title) => setDetailId(title.id)}
        onPlay={(title) => playTitle(title)}
        onContextMenu={openCardMenu}
      />

      {myList.length > 0 ? (
        <Row
          heading="My List"
          titles={myList}
          width={cardWidth}
          showProgress
          onOpen={(title) => setDetailId(title.id)}
          onPlay={(title) => playTitle(title)}
          onContextMenu={openCardMenu}
        />
      ) : (
        <section className="mt-5 px-4">
          <h2 className="text-[13px] font-semibold text-white/90">My List</h2>
          <p className="text-[11px] text-white/40 mt-1 leading-relaxed max-w-lg">
            Nothing saved yet. Press <span className="text-white/70">＋ My List</span> on the
            billboard, or right-click any poster and add it.
          </p>
        </section>
      )}

      {byGenre.map((entry) => (
        <Row
          key={entry.genre}
          heading={entry.genre}
          titles={entry.items}
          width={cardWidth}
          showProgress
          onOpen={(title) => setDetailId(title.id)}
          onPlay={(title) => playTitle(title)}
          onContextMenu={openCardMenu}
        />
      ))}

      <Row
        heading="From Your Files"
        caption="decoded on this machine"
        titles={fromFiles}
        width={cardWidth}
        showProgress
        onOpen={(title) => setDetailId(title.id)}
        onPlay={(title) => playTitle(title)}
        onContextMenu={openCardMenu}
        trailing={
          <button
            onClick={() => setDialogOpen(true)}
            aria-label="Add from your files"
            className="shrink-0 rounded-md border border-dashed border-white/15 hover:border-white/40 hover:bg-white/[0.04] transition flex flex-col items-center justify-center gap-1.5 text-white/45"
            style={{ width: cardWidth, height: Math.round(cardWidth * POSTER_RATIO) }}
          >
            <FolderOpen size={18} />
            <span className="text-[10px] px-2 text-center leading-snug">Add from your files</span>
          </button>
        }
      />

      <p className="px-4 mt-6 text-[10px] text-white/25 leading-relaxed max-w-2xl">
        Every film in the starting catalogue streams straight from archive.org and is public domain
        or Creative Commons licensed. NovaFlix stores nothing but the identifier, the runtime it
        measured, and where you stopped watching.
      </p>
    </div>
  );

  const results = (
    <div className="px-4 pb-8 pt-3">
      <h2 className="text-[13px] font-semibold text-white/90">
        Results for “{query.trim()}” in your catalogue
      </h2>
      <p className="text-[11px] text-white/40 mt-0.5">
        {searchHits.length} title{searchHits.length === 1 ? "" : "s"} · titles, years, genres and
        synopses are searched
      </p>

      {searchHits.length === 0 ? (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-xs text-white/50 leading-relaxed max-w-md">
            Nothing in your catalogue matches that. archive.org has hundreds of thousands more
            public domain films — search it directly instead.
          </p>
          <button
            onClick={() => {
              setArchiveQuery(query.trim());
              setArchiveOpen(true);
              setQuery("");
            }}
            className={ghostButton}
          >
            <Globe size={13} /> Search the Internet Archive
          </button>
        </div>
      ) : (
        <div
          className="grid gap-2 mt-3"
          style={{
            gridTemplateColumns: `repeat(auto-fill, ${cardWidth}px)`,
            justifyContent: "start",
          }}
        >
          {searchHits.map((title) => (
            <PosterCard
              key={title.id}
              title={title}
              width={cardWidth}
              showProgress
              onOpen={() => setDetailId(title.id)}
              onPlay={() => playTitle(title)}
              onContextMenu={(event) => openCardMenu(event, title)}
            />
          ))}
        </div>
      )}
    </div>
  );

  const archivePanel = (
    <div className="px-4 pb-8 pt-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-red-500 shrink-0" />
          <h2 className="text-[13px] font-semibold text-white/90">Search the Internet Archive</h2>
          <button
            onClick={() => setArchiveOpen(false)}
            aria-label="Close Internet Archive search"
            className={`${iconButton} ml-auto`}
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">
          This is a live query against archive.org's public search API, so the words you type leave
          this machine. Results are limited to items filed as movies; anything you add is resolved
          through the item's own metadata to find a playable MP4.
        </p>

        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center flex-1 min-w-0 bg-white/[0.06] border border-white/10 rounded-md pl-3 pr-1 focus-within:border-white/30 transition">
            <input
              value={archiveQuery}
              onChange={(event) => setArchiveQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runArchiveSearch();
                }
              }}
              // Right-click paste is the whole point of this field.
              onContextMenu={(event) => event.stopPropagation()}
              placeholder="film noir, buster keaton, nosferatu…"
              aria-label="Search archive.org for films"
              className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-white/25 py-2"
            />
            {archiveQuery && (
              <button
                onClick={() => setArchiveQuery("")}
                aria-label="Clear archive search"
                className={iconButton}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => void runArchiveSearch()}
            disabled={archiveBusy || !archiveQuery.trim()}
            className={`${ghostButton} bg-red-600 hover:bg-red-500 text-white shrink-0`}
          >
            {archiveBusy ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : (
              <Search size={13} />
            )}
            Search
          </button>
        </div>

        {archiveError && (
          <div className="flex items-start gap-2 mt-2.5 text-[11px] text-amber-300">
            <TriangleAlert size={13} className="shrink-0 mt-0.5" />
            <span className="leading-relaxed">{archiveError}</span>
          </div>
        )}
      </div>

      {archiveBusy && !archiveResults && (
        <div className="flex items-center gap-2 mt-5 text-xs text-white/45">
          <LoaderCircle size={14} className="animate-spin" /> Asking archive.org…
        </div>
      )}

      {archiveResults && archiveResults.length > 0 && (
        <div
          className="grid gap-2 mt-4"
          style={{
            gridTemplateColumns: `repeat(auto-fill, ${cardWidth}px)`,
            justifyContent: "start",
          }}
        >
          {archiveResults.map((result) => {
            const known = titles.some((t) => t.id === result.identifier);
            const busy = resolvingId === result.identifier;
            return (
              <div key={result.identifier} className="flex flex-col" style={{ width: cardWidth }}>
                <div
                  className="relative rounded-md overflow-hidden bg-white/[0.06] ring-1 ring-white/5"
                  style={{ height: Math.round(cardWidth * POSTER_RATIO) }}
                >
                  <Poster src={archivePosterUrl(result.identifier)} seed={result.identifier} />
                  <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/90 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-1.5 text-[11px] leading-tight text-white line-clamp-2">
                    {result.title}
                  </span>
                </div>

                <div className="text-[10px] text-white/40 mt-1 truncate" title={result.creator}>
                  {result.year ? `${result.year} · ` : ""}
                  {result.creator ?? "creator not listed"}
                </div>

                <button
                  onClick={() => void addFromArchive(result)}
                  disabled={busy}
                  aria-label={known ? `Open ${result.title}` : `Add ${result.title}`}
                  className={`${ghostButton} mt-1.5 justify-center`}
                >
                  {busy ? (
                    <LoaderCircle size={12} className="animate-spin" />
                  ) : known ? (
                    <Check size={12} />
                  ) : (
                    <Plus size={12} />
                  )}
                  {busy ? "Resolving…" : known ? "In catalogue" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const detailOverlay = detail && (
    <div
      className="absolute inset-0 z-30 bg-black/75 flex items-start justify-center p-3 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`${detail.title} details`}
    >
      <div className="w-full max-w-2xl my-auto bg-[#131318] rounded-xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="relative" style={{ height: compact ? 150 : 220 }}>
          <Poster src={detail.posterUrl} seed={detail.id} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131318] via-[#131318]/45 to-transparent" />
          <button
            onClick={() => setDetailId(null)}
            aria-label="Close details"
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-white/80 transition"
          >
            <X size={15} />
          </button>
          <h2
            className={`absolute left-4 right-4 bottom-3 font-extrabold tracking-tight text-white ${
              compact ? "text-xl" : "text-2xl"
            }`}
            style={{ userSelect: "text" }}
          >
            {detail.title}
          </h2>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => playTitle(detail)}
              className={`${heroButton} bg-white text-black hover:bg-white/85`}
            >
              <Play size={15} className="fill-current" /> Play
            </button>
            <button
              onClick={() => toggleMyList(detail.id)}
              aria-pressed={detail.inMyList}
              className={ghostButton}
            >
              {detail.inMyList ? <Check size={13} /> : <Plus size={13} />}
              {detail.inMyList ? "In My List" : "My List"}
            </button>
            {detail.progressSeconds ? (
              <button onClick={() => clearProgress(detail.id)} className={ghostButton}>
                <X size={13} /> Clear progress
              </button>
            ) : null}
            <button
              onClick={() => remove(detail.id)}
              className={`${ghostButton} ml-auto text-red-300 hover:bg-red-500/20`}
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-3">
            {detail.year ? (
              <span className="text-xs text-white/75 tabular-nums font-medium">{detail.year}</span>
            ) : null}
            {detail.kind === "series" ? (
              <span className="flex items-center gap-1 text-xs text-white/55">
                <Tv size={12} /> {detail.episodes?.length ?? 0} episode
                {(detail.episodes?.length ?? 0) === 1 ? "" : "s"}
              </span>
            ) : titleRuntime(detail) ? (
              <span className="text-xs text-white/55 tabular-nums">
                {formatRuntime(titleRuntime(detail))}
              </span>
            ) : null}
            <GenreChips genres={detail.genres} />
          </div>

          {detail.synopsis && (
            <p
              className="text-xs leading-relaxed text-white/65 mt-3 whitespace-pre-line"
              style={{ userSelect: "text" }}
            >
              {detail.synopsis}
            </p>
          )}

          {detail.progressSeconds ? (
            <div className="text-[11px] text-white/45 mt-3">
              Stopped at{" "}
              <span className="tabular-nums text-white/70">
                {formatDuration(detail.progressSeconds)}
              </span>
              {detail.kind === "movie" ? ", and playback resumes there." : "."}
            </div>
          ) : null}

          <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-white/35 leading-relaxed">
            {detail.source === "archive" ? (
              <>
                <div>{PROVENANCE}</div>
                <div className="font-mono text-white/30 break-all mt-0.5" style={{ userSelect: "text" }}>
                  archive.org/details/{detail.id}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <HardDrive size={10} /> Decoded on this machine from the handle NovaOS holds.
                </div>
                <div className="font-mono text-white/30 break-all mt-0.5" style={{ userSelect: "text" }}>
                  {detail.path}
                </div>
              </>
            )}
          </div>

          {detail.kind === "series" && detail.episodes && detail.episodes.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-semibold text-white/85">Episodes</h3>
                <label className="flex items-center gap-1.5 ml-auto text-[11px] text-white/45">
                  Season
                  <select
                    value={season}
                    onChange={(event) => setSeason(Number(event.target.value))}
                    aria-label="Season"
                    className="bg-white/[0.07] border border-white/10 rounded px-1.5 py-1 text-[11px] text-white/80 outline-none"
                  >
                    {[...new Set(detail.episodes.map((episode) => episode.season))]
                      .sort((a, b) => a - b)
                      .map((value) => (
                        <option key={value} value={value} className="bg-[#1b1a26]">
                          {value}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="mt-2 space-y-0.5">
                {episodesOfSeason(detail, season).map((episode) => (
                  <button
                    key={episode.id}
                    onClick={() => playTitle(detail, episode)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.06] transition text-left"
                  >
                    <span className="w-6 text-center text-xs text-white/35 tabular-nums shrink-0">
                      {episode.episode}
                    </span>
                    <span className="w-9 h-9 rounded bg-white/10 flex items-center justify-center shrink-0">
                      <Play size={13} className="text-white/70 fill-current ml-[1px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-xs text-white/85 truncate"
                        style={{ userSelect: "text" }}
                      >
                        {episode.title}
                      </span>
                      <span className="block text-[10px] text-white/35 font-mono truncate">
                        {episode.file}
                      </span>
                    </span>
                    {episode.durationSeconds ? (
                      <span className="text-[11px] text-white/40 tabular-nums shrink-0">
                        {formatRuntime(episode.durationSeconds)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const player = current && (
    <div className="absolute inset-0 z-40 bg-black">
      {playbackSrc ? (
        <video
          key={`${current.id}:${currentEpisode?.id ?? "main"}`}
          ref={videoRef}
          src={playbackSrc}
          poster={current.posterUrl}
          controls
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full bg-black"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onPause={flushProgress}
          onEnded={onEnded}
          onError={() =>
            setPlaybackError(
              current.source === "archive"
                ? "That stream wouldn't play. archive.org may have moved the file, or this browser can't decode it."
                : "This browser couldn't decode that file."
            )
          }
        />
      ) : localError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
          <TriangleAlert size={26} className="text-amber-400 mb-2" />
          <div className="text-xs text-white/60 max-w-sm leading-relaxed">{localError}</div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle size={22} className="text-white/40 animate-spin" />
        </div>
      )}

      {playbackError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-black/85">
          <TriangleAlert size={26} className="text-amber-400 mb-2" />
          <div className="text-xs text-white/65 max-w-sm leading-relaxed">{playbackError}</div>
          <div className="text-[10px] text-white/35 mt-2 font-mono break-all max-w-md">
            {playbackSrc}
          </div>
        </div>
      )}

      {/* Overlaid chrome: the bar itself is click-through so the video keeps its
          own controls, only the back button takes pointer events. */}
      <div className="absolute top-0 left-0 right-0 flex items-start gap-3 p-3 bg-gradient-to-b from-black/85 to-transparent pointer-events-none">
        <button
          onClick={closePlayer}
          aria-label="Back to browse"
          className="pointer-events-auto p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/85 transition shrink-0"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex-1 min-w-0 text-center pt-1">
          <div className="text-sm font-semibold text-white truncate" style={{ userSelect: "text" }}>
            {current.title}
          </div>
          <div className="text-[11px] text-white/50 truncate">
            {currentEpisode
              ? `S${currentEpisode.season} · E${currentEpisode.episode} · ${currentEpisode.title}`
              : current.source === "archive"
                ? PROVENANCE
                : "From your files"}
          </div>
        </div>
        <span className="w-9 shrink-0" aria-hidden="true" />
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="relative h-full flex flex-col bg-[#08080c] text-white/85 overflow-hidden"
      // Keeps the desktop's own context menu from leaking through the window.
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <header className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#08080c]/95 backdrop-blur z-20">
        <button
          onClick={() => {
            setQuery("");
            setArchiveOpen(false);
            setDetailId(null);
            closePlayer();
          }}
          aria-label="NovaFlix home"
          className="outline-none"
        >
          <Wordmark compact={compact} />
        </button>

        <div className="flex-1 flex justify-center min-w-0 px-1">
          <div className="flex items-center w-full max-w-sm bg-white/[0.06] border border-white/10 rounded-md pl-3 pr-0.5 focus-within:border-white/30 transition">
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setArchiveOpen(false);
              }}
              // Let the browser's own menu through here, so right-click paste works.
              onContextMenu={(event) => event.stopPropagation()}
              placeholder="Search your catalogue"
              aria-label="Search your catalogue"
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

        <button
          onClick={() => {
            setArchiveOpen((open) => !open);
            setQuery("");
          }}
          aria-pressed={archiveOpen}
          aria-label="Search the Internet Archive"
          className={`${ghostButton} shrink-0 ${archiveOpen ? "bg-red-600 hover:bg-red-500 text-white" : ""}`}
        >
          <Globe size={13} /> {!compact && "Internet Archive"}
        </button>
        <button
          onClick={() => setDialogOpen(true)}
          aria-label="Add from your files"
          className={`${ghostButton} shrink-0`}
        >
          <FolderOpen size={13} /> {!compact && "Add from your files"}
        </button>
      </header>

      {notice && (
        <div
          className={`shrink-0 px-3 py-1.5 text-[11px] border-b border-white/10 ${
            notice.kind === "error"
              ? "bg-red-500/15 text-red-200"
              : "bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {notice.message}
        </div>
      )}

      {seriesPrompt && (
        <div className="shrink-0 px-3 py-2.5 border-b border-white/10 bg-white/[0.04]">
          <div className="flex items-start gap-2">
            <Tv size={14} className="text-white/50 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-white/70 leading-relaxed">
                “{seriesPrompt.title}” holds {seriesPrompt.episodes?.length ?? 0} video files of
                different lengths. Those are either separate episodes or separate cuts — NovaFlix
                can't tell, so you choose.
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => resolveSeriesPrompt(true)} className={ghostButton}>
                  <Tv size={12} /> Add as a series
                </button>
                <button onClick={() => resolveSeriesPrompt(false)} className={ghostButton}>
                  <Film size={12} /> Add as one film
                </button>
              </div>
            </div>
            <button
              onClick={() => setSeriesPrompt(null)}
              aria-label="Cancel adding this item"
              className={iconButton}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto">
        {archiveOpen ? (
          archivePanel
        ) : searching ? (
          results
        ) : titles.length === 0 ? (
          <div className="flex flex-col items-center text-center px-8 py-16">
            <span className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
              <Film size={24} className="text-white/35" />
            </span>
            <div className="text-sm text-white/75 mb-1">Your catalogue is empty</div>
            <div className="text-xs text-white/45 max-w-sm leading-relaxed">
              NovaFlix starts with twelve public domain films, but you removed them all. Search the
              Internet Archive for more, or bring in a video file from the filesystem.
            </div>
            <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
              <button onClick={() => setArchiveOpen(true)} className={ghostButton}>
                <Globe size={13} /> Search the Internet Archive
              </button>
              <button onClick={() => setDialogOpen(true)} className={ghostButton}>
                <FolderOpen size={13} /> Add from your files
              </button>
            </div>
          </div>
        ) : (
          <>
            {hero}
            {rows}
          </>
        )}
      </main>

      {detailOverlay}
      {player}

      {dialogOpen && (
        <FileDialog
          mode="open"
          initialDir={localSeedPath ? dirName(localSeedPath) : "/home/user/videos"}
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
