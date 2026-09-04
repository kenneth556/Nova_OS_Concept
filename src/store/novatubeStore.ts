import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { throttledLocalStorage } from "../lib/persistStorage";

export type VideoSource = "youtube" | "local";

export interface NovaVideo {
  id: string; // youtube id, or "local:<path>"
  source: VideoSource;
  title: string;
  channel: string;
  /** Virtual filesystem path, local videos only. */
  path?: string;
  /** Data-URL thumbnail captured from a local video's first frames. */
  thumbnail?: string;
  durationSeconds?: number;
  addedAt: number;
  views: number; // real local watch count, never fabricated
  liked: boolean;
  /** Seconds watched, so playback can resume. */
  progressSeconds?: number;
}

export interface HistoryEntry {
  videoId: string;
  watchedAt: number;
}

/**
 * What a caller has to hand to `addVideo`. The bookkeeping fields default here
 * so no call site has to invent a view count.
 */
export type NewVideo = Omit<NovaVideo, "addedAt" | "views" | "liked"> &
  Partial<Pick<NovaVideo, "addedAt" | "views" | "liked">>;

const HISTORY_LIMIT = 200;

/* --------------------------------------------------------------- youtube ids */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Hosts whose URLs can carry a video id. */
const YOUTUBE_HOSTS = [
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
];

/** Path prefixes that put the id in the first segment after them. */
const PATH_FORMS = ["embed", "shorts", "live", "v"];

/**
 * Accepts `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`,
 * `youtube.com/shorts/ID`, and a bare 11-character id. Anything else is null.
 */
export const parseYouTubeId = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // A bare id has to be checked first: it would otherwise parse as a hostname.
  if (YOUTUBE_ID.test(trimmed)) return trimmed;

  // Give the URL parser a scheme so "youtu.be/xyz" works as typed.
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(absolute);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const candidate = segments[0] ?? "";
    return YOUTUBE_ID.test(candidate) ? candidate : null;
  }

  if (!YOUTUBE_HOSTS.includes(host)) return null;

  const query = url.searchParams.get("v");
  if (query && YOUTUBE_ID.test(query)) return query;

  if (PATH_FORMS.includes(segments[0] ?? "")) {
    const candidate = segments[1] ?? "";
    return YOUTUBE_ID.test(candidate) ? candidate : null;
  }

  return null;
};

/**
 * Embeddable player URL. The `-nocookie` host sends neither `X-Frame-Options`
 * nor a `frame-ancestors` directive, so unlike `youtube.com/watch` it loads
 * inside an iframe.
 */
export const youtubeEmbedUrl = (id: string): string =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;

export const youtubeWatchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;

/** `mq` is 320x180, `hq` is 480x360. Plain <img> sources, no CORS involved. */
export const youtubeThumbnailUrl = (id: string, quality: "mq" | "hq" = "mq"): string =>
  `https://img.youtube.com/vi/${id}/${quality}default.jpg`;

/** Local videos are keyed by path, so the same file can never be added twice. */
export const localVideoId = (path: string): string => `local:${path}`;

export interface YouTubeMetadata {
  title: string;
  channel: string;
}

/**
 * Resolves a human title and channel for a video id.
 *
 * THIRD PARTY REQUEST: this sends the YouTube watch URL to noembed.com.
 * YouTube's own oEmbed endpoint returns no `Access-Control-Allow-Origin`, so a
 * browser cannot read it; noembed does send `*`. Failure is a normal outcome
 * here — the caller falls back to showing the bare video id as the title.
 */
