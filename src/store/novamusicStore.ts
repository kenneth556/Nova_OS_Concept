import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { throttledLocalStorage } from "../lib/persistStorage";

export type TrackSource = "archive" | "local";
export type RepeatMode = "off" | "all" | "one";

export interface Track {
  /** `"<identifier>/<file>"` for Archive tracks, `"local:<path>"` for files. */
  id: string;
  source: TrackSource;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  /** Internet Archive item identifier, archive tracks only. */
  identifier?: string;
  /** File name inside that item, archive tracks only. */
  file?: string;
  /** Virtual filesystem path, local tracks only. */
  path?: string;
  artworkUrl?: string;
  durationSeconds?: number;
  addedAt: number;
  liked: boolean;
  /** Real local play count. Never seeded, never invented. */
  plays: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

/** A resolved track before the local bookkeeping fields exist. */
export type TrackDraft = Omit<Track, "addedAt" | "liked" | "plays">;

/**
 * What a caller hands to `addTrack`. The bookkeeping fields default here so no
 * call site has to invent a play count.
 */
export type NewTrack = TrackDraft & Partial<Pick<Track, "addedAt" | "liked" | "plays">>;

/**
 * What `next()` and `previous()` tell the caller to do with the audio element.
 * The store owns the queue position; the component owns the element, so a move
 * that lands on the track already loaded has to be reported as a restart.
 */
export type QueueMove = "advanced" | "restart" | "stopped";

const RECENT_LIMIT = 50;
const SEARCH_ROWS = 24;

/* --------------------------------------------------------------- archive.org */

/**
 * Direct media URL. Encoding the file name is mandatory: these names contain
 * spaces, apostrophes and quotes. Cross-origin `<audio src>` playback needs no
 * CORS header, and the endpoint answers ranged requests with 206, so the seek
 * bar works against it.
 */
export const archiveAudioUrl = (identifier: string, file: string): string =>
  `https://archive.org/download/${identifier}/${encodeURIComponent(file)}`;

/** Item thumbnail, served as JPEG. A plain <img> with an onError fallback. */
export const archiveArtworkUrl = (identifier: string): string =>
  `https://archive.org/services/img/${identifier}`;

export const archiveTrackId = (identifier: string, file: string): string =>
  `${identifier}/${file}`;

/** Local tracks are keyed by path, so the same file can never be added twice. */
export const localTrackId = (path: string): string => `local:${path}`;

/**
 * Archive `length` fields come in two shapes: seconds as a string (`"182.26"`)
 * and clock time (`"3:02"`, occasionally `"1:02:30"`). Returns undefined for
 * anything unusable, which is how a derivative that is still being generated
 * gets skipped.
 */
export const parseArchiveLength = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length > 3) return undefined;
    let seconds = 0;
    for (const part of parts) {
      const chunk = Number(part);
      if (!Number.isFinite(chunk) || chunk < 0) return undefined;
      seconds = seconds * 60 + chunk;
    }
    return seconds > 0 ? seconds : undefined;
  }

  const plain = Number(trimmed);
  return Number.isFinite(plain) && plain > 0 ? plain : undefined;
};

/**
 * Archive metadata fields are a string, a number, or an array of either,
 * depending on how many values the item carries. Takes the first usable one.
 */
const firstValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstValue(entry);
      if (found) return found;
    }
  }
  return undefined;
};

export interface ArchiveResult {
  identifier: string;
  title: string;
  creator: string;
  year?: string;
}

const advancedSearchUrl = (query: string, rows: number): string =>
  `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}` +
  "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year" +
  `&sort[]=downloads+desc&rows=${rows}&page=1&output=json`;

/**
 * Live search against the Internet Archive.
 *
 * THIRD PARTY REQUEST: the query string leaves this machine for archive.org.
 * That endpoint does send `Access-Control-Allow-Origin: *`, so unlike most
 * media APIs a browser can read the response.
 *
 * Searches are scoped to `mediatype:audio` first inside `collection:georgeblood`
 * — a digitised 78rpm archive with one item per song and a real artist credit,
 * which is what makes song-level results possible — and widened to all audio
 * only when that finds nothing. Throws when the request itself fails, so the
 * caller can tell "no matches" apart from "offline".
 */
