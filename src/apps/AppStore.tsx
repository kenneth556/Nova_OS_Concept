import { useMemo, useState } from "react";
import {
  Download, Trash2, Play, ShieldCheck, Upload, Code2, CircleCheck, Search,
  KeyRound, ChevronDown, ChevronUp, Star,
  Home, Library, ArrowLeft,
} from "lucide-react";
import type { AppDefinition, AppProps } from "../lib/types";
import { useBlakStore, parsePackage, packageId, type BlakPackage, type InstalledApp } from "../store/blakStore";
import { useInstallStore } from "../store/installStore";
import { useFsStore } from "../store/fsStore";
import { useWindowStore } from "../store/windowStore";
import { INSTALLABLE_APPS } from "./registry";
import { BLAK_SAMPLES } from "../blak/samples";
import { PERMISSION_LABELS, PERMISSIONS } from "../blak/types";
import type { Permission } from "../blak/types";
import FileDialog from "../components/FileDialog";

const PROJECTS_DIR = "/home/user/projects";



/** The store lists two very different things, so they share one shape here. */
type StoreItem =
  | { kind: "native"; key: string; app: AppDefinition }
  | { kind: "blak"; key: string; pkg: BlakPackage };

const asPackage = (sample: (typeof BLAK_SAMPLES)[number]): BlakPackage => ({
  blak: 1,
  name: sample.name,
  version: sample.version,
  author: sample.author,
  description: sample.description,
  icon: sample.icon,
  color: sample.color,
  permissions: sample.permissions,
  source: sample.source,
  rating: sample.rating,
  reviews: sample.reviews,
});

const permissionLabel = (name: string) =>
  PERMISSIONS.includes(name as Permission)
    ? PERMISSION_LABELS[name as Permission]
    : `Use "${name}" (unknown to this version of NovaOS)`;



const itemName = (item: StoreItem) => (item.kind === "native" ? item.app.title : item.pkg.name);
const itemDescription = (item: StoreItem) =>
  item.kind === "native" ? item.app.store?.description ?? "" : item.pkg.description;
const itemAuthor = (item: StoreItem) =>
  item.kind === "native" ? item.app.store?.author ?? "NovaOS" : item.pkg.author;
const itemRating = (item: StoreItem) =>
  item.kind === "native" ? item.app.store?.rating : item.pkg.rating;
const itemReviews = (item: StoreItem) =>
  item.kind === "native" ? item.app.store?.reviews : item.pkg.reviews;

function StarRating({ value, size = 10 }: { value?: number; size?: number }) {
  if (!value) return null;
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const stars = Array.from({ length: 5 }, (_, i) => i < full ? "full" : i === full && half ? "half" : "empty");
  return (
    <div className="flex items-center gap-0.5">
      {stars.map((state, i) => (
        <Star
          key={i}
          size={size}
          className={
            state === "full"
              ? "text-amber-400 fill-amber-400"
              : state === "half"
                ? "text-amber-400 fill-amber-400/50"
                : "text-white/20"
          }
        />
      ))}
      <span className="text-[10px] text-white/50 ml-1">{value.toFixed(1)}</span>
    </div>
  );
}