export const fetchYouTubeMetadata = async (id: string): Promise<YouTubeMetadata | null> => {
  try {
    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(youtubeWatchUrl(id))}`;
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      error?: string;
    };
    if (!data || data.error || !data.title) return null;
    return { title: data.title, channel: data.author_name?.trim() || "Unknown channel" };
  } catch {
    // Offline, blocked, rate limited, or CORS: all handled the same way.
    return null;
  }
};

/* ------------------------------------------------------------------ seed data */

/**
 * Six videos verified to exist and to be embeddable. Everything else about them
 * (views, likes, progress) is local and starts empty.
 */
const SEED: Array<{ id: string; title: string; channel: string }> = [
  {
    id: "aqz-KE-bpKQ",
    title: "Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film",
    channel: "Blender",
  },
  { id: "jNQXAC9IVRw", title: "Me at the zoo", channel: "jawed" },
  {
    id: "LXb3EKWsInQ",
    title: "COSTA RICA IN 4K 60fps HDR (ULTRA HD)",
    channel: "Jacob + Katie Schwarz",
  },
  {
    id: "hFZFjoX2cGg",
    title: "Backyard Squirrel Maze 1.0- Ninja Warrior Course",
    channel: "Mark Rober",
  },
  {
    id: "ZbZSe6N_BXs",
    title: "Pharrell Williams - Happy (Official Video)",
    channel: "PharrellWilliamsVEVO",
  },
  {
    id: "dQw4w9WgXcQ",
    title: "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
    channel: "Rick Astley",
  },
];

const SEEDED_AT = Date.now();

/**
 * All seeded in one go; the one-minute stagger only keeps "recently added"
 * ordering stable instead of leaving six identical timestamps to tie-break.
 */
const SEED_VIDEOS: NovaVideo[] = SEED.map(
  (entry, index): NovaVideo => ({
    ...entry,
    source: "youtube",
    addedAt: SEEDED_AT - index * 60_000,
    views: 0,
    liked: false,
  })
);

/* ---------------------------------------------------------------------- store */

interface NovatubeStore {
  videos: NovaVideo[];
  history: HistoryEntry[];
  /** Channel names, matched against `NovaVideo.channel`. */
  subscriptions: string[];

  /** Adds unless the id is already known. Returns the id either way. */
  addVideo: (video: NewVideo) => string;
  removeVideo: (id: string) => void;
  /** One real play: bumps the view count and records the watch. */
  recordView: (id: string) => void;
  setProgress: (id: string, seconds: number) => void;
  toggleLike: (id: string) => void;
  toggleSubscribe: (channel: string) => void;
  setThumbnail: (id: string, dataUrl: string) => void;
  setDuration: (id: string, seconds: number) => void;
  clearHistory: () => void;
}

export const useNovatubeStore = create<NovatubeStore>()(
  persist(
    (set, get) => {
      /** Applies `fn` to one video, skipping the write when nothing changed. */
      const patchVideo = (id: string, fn: (video: NovaVideo) => NovaVideo) =>
        set((s) => {
          const target = s.videos.find((v) => v.id === id);
          if (!target) return s;
          const next = fn(target);
          if (next === target) return s;
          return { videos: s.videos.map((v) => (v.id === id ? next : v)) };
        });

      return {
        videos: SEED_VIDEOS,
        history: [],
        subscriptions: [],

        addVideo: (video) => {
          const existing = get().videos.find((v) => v.id === video.id);
          if (existing) return existing.id;

          const entry: NovaVideo = {
            ...video,
            addedAt: video.addedAt ?? Date.now(),
            views: video.views ?? 0,
            liked: video.liked ?? false,
          };
          set((s) => ({ videos: [entry, ...s.videos] }));
          return entry.id;
        },

        removeVideo: (id) =>
          set((s) => ({
            videos: s.videos.filter((v) => v.id !== id),
            history: s.history.filter((h) => h.videoId !== id),
          })),

        recordView: (id) =>
          set((s) => {
            if (!s.videos.some((v) => v.id === id)) return s;
            const entry: HistoryEntry = { videoId: id, watchedAt: Date.now() };
            // Replaying the same video updates the newest entry instead of
            // stacking duplicates, the way a real watch history behaves.
            const history =
              s.history[0]?.videoId === id
                ? [entry, ...s.history.slice(1)]
                : [entry, ...s.history].slice(0, HISTORY_LIMIT);
            return {
              videos: s.videos.map((v) => (v.id === id ? { ...v, views: v.views + 1 } : v)),
              history,
            };
          }),

        setProgress: (id, seconds) => {
          if (!Number.isFinite(seconds)) return;
          const rounded = Math.max(0, Math.round(seconds));
          patchVideo(id, (v) =>
            v.progressSeconds === rounded ? v : { ...v, progressSeconds: rounded }
          );
        },

        toggleLike: (id) => patchVideo(id, (v) => ({ ...v, liked: !v.liked })),

        toggleSubscribe: (channel) =>
          set((s) => {
            const name = channel.trim();
            if (!name) return s;
            return s.subscriptions.includes(name)
              ? { subscriptions: s.subscriptions.filter((c) => c !== name) }
              : { subscriptions: [...s.subscriptions, name] };
          }),

        setThumbnail: (id, dataUrl) =>
          patchVideo(id, (v) => (v.thumbnail === dataUrl ? v : { ...v, thumbnail: dataUrl })),

        setDuration: (id, seconds) => {
          if (!Number.isFinite(seconds) || seconds <= 0) return;
          const rounded = Math.round(seconds);
          patchVideo(id, (v) =>
            v.durationSeconds === rounded ? v : { ...v, durationSeconds: rounded }
          );
        },

        clearHistory: () => set({ history: [] }),
      };
    },
    {
      name: "novatube-store",
      version: 1,
      // Watch progress and captured thumbnails are written while a video plays,
      // so the writes get coalesced like every other store in the project.
      storage: createJSONStorage(() => throttledLocalStorage),
    }
  )
);
