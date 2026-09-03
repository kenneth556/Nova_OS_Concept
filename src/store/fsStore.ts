import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STARTER_TEMPLATE } from "../blak/samples";

/**
 * Live File System Access API handles for files mounted from the real disk.
 * Deliberately outside the persisted store: handles are not JSON-serialisable,
 * so they are lost on reload and the drive has to be remounted.
 */
export const handleCache = new Map<string, any>();

export interface FSNode {
  name: string;
  type: "file" | "dir";
  content?: string;
  children?: string[]; // array of child names for directories
  created?: number;
  modified?: number;
}

interface FSState {
  nodes: Record<string, FSNode>; // path -> FSNode
  currentPath: string;
  createFile: (path: string, content: string) => void;
  createDir: (path: string) => void;
  /** Create-or-overwrite. This is what the editor saves through. */
  writeFile: (path: string, content: string) => void;
  setCurrentPath: (path: string) => void;
  /** Removes the node and, for directories, everything underneath it. */
  deleteNode: (path: string) => void;
  /** Creates every missing folder along a path, like `mkdir -p`. */
  ensureDir: (path: string) => void;
  /** `/dir/notes.txt` -> `/dir/notes (2).txt` when the name is taken. */
  uniquePath: (dirPath: string, name: string) => string;
}

const splitPath = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() ?? "";
  return { name, parentPath: parts.length ? `/${parts.join("/")}` : "/" };
};

/** Adds a child name to a directory without creating duplicates. */
const linkChild = (parent: FSNode, name: string): FSNode =>
  (parent.children ?? []).includes(name)
    ? parent
    : { ...parent, children: [...(parent.children ?? []), name] };

const initialNodes: Record<string, FSNode> = {
  "/": { name: "/", type: "dir", children: ["home"] },
  "/home": { name: "home", type: "dir", children: ["user"] },
  "/home/user": {
    name: "user",
    type: "dir",
    children: ["desktop", "documents", "downloads", "pictures", "music", "videos", "projects", "apps", "hello.txt"],
  },
  "/home/user/desktop": { name: "desktop", type: "dir", children: [] },
  "/home/user/documents": { name: "documents", type: "dir", children: ["readme.md"] },
  "/home/user/downloads": { name: "downloads", type: "dir", children: [] },
  "/home/user/pictures": { name: "pictures", type: "dir", children: [] },
  "/home/user/music": { name: "music", type: "dir", children: [] },
  "/home/user/videos": { name: "videos", type: "dir", children: [] },
  "/home/user/apps": { name: "apps", type: "dir", children: [] },
  "/home/user/projects": { name: "projects", type: "dir", children: ["hello.blk"] },
  "/home/user/projects/hello.blk": {
    name: "hello.blk",
    type: "file",
    content: STARTER_TEMPLATE,
  },
  "/home/user/hello.txt": {
    name: "hello.txt",
    type: "file",
    content: "Welcome to NovaOS.\n\nThis file lives in the virtual filesystem. Edit it in Notepad and press Ctrl+S to save.\n",
  },
  "/home/user/documents/readme.md": {
    name: "readme.md",
    type: "file",
    content:
      "# NovaOS\n\n- Notepad reads and writes these files for real.\n- Mount a folder from your disk in File Explorer to edit actual files on your machine.\n",
  },
};

