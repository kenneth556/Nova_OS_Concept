/**
 * Facts about the running system for the About page.
 *
 * Everything here is measured or read from a real browser API. Anything a
 * browser refuses to expose is reported as unavailable rather than guessed.
 */

export const OS_NAME = "NovaOS";
export const OS_VERSION = "1.0";
export const OS_CHANNEL = "developer preview";
export const BLAK_VERSION = "1.0";

/** Captured when the module first loads, i.e. when the OS booted this session. */
export const SESSION_STARTED_AT = Date.now();

export interface InfoRow {
  label: string;
  value: string;
  /** Set when the browser can't tell us, so the UI can dim it. */
  unavailable?: boolean;
}

const unknown = (label: string): InfoRow => ({ label, value: "Not reported", unavailable: true });

/** Best-effort browser name and version out of the user-agent string. */
export const detectBrowser = (): string => {
  const ua = navigator.userAgent;
  const brands = (navigator as any).userAgentData?.brands as { brand: string; version: string }[] | undefined;
  if (brands && brands.length > 0) {
    const real = brands.find(
      (b) => !/not.a.brand/i.test(b.brand) && !/chromium/i.test(b.brand)
    ) ?? brands.find((b) => !/not.a.brand/i.test(b.brand));
    if (real) return `${real.brand} ${real.version}`;
  }
  const patterns: [RegExp, string][] = [
    [/Edg\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  for (const [pattern, name] of patterns) {
    const match = ua.match(pattern);
    if (match) return `${name} ${match[1].split(".")[0]}`;
  }
  return "Unknown browser";
};

export const detectPlatform = (): string => {
  const data = (navigator as any).userAgentData;
  if (data?.platform) return data.platform;
  const platform = (navigator as any).platform;
  if (typeof platform === "string" && platform) return platform;
  return "Unknown platform";
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
};

export const formatUptime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

/** Hardware and display facts, read synchronously. */
export const collectDeviceInfo = (): InfoRow[] => {
  const rows: InfoRow[] = [];

  rows.push({ label: "Browser", value: detectBrowser() });
  rows.push({ label: "Platform", value: detectPlatform() });

  const cores = navigator.hardwareConcurrency;
  rows.push(
    cores ? { label: "Logical processors", value: String(cores) } : unknown("Logical processors")
  );

  // Chromium only, and deliberately coarse: it reports a rounded GiB figure.
  const memory = (navigator as any).deviceMemory;
  rows.push(
    typeof memory === "number"
      ? { label: "Device memory", value: `${memory} GB or more` }
      : unknown("Device memory")
  );

  rows.push({
    label: "Screen",
    value: `${window.screen.width} × ${window.screen.height} at ${window.devicePixelRatio}×`,
  });
  rows.push({
    label: "Window",
    value: `${window.innerWidth} × ${window.innerHeight}`,
  });
  rows.push({
    label: "Colour depth",
    value: `${window.screen.colorDepth}-bit`,
  });
  rows.push({
    label: "Touch points",
    value: navigator.maxTouchPoints > 0 ? String(navigator.maxTouchPoints) : "No touch input",
  });
  rows.push({
    label: "Language",
    value: navigator.languages?.length ? navigator.languages.slice(0, 3).join(", ") : navigator.language,
  });
  rows.push({
    label: "Time zone",
    value: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Unknown",
  });
  rows.push({ label: "Network", value: navigator.onLine ? "Online" : "Offline" });

  const connection = (navigator as any).connection;
  rows.push(
    connection?.effectiveType
      ? { label: "Connection", value: connection.effectiveType.toUpperCase() }
      : unknown("Connection")
  );

  return rows;
};

/** Which browser features NovaOS depends on, and whether they're present. */
export const collectCapabilities = (): { label: string; supported: boolean; note: string }[] => [
  {
    label: "File System Access",
    supported: "showDirectoryPicker" in window,
    note: "Mounting real folders in File Explorer",
  },
  {
    label: "Persistent storage",
    supported: typeof navigator.storage?.estimate === "function",
    note: "Reporting how much space NovaOS uses",
  },
  {
    label: "Picture in picture",
    supported: "pictureInPictureEnabled" in document,
    note: "Popping video out of Media Player",
  },
  {
    label: "Clipboard write",
    supported: typeof navigator.clipboard?.writeText === "function",
    note: "Copy actions in Paint, Browser and BLAK",
  },
  {
    label: "Fullscreen",
    supported: typeof document.documentElement.requestFullscreen === "function",
    note: "Fullscreen playback",
  },
  {
    label: "Resize observer",
    supported: typeof ResizeObserver !== "undefined",
    note: "Responsive app layouts",
  },
];

export interface StorageReport {
  usage: number;
  quota: number;
  novaBytes: number;
  novaKeys: number;
  supported: boolean;
}

/** Real storage numbers: the origin's quota plus what NovaOS itself wrote. */
export const measureStorage = async (): Promise<StorageReport> => {
  let novaBytes = 0;
  let novaKeys = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const value = window.localStorage.getItem(key) ?? "";
      // UTF-16 in memory, so two bytes per code unit is the honest estimate.
      const size = (key.length + value.length) * 2;
      if (key.startsWith("nova")) {
        novaBytes += size;
        novaKeys++;
      }
    }
  } catch {
    /* storage can be blocked entirely */
  }

  if (typeof navigator.storage?.estimate !== "function") {
    return { usage: 0, quota: 0, novaBytes, novaKeys, supported: false };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      novaBytes,
      novaKeys,
      supported: true,
    };
  } catch {
    return { usage: 0, quota: 0, novaBytes, novaKeys, supported: false };
  }
};

/** JS heap, Chromium only. */
export const measureHeap = (): { used: number; limit: number } | null => {
  const memory = (performance as any).memory;
  if (!memory?.usedJSHeapSize) return null;
  return { used: memory.usedJSHeapSize, limit: memory.jsHeapSizeLimit ?? 0 };
};

export const CREDITS: { label: string; value: string }[] = [
  { label: "Interface", value: "React 19 with Framer Motion" },
  { label: "Build", value: "Vite 8 with Rolldown" },
  { label: "Styling", value: "Tailwind CSS 3" },
  { label: "State", value: "Zustand 5, persisted to localStorage" },
  { label: "Icons", value: "Lucide" },
  { label: "Language", value: `BLAK ${BLAK_VERSION}, written for NovaOS` },
  { label: "Media", value: "Public domain and Creative Commons works via the Internet Archive" },
];
