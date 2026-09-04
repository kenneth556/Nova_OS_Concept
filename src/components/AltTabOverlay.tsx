import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWindowStore } from "../store/windowStore";
import { getApp } from "../apps/registry";

export default function AltTabOverlay() {
  const windows = useWindowStore((s) => s.windows);
  const activeDesktopId = useWindowStore((s) => s.activeDesktopId);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  /*
   * Only windows on the desktop you're looking at. Alt-Tabbing to a window
   * parked on another desktop used to focus something that stayed hidden, so
   * the switch looked like it did nothing.
   */
  const candidates = windows
    .filter((w) => w.desktopId === activeDesktopId)
    .sort((a, b) => b.z - a.z);

  // Read the live list from a ref so the key listeners don't need to be torn
  // down and re-added on every render (they were, on every drag frame).
  const stateRef = useRef({ candidates, isOpen, selectedIndex });
  stateRef.current = { candidates, isOpen, selectedIndex };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { candidates: list, isOpen: open } = stateRef.current;
      if (e.key === "Tab" && e.altKey) {
        if (list.length === 0) return;
        e.preventDefault();
        if (!open) {
          setIsOpen(true);
          setSelectedIndex(list.length > 1 ? 1 : 0);
        } else {
          setSelectedIndex((prev) =>
            e.shiftKey ? (prev - 1 + list.length) % list.length : (prev + 1) % list.length
          );
        }
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const commit = () => {
      const { candidates: list, isOpen: open, selectedIndex: index } = stateRef.current;
      if (!open) return;
      setIsOpen(false);
      const target = list[index] ?? list[0];
      if (target) focusWindow(target.windowId);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        e.preventDefault();
        commit();
      }
    };

    // Alt+Tab out of the browser swallows the keyup, which used to leave the
    // overlay stuck open with no way to dismiss it.
    const handleBlur = () => setIsOpen(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [focusWindow]);

  return (
    <AnimatePresence>
      {isOpen && candidates.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
          role="dialog"
          aria-label="Switch window"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="glass-panel rounded-2xl p-6 flex gap-4 max-w-4xl overflow-x-auto shadow-2xl relative z-10 border border-white/20">
            {candidates.map((win, idx) => {
              const app = getApp(win.appId);
              if (!app) return null;
              const Icon = app.icon;
              return (
                <div
                  key={win.windowId}
                  aria-current={idx === selectedIndex ? "true" : undefined}
                  className={`flex flex-col items-center justify-center gap-3 w-32 h-32 rounded-xl transition-all ${
                    idx === selectedIndex ? "bg-white/20 ring-2 ring-white" : "bg-white/5 opacity-70"
                  }`}
                >
                  <Icon size={40} className="text-white drop-shadow-md" />
                  <span className="text-xs font-medium text-white text-center px-2 truncate w-full drop-shadow">
                    {win.title}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
