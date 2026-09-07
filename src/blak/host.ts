import { BlakError } from "./types";
import type { BlakHost, BlakValue } from "./types";
import { useFsStore } from "../store/fsStore";
import { useSystemStore } from "../store/systemStore";
import { useWindowStore } from "../store/windowStore";
import { APPS } from "../apps/registry";
import { isAppInstalled } from "../store/installStore";
import type { AppId } from "../lib/types";
import { dirName } from "../lib/fileTypes";

export interface HostOptions {
  appName: string;
  /** The app's own folder. Paths outside it need `permission files`. */
  dataDir: string;
  onOpenWindow: (name: string) => void;
  /** Called when async work finishes so the UI can rebuild. */
  onChange: () => void;
  /** Close the current BLAK window. */
  closeWindow: () => void;
}

const fromJson = (value: unknown): BlakValue => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return { type: "list", items: value.map(fromJson) };
  if (typeof value === "object") {
    const fields = new Map<string, BlakValue>();
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      fields.set(key, fromJson(item));
    }
    return { type: "object", fields };
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  return String(value);
};

const toJson = (value: BlakValue): unknown => {
  if (value === null) return null;
  if (typeof value === "object") {
    if ((value as any).type === "list") return (value as any).items.map(toJson);
    if ((value as any).type === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of ((value as any).fields as Map<string, BlakValue>)) out[key] = toJson(item);
      return out;
    }
    return null;
  }
  return value;
};

/** Creates every folder along a path that doesn't exist yet. */
const ensureFolder = (path: string) => {
  useFsStore.getState().ensureDir(path);
};

export function createBlakHost(options: HostOptions): BlakHost {
  const netCache = new Map<string, { state: "pending" | "done" | "error"; value: BlakValue; error?: string }>();
  const host: BlakHost = {
    permissions: new Set<string>(),

    readFile: (path) => {
      const resolved = resolve(path, "read");
      const node = useFsStore.getState().nodes[resolved];
      if (!node) throw new BlakError(`There's no file called "${path}"`);
      if (node.type !== "file") throw new BlakError(`"${path}" is a folder, not a file`);
      return node.content ?? "";
    },

    writeFile: (path, content) => {
      const resolved = resolve(path, "write");
      ensureFolder(dirName(resolved));
      useFsStore.getState().writeFile(resolved, content);
    },

    makeFolder: (path) => {
      ensureFolder(resolve(path, "write"));
    },

    listFolder: (path) => {
      const resolved = resolve(path, "read");
      const node = useFsStore.getState().nodes[resolved];
      if (!node || node.type !== "dir") return [];
      return [...(node.children ?? [])];
    },

    fileExists: (path) => Boolean(useFsStore.getState().nodes[resolve(path, "read")]),

    deleteFile: (path) => {
      useFsStore.getState().deleteNode(resolve(path, "write"));
    },

    moveFile: (from, to) => {
      const fs = useFsStore.getState();
      const source = resolve(from, "write");
      const destination = resolve(to, "write");
      const node = fs.nodes[source];
      if (!node) throw new BlakError(`There's no file called "${from}"`);
      if (node.type !== "file") throw new BlakError("Only files can be moved for now");
      ensureFolder(dirName(destination));
      fs.writeFile(destination, node.content ?? "");
      fs.deleteNode(source);
    },

    notify: (message) => {
      requirePermission("notifications", "send notifications");
      useSystemStore.getState().addNotification({
        app: options.appName,
        title: options.appName,
        body: message,
        iconBg: "bg-emerald-500",
      });
    },

    openApp: (name) => {
      const wanted = name.trim().toLowerCase();
      const match = APPS.find(
        (app) => app.title.toLowerCase() === wanted || app.id.toLowerCase() === wanted
      );
      if (!match) throw new BlakError(`There's no app called "${name}"`);
      if (match.installable && !isAppInstalled(match.id)) {
        throw new BlakError(`"${match.title}" isn't installed. Install it from the App Store first.`);
      }
      useWindowStore.getState().openApp(match.id as AppId);
    },

    openBrowser: (url) => {
      useWindowStore.getState().openApp("browser", { startUrl: url });
    },

    copyText: (text) => {
      requirePermission("clipboard", "use the clipboard");
      void navigator.clipboard?.writeText(text);
    },

    setTheme: (theme) => {
      requirePermission("system", "change system settings");
      const dark = theme.trim().toLowerCase() !== "light";
      useSystemStore.getState().setQuickSetting("darkMode", dark);
    },

    fetchGet: (url) => {
      requirePermission("network", "use the network");
      const hit = netCache.get(url);
      if (hit) {
        if (hit.state === "error") throw new BlakError(`The request to ${url} failed: ${hit.error}`);
        return hit.value;
      }
      netCache.set(url, { state: "pending", value: null });
      void fetch(url)
        .then(async (response) => {
          const text = await response.text();
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          try {
            netCache.set(url, { state: "done", value: fromJson(JSON.parse(text)) });
          } catch {
            netCache.set(url, { state: "done", value: text });
          }
        })
        .catch((err: Error) => {
          netCache.set(url, { state: "error", value: null, error: err.message });
        })
        .finally(options.onChange);
      return null;
    },

    fetchPost: (url, body) => {
      requirePermission("network", "use the network");
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toJson(body)),
      })
        .catch(() => {
          /* the program keeps running; failures surface through get() */
        })
        .finally(options.onChange);
    },

    openWindow: options.onOpenWindow,
    closeWindow: options.closeWindow,
  };

  function requirePermission(permission: string, description: string) {
    if (!host.permissions.has(permission)) {
      throw new BlakError(
        `This app needs permission to ${description}. Add "permission ${permission}" inside the app block.`
      );
    }
  }

  /**
   * Relative paths stay inside the app's own folder. Reaching anywhere else in
   * the filesystem requires `permission files`.
   */
  function resolve(path: string, _mode: "read" | "write"): string {
    const trimmed = path.trim();
    if (!trimmed) throw new BlakError("A file name is missing");
    if (trimmed.includes("..")) throw new BlakError(`"${path}" isn't a valid file name`);

    if (!trimmed.startsWith("/")) {
      ensureFolder(options.dataDir);
      return `${options.dataDir}/${trimmed}`;
    }
    if (!trimmed.startsWith(`${options.dataDir}/`) && trimmed !== options.dataDir) {
      requirePermission("files", "read and write your files");
    }
    return trimmed;
  }

  return host;
}
