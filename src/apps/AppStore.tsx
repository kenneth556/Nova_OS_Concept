import { useMemo, useState } from "react";
import {
  Store, Download, Trash2, Play, ShieldCheck, Upload, Code2, CircleCheck, Search,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { useBlakStore, parsePackage, packageId, type BlakPackage, type InstalledApp } from "../store/blakStore";
import { useFsStore } from "../store/fsStore";
import { useWindowStore } from "../store/windowStore";
import { BLAK_SAMPLES } from "../blak/samples";
import { PERMISSION_LABELS, PERMISSIONS } from "../blak/types";
import type { Permission } from "../blak/types";
import FileDialog from "../components/FileDialog";

const PROJECTS_DIR = "/home/user/projects";

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

export default function AppStore(_props: AppProps) {
  const installedApps = useBlakStore((s) => s.apps);
  const install = useBlakStore((s) => s.install);
  const uninstall = useBlakStore((s) => s.uninstall);
  const writeFile = useFsStore((s) => s.writeFile);
  const ensureDir = useFsStore((s) => s.ensureDir);
  const openApp = useWindowStore((s) => s.openApp);

  const catalogue = useMemo(() => BLAK_SAMPLES.map(asPackage), []);
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string>(catalogue[0]?.name ?? "");
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

  const filtered = allPackages.filter((pkg) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return pkg.name.toLowerCase().includes(needle) || pkg.description.toLowerCase().includes(needle);
  });

  const selected = allPackages.find((pkg) => pkg.name === selectedName) ?? filtered[0] ?? null;
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
        consent.allow.size ? ` with ${consent.allow.size} permission${consent.allow.size === 1 ? "" : "s"}` : " with no permissions"
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
      setSelectedName(pkg.name);
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

  const button = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] hover:bg-white/10 text-white/70";

  return (
    <div className="relative h-full flex flex-col bg-[#15141d] text-white/85">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
        <Store size={15} className="text-indigo-300" />
        <span className="text-sm font-medium">App Store</span>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1 ml-3">
          <Search size={12} className="text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps"
            aria-label="Search apps"
            className="bg-transparent text-xs outline-none placeholder:text-white/30 w-36"
          />
        </div>
        <button className={`${button} ml-auto`} onClick={() => setImportOpen(true)}>
          <Upload size={12} /> Install from file
        </button>
      </div>

      {(error || flash) && (
        <div
          className={`px-3 py-1.5 text-[11px] border-b border-white/10 shrink-0 ${
            error ? "bg-red-500/15 text-red-200" : "bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {error ?? flash}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-52 border-r border-white/10 overflow-y-auto p-1.5 shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-white/30 px-2 py-1">
            Catalogue ({filtered.length})
          </div>
          {filtered.map((pkg) => {
            const isInstalled = installedById.has(packageId(pkg.name));
            return (
              <button
                key={pkg.name}
                onClick={() => setSelectedName(pkg.name)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-left ${
                  selected?.name === pkg.name ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-md ${pkg.color} flex items-center justify-center text-sm shrink-0`}
                >
                  {pkg.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs truncate">{pkg.name}</span>
                  <span className="block text-[10px] text-white/40 truncate">
                    {isInstalled ? "Installed" : `v${pkg.version}`}
                  </span>
                </span>
                {isInstalled && <CircleCheck size={12} className="text-emerald-400 shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-[11px] text-white/30 px-2 py-3">Nothing matches that search.</div>
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto">
          {!selected ? (
            <div className="p-6 text-xs text-white/40">Pick an app on the left.</div>
          ) : (
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-14 h-14 rounded-xl ${selected.color} flex items-center justify-center text-2xl shrink-0`}>
                  {selected.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-medium truncate">{selected.name}</div>
                  <div className="text-[11px] text-white/40">
                    v{selected.version} · {selected.author} · BLAK app
                  </div>
                </div>
              </div>

              <div className="text-xs text-white/60 leading-relaxed mb-4" style={{ userSelect: "text" }}>
                {selected.description}
              </div>

              <div className="flex items-center gap-2 mb-5">
                {selectedInstalled ? (
                  <>
                    <button
                      onClick={() => openApp("blakApp", { installId: selectedInstalled.id })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-emerald-500 hover:bg-emerald-400 text-white font-medium"
                    >
                      <Play size={12} /> Open
                    </button>
                    <button className={button} onClick={() => editInStudio(selected)}>
                      <Code2 size={12} /> Edit in Code Studio
                    </button>
                    <button
                      onClick={() => {
                        uninstall(selectedInstalled.id);
                        setFlash(`Removed "${selected.name}".`);
                      }}
                      className={`${button} text-red-300 hover:bg-red-500/15`}
                    >
                      <Trash2 size={12} /> Uninstall
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => beginInstall(selected)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 text-white font-medium"
                    >
                      <Download size={12} /> Install
                    </button>
                    <button className={button} onClick={() => editInStudio(selected)}>
                      <Code2 size={12} /> View the code
                    </button>
                  </>
                )}
              </div>

              <div className="mb-5">
                <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2 flex items-center gap-1.5">
                  <ShieldCheck size={12} /> Permissions
                </div>
                {selected.permissions.length === 0 ? (
                  <div className="text-xs text-white/50">
                    This app asks for nothing. It can only read and write inside its own folder.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selected.permissions.map((permission) => {
                      const grantedNow = selectedInstalled?.granted.includes(permission);
                      return (
                        <div key={permission} className="flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-white/70">{permissionLabel(permission)}</span>
                          {selectedInstalled && (
                            <span className={`text-[10px] ml-auto ${grantedNow ? "text-emerald-400" : "text-white/30"}`}>
                              {grantedNow ? "allowed" : "blocked"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2">Source</div>
                <pre
                  className="p-3 rounded-lg bg-black/30 border border-white/10 text-[11px] font-mono text-white/70 overflow-x-auto max-h-64 overflow-y-auto"
                  style={{ userSelect: "text" }}
                >
                  {selected.source}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {consent && (
        <div
          className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Permission request"
        >
          <div className="w-full max-w-sm bg-[#1b1a26] border border-white/10 rounded-xl shadow-2xl p-4">
            <div className="text-sm font-medium mb-1">{consent.pkg.name} wants access to:</div>
            <div className="text-xs text-white/50 mb-3">
              Uncheck anything you'd rather not allow. The app still installs, but those actions will
              fail with a clear message.
            </div>
            <div className="space-y-2 mb-4">
              {consent.pkg.permissions.map((permission) => (
                <label key={permission} className="flex items-start gap-2 text-xs cursor-pointer">
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
            <div className="flex justify-end gap-2">
              <button onClick={() => setConsent(null)} className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10">
                Cancel
              </button>
              <button
                onClick={confirmInstall}
                className="px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 text-white font-medium"
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
