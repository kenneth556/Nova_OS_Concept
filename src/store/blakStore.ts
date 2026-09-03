import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A `.blak` package: JSON metadata wrapped around the program source. */
export interface BlakPackage {
  blak: 1;
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string;
  color: string;
  permissions: string[];
  source: string;
}

export interface InstalledApp extends BlakPackage {
  id: string;
  /** Permissions the user actually approved at install time. */
  granted: string[];
  installedAt: number;
}

interface BlakStore {
  apps: InstalledApp[];
  install: (pkg: BlakPackage, granted: string[]) => InstalledApp;
  uninstall: (id: string) => void;
  setGranted: (id: string, granted: string[]) => void;
  updateSource: (id: string, source: string) => void;
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "app";

export const packageId = (name: string) => `blak-${slugify(name)}`;

/** Serialises a program into the on-disk `.blak` format. */
export const serializePackage = (pkg: BlakPackage): string => JSON.stringify(pkg, null, 2);

export const parsePackage = (text: string): BlakPackage => {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a valid .blak package (it should contain JSON).");
  }
  if (!raw || typeof raw !== "object") throw new Error("That .blak package is empty.");
  if (typeof raw.source !== "string" || raw.source.trim() === "") {
    throw new Error("That .blak package has no BLAK source in it.");
  }
  return {
    blak: 1,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Untitled app",
    version: typeof raw.version === "string" ? raw.version : "1.0.0",
    author: typeof raw.author === "string" ? raw.author : "Unknown",
    description: typeof raw.description === "string" ? raw.description : "",
    icon: typeof raw.icon === "string" && raw.icon ? raw.icon : "📦",
    color: typeof raw.color === "string" && raw.color ? raw.color : "bg-indigo-500",
    permissions: Array.isArray(raw.permissions) ? raw.permissions.filter((p: unknown) => typeof p === "string") : [],
    source: raw.source,
  };
};

export const useBlakStore = create<BlakStore>()(
  persist(
    (set) => ({
      apps: [],

      install: (pkg, granted) => {
        const id = packageId(pkg.name);
        const app: InstalledApp = { ...pkg, id, granted, installedAt: Date.now() };
        set((s) => ({
          // Re-installing replaces the existing copy rather than duplicating it.
          apps: [...s.apps.filter((a) => a.id !== id), app],
        }));
        return app;
      },

      uninstall: (id) => set((s) => ({ apps: s.apps.filter((a) => a.id !== id) })),

      setGranted: (id, granted) =>
        set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, granted } : a)) })),

      updateSource: (id, source) =>
        set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, source } : a)) })),
    }),
    {
      name: "novaos-blak-store",
      version: 1,
    }
  )
);

export const findInstalled = (id: string): InstalledApp | undefined =>
  useBlakStore.getState().apps.find((a) => a.id === id);
