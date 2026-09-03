import type { AppId } from "./types";

const VIDEO_EXT = ["mp4", "webm", "mkv", "mov", "m4v", "avi"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"];
const PDF_EXT = ["pdf"];

/**
 * Extensions Notepad claims. Anything without an extension is treated as text
 * too, which matches how a real editor behaves with files like `LICENSE`.
 */
const TEXT_EXT = [
  "txt", "md", "markdown", "rst", "log", "csv", "tsv",
  "json", "jsonc", "xml", "yml", "yaml", "toml", "ini", "cfg", "conf", "env",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "css", "scss", "less", "html", "htm", "vue", "svelte",
  "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "cs", "php", "swift", "lua", "sql",
  "sh", "bash", "zsh", "ps1", "bat", "cmd", "gitignore", "editorconfig", "dockerfile", "makefile",
  "blk", "blak",
];

/** Lowercase extension without the dot, or "" when the name has none. */
export const extOf = (path: string): string => {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const baseName = (path: string): string => path.split("/").pop() ?? path;

export const dirName = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
};

export const joinPath = (dir: string, name: string): string =>
  dir === "/" ? `/${name}` : `${dir}/${name}`;

export const isTextFile = (path: string): boolean => {
  const ext = extOf(path);
  return ext === "" || TEXT_EXT.includes(ext);
};

/**
 * Single source of truth for file associations. Both the desktop and the file
 * explorer route double-clicks through here.
 */
export const appForFile = (path: string): AppId => {
  const ext = extOf(path);
  if (ext === "blk") return "codeStudio";
  if (ext === "blak") return "appStore";
  if (VIDEO_EXT.includes(ext)) return "mediaPlayer";
  if (AUDIO_EXT.includes(ext)) return "music";
  if (IMAGE_EXT.includes(ext)) return "photos";
  if (PDF_EXT.includes(ext)) return "pdfViewer";
  return "notepad";
};
