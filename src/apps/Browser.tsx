import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, RotateCw, Plus, X, Star, Lock, Globe, MoreVertical, House,
  ExternalLink, History as HistoryIcon, Trash2, TriangleAlert, Search, Download,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { useBrowserStore } from "../store/browserStore";
import { useWindowStore } from "../store/windowStore";
import {
  NEW_TAB_URL, isInternalUrl, isKnownUnframeable, isSameOriginAsApp, parseInternalUrl,
  resolveInput, titleForUrl,
} from "../lib/url";
import { BlockedPage, BookmarksPage, Favicon, HistoryPage, NewTabPage, SearchPage } from "./browser/pages";

type FrameState = "loading" | "loaded" | "blocked" | "slow";

/** Live web content. Anything that can't be framed falls back to BlockedPage. */
function WebFrame({ url, reloadKey }: { url: string; reloadKey: number }) {
  const [state, setState] = useState<FrameState>(() =>
    isKnownUnframeable(url) ? "blocked" : "loading"
  );
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setState(isKnownUnframeable(url) ? "blocked" : "loading");
  }, [url, reloadKey]);

  useEffect(() => {
    if (state !== "loading") return;
    const id = window.setTimeout(() => {
      setState((current) => (current === "loading" ? "slow" : current));
    }, 12000);
    return () => window.clearTimeout(id);
  }, [state, url, reloadKey]);

  const handleLoad = () => {
    // A frame refused by X-Frame-Options never leaves about:blank. A real
    // cross-origin document throws when its location is touched.
    try {
      const href = frameRef.current?.contentWindow?.location?.href;
      if (!href || href === "about:blank") {
        setState("blocked");
        return;
      }
    } catch {
      /* cross-origin: the document really loaded */
    }
    setState("loaded");
  };

  if (state === "blocked") return <BlockedPage url={url} reason="framing" />;

  return (
    <div className="relative flex-1 min-h-0 bg-white">
      {state === "loading" && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500/20 overflow-hidden z-10">
          <div
            className="h-full w-1/3 bg-blue-500"
            style={{ animation: "nova-loadbar 1.1s ease-in-out infinite" }}
          />
        </div>
      )}
      {state === "slow" && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-amber-500/90 text-black text-[11px] px-3 py-1.5 flex items-center gap-2">
          <TriangleAlert size={12} />
          <span className="flex-1">Still loading. The site may be blocking embedding.</span>
          <button
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            className="underline flex items-center gap-1 font-medium"
          >
            Open in a real tab <ExternalLink size={10} />
          </button>
        </div>
      )}
      <iframe
        key={`${url}::${reloadKey}`}
        ref={frameRef}
        src={url}
        title="web-frame"
        onLoad={handleLoad}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
        className="w-full h-full border-none bg-white"
      />
    </div>
  );
}

