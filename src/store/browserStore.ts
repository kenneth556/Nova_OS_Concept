import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NEW_TAB_URL, titleForUrl } from "../lib/url";

export interface BrowserTab {
  id: string;
  /** Back/forward stack. `history[index]` is what the content area shows. */
  history: string[];
  index: number;
  /** Address bar text, which may differ from the loaded URL while typing. */
  input: string;
  title: string;
  /** Bumped to force the iframe to remount, i.e. a real reload. */
  reloadKey: number;
}

export interface BrowserSession {
  tabs: BrowserTab[];
  activeId: string;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

const HISTORY_LIMIT = 300;
const TAB_HISTORY_LIMIT = 60;

let seq = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

const makeTab = (url: string = NEW_TAB_URL): BrowserTab => ({
  id: newId("tab-"),
  history: [url],
  index: 0,
  input: url === NEW_TAB_URL ? "" : url,
  title: titleForUrl(url),
  reloadKey: 0,
});

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { id: "bm-wikipedia", title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page" },
  { id: "bm-archive", title: "Internet Archive", url: "https://archive.org" },
  { id: "bm-caniuse", title: "Can I use", url: "https://caniuse.com" },
];

interface BrowserStore {
  sessions: Record<string, BrowserSession>; // keyed by windowId
  bookmarks: Bookmark[];
  history: HistoryEntry[];

  /** Creates this window's session if needed and drops sessions of closed windows. */
  ensureSession: (windowId: string, liveWindowIds: string[]) => void;
  newTab: (windowId: string, url?: string) => void;
  closeTab: (windowId: string, tabId: string) => void;
  selectTab: (windowId: string, tabId: string) => void;
  setInput: (windowId: string, tabId: string, input: string) => void;
  navigate: (windowId: string, tabId: string, url: string, title?: string) => void;
  goBack: (windowId: string, tabId: string) => void;
  goForward: (windowId: string, tabId: string) => void;
  reload: (windowId: string, tabId: string) => void;
  setTabTitle: (windowId: string, tabId: string, title: string) => void;
  toggleBookmark: (url: string, title: string) => void;
  removeBookmark: (id: string) => void;
  clearHistory: () => void;
}

export const useBrowserStore = create<BrowserStore>()(
  persist(
    (set) => {
      /** Applies `fn` to one tab of one window's session. */
      const patchTab = (
        windowId: string,
        tabId: string,
        fn: (tab: BrowserTab) => BrowserTab
      ) =>
        set((s) => {
          const session = s.sessions[windowId];
          if (!session) return s;
          return {
            sessions: {
              ...s.sessions,
              [windowId]: {
                ...session,
                tabs: session.tabs.map((t) => (t.id === tabId ? fn(t) : t)),
              },
            },
          };
        });

      return {
        sessions: {},
        bookmarks: DEFAULT_BOOKMARKS,
        history: [],

        ensureSession: (windowId, liveWindowIds) =>
          set((s) => {
            const live = new Set(liveWindowIds);
            const sessions: Record<string, BrowserSession> = {};
            for (const [id, session] of Object.entries(s.sessions)) {
              if (live.has(id)) sessions[id] = session;
            }
            if (!sessions[windowId]) {
              const tab = makeTab();
              sessions[windowId] = { tabs: [tab], activeId: tab.id };
            }
            return { sessions };
          }),

        newTab: (windowId, url) =>
          set((s) => {
            const session = s.sessions[windowId];
            if (!session) return s;
            const tab = makeTab(url);
            return {
              sessions: {
                ...s.sessions,
                [windowId]: { tabs: [...session.tabs, tab], activeId: tab.id },
              },
            };
          }),

        closeTab: (windowId, tabId) =>
          set((s) => {
            const session = s.sessions[windowId];
            if (!session) return s;
            const index = session.tabs.findIndex((t) => t.id === tabId);
            if (index === -1) return s;

            const tabs = session.tabs.filter((t) => t.id !== tabId);
            // A browser window always has at least one tab.
            if (tabs.length === 0) {
              const tab = makeTab();
              return {
                sessions: { ...s.sessions, [windowId]: { tabs: [tab], activeId: tab.id } },
              };
            }
            const activeId =
              session.activeId === tabId
                ? tabs[Math.min(index, tabs.length - 1)].id
                : session.activeId;
            return { sessions: { ...s.sessions, [windowId]: { tabs, activeId } } };
          }),

        selectTab: (windowId, tabId) =>
          set((s) => {
            const session = s.sessions[windowId];
            if (!session || session.activeId === tabId) return s;
            return { sessions: { ...s.sessions, [windowId]: { ...session, activeId: tabId } } };
          }),

        setInput: (windowId, tabId, input) => patchTab(windowId, tabId, (t) => ({ ...t, input })),

        navigate: (windowId, tabId, url, title) => {
          patchTab(windowId, tabId, (tab) => {
            const current = tab.history[tab.index];
            if (current === url) {
              // Same URL: treat as a reload rather than stacking a duplicate entry.
              return { ...tab, input: url === NEW_TAB_URL ? "" : url, reloadKey: tab.reloadKey + 1 };
            }
            const trimmed = [...tab.history.slice(0, tab.index + 1), url].slice(-TAB_HISTORY_LIMIT);
            return {
              ...tab,
              history: trimmed,
              index: trimmed.length - 1,
              input: url === NEW_TAB_URL ? "" : url,
              title: title ?? titleForUrl(url),
            };
          });

          set((s) => {
            if (url.startsWith("nova://")) return s; // internal pages aren't worth recording
            const last = s.history[0];
            if (last && last.url === url) return s;
            const entry: HistoryEntry = {
              id: newId("h-"),
              url,
              title: title ?? titleForUrl(url),
              visitedAt: Date.now(),
            };
            return { history: [entry, ...s.history].slice(0, HISTORY_LIMIT) };
          });
        },

        goBack: (windowId, tabId) =>
          patchTab(windowId, tabId, (tab) => {
            if (tab.index === 0) return tab;
            const index = tab.index - 1;
            const url = tab.history[index];
            return { ...tab, index, input: url === NEW_TAB_URL ? "" : url, title: titleForUrl(url) };
          }),

        goForward: (windowId, tabId) =>
          patchTab(windowId, tabId, (tab) => {
            if (tab.index >= tab.history.length - 1) return tab;
            const index = tab.index + 1;
            const url = tab.history[index];
            return { ...tab, index, input: url === NEW_TAB_URL ? "" : url, title: titleForUrl(url) };
          }),

        reload: (windowId, tabId) =>
          patchTab(windowId, tabId, (tab) => ({ ...tab, reloadKey: tab.reloadKey + 1 })),

        setTabTitle: (windowId, tabId, title) =>
          patchTab(windowId, tabId, (tab) => (tab.title === title ? tab : { ...tab, title })),

        toggleBookmark: (url, title) =>
          set((s) => {
            const existing = s.bookmarks.find((b) => b.url === url);
            if (existing) return { bookmarks: s.bookmarks.filter((b) => b.id !== existing.id) };
            return { bookmarks: [...s.bookmarks, { id: newId("bm-"), title, url }] };
          }),

        removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

        clearHistory: () => set({ history: [] }),
      };
    },
    {
      name: "novaos-browser-store",
      version: 1,
    }
  )
);
