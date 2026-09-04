import { useMemo, useState } from "react";
import {
  Store, Download, Trash2, Play, ShieldCheck, Upload, Code2, CircleCheck, Search, ChevronLeft,
  Sparkles, KeyRound, Boxes, ChevronDown, ChevronUp,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { useBlakStore, parsePackage, packageId, type BlakPackage, type InstalledApp } from "../store/blakStore";
import { useFsStore } from "../store/fsStore";
import { useWindowStore } from "../store/windowStore";
import { APPS } from "./registry";
import { BLAK_SAMPLES } from "../blak/samples";
import { PERMISSION_LABELS, PERMISSIONS } from "../blak/types";
import type { Permission } from "../blak/types";
import FileDialog from "../components/FileDialog";

const PROJECTS_DIR = "/home/user/projects";

type Filter = "all" | "installed" | "available";

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
});

const permissionLabel = (name: string) =>
  PERMISSIONS.includes(name as Permission)
    ? PERMISSION_LABELS[name as Permission]
    : `Use "${name}" (unknown to this version of NovaOS)`;

const countLines = (source: string) => source.trim().split("\n").length;

/** The gradient tile every app is represented by. */
function AppTile({ pkg, size = 56 }: { pkg: BlakPackage; size?: number }) {
  return (
    <div
      className={`relative ${pkg.color} rounded-2xl flex items-center justify-center shrink-0 overflow-hidden shadow-lg shadow-black/25`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/20" />
      <span className="relative leading-none">{pkg.icon}</span>
    </div>
  );
}

export default function AppStore(_props: AppProps) {
  const installedApps = useBlakStore((s) => s.apps);
  const install = useBlakStore((s) => s.install);
  const uninstall = useBlakStore((s) => s.uninstall);
  const writeFile = useFsStore((s) => s.writeFile);
  const ensureDir = useFsStore((s) => s.ensureDir);
  const openApp = useWindowStore((s) => s.openApp);

  const catalogue = useMemo(() => BLAK_SAMPLES.map(asPackage), []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openName, setOpenName] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [consent, setConsent] = useState<{ pkg: BlakPackage; allow: Set<string> } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const installedById = useMemo(() => {
    const map = new Map<string, InstalledApp>();
    for (const app of installedApps) map.set(app.id, app);
    return map;
  }, [installedApps]);

  /** Catalogue entries plus anything installed that isn't in the catalogue. */
  const allPackages = useMemo(() => {
    const extras = installedApps
      .filter((app) => !catalogue.some((pkg) => packageId(pkg.name) === app.id))
      .map((app) => ({ ...app } as BlakPackage));
    return [...catalogue, ...extras];
  }, [catalogue, installedApps]);

  const visible = allPackages.filter((pkg) => {
    const needle = query.trim().toLowerCase();
    if (needle && !pkg.name.toLowerCase().includes(needle) && !pkg.description.toLowerCase().includes(needle)) {
      return false;
    }
    const isInstalled = installedById.has(packageId(pkg.name));
    if (filter === "installed") return isInstalled;
    if (filter === "available") return !isInstalled;
    return true;
  });

  const selected = openName ? allPackages.find((pkg) => pkg.name === openName) ?? null : null;
  const selectedInstalled = selected ? installedById.get(packageId(selected.name)) : undefined;

  const beginInstall = (pkg: BlakPackage) => {
    setError(null);
    if (pkg.permissions.length === 0) {
      install(pkg, []);
      setFlash(`Installed "${pkg.name}".`);
      return;
    }
    setConsent({ pkg, allow: new Set(pkg.permissions) });
  };

  const confirmInstall = () => {
    if (!consent) return;
    install(consent.pkg, [...consent.allow]);
    setFlash(
      `Installed "${consent.pkg.name}"${
        consent.allow.size
          ? ` with ${consent.allow.size} permission${consent.allow.size === 1 ? "" : "s"}`
          : " with no permissions"
      }.`
    );
    setConsent(null);
  };

  const importPackage = (path: string) => {
    setImportOpen(false);
    setError(null);
    const content = useFsStore.getState().nodes[path]?.content ?? "";
    try {
      const pkg = parsePackage(content);
      setOpenName(pkg.name);
      beginInstall(pkg);
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

  const pill = "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] transition";
  const ghost = `${pill} hover:bg-white/10 text-white/65`;

  return (
    <div className="relative h-full flex flex-col bg-[#15141d] text-white/85 overflow-hidden">
      {/* header */}
      <div className="shrink-0 border-b border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent">
        <div className="flex items-center gap-3 px-4 py-3">
          {selected ? (
            <button
              onClick={() => {
                setOpenName(null);
                setShowSource(false);
              }}
              aria-label="Back to the store"
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60"
            >
              <ChevronLeft size={16} />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0">
              <Store size={15} className="text-white" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">App Store</div>
            <div className="text-[11px] text-white/40">
              {installedApps.length} installed · {catalogue.length} in the catalogue
            </div>
          </div>

          {!selected && (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white/[0.07] border border-white/10 rounded-full px-3 py-1.5 focus-within:border-blue-500/50">
                <Search size={12} className="text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search apps"
                  aria-label="Search apps"
                  className="bg-transparent text-xs outline-none placeholder:text-white/30 w-32"
                />
              </div>
              <button className={ghost} onClick={() => setImportOpen(true)}>
                <Upload size={12} /> Install .blak
              </button>
            </div>
          )}
        </div>

        {!selected && (
          <div className="flex items-center gap-1.5 px-4 pb-3">
            {([
              ["all", "All apps"],
              ["available", "Not installed"],
              ["installed", "Installed"],
            ] as [Filter, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`${pill} ${
                  filter === value ? "bg-white text-black font-medium" : "bg-white/[0.07] text-white/60 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {(error || flash) && (
        <div
          className={`px-4 py-2 text-[11px] border-b border-white/10 shrink-0 flex items-center gap-2 ${
            error ? "bg-red-500/15 text-red-200" : "bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {error ? <ShieldCheck size={12} /> : <CircleCheck size={12} />}
          {error ?? flash}
        </div>
      )}

      {/* body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selected ? (
          <div className="p-4">
            {/* Native apps ship with the OS, so they can't be "installed" —
                they're listed here because this is where people look for them. */}
            {filter !== "installed" && !query.trim() && (
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2.5">
                  <span className="text-[11px] uppercase tracking-wide text-white/35">
                    Included with NovaOS
                  </span>
                  <span className="text-[10px] text-white/25">already installed · native apps</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {APPS.filter((app) => app.id !== "blakApp").map((app) => (
                    <button
                      key={app.id}
                      onClick={() => openApp(app.id)}
                      className="shrink-0 w-[104px] p-2.5 rounded-xl bg-white/[0.035] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] transition flex flex-col items-center gap-2"
                    >
                      <span
                        className={`relative w-10 h-10 rounded-xl ${app.iconBg} flex items-center justify-center overflow-hidden`}
                      >
                        <span className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/20" />
                        <app.icon size={18} className="text-white relative" />
                      </span>
                      <span className="text-[10.5px] text-white/70 text-center leading-tight">
                        {app.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-baseline gap-2 mb-2.5">
              <span className="text-[11px] uppercase tracking-wide text-white/35">BLAK apps</span>
              <span className="text-[10px] text-white/25">written in BLAK · install and uninstall</span>
            </div>

            {visible.length === 0 ? (
              <div className="text-center py-16">
                <Boxes size={32} className="mx-auto text-white/15 mb-3" />
                <div className="text-sm text-white/50">Nothing matches that.</div>
                <div className="text-[11px] text-white/30 mt-1">
                  Try a different search, or install a .blak package from disk.
                </div>
              </div>
            ) : (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}
              >
                {visible.map((pkg) => {
                  const app = installedById.get(packageId(pkg.name));
                  const openDetails = () => {
                    setOpenName(pkg.name);
                    setShowSource(false);
                  };
                  return (
                    <div
                      key={pkg.name}
                      className="group p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] hover:border-white/[0.14] transition flex flex-col gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <AppTile pkg={pkg} size={46} />
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={openDetails}
                            className="text-[13px] font-medium truncate block max-w-full text-left hover:underline"
                          >
                            {pkg.name}
                          </button>
                          <div className="text-[11px] text-white/40 truncate">
                            {pkg.author} · v{pkg.version}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            {app ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                                <CircleCheck size={10} /> Installed
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/30">{countLines(pkg.source)} lines of BLAK</span>
                            )}
                            {pkg.permissions.length > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[10px] text-amber-300/80"
                                title={`${pkg.permissions.length} permission${pkg.permissions.length === 1 ? "" : "s"}`}
                              >
                                <KeyRound size={9} /> {pkg.permissions.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11.5px] text-white/50 leading-relaxed line-clamp-2">{pkg.description}</p>
                      <div className="flex items-center gap-2 mt-auto">
                        {app ? (
                          <button
                            onClick={() => openApp("blakApp", { installId: app.id })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] bg-white text-black font-medium hover:bg-white/90"
                          >
                            <Play size={11} /> Open
                          </button>
                        ) : (
                          <button
                            onClick={() => beginInstall(pkg)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] bg-blue-500 text-white font-medium hover:bg-blue-400"
                          >
                            <Download size={11} /> Install
                          </button>
                        )}
                        <button
                          onClick={openDetails}
                          className="text-[10px] text-white/30 hover:text-white/60 ml-auto"
                        >
                          Details →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* hero */}
            <div className="relative px-6 pt-6 pb-5 overflow-hidden">
              <div className={`absolute -top-20 -left-10 w-72 h-72 rounded-full ${selected.color} opacity-20 blur-3xl`} />
              <div className="relative flex items-start gap-4">
                <AppTile pkg={selected} size={72} />
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-semibold tracking-tight truncate">{selected.name}</div>
                  <div className="text-[11px] text-white/45 mt-0.5">
                    {selected.author} · v{selected.version} · {countLines(selected.source)} lines of BLAK
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {selectedInstalled ? (
                      <>
                        <button
                          onClick={() => openApp("blakApp", { installId: selectedInstalled.id })}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs bg-white text-black font-semibold hover:bg-white/90"
                        >
                          <Play size={12} /> Open
                        </button>
                        <button className={ghost} onClick={() => editInStudio(selected)}>
                          <Code2 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => {
                            uninstall(selectedInstalled.id);
                            setFlash(`Removed "${selected.name}".`);
                          }}
                          className={`${pill} text-red-300 hover:bg-red-500/15`}
                        >
                          <Trash2 size={12} /> Uninstall
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => beginInstall(selected)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs bg-blue-500 text-white font-semibold hover:bg-blue-400"
                        >
                          <Download size={12} /> Install
                        </button>
                        <button className={ghost} onClick={() => editInStudio(selected)}>
                          <Code2 size={12} /> View the code
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/35 mb-2">
                  <Sparkles size={11} /> What it does
                </div>
                <p className="text-[12.5px] text-white/65 leading-relaxed" style={{ userSelect: "text" }}>
                  {selected.description}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/35 mb-2.5">
                  <ShieldCheck size={11} /> Permissions
                </div>
                {selected.permissions.length === 0 ? (
                  <div className="text-[12.5px] text-white/55 leading-relaxed">
                    This app asks for nothing. It can only read and write inside its own folder.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selected.permissions.map((permission) => {
                      const grantedNow = selectedInstalled?.granted.includes(permission);
                      return (
                        <div key={permission} className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0">
                            <KeyRound size={12} className="text-amber-300" />
                          </span>
                          <span className="text-[12.5px] text-white/70 flex-1">{permissionLabel(permission)}</span>
                          {selectedInstalled && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full ${
                                grantedNow
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-white/[0.07] text-white/35"
                              }`}
                            >
                              {grantedNow ? "allowed" : "blocked"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] overflow-hidden">
                <button
                  onClick={() => setShowSource((v) => !v)}
                  className="w-full flex items-center gap-1.5 px-4 py-3 text-[11px] uppercase tracking-wide text-white/35 hover:bg-white/[0.03]"
                >
                  <Code2 size={11} /> Source
                  <span className="ml-auto normal-case tracking-normal text-white/30">
                    {showSource ? "Hide" : "Show"}
                  </span>
                  {showSource ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showSource && (
                  <pre
                    className="px-4 pb-4 text-[11px] font-mono text-white/65 overflow-x-auto max-h-72 overflow-y-auto leading-relaxed"
                    style={{ userSelect: "text" }}
                  >
                    {selected.source}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {consent && (
        <div
          className="absolute inset-0 z-30 bg-black/70 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Permission request"
        >
          <div className="w-full max-w-sm bg-[#1b1a26] border border-white/10 rounded-2xl shadow-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <AppTile pkg={consent.pkg} size={40} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{consent.pkg.name}</div>
                <div className="text-[11px] text-white/40">wants permission to:</div>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {consent.pkg.permissions.map((permission) => (
                <label
                  key={permission}
                  className="flex items-start gap-2.5 text-[12.5px] cursor-pointer p-2 rounded-lg hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={consent.allow.has(permission)}
                    onChange={(e) => {
                      const allow = new Set(consent.allow);
                      if (e.target.checked) allow.add(permission);
                      else allow.delete(permission);
                      setConsent({ ...consent, allow });
                    }}
                    className="mt-0.5 accent-blue-500"
                  />
                  <span className="text-white/75">{permissionLabel(permission)}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed mb-4">
              Uncheck anything you'd rather not allow. The app still installs — those actions just fail
              with a clear message instead.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConsent(null)} className={`${pill} bg-white/[0.07] hover:bg-white/10 text-white/70`}>
                Cancel
              </button>
              <button
                onClick={confirmInstall}
                className="px-4 py-1.5 rounded-full text-[11px] bg-blue-500 hover:bg-blue-400 text-white font-semibold"
              >
                Install
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <FileDialog
          mode="open"
          initialDir={PROJECTS_DIR}
          onCancel={() => setImportOpen(false)}
          onConfirm={importPackage}
        />
      )}
    </div>
  );
}
