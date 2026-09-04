import type { StateStorage } from "zustand/middleware";

/**
 * localStorage with coalesced writes.
 *
 * Window drags call `moveWindow` on every pointermove and the clock ticks every
 * second, so an unbuffered `persist` was serialising the whole store to disk
 * dozens of times a second. Writes are batched here instead, and flushed when
 * the tab is hidden or unloaded so nothing is lost.
 */

const FLUSH_DELAY = 350;

const pending = new Map<string, string>();
let timer: number | null = null;

const flush = () => {
  timer = null;
  if (pending.size === 0) return;
  for (const [key, value] of pending) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      // Quota is the realistic failure here (Paint stores PNG data URLs).
      console.warn(`[NovaOS] couldn't persist "${key}":`, err);
    }
  }
  pending.clear();
};

const schedule = () => {
  if (timer !== null) return;
  timer = window.setTimeout(flush, FLUSH_DELAY);
};

export const throttledLocalStorage: StateStorage = {
  getItem: (name) => {
    // A queued write is newer than what's on disk.
    const queued = pending.get(name);
    if (queued !== undefined) return queued;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    pending.set(name, value);
    schedule();
  },
  removeItem: (name) => {
    pending.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* nothing to do */
    }
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Exposed for tests and for anything that needs a synchronous commit. */
export const flushPersistedState = flush;
