import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSystemStore } from "./store/systemStore";
import { checkCalendarReminders } from "./store/calendarStore";
import { resolveAccent } from "./lib/theme";
import type { NotificationItem } from "./lib/types";
import Boot from "./components/Boot";
import LockScreen from "./components/LockScreen";
import Desktop from "./components/desktop/Desktop";
import Taskbar from "./components/taskbar/Taskbar";
import ContextMenu from "./components/ContextMenu";
import AltTabOverlay from "./components/AltTabOverlay";

/** Transient popups for notifications raised while the OS is running. */
function Toaster() {
  const notifications = useSystemStore((s) => s.notifications);
  const doNotDisturb = useSystemStore((s) => s.quickSettings.doNotDisturb);
  const dismiss = useSystemStore((s) => s.dismissNotification);
  const [visible, setVisible] = useState<NotificationItem[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (doNotDisturb) return;
    const fresh = notifications.filter(
      (n) => !seen.current.has(n.id) && n.createdAt !== undefined && n.createdAt >= mountedAt.current
    );
    if (fresh.length === 0) return;
    for (const item of fresh) {
      seen.current.add(item.id);
      window.setTimeout(() => {
        setVisible((current) => current.filter((n) => n.id !== item.id));
      }, 5000);
    }
    setVisible((current) => [...fresh, ...current].slice(0, 3));
  }, [notifications, doNotDisturb]);

  return (
    <div className="fixed right-4 bottom-[68px] z-[9997] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence>
        {visible.map((item) => (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              dismiss(item.id);
              setVisible((current) => current.filter((n) => n.id !== item.id));
            }}
            className="pointer-events-auto glass-panel rounded-xl px-3 py-2.5 w-72 text-left flex items-start gap-2.5 shadow-2xl"
          >
            <span className={`w-7 h-7 rounded-lg ${item.iconBg} flex items-center justify-center text-[11px] text-white shrink-0`}>
              {item.app.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-white/90 truncate">{item.title}</span>
              <span className="block text-[11px] text-white/55 line-clamp-2">{item.body}</span>
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

function App() {
  const stage = useSystemStore((s) => s.stage);
  const tick = useSystemStore((s) => s.tick);
  const toggleStartMenu = useSystemStore((s) => s.toggleStartMenu);
  const darkMode = useSystemStore((s) => s.quickSettings.darkMode);
  const accentColor = useSystemStore((s) => s.quickSettings.accentColor);
  const brightness = useSystemStore((s) => s.quickSettings.brightness);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta") {
        toggleStartMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleStartMenu]);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  // Calendar reminders keep running whether or not the app window is open.
  useEffect(() => {
    checkCalendarReminders();
    const id = setInterval(checkCalendarReminders, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="w-screen h-screen relative overflow-hidden select-none"
      data-theme={darkMode ? "dark" : "light"}
      style={{
        // The brightness slider dims the whole shell, like a display backlight.
        filter: `brightness(${Math.max(0.35, Math.min(1, brightness / 100))})`,
        ["--nova-accent" as string]: resolveAccent(accentColor),
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <AnimatePresence mode="wait">
        {stage === "booting" && <Boot key="boot" />}
        {stage === "lock" && <LockScreen key="lock" />}
      </AnimatePresence>

      {stage === "desktop" && (
        <>
          <Desktop />
          <Taskbar />
          <Toaster />
        </>
      )}

      <ContextMenu />
      {stage === "desktop" && <AltTabOverlay />}
    </div>
  );
}

export default App;
