import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { throttledLocalStorage } from "../lib/persistStorage";

export type TitleKind = "movie" | "series";
export type TitleSource = "archive" | "local";

export interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  file: string;
  durationSeconds?: number;
}

export interface NovaTitle {
  id: string; // archive identifier, or "local:<path>"
  kind: TitleKind;
  source: TitleSource;
  title: string;
  year?: number;
  genres: string[];
  synopsis?: string;
  /** Archive filename for a movie; episodes carry their own. */
  file?: string;
  path?: string; // local only
  posterUrl?: string;
  durationSeconds?: number;
  episodes?: Episode[];
  addedAt: number;
  inMyList: boolean;
  progressSeconds?: number;
  lastWatchedAt?: number;
}

/**
 * What a caller hands to `addTitle`. The bookkeeping fields default in the store
 * so no call site has to invent them.
 */
export type NewTitle = Omit<NovaTitle, "addedAt" | "inMyList"> &
  Partial<Pick<NovaTitle, "addedAt" | "inMyList">>;

/**
 * The tags NovaFlix browses by. Genre rows are rendered in this order, so this
 * doubles as the display order.
 */
export const GENRES = ["Classics", "Comedy", "Horror", "Animation", "Sci-Fi", "Silent"] as const;

/* ------------------------------------------------------------------- archive */

/**
 * Direct stream URL. Filenames in these items contain spaces, dots and quotes,
 * so the component has to be encoded — `Metropolis 1927.ia.mp4` breaks without
 * it. Cross-origin <video src> playback needs no CORS header at all; only
 * canvas pixel reads do, which is why archive posters are plain <img> and local
 * files are the only source a frame is ever captured from.
 */
export const archiveStreamUrl = (identifier: string, file: string): string =>
  `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file)}`;

/** Item thumbnail, served as a JPEG. Used directly as an <img> src. */
export const archivePosterUrl = (identifier: string): string =>
  `https://archive.org/services/img/${encodeURIComponent(identifier)}`;

/** Local titles are keyed by path, so the same file can never be added twice. */
export const localTitleId = (path: string): string => `local:${path}`;

/**
 * Archive `files[].length` arrives either as seconds (`"4700.16"`) or as a
 * clock string (`"1:18:20"`, `"6:10"`). Both shapes are parsed here; anything
 * else resolves to undefined rather than to a guess.
 */
export const parseArchiveLength = (value?: string | number | null): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  }

  const raw = value.trim();
  if (!raw) return undefined;

  if (raw.includes(":")) {
    const parts = raw.split(":");
    if (parts.length > 3) return undefined;
    let seconds = 0;
    for (const part of parts) {
      const unit = Number(part);
      if (!Number.isFinite(unit) || unit < 0) return undefined;
      seconds = seconds * 60 + unit;
    }
    return seconds > 0 ? Math.round(seconds) : undefined;
  }

  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
};

const ARCHIVE_TIMEOUT = 12_000;

/** Callers may pass their own signal; otherwise every request self-cancels. */
const requestSignal = (signal?: AbortSignal): AbortSignal =>
  signal ?? AbortSignal.timeout(ARCHIVE_TIMEOUT);

/** Archive JSON fields are sometimes a string, sometimes an array of them. */
const firstString = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
  }
  return undefined;
};

const allStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  return [];
};

/** Descriptions come back as HTML. Tags and the few entities that matter go. */
const plainText = (value: unknown): string | undefined => {
  const raw = firstString(value);
  if (!raw) return undefined;
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || undefined;
};

/** First four-digit year in the value, so `"1959-05-01"` still resolves. */
const parseYear = (value: unknown): number | undefined => {
  const raw = firstString(value);
  if (!raw) return undefined;
  const match = /\b(1[89]\d{2}|20\d{2})\b/.exec(raw);
  return match ? Number(match[1]) : undefined;
};

const parseBytes = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
};

/**
 * Characters that make the Lucene query on advancedsearch.php fail outright
 * when a user leaves them unbalanced. Stripped rather than escaped, because a
 * search box is not a query language.
 */
