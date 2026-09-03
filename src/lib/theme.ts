export interface AccentOption {
  name: string;
  value: string;
}

export const ACCENTS: AccentOption[] = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Cyan", value: "#06b6d4" },
];

/** Settings used to store accents as tailwind classes; map those forward. */
const LEGACY_ACCENTS: Record<string, string> = {
  "bg-blue-500": "#3b82f6",
  "bg-indigo-500": "#6366f1",
  "bg-purple-500": "#8b5cf6",
  "bg-violet-500": "#8b5cf6",
  "bg-emerald-500": "#10b981",
  "bg-green-500": "#10b981",
  "bg-orange-500": "#f59e0b",
  "bg-amber-500": "#f59e0b",
  "bg-pink-500": "#f43f5e",
  "bg-rose-500": "#f43f5e",
  "bg-red-500": "#ef4444",
  "bg-cyan-500": "#06b6d4",
};

export const resolveAccent = (value: string): string =>
  value.startsWith("#") ? value : LEGACY_ACCENTS[value] ?? "#3b82f6";