/** The gradient tile every listing is represented by. */
function ItemTile({ item, size = 56 }: { item: StoreItem; size?: number }) {
  const bg = item.kind === "native" ? item.app.iconBg : item.pkg.color;
  return (
    <div
      className={`relative ${bg} rounded-2xl flex items-center justify-center shrink-0 overflow-hidden shadow-lg shadow-black/25`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/20" />
      {item.kind === "native" ? (
        <item.app.icon size={Math.round(size * 0.42)} className="text-white relative" />
      ) : (
        <span className="relative leading-none">{item.pkg.icon}</span>
      )}
    </div>
  );
}

export default function AppStore(_props: AppProps) {
  const blakApps = useBlakStore((s) => s.apps);
  const install = useBlakStore((s) => s.install);
  const uninstall = useBlakStore((s) => s.uninstall);
  const installedNative = useInstallStore((s) => s.installed);
  const installNative = useInstallStore((s) => s.install);
  const uninstallNative = useInstallStore((s) => s.uninstall);
  const writeFile = useFsStore((s) => s.writeFile);
  const ensureDir = useFsStore((s) => s.ensureDir);
  const openApp = useWindowStore((s) => s.openApp);

  const [query, setQuery] = useState("");
  const [navTab, setNavTab] = useState<"home" | "library">("home");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [consent, setConsent] = useState<{ pkg: BlakPackage; allow: Set<string> } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const blakById = useMemo(() => {
    const map = new Map<string, InstalledApp>();
    for (const app of blakApps) map.set(app.id, app);
    return map;
  }, [blakApps]);

  const items = useMemo<StoreItem[]>(() => {
    const natives: StoreItem[] = INSTALLABLE_APPS.map((app) => ({
      kind: "native",
      key: `native:${app.id}`,
      app,
    }));
    const catalogue: StoreItem[] = BLAK_SAMPLES.map((sample) => {
      const pkg = asPackage(sample);
      return { kind: "blak", key: `blak:${pkg.name}`, pkg };
    });
    const extras: StoreItem[] = blakApps
      .filter((app) => !BLAK_SAMPLES.some((sample) => packageId(sample.name) === app.id))
      .map((app) => ({ kind: "blak", key: `blak:${app.name}`, pkg: app as BlakPackage }));
    return [...natives, ...catalogue, ...extras];
  }, [blakApps]);

  const isInstalled = (item: StoreItem) =>
    item.kind === "native"
      ? installedNative.includes(item.app.id)
      : blakById.has(packageId(item.pkg.name));

  const beginInstall = (item: StoreItem) => {
    setError(null);
    if (item.kind === "native") {
      installNative(item.app.id);
      setFlash(`Installed ${item.app.title}. It's pinned to your taskbar.`);
      return;
    }
    if (item.pkg.permissions.length === 0) {
      install(item.pkg, []);
      setFlash(`Installed "${item.pkg.name}".`);
      return;
    }
    setConsent({ pkg: item.pkg, allow: new Set(item.pkg.permissions) });
  };

  const removeItem = (item: StoreItem) => {
    if (item.kind === "native") {
      uninstallNative(item.app.id);
      setFlash(`Removed ${item.app.title}. Any open windows were closed.`);
      return;
    }
    const existing = blakById.get(packageId(item.pkg.name));
    if (existing) uninstall(existing.id);
    setFlash(`Removed "${item.pkg.name}".`);
  };

  const openItem = (item: StoreItem) => {
    if (item.kind === "native") openApp(item.app.id);
    else {
      const existing = blakById.get(packageId(item.pkg.name));
      if (existing) openApp("blakApp", { installId: existing.id });
    }
  };

  const confirmInstall = () => {
    if (!consent) return;
    install(consent.pkg, [...consent.allow]);
    setFlash(`Installed "${consent.pkg.name}".`);
    setConsent(null);
  };

  const importPackage = (path: string) => {
    setImportOpen(false);
    setError(null);
    const content = useFsStore.getState().nodes[path]?.content ?? "";
    try {
      const pkg = parsePackage(content);
      setOpenKey(`blak:${pkg.name}`);
      beginInstall({ kind: "blak", key: `blak:${pkg.name}`, pkg });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const editInStudio = (pkg: BlakPackage) => {
    ensureDir(PROJECTS_DIR);
    const target = `${PROJECTS_DIR}/${pkg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.blk`;
    writeFile(target, pkg.source);
    openApp("codeStudio", { path: target });
  };

  const visible = items.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (needle && !itemName(item).toLowerCase().includes(needle) && !itemDescription(item).toLowerCase().includes(needle)) {
      return false;
    }
    if (navTab === "library" && !openKey) return isInstalled(item);
    return true;
  });

  const selected = openKey ? items.find((item) => item.key === openKey) ?? null : null;
  const selectedBlak = selected && selected.kind === "blak" ? blakById.get(packageId(selected.pkg.name)) : undefined;

  const groupedApps = useMemo(() => {
    const groups: Record<string, StoreItem[]> = {
      "Media & Entertainment": [],
      "Productivity & Tools": [],
      "Development & Coding": [],
      "Lifestyle & Finance": [],
      "Other": []
    };
    items.forEach(item => {
      const name = itemName(item);
      if (["NovaTube", "NovaFix", "NovaMusic", "Media Player", "Photos"].includes(name)) groups["Media & Entertainment"].push(item);
      else if (["To-do", "Notepad", "Notes", "Calculator", "Terminal", "Task Manager", "PDF Viewer", "Wiki Peek", "Converter"].includes(name)) groups["Productivity & Tools"].push(item);
      else if (["Code Studio", "Hello World", "Greeter", "Counter", "Tip Split"].includes(name)) groups["Development & Coding"].push(item);
      else if (["Habits", "Money"].includes(name)) groups["Lifestyle & Finance"].push(item);
      else groups["Other"].push(item);
    });
    return groups;
  }, [items]);

  const renderAppCard = (item: StoreItem) => {
    const installedNow = isInstalled(item);
    return (
      <button 
        key={item.key} 
        onClick={() => { setOpenKey(item.key); setShowSource(false); }}
        className="w-[140px] shrink-0 group flex flex-col gap-2 rounded-2xl p-2 hover:bg-white/5 transition text-left"
      >
        <div className="w-full aspect-square rounded-2xl flex items-center justify-center overflow-hidden shadow-md shadow-black/20" style={{ background: item.kind === "native" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.05)" }}>
          <ItemTile item={item} size={100} />
        </div>
        <div className="px-1">
          <div className="text-[12px] font-medium truncate text-white/90">{itemName(item)}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {installedNow ? (
              <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full inline-block">Owned</span>
            ) : (
              <span className="text-[10px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded-full inline-block">Free</span>
            )}
            <StarRating value={itemRating(item)} size={8} />
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="relative h-full flex bg-[#1c1c1c] text-white/90 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-16 shrink-0 bg-black/20 border-r border-white/5 flex flex-col items-center py-6 gap-4 z-10">
        <button onClick={() => { setNavTab("home"); setOpenKey(null); setQuery(""); }} className={`p-3 rounded-xl transition ${navTab === "home" && !openKey ? "bg-blue-500/20 text-blue-400" : "text-white/50 hover:bg-white/10 hover:text-white/80"}`} title="Home">
          <Home size={22} />
        </button>
        <button onClick={() => { setNavTab("library"); setOpenKey(null); setQuery(""); }} className={`p-3 rounded-xl transition ${navTab === "library" && !openKey ? "bg-blue-500/20 text-blue-400" : "text-white/50 hover:bg-white/10 hover:text-white/80"}`} title="Library">
          <Library size={22} />
        </button>
        <div className="mt-auto flex flex-col gap-3">
          <button onClick={() => setImportOpen(true)} className="p-3 rounded-xl text-white/50 hover:bg-white/10 hover:text-white/80 transition" title="Install .blak package">
            <Upload size={22} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#202020]">
        {/* Top Header */}
        <div className="shrink-0 h-16 flex items-center justify-between px-6 z-10">
          <div className="flex items-center w-10">
            {openKey && (
              <button onClick={() => { setOpenKey(null); setShowSource(false); }} className="p-2 rounded-full hover:bg-white/10 text-white/70 transition">
                <ArrowLeft size={20} />
              </button>
            )}
          </div>
          <div className="flex-1 max-w-lg mx-auto">
            <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-full px-4 py-2 w-full focus-within:border-blue-500/50 focus-within:bg-black/40 transition">
              <Search size={16} className="text-white/40" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (openKey) setOpenKey(null); }}
                placeholder="Search apps, games, and more"
                className="bg-transparent text-[13px] outline-none placeholder:text-white/30 flex-1 text-white"
              />
            </div>
          </div>
          <div className="w-10"></div>
        </div>

        {(error || flash) && (
          <div className={`px-6 py-2.5 text-[12px] flex items-center gap-2 z-20 shadow-md ${error ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"}`}>
            {error ? <ShieldCheck size={14} /> : <CircleCheck size={14} />}
            {error ?? flash}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto pb-10 custom-scrollbar">
          {!selected ? (
            query.trim() ? (
              <div className="p-8">
                <h2 className="text-xl font-semibold mb-6">Search results for "{query}"</h2>
                <div className="flex flex-wrap gap-4">
                  {visible.length === 0 ? (
                    <div className="text-white/40 text-sm">No results found.</div>
                  ) : (
                    visible.map(renderAppCard)
                  )}
                </div>
              </div>
            ) : navTab === "library" ? (
              <div className="p-8">
                <h2 className="text-2xl font-semibold mb-6">Library</h2>
                <div className="flex flex-wrap gap-4">
                  {visible.length === 0 ? (
                    <div className="text-white/40 text-sm">You haven't installed any apps yet.</div>
                  ) : (
                    visible.map(renderAppCard)
                  )}
                </div>
              </div>
            ) : (
              <div>
                {/* Hero Banner */}
                {items.length > 0 && (
                  <div className="px-8 pt-2 pb-6">
                    <div className="relative w-full h-64 rounded-3xl overflow-hidden shadow-2xl flex cursor-pointer group" onClick={() => setOpenKey(items[0].key)}>
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-700 to-blue-800 opacity-90 transition group-hover:scale-105 duration-700" />
                      <div className="absolute inset-0 bg-black/20" />
                      <div className="relative z-10 p-10 flex flex-col justify-end w-full">
                        <div className="flex items-center gap-6">
                          <ItemTile item={items[0]} size={90} />
                          <div>
                            <div className="text-sm font-medium text-white/70 mb-1 uppercase tracking-wider">Featured App</div>
                            <h1 className="text-4xl font-bold text-white tracking-tight drop-shadow-md">{itemName(items[0])}</h1>
                            <p className="text-white/80 mt-2 text-sm max-w-xl line-clamp-2">{itemDescription(items[0])}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Categories */}
                <div className="px-8 space-y-10">
                  {Object.entries(groupedApps).map(([category, catItems]) => {
                    if (catItems.length === 0) return null;
                    return (
                      <div key={category}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white">{category}</h3>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                          {catItems.map(item => (
                            <div key={item.key} className="snap-start">
                              {renderAppCard(item)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <div>
              {/* App Details Header Banner */}
              <div className="relative w-full h-72 flex items-end">
                <div className={`absolute inset-0 ${selected.kind === 'native' ? selected.app.iconBg : selected.pkg.color} opacity-30 blur-2xl`} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#202020] via-[#202020]/80 to-transparent" />
                
                <div className="relative z-10 w-full px-10 pb-8 flex items-end gap-6">
                  <ItemTile item={selected} size={120} />
                  <div className="flex-1 mb-2">
                    <h1 className="text-4xl font-bold tracking-tight text-white">{itemName(selected)}</h1>
                    <div className="text-sm text-blue-400 mt-2 font-medium hover:underline cursor-pointer">
                      {itemAuthor(selected)}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1.5">
                        <StarRating value={itemRating(selected) || 4.5} size={14} />
                        <span className="text-white/50 text-xs ml-1">({itemReviews(selected) || 128} ratings)</span>
                      </div>
                      <span className="text-white/30 text-xs px-2 py-0.5 border border-white/10 rounded-md">
                        {selected.kind === "native" ? "Native app" : "BLAK App"}
                      </span>
                    </div>
                  </div>
                  <div className="mb-2">
                    {isInstalled(selected) ? (
                      <div className="flex gap-2">
                        <button onClick={() => openItem(selected)} className="px-8 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm transition shadow-lg shadow-blue-500/25 flex items-center gap-2">
                          <Play size={16} /> Open
                        </button>
                        {selected.kind === "blak" && (
                          <button onClick={() => editInStudio(selected.pkg)} className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition" title="Edit Code">
                            <Code2 size={16} />
                          </button>
                        )}
                        <button onClick={() => removeItem(selected)} className="px-4 py-3 rounded-xl bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 transition" title="Uninstall">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => beginInstall(selected)} className="px-10 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm transition shadow-lg shadow-blue-500/25 flex items-center gap-2">
                        <Download size={16} /> Get
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-10 py-8 flex gap-12">
                <div className="flex-1 space-y-10">
                  {/* Screenshots Placeholder */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Screenshots</h3>
                    <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                      {[1, 2].map((i) => (
                        <div key={i} className="w-[400px] h-[225px] shrink-0 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center snap-start overflow-hidden relative">
                           <div className="absolute inset-0 flex items-center justify-center opacity-10">
                              <ItemTile item={selected} size={200} />
                           </div>
                           <div className="z-10 text-white/20 font-medium">Screenshot {i}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Description</h3>
                    <p className="text-[14px] text-white/70 leading-relaxed whitespace-pre-line max-w-3xl">
                      {itemDescription(selected)}
                    </p>
                  </div>

                  {selected.kind === "blak" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Permissions</h3>
                      {selected.pkg.permissions.length === 0 ? (
                        <div className="text-[14px] text-white/50">This app asks for no special permissions.</div>
                      ) : (
                        <div className="grid gap-3 max-w-xl">
                          {selected.pkg.permissions.map((permission) => {
                            const grantedNow = selectedBlak?.granted.includes(permission);
                            return (
                              <div key={permission} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                <span className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center shrink-0">
                                  <KeyRound size={14} className="text-amber-400" />
                                </span>
                                <span className="text-[13px] text-white/80 flex-1">{permissionLabel(permission)}</span>
                                {selectedBlak && (
                                  <span className={`text-[11px] px-2 py-1 rounded-md ${grantedNow ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/50"}`}>
                                    {grantedNow ? "allowed" : "blocked"}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-8 rounded-xl bg-black/20 border border-white/10 overflow-hidden max-w-3xl">
                        <button onClick={() => setShowSource((v) => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Code2 size={16} /> Source Code
                          </div>
                          <div className="flex items-center gap-1 text-white/40 text-xs">
                            {showSource ? "Hide" : "Show"}
                            {showSource ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </button>
                        {showSource && (
                          <pre className="px-5 pb-5 text-[12px] font-mono text-white/60 overflow-x-auto max-h-96 overflow-y-auto leading-relaxed border-t border-white/5 pt-4">
                            {selected.pkg.source}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column (Discover more) */}
                <div className="w-72 shrink-0 space-y-4">
                  <h3 className="text-lg font-semibold">Discover more</h3>
                  <div className="flex flex-col gap-3">
                    {items.filter(i => i.key !== selected.key).slice(0, 4).map(item => (
                      <button key={item.key} onClick={() => { setOpenKey(item.key); setShowSource(false); }} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition text-left border border-transparent hover:border-white/10">
                        <ItemTile item={item} size={48} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{itemName(item)}</div>
                          <div className="text-[11px] text-white/50 mt-0.5">{item.kind === 'native' ? 'Native app' : 'BLAK App'}</div>
                        </div>
                        <span className="text-[10px] bg-white/10 px-2 py-1 rounded-md text-white/60 shrink-0">Free</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {consent && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <ItemTile item={{ kind: "blak", key: "consent", pkg: consent.pkg }} size={48} />
              <div className="min-w-0">
                <div className="text-base font-semibold truncate">{consent.pkg.name}</div>
                <div className="text-xs text-white/50">wants permission to:</div>
              </div>
            </div>
            <div className="space-y-2 mb-6 bg-black/20 p-3 rounded-xl border border-white/5">
              {consent.pkg.permissions.map((permission) => (
                <label key={permission} className="flex items-start gap-3 text-sm cursor-pointer p-2 rounded-lg hover:bg-white/5 transition">
                  <input
                    type="checkbox"
                    checked={consent.allow.has(permission)}
                    onChange={(e) => {
                      const allow = new Set(consent.allow);
                      if (e.target.checked) allow.add(permission);
                      else allow.delete(permission);
                      setConsent({ ...consent, allow });
                    }}
                    className="mt-0.5 accent-blue-500 w-4 h-4 rounded"
                  />
                  <span className="text-white/80">{permissionLabel(permission)}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConsent(null)} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium transition">
                Cancel
              </button>
              <button onClick={confirmInstall} className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm transition">
                Install
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <FileDialog mode="open" initialDir={PROJECTS_DIR} onCancel={() => setImportOpen(false)} onConfirm={importPackage} />
      )}
    </div>
  );
}
