import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWindowStore } from "../store/windowStore";
import { getApp } from "../apps/registry";

export default function AltTabOverlay() {
  const { windows, focusWindow } = useWindowStore();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Ordered by recently focused (highest z-index first)
  const sortedWindows = [...windows].sort((a, b) => b.z - a.z);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && e.altKey) {
        e.preventDefault();
        if (!isOpen && windows.length > 0) {
          setIsOpen(true);
          setSelectedIndex(1 >= windows.length ? 0 : 1);
        } else if (isOpen) {
          setSelectedIndex((prev) => (prev + 1) % windows.length);
        }
      } else if (e.key === "Alt") {
        // Nothing on down, we wait for release
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        if (sortedWindows.length > 0) {
          focusWindow(sortedWindows[selectedIndex].windowId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isOpen, selectedIndex, windows, focusWindow, sortedWindows]);

  return (
    <AnimatePresence>
      {isOpen && sortedWindows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="glass-panel rounded-2xl p-6 flex gap-4 max-w-4xl overflow-x-auto shadow-2xl relative z-10 border border-white/20">
            {sortedWindows.map((win, idx) => {
              const app = getApp(win.appId);
              if (!app) return null;
              const Icon = app.icon;
              return (
                <div
                  key={win.windowId}
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
