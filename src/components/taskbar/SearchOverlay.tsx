import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, FileText, Folder } from "lucide-react";
import { availableApps } from "../../apps/registry";
import { useWindowStore } from "../../store/windowStore";
import { useSystemStore } from "../../store/systemStore";
import { useFsStore } from "../../store/fsStore";
import { useBlakStore } from "../../store/blakStore";
import { useInstallStore } from "../../store/installStore";
import { appForFile } from "../../lib/fileTypes";
import type { AppId } from "../../lib/types";

interface Result {
  key: string;
  kind: "app" | "blak" | "file" | "folder";
  label: string;
  sublabel?: string;
  run: () => void;
  /** Tailwind class for the tile, or an emoji for BLAK apps. */
  tile: string;
  emoji?: string;
  icon?: (props: { size?: number; className?: string }) => React.ReactNode;
}

export default function SearchOverlay() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const openApp = useWindowStore((s) => s.openApp);
  const closeSearch = useSystemStore((s) => s.closeSearch);
  const nodes = useFsStore((s) => s.nodes);
  const setCurrentPath = useFsStore((s) => s.setCurrentPath);
  const installedApps = useBlakStore((s) => s.apps);
  const installedNative = useInstallStore((s) => s.installed);
  const listRef = useRef<HTMLDivElement>(null);

  const launch = useCallback(
    (id: AppId, appData?: any) => {
      openApp(id, appData);
      closeSearch();
      setQuery("");
    },
    [openApp, closeSearch]
  );

  const needle = query.trim().toLowerCase();

  const results = useMemo<Result[]>(() => {
    const found: Result[] = [];

    for (const app of availableApps(installedNative)) {
      if (needle && !app.title.toLowerCase().includes(needle)) continue;
      found.push({
        key: `app-${app.id}`,
        kind: "app",
        label: app.title,
        sublabel: "App",
        tile: app.iconBg,
        icon: (props) => <app.icon {...props} />,
        run: () => launch(app.id),
      });
    }

    for (const app of installedApps) {
      if (needle && !app.name.toLowerCase().includes(needle)) continue;
      found.push({
        key: `blak-${app.id}`,
        kind: "blak",
        label: app.name,
        sublabel: "BLAK app",
        tile: app.color,
        emoji: app.icon,
        run: () => launch("blakApp", { installId: app.id }),
      });
    }

    // Files only appear once there's something to match, otherwise the list is
    // just noise.
    if (needle.length >= 2) {
      for (const [path, node] of Object.entries(nodes)) {
        if (path === "/" || !node.name.toLowerCase().includes(needle)) continue;
        if (node.type === "dir") {
          found.push({
            key: `dir-${path}`,
            kind: "folder",
            label: node.name,
            sublabel: path,
            tile: "bg-yellow-500/80",
            icon: (props) => <Folder {...props} />,
            run: () => {
              setCurrentPath(path);
              launch("files");
            },
          });
        } else {
          found.push({
            key: `file-${path}`,
            kind: "file",
            label: node.name,
            sublabel: path,
            tile: "bg-white/15",
            icon: (props) => <FileText {...props} />,
            run: () => launch(appForFile(path), { path }),
          });
        }
        if (found.length > 40) break;
      }
    }

    return found.slice(0, 40);
  }, [needle, nodes, installedApps, installedNative, launch, setCurrentPath]);

  useEffect(() => setSelected(0), [needle]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[selected]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onPointerDown={closeSearch} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-[60px] left-2 w-[380px] glass-panel rounded-2xl shadow-2xl z-[9999] p-4"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 mb-3">
          <Search size={13} className="text-white/50" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps, BLAK apps and files"
            aria-label="Search"
            className="bg-transparent text-xs outline-none placeholder:text-white/30 w-full text-white"
          />
        </div>
        <div ref={listRef} className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {results.length === 0 && (
            <div className="text-xs text-white/30 px-2 py-4 text-center">No results for "{query}"</div>
          )}
          {results.map((result, index) => (
            <button
              key={result.key}
              onClick={result.run}
              onPointerEnter={() => setSelected(index)}
              className={`flex items-center gap-3 px-2 py-2 rounded-lg text-left ${
                index === selected ? "bg-white/15" : "hover:bg-white/10"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg ${result.tile} flex items-center justify-center shrink-0 text-sm`}>
                {result.emoji ?? result.icon?.({ size: 16, className: "text-white" })}
              </div>
              <div className="min-w-0">
                <div className="text-xs text-white truncate">{result.label}</div>
                {result.sublabel && (
                  <div className="text-[10px] text-white/40 truncate">{result.sublabel}</div>
                )}
              </div>
            </button>
          ))}
        </div>
        {results.length > 0 && (
          <div className="text-[10px] text-white/30 mt-2 px-1">↑↓ to move · Enter to open · Esc to close</div>
        )}
      </motion.div>
    </>
  );
}
