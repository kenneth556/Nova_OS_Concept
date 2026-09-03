import { create } from "zustand";

interface ClipboardState {
  files: string[];
  action: "copy" | "cut" | null;
  setClipboard: (files: string[], action: "copy" | "cut") => void;
  clearClipboard: () => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  files: [],
  action: null,
  setClipboard: (files, action) => set({ files, action }),
  clearClipboard: () => set({ files: [], action: null }),
}));
