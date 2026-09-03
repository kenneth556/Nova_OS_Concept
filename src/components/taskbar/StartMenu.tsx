import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Power, RotateCw, Moon, FileText, Boxes } from "lucide-react";
import { APPS } from "../../apps/registry";
import { useWindowStore } from "../../store/windowStore";
import { useSystemStore } from "../../store/systemStore";
import { useFsStore } from "../../store/fsStore";
import { useBlakStore } from "../../store/blakStore";
import { appForFile, joinPath } from "../../lib/fileTypes";
import type { AppId } from "../../lib/types";

const RECENT_DIRS = ["/home/user", "/home/user/documents", "/home/user/desktop", "/home/user/projects"];

export default function StartMenu() {
  const openApp = useWindowStore((s) => s.openApp);
  const closeStartMenu = useSystemStore((s) => s.closeStartMenu);
  const setStage = useSystemStore((s) => s.setStage);
  const nodes = useFsStore((s) => s.nodes);
  const installedApps = useBlakStore((s) => s.apps);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const handleOpen = (id: AppId, appData?: any) => {
    openApp(id, appData);
    closeStartMenu();
  };

  /** Real files from the virtual filesystem, newest first. */
  const recommended = useMemo(() => {
    const found: { path: string; name: string; modified: number }[] = [];
    for (const dir of RECENT_DIRS) {
      for (const child of nodes[dir]?.children ?? []) {
        const path = joinPath(dir, child);
        const node = nodes[path];
        if (node?.type === "file") found.push({ path, name: child, modified: node.modified ?? 0 });
      }
    }
    return found.sort((a, b) => b.modified - a.modified).slice(0, 4);
  }, [nodes]);

  const needle = query.trim().toLowerCase();
  const visibleApps = APPS.filter((app) => {
    if (needle) return app.title.toLowerCase().includes(needle);
    return showAll || app.pinned;
  });
  const visibleBlak = installedApps.filter((app) =>
    needle ? app.name.toLowerCase().includes(needle) : true
  );

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onPointerDown={closeStartMenu} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-[60px] left-2 w-[380px] glass-panel rounded-2xl shadow-2xl z-[9999] p-4"
      >
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 mb-4">
          <Search size={13} className="text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps and files"
            aria-label="Search apps"
            className="bg-transparent text-xs outline-none placeholder:text-white/30 w-full text-white"
          />
        </div>

        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs text-white/50">{needle ? "Results" : showAll ? "All apps" : "Pinned"}</span>
          {!needle && (
            <button onClick={() => setShowAll((v) => !v)} className="text-[11px] text-white/40 hover:text-white/70">
              {showAll ? "Show less" : `All apps (${APPS.length})`} &gt;
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-2 mb-4 max-h-56 overflow-y-auto">
          {visibleApps.map((app) => (
            <button
              key={app.id}
              onClick={() => handleOpen(app.id)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-white/10"
            >
              <div className={`w-9 h-9 rounded-lg ${app.iconBg} flex items-center justify-center`}>
                <app.icon size={17} className="text-white" />
              </div>
              <span className="text-[10px] text-white/70 text-center leading-tight">{app.title}</span>
            </button>
          ))}
        </div>

        {visibleBlak.length > 0 && (
          <>
            <div className="text-xs text-white/50 mb-2 px-1 flex items-center gap-1.5">
              <Boxes size={11} /> Installed BLAK apps
            </div>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {visibleBlak.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleOpen("blakApp", { installId: app.id })}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-white/10"
                >
                  <div className={`w-9 h-9 rounded-lg ${app.color} flex items-center justify-center text-base`}>
                    {app.icon}
                  </div>
                  <span className="text-[10px] text-white/70 text-center leading-tight truncate w-full">{app.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {!needle && recommended.length > 0 && (
          <>
            <div className="text-xs text-white/50 mb-2 px-1">Recommended</div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {recommended.map((file) => (
                <button
                  key={file.path}
                  onClick={() => handleOpen(appForFile(file.path), { path: file.path })}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 text-left"
                >
                  <FileText size={20} className="text-white/60 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-white truncate">{file.name}</div>
                    <div className="text-[10px] text-white/40 truncate">{file.path}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="border-t border-white/10 pt-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-semibold">A</div>
            <div>
              <div className="text-xs text-white">Alex</div>
              <div className="text-[10px] text-white/40">alex@example.com</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                closeStartMenu();
                setStage("lock");
              }}
              className="p-2 rounded-lg hover:bg-white/10"
              title="Lock"
              aria-label="Lock"
            >
              <Moon size={14} className="text-white/60" />
            </button>
            <button
              onClick={() => {
                closeStartMenu();
                setStage("booting");
              }}
              className="p-2 rounded-lg hover:bg-white/10"
              title="Restart"
              aria-label="Restart"
            >
              <RotateCw size={14} className="text-white/60" />
            </button>
            <button
              onClick={() => {
                closeStartMenu();
                setStage("lock");
              }}
              className="p-2 rounded-lg hover:bg-white/10"
              title="Sign out"
              aria-label="Sign out"
            >
              <Power size={14} className="text-white/60" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
