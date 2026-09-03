/**
 * URL handling for the Browser app.
 *
 * `nova://` pages are rendered natively by the browser instead of being loaded
 * into the content iframe, the same way Chrome handles `chrome://`.
 */

export const NEW_TAB_URL = "nova://newtab";

export type InternalPage = "newtab" | "search" | "history" | "bookmarks";

const INTERNAL_PAGES: InternalPage[] = ["newtab", "search", "history", "bookmarks"];

export const INTERNAL_TITLES: Record<InternalPage, string> = {
  newtab: "New Tab",
  search: "Search",
  history: "History",
  bookmarks: "Bookmarks",
};

export const isInternalUrl = (url: string): boolean => url.startsWith("nova://");

export const parseInternalUrl = (url: string): { page: InternalPage; query: string } => {
  const rest = url.slice("nova://".length);
  const [rawPage, rawQuery] = rest.split("?");
  const page = INTERNAL_PAGES.find((p) => p === rawPage) ?? "newtab";
  const query = new URLSearchParams(rawQuery ?? "").get("q") ?? "";
  return { page, query };
};

export const searchUrl = (query: string): string =>
  `nova://search?q=${encodeURIComponent(query)}`;

/** Full-web search, used for the "open in a real tab" escape hatch. */
export const webSearchUrl = (query: string): string =>
  `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

const HOST_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i;
const LOCAL_LIKE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/?#].*)?$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Turns whatever the user typed into something safe to load: an http(s) URL,
 * a nova:// page, or a search. Unsupported schemes (javascript:, data:, file:)
 * are never returned — they fall through to a search instead.
 */
export const resolveInput = (raw: string): string => {
  const value = raw.trim();
  if (!value) return NEW_TAB_URL;
  if (isInternalUrl(value)) return value;

  const lower = value.toLowerCase();
  if (lower.startsWith("https://") || lower.startsWith("http://")) return value;
  if (HAS_SCHEME.test(value)) return searchUrl(value);
  if (LOCAL_LIKE.test(value)) return `http://${value}`;
  if (!value.includes(" ") && HOST_LIKE.test(value)) return `https://${value}`;
  return searchUrl(value);
};

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * A framed document that shares our origin could reach into the OS itself, so
 * those URLs are refused outright.
 */
export const isSameOriginAsApp = (url: string): boolean => {
  const origin = originOf(url);
  return origin !== null && origin === window.location.origin;
};

export const titleForUrl = (url: string): string =>
  isInternalUrl(url) ? INTERNAL_TITLES[parseInternalUrl(url).page] : hostOf(url);

/**
 * Hosts known to send X-Frame-Options / CSP frame-ancestors, verified by
 * request. Listing them lets the browser show a useful message instantly
 * instead of a mystery blank pane.
 */
const UNFRAMEABLE_HOSTS = [
  "google.com", "youtube.com", "facebook.com", "instagram.com", "x.com", "twitter.com",
  "reddit.com", "github.com", "gitlab.com", "stackoverflow.com", "stackexchange.com",
  "amazon.com", "netflix.com", "linkedin.com", "mozilla.org", "duckduckgo.com", "bing.com",
  "openstreetmap.org", "w3schools.com", "mojeek.com", "chatgpt.com", "openai.com",
  "apple.com", "microsoft.com", "live.com", "outlook.com", "office.com", "spotify.com",
  "tiktok.com", "discord.com", "twitch.tv", "pinterest.com", "ebay.com", "paypal.com",
  "yahoo.com", "medium.com", "notion.so", "figma.com", "npmjs.com", "cloudflare.com",
  "nytimes.com", "bbc.co.uk", "cnn.com", "whatsapp.com", "telegram.org", "quora.com",
];

export const isKnownUnframeable = (url: string): boolean => {
  const host = hostOf(url).toLowerCase();
  return UNFRAMEABLE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
};

/** Sites verified to allow framing — used for the new tab shortcuts. */
export const SUGGESTED_SITES: { label: string; url: string }[] = [
  { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page" },
  { label: "Internet Archive", url: "https://archive.org" },
  { label: "Can I use", url: "https://caniuse.com" },
  { label: "Project Gutenberg", url: "https://www.gutenberg.org" },
  { label: "The first website", url: "https://info.cern.ch" },
  { label: "example.com", url: "https://example.com" },
];