export const searchArchiveAudio = async (
  query: string,
  rows: number = SEARCH_ROWS
): Promise<ArchiveResult[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  /** Resolves the docs, or null when the request failed outright. */
  const run = async (scope: string): Promise<ArchiveResult[] | null> => {
    try {
      const response = await fetch(advancedSearchUrl(scope, rows), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { response?: { docs?: unknown } };
      const docs = data.response?.docs;
      if (!Array.isArray(docs)) return null;

      const results: ArchiveResult[] = [];
      for (const doc of docs) {
        const record = doc as Record<string, unknown>;
        const identifier = firstValue(record.identifier);
        if (!identifier) continue;
        results.push({
          identifier,
          title: firstValue(record.title) ?? identifier,
          creator: firstValue(record.creator) ?? "Unknown artist",
          year: firstValue(record.year),
        });
      }
      return results;
    } catch {
      // Offline, blocked, timed out, or malformed JSON: all the same to a caller.
      return null;
    }
  };

  const songs = await run(`${trimmed} AND mediatype:audio AND collection:georgeblood`);
  if (songs && songs.length > 0) return songs;

  const wider = await run(`${trimmed} AND mediatype:audio`);
  if (wider) return wider;
  // The scoped search worked and simply had no matches.
  if (songs) return songs;

  throw new Error("The Internet Archive search request failed.");
};

interface ArchiveFile {
  name?: unknown;
  format?: unknown;
  size?: unknown;
  length?: unknown;
}

/**
 * Resolves an item identifier into a playable track draft.
 *
 * THIRD PARTY REQUEST: `archive.org/metadata/<identifier>`, which also sends
 * `Access-Control-Allow-Origin: *`. HEAD is answered with 405 there, so this is
 * always a GET. Returns null when the item holds no MP3 with a known length —
 * a collection page or a lossless-only item — and throws when the request fails.
 */
export const fetchArchiveTrack = async (identifier: string): Promise<TrackDraft | null> => {
  let payload: { metadata?: Record<string, unknown>; files?: unknown };

  try {
    const response = await fetch(
      `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
      { signal: AbortSignal.timeout(12_000) }
    );
    if (!response.ok) throw new Error(`the Internet Archive replied ${response.status}`);
    payload = (await response.json()) as { metadata?: Record<string, unknown>; files?: unknown };
  } catch (err) {
    throw new Error(`Couldn't read the Internet Archive metadata (${(err as Error).message}).`);
  }

  const files: ArchiveFile[] = Array.isArray(payload.files) ? payload.files : [];

  let chosen: { name: string; length: number } | null = null;
  for (const entry of files) {
    const name = typeof entry.name === "string" ? entry.name : "";
    if (!name.toLowerCase().endsWith(".mp3")) continue;
    const length = parseArchiveLength(entry.length);
    // No length means the derivative is still being generated: unplayable now.
    if (length === undefined) continue;
    chosen = { name, length };
    break;
  }
  if (!chosen) return null;

  const metadata = payload.metadata ?? {};
  return {
    id: archiveTrackId(identifier, chosen.name),
    source: "archive",
    title: firstValue(metadata.title) ?? identifier,
    artist: firstValue(metadata.creator) ?? "Unknown artist",
    album: firstValue(metadata.album),
    genre: firstValue(metadata.genre),
    identifier,
    file: chosen.name,
    artworkUrl: archiveArtworkUrl(identifier),
    durationSeconds: Math.round(chosen.length),
  };
};

/* ------------------------------------------------------------------ seed data */

interface SeedEntry {
  identifier: string;
  title: string;
  artist: string;
  file: string;
  /** Exactly as the Archive prints it: seconds, or clock time. */
  length: string;
  genre: string;
}

/**
 * Seven public-domain 78rpm transfers from the George Blood collection. Every
 * identifier, file name and length below was verified against the item
 * metadata; everything else about them (plays, likes) is local and starts at
 * zero.
 */
const SEED: SeedEntry[] = [
  {
    identifier: "78_maple-leaf-rag_fred-van-eps-robert-van-eps-joplin_gbia0028228a",
    title: "Maple Leaf Rag",
    artist: "Fred Van Eps",
    file: "Maple Leaf Rag - Fred Van Eps - Robert Van Eps.mp3",
    length: "2:20",
    genre: "Ragtime",
  },
  {
    identifier:
      "78_im-in-the-mood-for-love_coleman-hawkins-and-his-quintet-teddy-wilson-fields-mchugh_gbia0003952b",
    title: "I'm In The Mood For Love",
    artist: "Coleman Hawkins and his Quintet",
    file: "I'm In The Mood For Love - Coleman Hawkins and his Quintet.mp3",
    length: "3:22",
    genre: "Jazz",
  },
  {
    identifier: "78_mr-sandman_the-chordettes-archie-bleyer-pat-ballard-archie-ballard_gbia0017988b",
    title: "Mr. Sandman",
    artist: "The Chordettes",
    file: "Mr. Sandman - The Chordettes - Archie Bleyer.mp3",
    length: "2:31",
    genre: "Vocal",
  },
  {
    identifier: "78_house-of-the-rising-sun_josh-white-and-his-guitar_gbia0001628b",
    title: "House Of The Rising Sun",
    artist: "Josh White",
    file: "House Of The Rising Sun - Josh White and his Guitar-restored.mp3",
    length: "182",
    genre: "Blues",
  },
  {
    identifier: "78_take-the-a-train_glenn-miller-and-his-orchestra-strayhorn_gbia0011406b",
    title: 'Take the "A" Train',
    artist: "Glenn Miller and His Orchestra",
    file: "Take the _A_ Train - Glenn Miller and His Orchestra-restored.mp3",
    length: "205",
    genre: "Swing",
  },
  {
    identifier: "78_sing-sing-sing-with-a-swing_louis-prima-and-his-orchestra-jimmy-vincent_gbia0003798b",
    title: "Sing, Sing, Sing (With A Swing)",
    artist: "Louis Prima and his Orchestra",
    file: "Sing, Sing, Sing (With A Swing) - Louis Prima and his Orchestra.mp3",
    length: "3:02",
    genre: "Swing",
  },
  {
    identifier: "78_rhapsody-in-blue_george-gershwin_gbia0298394a",
    title: "Rhapsody in Blue",
    artist: "George Gershwin",
    file: "RHAPSODY IN BLUE - GEORGE GERSHWIN.mp3",
    length: "283",
    genre: "Classical",
  },
];

const SEEDED_AT = Date.now();

const SEED_TRACKS: Track[] = SEED.map(
  (entry, index): Track => ({
    id: archiveTrackId(entry.identifier, entry.file),
    source: "archive",
    title: entry.title,
    artist: entry.artist,
    genre: entry.genre,
    identifier: entry.identifier,
    file: entry.file,
    artworkUrl: archiveArtworkUrl(entry.identifier),
    durationSeconds: parseArchiveLength(entry.length),
    // The one-minute stagger only keeps "recently added" ordering stable
    // instead of leaving seven identical timestamps to tie-break.
    addedAt: SEEDED_AT - index * 60_000,
    liked: false,
    plays: 0,
  })
);

export const SEED_PLAYLIST_ID = "novamusic-jazz-standards";

const SEED_PLAYLISTS: Playlist[] = [
  {
    id: SEED_PLAYLIST_ID,
    name: "Jazz & Standards",
    trackIds: SEED_TRACKS.map((track) => track.id),
    createdAt: SEEDED_AT,
  },
];

const newPlaylistId = (): string =>
  `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Picks a random index that isn't the one already playing. */
const randomOtherIndex = (length: number, current: number): number => {
  if (length <= 1) return 0;
  let index = current;
  while (index === current) index = Math.floor(Math.random() * length);
  return index;
};

/* ----------------------------------------------------------------------- store */

interface NovamusicStore {
  tracks: Track[];
  playlists: Playlist[];
  /** Track ids, in play order. */
  queue: string[];
  queueIndex: number;
  currentTrackId: string | null;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Track ids, newest first, capped at 50. */
  recentlyPlayed: string[];

  /** Adds unless the id is already known. Returns the id either way. */
  addTrack: (track: NewTrack) => string;
  removeTrack: (id: string) => void;
  toggleLike: (id: string) => void;
  /** One real play: bumps the count and records it as recently played. */
  recordPlay: (id: string) => void;
  setDuration: (id: string, seconds: number) => void;
  setArtwork: (id: string, url: string) => void;

  createPlaylist: (name: string, trackIds?: string[]) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, trackId: string) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;

  /** Replaces the queue and starts at `startIndex`. Returns the started id. */
  playQueue: (trackIds: string[], startIndex?: number) => string | null;
  next: () => QueueMove;
  previous: () => QueueMove;
  setShuffle: (value: boolean) => void;
  cycleRepeat: () => void;
  clearQueue: () => void;
}

export const useNovamusicStore = create<NovamusicStore>()(
  persist(
    (set, get) => {
      /** Applies `fn` to one track, skipping the write when nothing changed. */
      const patchTrack = (id: string, fn: (track: Track) => Track) =>
        set((s) => {
          const target = s.tracks.find((t) => t.id === id);
          if (!target) return s;
          const next = fn(target);
          if (next === target) return s;
          return { tracks: s.tracks.map((t) => (t.id === id ? next : t)) };
        });

      return {
        tracks: SEED_TRACKS,
        playlists: SEED_PLAYLISTS,
        queue: [],
        queueIndex: 0,
        currentTrackId: null,
        shuffle: false,
        repeat: "off",
        recentlyPlayed: [],

        addTrack: (track) => {
          const existing = get().tracks.find((t) => t.id === track.id);
          if (existing) return existing.id;

          const entry: Track = {
            ...track,
            addedAt: track.addedAt ?? Date.now(),
            liked: track.liked ?? false,
            plays: track.plays ?? 0,
          };
          set((s) => ({ tracks: [entry, ...s.tracks] }));
          return entry.id;
        },

        removeTrack: (id) =>
          set((s) => {
            if (!s.tracks.some((t) => t.id === id)) return s;

            const removedAt = s.queue.indexOf(id);
            const queue = s.queue.filter((entry) => entry !== id);

            // The queue pointer has to keep pointing at whatever was playing.
            let queueIndex = s.queueIndex;
            let currentTrackId = s.currentTrackId;
            if (currentTrackId === id) {
              // Playback stops: there is nothing left to decode for this row.
              currentTrackId = null;
              if (removedAt >= 0) queueIndex = removedAt;
            } else if (currentTrackId) {
              const found = queue.indexOf(currentTrackId);
              if (found >= 0) queueIndex = found;
            }
            queueIndex = queue.length === 0 ? 0 : Math.min(queueIndex, queue.length - 1);

            return {
              tracks: s.tracks.filter((t) => t.id !== id),
              playlists: s.playlists.map((p) =>
                p.trackIds.includes(id)
                  ? { ...p, trackIds: p.trackIds.filter((entry) => entry !== id) }
                  : p
              ),
              queue,
              queueIndex,
              currentTrackId,
              recentlyPlayed: s.recentlyPlayed.filter((entry) => entry !== id),
            };
          }),

        toggleLike: (id) => patchTrack(id, (t) => ({ ...t, liked: !t.liked })),

        recordPlay: (id) =>
          set((s) => {
            if (!s.tracks.some((t) => t.id === id)) return s;
            return {
              tracks: s.tracks.map((t) => (t.id === id ? { ...t, plays: t.plays + 1 } : t)),
              recentlyPlayed: [id, ...s.recentlyPlayed.filter((entry) => entry !== id)].slice(
                0,
                RECENT_LIMIT
              ),
            };
          }),

        setDuration: (id, seconds) => {
          if (!Number.isFinite(seconds) || seconds <= 0) return;
          const rounded = Math.round(seconds);
          patchTrack(id, (t) =>
            t.durationSeconds === rounded ? t : { ...t, durationSeconds: rounded }
          );
        },

        setArtwork: (id, url) => {
          if (!url) return;
          patchTrack(id, (t) => (t.artworkUrl === url ? t : { ...t, artworkUrl: url }));
        },

        createPlaylist: (name, trackIds) => {
          const known = new Set(get().tracks.map((t) => t.id));
          const seen = new Set<string>();
          const entry: Playlist = {
            id: newPlaylistId(),
            name: name.trim() || "New playlist",
            trackIds: (trackIds ?? []).filter((id) => {
              if (!known.has(id) || seen.has(id)) return false;
              seen.add(id);
              return true;
            }),
            createdAt: Date.now(),
          };
          set((s) => ({ playlists: [...s.playlists, entry] }));
          return entry.id;
        },

        renamePlaylist: (id, name) =>
          set((s) => {
            const trimmed = name.trim();
            if (!trimmed) return s;
            const target = s.playlists.find((p) => p.id === id);
            if (!target || target.name === trimmed) return s;
            return {
              playlists: s.playlists.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
            };
          }),

        deletePlaylist: (id) =>
          set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),

        addToPlaylist: (playlistId, trackId) =>
          set((s) => {
            if (!s.tracks.some((t) => t.id === trackId)) return s;
            const target = s.playlists.find((p) => p.id === playlistId);
            if (!target || target.trackIds.includes(trackId)) return s;
            return {
              playlists: s.playlists.map((p) =>
                p.id === playlistId ? { ...p, trackIds: [...p.trackIds, trackId] } : p
              ),
            };
          }),

        removeFromPlaylist: (playlistId, trackId) =>
          set((s) => {
            const target = s.playlists.find((p) => p.id === playlistId);
            if (!target || !target.trackIds.includes(trackId)) return s;
            return {
              playlists: s.playlists.map((p) =>
                p.id === playlistId
                  ? { ...p, trackIds: p.trackIds.filter((entry) => entry !== trackId) }
                  : p
              ),
            };
          }),

        playQueue: (trackIds, startIndex = 0) => {
          const known = get().tracks;
          const ids = trackIds.filter((id) => known.some((t) => t.id === id));
          if (ids.length === 0) {
            set({ queue: [], queueIndex: 0, currentTrackId: null });
            return null;
          }
          const index = Math.min(Math.max(0, Math.trunc(startIndex)), ids.length - 1);
          const id = ids[index];
          set({ queue: ids, queueIndex: index, currentTrackId: id });
          return id;
        },

        next: () => {
          const state = get();
          const { queue, queueIndex, repeat, shuffle } = state;
          if (queue.length === 0) return "stopped";
          // "one" holds position: the element just seeks back to zero.
          if (repeat === "one") return "restart";

          let index: number;
          if (shuffle && queue.length > 1) {
            index = randomOtherIndex(queue.length, queueIndex);
          } else {
            index = queueIndex + 1;
            if (index >= queue.length) {
              if (repeat !== "all") return "stopped";
              index = 0;
            }
          }

          const id = queue[index];
          if (!id) return "stopped";
          set({ queueIndex: index, currentTrackId: id });
          // A one-track queue on repeat "all" wraps onto itself.
          return id === state.currentTrackId ? "restart" : "advanced";
        },

        previous: () => {
          const state = get();
          const { queue, queueIndex, repeat, shuffle } = state;
          if (queue.length === 0) return "stopped";

          let index: number;
          if (shuffle && queue.length > 1) {
            index = randomOtherIndex(queue.length, queueIndex);
          } else {
            index = queueIndex - 1;
            // At the head, "all" wraps to the end and everything else restarts.
            if (index < 0) index = repeat === "all" ? queue.length - 1 : 0;
          }

          const id = queue[index];
          if (!id) return "stopped";
          set({ queueIndex: index, currentTrackId: id });
          return id === state.currentTrackId ? "restart" : "advanced";
        },

        setShuffle: (value) => set({ shuffle: value }),

        cycleRepeat: () =>
          set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),

        clearQueue: () => set({ queue: [], queueIndex: 0, currentTrackId: null }),
      };
    },
    {
      name: "novamusic-store",
      version: 1,
      // Play counts and resolved durations are written while audio plays, so the
      // writes get coalesced like every other store in the project.
      storage: createJSONStorage(() => throttledLocalStorage),
    }
  )
);
