import { useEffect, useState } from "react";
import {
  Globe, Search, Star, Trash2, ExternalLink, ShieldAlert, Clock, History as HistoryIcon, Loader2,
} from "lucide-react";
import type { Bookmark, HistoryEntry } from "../../store/browserStore";
import {
  SUGGESTED_SITES, hostOf, isInternalUrl, originOf, searchUrl, webSearchUrl,
} from "../../lib/url";

/** Favicons are fetched from the site itself, so no third party sees the URL. */
export function Favicon({ url, size = 14 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const origin = originOf(url);

  useEffect(() => setFailed(false), [url]);

  if (isInternalUrl(url) || failed || !origin) {
    return <Globe size={size} className="text-white/40 shrink-0" />;
  }
  return (
    <img
      src={`${origin}/favicon.ico`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-sm object-contain"
      style={{ width: size, height: size }}
    />
  );
}

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");

const relativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
};

interface NavigateFn {
  (url: string, title?: string): void;
}

/* ------------------------------------------------------------------ new tab */

export function NewTabPage({
  bookmarks,
  history,
  onNavigate,
}: {
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  onNavigate: NavigateFn;
}) {
  const [query, setQuery] = useState("");
  const recent = history.slice(0, 6);

  return (
    <div className="h-full overflow-y-auto bg-[#101019] text-white/85">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="text-center mb-6">
          <div className="text-3xl font-semibold tracking-tight">Nova</div>
          <div className="text-xs text-white/40 mt-1">Browser</div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) onNavigate(searchUrl(query.trim()));
          }}
          className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 focus-within:ring-1 focus-within:ring-blue-500/60"
        >
          <Search size={15} className="text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Wikipedia or enter an address"
            aria-label="Search"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30"
            style={{ userSelect: "text" }}
          />
        </form>

        <div className="mt-8">
          <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2">Sites that work in-frame</div>
          <div className="grid grid-cols-3 gap-2">
            {SUGGESTED_SITES.map((site) => (
              <button
                key={site.url}
                onClick={() => onNavigate(site.url)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-left"
              >
                <Favicon url={site.url} />
                <span className="text-xs truncate">{site.label}</span>
              </button>
            ))}
          </div>
        </div>

        {bookmarks.length > 0 && (
          <div className="mt-8">
            <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2 flex items-center gap-1.5">
              <Star size={11} /> Bookmarks
            </div>
            <div className="flex flex-wrap gap-2">
              {bookmarks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onNavigate(b.url, b.title)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-xs"
                >
                  <Favicon url={b.url} size={12} />
                  <span className="truncate max-w-[160px]">{b.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-8">
            <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2 flex items-center gap-1.5">
              <Clock size={11} /> Recent
            </div>
            <div className="space-y-0.5">
              {recent.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onNavigate(entry.url, entry.title)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-left"
                >
                  <Favicon url={entry.url} size={12} />
                  <span className="text-xs truncate flex-1">{entry.title}</span>
                  <span className="text-[11px] text-white/30 shrink-0">{relativeTime(entry.visitedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- search */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function SearchPage({ query, onNavigate }: { query: string; onNavigate: NavigateFn }) {
  const [input, setInput] = useState(query);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [instant, setInstant] = useState<{ heading: string; text: string; url: string } | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => setInput(query), [query]);

  useEffect(() => {
    if (!query) {
      setState("done");
      setResults([]);
      setInstant(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setResults([]);
    setInstant(null);

    const asJson = (response: Response) =>
      response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`));

    // Both endpoints send Access-Control-Allow-Origin: *, so they can be called
    // straight from the page without a proxy.
    const wikipedia = fetch(
      `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=10`
    ).then(asJson);
    const duckduckgo = fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    ).then(asJson);

    void Promise.allSettled([wikipedia, duckduckgo]).then(([wiki, ddg]) => {
      if (cancelled) return;

      if (wiki.status === "fulfilled") {
        const pages: any[] = wiki.value?.pages ?? [];
        setResults(
          pages.map((page) => ({
            title: page.title ?? page.key,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
            snippet: stripHtml(page.excerpt ?? page.description ?? ""),
          }))
        );
      }
      if (ddg.status === "fulfilled" && ddg.value?.AbstractText) {
        setInstant({
          heading: ddg.value.Heading || query,
          text: ddg.value.AbstractText,
          url: ddg.value.AbstractURL,
        });
      }
      setState(wiki.status === "fulfilled" || ddg.status === "fulfilled" ? "done" : "error");
    });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="h-full overflow-y-auto bg-[#101019] text-white/85">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) onNavigate(searchUrl(input.trim()));
          }}
          className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 mb-5 focus-within:ring-1 focus-within:ring-blue-500/60"
        >
          <Search size={14} className="text-white/40" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Search"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ userSelect: "text" }}
          />
        </form>

        {state === "loading" && (
          <div className="flex items-center gap-2 text-xs text-white/40 py-8 justify-center">
            <Loader2 size={14} className="animate-spin" /> Searching…
          </div>
        )}

        {state === "error" && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            Search failed. Check the network connection — NovaOS queries Wikipedia and DuckDuckGo directly.
          </div>
        )}

        {instant && (
          <div className="mb-5 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-sm font-medium mb-1">{instant.heading}</div>
            <div className="text-xs text-white/60 leading-relaxed" style={{ userSelect: "text" }}>
              {instant.text}
            </div>
            {instant.url && (
              <button
                onClick={() => onNavigate(instant.url, instant.heading)}
                className="mt-2 text-[11px] text-blue-300 hover:underline flex items-center gap-1"
              >
                {hostOf(instant.url)} <ExternalLink size={10} />
              </button>
            )}
          </div>
        )}

        <div className="space-y-4">
          {results.map((result) => (
            <div key={result.url}>
              <button
                onClick={() => onNavigate(result.url, result.title)}
                className="text-left group"
              >
                <div className="text-[11px] text-white/40 flex items-center gap-1.5">
                  <Favicon url={result.url} size={11} /> en.wikipedia.org
                </div>
                <div className="text-sm text-blue-300 group-hover:underline">{result.title}</div>
              </button>
              {result.snippet && (
                <div className="text-xs text-white/50 leading-relaxed mt-0.5" style={{ userSelect: "text" }}>
                  {result.snippet}
                </div>
              )}
            </div>
          ))}
        </div>

        {state === "done" && results.length === 0 && !instant && query && (
          <div className="text-xs text-white/40 py-6 text-center">No results for “{query}”.</div>
        )}

        {query && (
          <div className="mt-8 pt-4 border-t border-white/10">
            <button
              onClick={() => window.open(webSearchUrl(query), "_blank", "noopener,noreferrer")}
              className="text-xs text-white/60 hover:text-white flex items-center gap-1.5"
            >
              Search the full web on DuckDuckGo <ExternalLink size={11} />
            </button>
            <div className="text-[11px] text-white/30 mt-1.5 leading-relaxed">
              In-page results come from Wikipedia search and DuckDuckGo Instant Answers, the two
              engines that allow direct browser requests. Full search engines block being embedded,
              so they open in a real tab.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ history */

export function HistoryPage({
  history,
  onNavigate,
  onClear,
}: {
  history: HistoryEntry[];
  onNavigate: NavigateFn;
  onClear: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto bg-[#101019] text-white/85">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-medium flex items-center gap-2">
            <HistoryIcon size={16} /> History
          </div>
          {history.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 flex items-center gap-1.5"
            >
              <Trash2 size={12} /> Clear all
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-white/40 py-8 text-center">Nothing here yet.</div>
        ) : (
          <div className="space-y-0.5">
            {history.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onNavigate(entry.url, entry.title)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/5 text-left"
              >
                <Favicon url={entry.url} size={12} />
                <span className="text-xs truncate flex-1">{entry.title}</span>
                <span className="text-[11px] text-white/30 truncate max-w-[180px]">{entry.url}</span>
                <span className="text-[11px] text-white/30 shrink-0 w-20 text-right">
                  {relativeTime(entry.visitedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- bookmarks */

export function BookmarksPage({
  bookmarks,
  onNavigate,
  onRemove,
}: {
  bookmarks: Bookmark[];
  onNavigate: NavigateFn;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto bg-[#101019] text-white/85">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="text-lg font-medium flex items-center gap-2 mb-4">
          <Star size={16} /> Bookmarks
        </div>
        {bookmarks.length === 0 ? (
          <div className="text-xs text-white/40 py-8 text-center">
            No bookmarks yet. Use the star in the toolbar.
          </div>
        ) : (
          <div className="space-y-0.5">
            {bookmarks.map((b) => (
              <div key={b.id} className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/5">
                <Favicon url={b.url} size={12} />
                <button onClick={() => onNavigate(b.url, b.title)} className="text-xs truncate flex-1 text-left">
                  {b.title}
                </button>
                <span className="text-[11px] text-white/30 truncate max-w-[200px]">{b.url}</span>
                <button
                  onClick={() => onRemove(b.id)}
                  aria-label={`Remove ${b.title}`}
                  className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-red-300"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ blocked */

export function BlockedPage({ url, reason }: { url: string; reason: "framing" | "same-origin" }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="h-full flex items-center justify-center bg-[#101019] text-white/85 p-8">
      <div className="max-w-md text-center">
        <ShieldAlert size={30} className="mx-auto text-amber-400 mb-3" />
        <div className="text-sm font-medium mb-2">
          {reason === "same-origin"
            ? "NovaOS won't frame itself"
            : `${hostOf(url)} refuses to load inside NovaOS`}
        </div>
        <div className="text-xs text-white/50 leading-relaxed mb-5">
          {reason === "same-origin" ? (
            <>That address points back at the page NovaOS is running on, which would let the frame reach into the OS. Blocked on purpose.</>
          ) : (
            <>
              The site sends an <code className="text-white/70">X-Frame-Options</code> or{" "}
              <code className="text-white/70">Content-Security-Policy: frame-ancestors</code> header.
              Browsers enforce that at the network layer, so no in-page browser can display it — that
              would need a server-side proxy.
            </>
          )}
        </div>
        {reason === "framing" && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              className="px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 text-white font-medium flex items-center gap-1.5"
            >
              Open in a real tab <ExternalLink size={11} />
            </button>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => setCopied(true));
              }}
              className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
        <div className="text-[11px] text-white/25 mt-4 break-all" style={{ userSelect: "text" }}>
          {url}
        </div>
      </div>
    </div>
  );
}