export const useFsStore = create<FSState>()(
  persist(
    (set, get) => ({
      nodes: initialNodes,
      currentPath: "/home/user",
      setCurrentPath: (path) => set({ currentPath: path }),

      createFile: (path, content) =>
        set((state) => {
          if (state.nodes[path]) return state; // never clobber; use writeFile for that
          const { name, parentPath } = splitPath(path);
          const parent = state.nodes[parentPath];
          if (!name || !parent || parent.type !== "dir") return state;

          const now = Date.now();
          return {
            nodes: {
              ...state.nodes,
              [path]: { name, type: "file", content, created: now, modified: now },
              [parentPath]: linkChild(parent, name),
            },
          };
        }),

      createDir: (path) =>
        set((state) => {
          if (state.nodes[path]) return state;
          const { name, parentPath } = splitPath(path);
          const parent = state.nodes[parentPath];
          if (!name || !parent || parent.type !== "dir") return state;

          const now = Date.now();
          return {
            nodes: {
              ...state.nodes,
              [path]: { name, type: "dir", children: [], created: now, modified: now },
              [parentPath]: linkChild(parent, name),
            },
          };
        }),

      writeFile: (path, content) =>
        set((state) => {
          const existing = state.nodes[path];
          if (existing && existing.type === "dir") return state;
          const { name, parentPath } = splitPath(path);
          const parent = state.nodes[parentPath];
          if (!name || !parent || parent.type !== "dir") return state;

          const now = Date.now();
          return {
            nodes: {
              ...state.nodes,
              [path]: {
                name,
                type: "file",
                content,
                created: existing?.created ?? now,
                modified: now,
              },
              [parentPath]: linkChild(parent, name),
            },
          };
        }),

      deleteNode: (path) =>
        set((state) => {
          if (path === "/" || !state.nodes[path]) return state;
          const { name, parentPath } = splitPath(path);
          const parent = state.nodes[parentPath];

          const newNodes = { ...state.nodes };
          const prefix = path.endsWith("/") ? path : `${path}/`;
          for (const key of Object.keys(newNodes)) {
            if (key === path || key.startsWith(prefix)) {
              delete newNodes[key];
              handleCache.delete(key);
            }
          }

          if (parent && parent.type === "dir") {
            newNodes[parentPath] = {
              ...parent,
              children: (parent.children ?? []).filter((c) => c !== name),
            };
          }
          return { nodes: newNodes };
        }),

      ensureDir: (path) =>
        set((state) => {
          const parts = path.split("/").filter(Boolean);
          const nodes = { ...state.nodes };
          const now = Date.now();
          let current = "";
          let changed = false;

          for (const part of parts) {
            const parentPath = current === "" ? "/" : current;
            current = `${current}/${part}`;
            if (nodes[current]) continue;
            const parent = nodes[parentPath];
            if (!parent || parent.type !== "dir") break;
            nodes[current] = { name: part, type: "dir", children: [], created: now, modified: now };
            nodes[parentPath] = linkChild(parent, part);
            changed = true;
          }
          return changed ? { nodes } : state;
        }),

      uniquePath: (dirPath, name) => {        const { nodes } = get();
        const join = (n: string) => (dirPath === "/" ? `/${n}` : `${dirPath}/${n}`);
        if (!nodes[join(name)]) return join(name);

        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        for (let i = 2; i < 1000; i++) {
          const candidate = join(`${base} (${i})${ext}`);
          if (!nodes[candidate]) return candidate;
        }
        return join(`${base} (${Date.now()})${ext}`);
      },
    }),
    {
      name: "novaos-fs-store",
      version: 2,
      /**
       * Older saved trees predate the seed folders and timestamps, so merge the
       * seed in rather than dropping whatever the user already created.
       */
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<FSState>;
        const nodes: Record<string, FSNode> = { ...initialNodes, ...(state.nodes ?? {}) };
        for (const [path, seed] of Object.entries(initialNodes)) {
          const stored = nodes[path];
          if (seed.type !== "dir" || !stored || stored.type !== "dir") continue;
          const children = new Set([...(stored.children ?? []), ...(seed.children ?? [])]);
          nodes[path] = { ...stored, children: Array.from(children) };
        }
        return { ...state, nodes, currentPath: state.currentPath ?? "/home/user" } as FSState;
      },
    }
  )
);

/**
 * Reads a file's text, preferring the real bytes when the path is backed by a
 * File System Access handle. Falls back to the virtual node's content.
 */
export const readFileText = async (
  path: string
): Promise<{ text: string; fromDisk: boolean; error?: string }> => {
  const handle = handleCache.get(path);
  const virtual = useFsStore.getState().nodes[path]?.content ?? "";

  if (handle) {
    try {
      const file = await handle.getFile();
      return { text: await file.text(), fromDisk: true };
    } catch (err) {
      return { text: virtual, fromDisk: false, error: (err as Error).message };
    }
  }
  return { text: virtual, fromDisk: false };
};