export default function Browser({ windowId, appData }: AppProps) {
  const session = useBrowserStore((s) => s.sessions[windowId]);
  const bookmarks = useBrowserStore((s) => s.bookmarks);
  const history = useBrowserStore((s) => s.history);
  const ensureSession = useBrowserStore((s) => s.ensureSession);
  const newTab = useBrowserStore((s) => s.newTab);
  const closeTab = useBrowserStore((s) => s.closeTab);
  const selectTab = useBrowserStore((s) => s.selectTab);
  const setInput = useBrowserStore((s) => s.setInput);
  const navigate = useBrowserStore((s) => s.navigate);
  const goBack = useBrowserStore((s) => s.goBack);
  const goForward = useBrowserStore((s) => s.goForward);
  const reload = useBrowserStore((s) => s.reload);
  const toggleBookmark = useBrowserStore((s) => s.toggleBookmark);
  const removeBookmark = useBrowserStore((s) => s.removeBookmark);
  const clearHistory = useBrowserStore((s) => s.clearHistory);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);

  const [menuOpen, setMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [downloads, setDownloads] = useState<Array<{ name: string; url: string; time: Date }>>([]);
  const addressRef = useRef<HTMLInputElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // Also prunes sessions belonging to browser windows that were closed.
    ensureSession(
      windowId,
      useWindowStore.getState().windows.map((w) => w.windowId)
    );
  }, [windowId, ensureSession]);

  // `browser "https://…"` from a BLAK app, or any other app handing us a URL.
  const startUrl: string | undefined = appData?.startUrl;
  useEffect(() => {
    if (!startUrl || startedRef.current) return;
    const current = useBrowserStore.getState().sessions[windowId];
    if (!current) return;
    startedRef.current = true;
    navigate(windowId, current.activeId, resolveInput(startUrl));
  }, [startUrl, windowId, navigate, session]);

  const tab = session?.tabs.find((t) => t.id === session.activeId) ?? session?.tabs[0];
  const url = tab ? tab.history[tab.index] ?? NEW_TAB_URL : NEW_TAB_URL;

  useEffect(() => {
    const label = tab?.title || titleForUrl(url);
    setWindowTitle(windowId, `${label} — Browser`);
  }, [windowId, tab?.title, url, setWindowTitle]);

  if (!session || !tab) return <div className="h-full bg-[#141420]" />;

  const go = (target: string, title?: string) => navigate(windowId, tab.id, target, title);
  const commitAddress = () => {
    go(resolveInput(tab.input));
    addressRef.current?.blur();
  };

  const canGoBack = tab.index > 0;
  const canGoForward = tab.index < tab.history.length - 1;
  const bookmarked = bookmarks.some((b) => b.url === url);
  const secure = url.startsWith("https://");

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "t") {
      e.preventDefault();
      newTab(windowId);
    } else if ((e.ctrlKey || e.metaKey) && key === "w") {
      e.preventDefault();
      closeTab(windowId, tab.id);
    } else if ((e.ctrlKey || e.metaKey) && key === "l") {
      e.preventDefault();
      addressRef.current?.select();
    } else if (((e.ctrlKey || e.metaKey) && key === "r") || e.key === "F5") {
      e.preventDefault();
      reload(windowId, tab.id);
    } else if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      goBack(windowId, tab.id);
    } else if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      goForward(windowId, tab.id);
    } else if ((e.ctrlKey || e.metaKey) && key === "f") {
      e.preventDefault();
      setFindOpen((v) => !v);
      if (!findOpen) {
        setTimeout(() => findRef.current?.select(), 0);
      }
    } else if (e.key === "Escape" && findOpen) {
      e.preventDefault();
      setFindOpen(false);
      setFindQuery("");
    }
  };

  const renderContent = () => {
    if (isInternalUrl(url)) {
      const { page, query } = parseInternalUrl(url);
      if (page === "search") return <SearchPage query={query} onNavigate={go} />;
      if (page === "history")
        return <HistoryPage history={history} onNavigate={go} onClear={clearHistory} />;
      if (page === "bookmarks")
        return <BookmarksPage bookmarks={bookmarks} onNavigate={go} onRemove={removeBookmark} />;
      return <NewTabPage bookmarks={bookmarks} history={history} onNavigate={go} />;
    }
    if (isSameOriginAsApp(url)) return <BlockedPage url={url} reason="same-origin" />;
    return <WebFrame url={url} reloadKey={tab.reloadKey} />;
  };

  const iconButton = "p-1.5 rounded-md hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent text-white/60";

  const openDownload = (item: { name: string; url: string }) => {
    window.open(item.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="h-full flex flex-col bg-[#141420] text-white text-sm outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {/* tab strip */}
      <div className="flex items-end gap-1 px-2 pt-2 bg-black/20 shrink-0 overflow-x-auto">
        {session.tabs.map((t) => {
          const tabUrl = t.history[t.index] ?? NEW_TAB_URL;
          const active = t.id === session.activeId;
          return (
            <div
              key={t.id}
              onPointerDown={() => selectTab(windowId, t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(windowId, t.id);
              }}
              title={t.title}
              className={`group flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs cursor-default min-w-[110px] max-w-[190px] ${
                active ? "bg-[#141420]" : "bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              <Favicon url={tabUrl} size={12} />
              <span className="truncate flex-1">{t.title || titleForUrl(tabUrl)}</span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(windowId, t.id);
                }}
                aria-label={`Close ${t.title}`}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 shrink-0"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => newTab(windowId)}
          aria-label="New tab"
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 mb-0.5 shrink-0"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-white/10 shrink-0">
        <button
          onClick={() => goBack(windowId, tab.id)}
          disabled={!canGoBack}
          aria-label="Back"
          className={iconButton}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          onClick={() => goForward(windowId, tab.id)}
          disabled={!canGoForward}
          aria-label="Forward"
          className={iconButton}
        >
          <ArrowRight size={15} />
        </button>
        <button onClick={() => reload(windowId, tab.id)} aria-label="Reload" className={iconButton}>
          <RotateCw size={13} />
        </button>
        <button onClick={() => go(NEW_TAB_URL)} aria-label="Home" className={iconButton}>
          <House size={14} />
        </button>

        <div className="flex-1 flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1.5 text-xs focus-within:ring-1 focus-within:ring-blue-500/50 min-w-0">
          {isInternalUrl(url) ? (
            <Globe size={11} className="text-white/40 shrink-0" />
          ) : secure ? (
            <Lock size={11} className="text-emerald-400 shrink-0" />
          ) : (
            <TriangleAlert size={11} className="text-amber-400 shrink-0" />
          )}
          <input
            ref={addressRef}
            value={tab.input}
            onChange={(e) => setInput(windowId, tab.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitAddress();
              } else if (e.key === "Escape") {
                setInput(windowId, tab.id, isInternalUrl(url) ? "" : url);
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Search or enter address"
            aria-label="Address and search bar"
            className="bg-transparent outline-none flex-1 min-w-0 placeholder:text-white/30"
            style={{ userSelect: "text" }}
          />
        </div>

        <button
          onClick={() => toggleBookmark(url, tab.title || titleForUrl(url))}
          aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
          aria-pressed={bookmarked}
          className={iconButton}
          disabled={isInternalUrl(url)}
        >
          <Star size={14} className={bookmarked ? "text-amber-300 fill-amber-300" : ""} />
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Browser menu"
            aria-expanded={menuOpen}
            className={iconButton}
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onPointerDown={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-30 w-52 py-1 bg-[#1b1a26] border border-white/10 rounded-lg shadow-2xl text-xs">
                {[
                  {
                    label: "History",
                    icon: HistoryIcon,
                    onClick: () => go("nova://history"),
                  },
                  {
                    label: "Bookmarks",
                    icon: Star,
                    onClick: () => go("nova://bookmarks"),
                  },
                  {
                    label: "Downloads",
                    icon: Download,
                    onClick: () => {},
                  },
                  {
                    label: "Open in a real tab",
                    icon: ExternalLink,
                    onClick: () => {
                      if (!isInternalUrl(url)) {
                        setDownloads(prev => [{ name: titleForUrl(url), url, time: new Date() }, ...prev].slice(0, 20));
                        window.open(url, "_blank", "noopener,noreferrer");
                      }
                    },
                  },
                  {
                    label: "Clear history",
                    icon: Trash2,
                    onClick: clearHistory,
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setMenuOpen(false);
                      item.onClick();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-left text-white/80"
                  >
                    <item.icon size={13} className="text-white/50" /> {item.label}
                  </button>
                ))}
                {downloads.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-white/30 border-t border-white/10 mt-1">
                      Recent downloads
                    </div>
                    {downloads.slice(0, 5).map((d, i) => (
                      <button
                        key={i}
                        onClick={() => openDownload(d)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 text-left"
                      >
                        <Download size={11} className="text-white/40" />
                        <span className="truncate text-white/70">{d.name}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* bookmarks bar */}
      {bookmarks.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-white/10 shrink-0 overflow-x-auto">
          {bookmarks.map((b) => (
            <button
              key={b.id}
              onClick={() => go(b.url, b.title)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/10 text-[11px] text-white/70 shrink-0"
            >
              <Favicon url={b.url} size={12} />
              <span className="truncate max-w-[120px]">{b.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* find in page bar */}
      {findOpen && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/5 shrink-0">
          <Search size={13} className="text-white/40" />
          <input
            ref={findRef}
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find in page"
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500/50 w-48"
          />
          <button
            onClick={() => {
              const iframe = document.querySelector('iframe[title="web-frame"]') as HTMLIFrameElement | null;
              iframe?.focus();
            }}
            className="px-2 py-1 rounded text-[11px] bg-blue-500 hover:bg-blue-400 text-white"
          >
            Find
          </button>
          <button
            onClick={() => {
              setFindOpen(false);
              setFindQuery("");
            }}
            className="p-1 rounded hover:bg-white/10 text-white/50"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* content: internal nova:// pages render natively, the web renders in the frame */}
      <div className="flex-1 min-h-0 flex flex-col">{renderContent()}</div>
    </div>
  );
}