const LUCENE_UNSAFE = /["()[\]{}\\^~:]/g;

const SUBJECT_GENRES: Array<{ pattern: RegExp; genre: string }> = [
  { pattern: /science[\s-]?fiction|sci[\s-]?fi/i, genre: "Sci-Fi" },
  { pattern: /horror|monster|vampire/i, genre: "Horror" },
  { pattern: /comedy|comedies|slapstick/i, genre: "Comedy" },
  { pattern: /animation|animated|cartoon/i, genre: "Animation" },
  { pattern: /silent/i, genre: "Silent" },
  { pattern: /classic/i, genre: "Classics" },
];

/** Genre tags taken from the item's own `subject` field. Never invented. */
const genresFromSubjects = (value: unknown): string[] => {
  const haystack = allStrings(value).join(" ");
  if (!haystack) return [];
  const found: string[] = [];
  for (const entry of SUBJECT_GENRES) {
    if (entry.pattern.test(haystack) && !found.includes(entry.genre)) found.push(entry.genre);
  }
  return found;
};

export interface ArchiveSearchResult {
  identifier: string;
  title: string;
  year?: number;
  creator?: string;
}

export interface ArchiveRequestOptions {
  rows?: number;
  signal?: AbortSignal;
}

/**
 * Live search against archive.org.
 *
 * THIRD PARTY REQUEST: the query string leaves this machine. The endpoint sends
 * `Access-Control-Allow-Origin: *`, so the JSON is readable from the browser.
 * Results are restricted to `mediatype:movies` because NovaFlix can only play
 * video. An empty query resolves to an empty list; a network failure, timeout or
 * error status rejects, and the caller turns that into a visible message.
 */
export const searchArchive = async (
  query: string,
  opts: ArchiveRequestOptions = {}
): Promise<ArchiveSearchResult[]> => {
  const cleaned = query.replace(LUCENE_UNSAFE, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const rows = Math.min(60, Math.max(1, Math.round(opts.rows ?? 24)));
  const lucene = `(${cleaned}) AND mediatype:(movies)`;
  const endpoint =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(lucene)}` +
    `&fl[]=identifier&fl[]=title&fl[]=year&fl[]=creator` +
    `&sort[]=downloads+desc&rows=${rows}&page=1&output=json`;

  const response = await fetch(endpoint, { signal: requestSignal(opts.signal) });
  if (!response.ok) throw new Error(`archive.org answered ${response.status}`);

  const data = (await response.json()) as { response?: { docs?: unknown[] } };
  const docs = data.response?.docs ?? [];

  const results: ArchiveSearchResult[] = [];
  const seen = new Set<string>();
  for (const entry of docs) {
    const doc = entry as Record<string, unknown>;
    const identifier = firstString(doc.identifier);
    if (!identifier || seen.has(identifier)) continue;
    seen.add(identifier);
    results.push({
      identifier,
      title: firstString(doc.title) ?? identifier,
      year: parseYear(doc.year),
      creator: firstString(doc.creator),
    });
  }
  return results;
};

interface ArchiveVideoFile {
  name: string;
  durationSeconds: number;
  sizeBytes?: number;
}

/** `Popeye_forPresident_512kb.mp4` reads better as `Popeye forPresident 512kb`. */
const fileLabel = (name: string): string =>
  name
    .replace(/\.[^./]+$/, "")
    .replace(/[_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || name;

/**
 * Several video files of clearly different lengths mean separate programmes;
 * near-identical lengths mean the same film in different encodings, which is
 * what a normal archive movie item looks like. Only the first case is offered
 * to the user as a series, and only as an opt-in.
 */
const looksEpisodic = (files: ArchiveVideoFile[]): boolean => {
  if (files.length < 2) return false;
  const longest = Math.max(...files.map((f) => f.durationSeconds));
  const shortest = Math.min(...files.map((f) => f.durationSeconds));
  return longest > 0 && (longest - shortest) / longest > 0.05;
};

/**
 * Resolves an identifier into a title draft ready for `addTitle`.
 *
 * THIRD PARTY REQUEST: `archive.org/metadata/<id>`, which also sends
 * `Access-Control-Allow-Origin: *`. HEAD is answered with 405, so this is
 * always a GET. The playable file is the *smallest* `.mp4` that reports a
 * `length`: those are the 512kb derivatives, which stream fastest and seek the
 * same as the originals. When the item holds several video files of different
 * lengths the draft also carries them as `episodes`, so the UI can offer to add
 * it as a series instead of a single film. Null means the item exists but has
 * nothing playable; a failed request rejects instead.
 */
export const fetchArchiveTitle = async (
  identifier: string,
  opts: { signal?: AbortSignal } = {}
): Promise<NewTitle | null> => {
  const endpoint = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
  const response = await fetch(endpoint, { signal: requestSignal(opts.signal) });
  if (!response.ok) throw new Error(`archive.org answered ${response.status}`);

  const data = (await response.json()) as {
    metadata?: Record<string, unknown>;
    files?: Array<Record<string, unknown>>;
  };

  const metadata = data.metadata;
  // An unknown identifier answers 200 with `{}`, so a missing metadata block is
  // the not-found signal.
  if (!metadata) return null;

  const videoFiles: ArchiveVideoFile[] = [];
  for (const file of data.files ?? []) {
    const name = firstString(file.name);
    if (!name || !/\.mp4$/i.test(name)) continue;
    const durationSeconds = parseArchiveLength(file.length as string | number | undefined);
    if (durationSeconds === undefined) continue;
    videoFiles.push({ name, durationSeconds, sizeBytes: parseBytes(file.size) });
  }
  if (videoFiles.length === 0) return null;

  const primary = videoFiles.reduce((smallest, candidate) => {
    const a = candidate.sizeBytes ?? Number.POSITIVE_INFINITY;
    const b = smallest.sizeBytes ?? Number.POSITIVE_INFINITY;
    return a < b ? candidate : smallest;
  }, videoFiles[0]);

  const ordered = [...videoFiles].sort((a, b) => a.name.localeCompare(b.name));
  const episodes: Episode[] = ordered.map((file, index) => ({
    id: `${identifier}/${file.name}`,
    title: fileLabel(file.name),
    season: 1,
    episode: index + 1,
    file: file.name,
    durationSeconds: file.durationSeconds,
  }));

  return {
    id: identifier,
    kind: "movie",
    source: "archive",
    title: firstString(metadata.title) ?? identifier,
    year: parseYear(metadata.year) ?? parseYear(metadata.date),
    genres: genresFromSubjects(metadata.subject),
    synopsis: plainText(metadata.description),
    file: primary.name,
    posterUrl: archivePosterUrl(identifier),
    durationSeconds: primary.durationSeconds,
    episodes: looksEpisodic(videoFiles) ? episodes : undefined,
  };
};

/* ---------------------------------------------------------------- derivations */

/** Anything past this much of its runtime counts as finished, not in progress. */
const FINISHED_FRACTION = 0.97;

/** How far into a title playback got, 0 when it was never started. */
export const watchedFraction = (title: NovaTitle): number => {
  const progress = title.progressSeconds ?? 0;
  if (progress <= 0) return 0;
  const duration = title.durationSeconds ?? title.episodes?.[0]?.durationSeconds;
  if (!duration || duration <= 0) return 0.04; // started, runtime unknown
  return Math.min(1, progress / duration);
};

export const isFinished = (title: NovaTitle): boolean =>
  watchedFraction(title) >= FINISHED_FRACTION;

/**
 * Continue Watching, derived rather than stored: everything with real progress
 * that isn't finished, most recently played first.
 */
export const continueWatching = (titles: NovaTitle[]): NovaTitle[] =>
  titles
    .filter((title) => (title.progressSeconds ?? 0) > 15 && !isFinished(title))
    .sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0));

/* ------------------------------------------------------------------ seed data */

interface SeedEntry {
  id: string;
  title: string;
  year: number;
  file: string;
  durationSeconds: number;
  genres: string[];
  synopsis: string;
}

/**
 * Every identifier, filename and runtime here was checked against archive.org.
 * All twelve are public domain or Creative Commons licensed. Nothing about them
 * is scored, ranked or rated: the only numbers are the real year and the real
 * runtime reported by the item's own metadata.
 */
const SEED: SeedEntry[] = [
  {
    id: "plan-9-from-outer-space",
    title: "Plan 9 From Outer Space",
    year: 1959,
    file: "plan-9-from-outer-space.mp4",
    durationSeconds: 4700,
    genres: ["Sci-Fi", "Horror"],
    synopsis:
      "Aliens raise the dead in a Los Angeles graveyard, hoping to stop humanity from building a weapon that would threaten the universe. Ed Wood's science-fiction feature, finished after Bela Lugosi's death by shooting a stand-in with a cape over his face.",
  },
  {
    id: "his_girl_friday",
    title: "His Girl Friday",
    year: 1940,
    file: "his_girl_friday_512kb.mp4",
    durationSeconds: 5504,
    genres: ["Comedy", "Classics"],
    synopsis:
      "Howard Hawks' overlapping-dialogue newspaper comedy. An editor stalls his ex-wife's remarriage by handing her one last story, because she is still the best reporter he has.",
  },
  {
    id: "TheGeneral1926",
    title: "The General",
    year: 1926,
    file: "The_General_1926_720p_512kb.mp4",
    durationSeconds: 4732,
    genres: ["Silent", "Comedy"],
    synopsis:
      "Buster Keaton's Civil War chase, built around a railroad engineer pursuing his stolen locomotive up the line and the woman who was aboard it. The stunts are Keaton's own.",
  },
  {
    id: "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari",
    title: "The Cabinet of Dr. Caligari",
    year: 1919,
    file: "The_Cabinet_of_Dr._Caligari_512kb.mp4",
    durationSeconds: 3061,
    genres: ["Silent", "Horror"],
    synopsis:
      "Robert Wiene's German Expressionist landmark. A travelling hypnotist and the sleepwalker he exhibits are tied to a run of murders, told through painted sets that lean and buckle.",
  },
  {
    id: "Sita_Sings_the_Blues",
    title: "Sita Sings the Blues",
    year: 2008,
    file: "Sita_Sings_the_Blues_1080p.mp4",
    durationSeconds: 4891,
    genres: ["Animation"],
    synopsis:
      "Nina Paley animates the Ramayana against 1920s Annette Hanshaw jazz recordings, cutting Sita's exile together with the collapse of Paley's own marriage. Released by the author under a Creative Commons licence.",
  },
  {
    id: "utopia",
    title: "Utopia",
    year: 1951,
    file: "Utopia.mp4",
    durationSeconds: 8519,
    genres: ["Comedy", "Classics"],
    synopsis:
      "The last Laurel and Hardy feature, also released as Atoll K. The pair inherit a yacht and an uncharted island, declare it a country with no laws, and find out what that costs.",
  },
  {
    id: "house_on_haunted_hill_ipod",
    title: "House on Haunted Hill",
    year: 1959,
    file: "house_on_haunted_hill_512kb.mp4",
    durationSeconds: 4483,
    genres: ["Horror", "Classics"],
    synopsis:
      "William Castle's haunted-house picture, with Vincent Price as the millionaire who offers five strangers ten thousand dollars each to last one night in a house that already has a body count.",
  },
  {
    id: "JungleBook",
    title: "Jungle Book",
    year: 1942,
    file: "Jungle_Book_512kb.mp4",
    durationSeconds: 6294,
    genres: ["Classics"],
    synopsis:
      "The Korda brothers' Technicolor Kipling, with Sabu as the boy raised by wolves who is drawn back to a village that wants the jungle's treasure more than it wants him.",
  },
  {
    id: "The_Pied_Piper_of_Hamelin",
    title: "The Pied Piper of Hamelin",
    year: 1957,
    file: "pied_512kb.mp4",
    durationSeconds: 1392,
    genres: ["Classics"],
    synopsis:
      "A television musical of the Browning poem set to Grieg melodies, with Van Johnson as the piper who clears Hamelin of its rats and then, unpaid, of its children.",
  },
  {
    id: "charlie_chaplin_film_fest",
    title: "Charlie Chaplin Festival",
    year: 1938,
    file: "charlie_chaplin_film_fest_512kb.mp4",
    durationSeconds: 4646,
    genres: ["Comedy", "Silent"],
    synopsis:
      "A feature-length programme collecting Chaplin's silent two-reel comedies, reissued together as a single festival print.",
  },
  {
    id: "Popeye_forPresident",
    title: "Popeye for President",
    year: 1956,
    file: "Popeye_forPresident_512kb.mp4",
    durationSeconds: 370,
    genres: ["Animation", "Comedy"],
    synopsis:
      "A Famous Studios cartoon. Popeye and Bluto both need Olive Oyl's deciding vote, and campaign for it the only way either of them knows how.",
  },
  {
    id: "metropolis-1927_202511",
    title: "Metropolis",
    year: 1927,
    file: "Metropolis 1927.ia.mp4",
    durationSeconds: 9011,
    genres: ["Silent", "Sci-Fi"],
    synopsis:
      "Fritz Lang's futurist epic, set in a city split between a gleaming surface and the machine halls that keep it running. The son of the city's master follows Maria down into the depths while an inventor builds a machine in her image.",
  },
];

const SEEDED_AT = Date.now();

/**
 * The one-minute stagger only keeps "recently added" ordering stable instead of
 * leaving twelve identical timestamps to tie-break.
 */
const SEED_TITLES: NovaTitle[] = SEED.map(
  (entry, index): NovaTitle => ({
    id: entry.id,
    kind: "movie",
    source: "archive",
    title: entry.title,
    year: entry.year,
    genres: entry.genres,
    synopsis: entry.synopsis,
    file: entry.file,
    posterUrl: archivePosterUrl(entry.id),
    durationSeconds: entry.durationSeconds,
    addedAt: SEEDED_AT - index * 60_000,
    inMyList: false,
  })
);

/* ---------------------------------------------------------------------- store */

interface NovaflixStore {
  titles: NovaTitle[];

  /** Adds unless the id is already known. Returns the id either way. */
  addTitle: (title: NewTitle) => string;
  removeTitle: (id: string) => void;
  toggleMyList: (id: string) => void;
  /** Throttled by the caller: the player writes roughly every five seconds. */
  setProgress: (id: string, seconds: number) => void;
  /** With `episodeId` the real runtime is written back to that episode. */
  setDuration: (id: string, seconds: number, episodeId?: string) => void;
  /** Records a play now without moving the playhead. */
  markWatched: (id: string) => void;
  clearProgress: (id: string) => void;
  /** Data-URL poster captured from a local file's first frames. */
  setPoster: (id: string, posterUrl: string) => void;
}

export const useNovaflixStore = create<NovaflixStore>()(
  persist(
    (set, get) => {
      /** Applies `fn` to one title, skipping the write when nothing changed. */
      const patch = (id: string, fn: (title: NovaTitle) => NovaTitle) =>
        set((s) => {
          const target = s.titles.find((t) => t.id === id);
          if (!target) return s;
          const next = fn(target);
          if (next === target) return s;
          return { titles: s.titles.map((t) => (t.id === id ? next : t)) };
        });

      return {
        titles: SEED_TITLES,

        addTitle: (title) => {
          const existing = get().titles.find((t) => t.id === title.id);
          if (existing) return existing.id;

          const entry: NovaTitle = {
            ...title,
            addedAt: title.addedAt ?? Date.now(),
            inMyList: title.inMyList ?? false,
          };
          set((s) => ({ titles: [entry, ...s.titles] }));
          return entry.id;
        },

        removeTitle: (id) => set((s) => ({ titles: s.titles.filter((t) => t.id !== id) })),

        toggleMyList: (id) => patch(id, (t) => ({ ...t, inMyList: !t.inMyList })),

        setProgress: (id, seconds) => {
          if (!Number.isFinite(seconds)) return;
          const rounded = Math.max(0, Math.round(seconds));
          patch(id, (t) =>
            t.progressSeconds === rounded
              ? t
              : { ...t, progressSeconds: rounded, lastWatchedAt: Date.now() }
          );
        },

        setDuration: (id, seconds, episodeId) => {
          if (!Number.isFinite(seconds) || seconds <= 0) return;
          const rounded = Math.round(seconds);
          patch(id, (t) => {
            if (episodeId && t.episodes) {
              const target = t.episodes.find((e) => e.id === episodeId);
              if (!target || target.durationSeconds === rounded) return t;
              return {
                ...t,
                episodes: t.episodes.map((e) =>
                  e.id === episodeId ? { ...e, durationSeconds: rounded } : e
                ),
              };
            }
            return t.durationSeconds === rounded ? t : { ...t, durationSeconds: rounded };
          });
        },

        markWatched: (id) => patch(id, (t) => ({ ...t, lastWatchedAt: Date.now() })),

        clearProgress: (id) =>
          patch(id, (t) => {
            if (t.progressSeconds === undefined && t.lastWatchedAt === undefined) return t;
            const next: NovaTitle = { ...t };
            delete next.progressSeconds;
            delete next.lastWatchedAt;
            return next;
          }),

        setPoster: (id, posterUrl) =>
          patch(id, (t) => (t.posterUrl === posterUrl ? t : { ...t, posterUrl })),
      };
    },
    {
      name: "novaflix-store",
      version: 1,
      // Watch progress is written while a film plays, so the writes get
      // coalesced like every other store in the project.
      storage: createJSONStorage(() => throttledLocalStorage),
    }
  )
);
