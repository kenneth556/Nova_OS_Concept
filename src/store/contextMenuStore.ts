import { create } from "zustand";

export interface ContextMenuItem {
  label: string;
  icon?: any;
  onClick: () => void;
  divider?: boolean;
}

interface ContextMenuStore {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  openMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeMenu: () => void;
}

export const useContextMenuStore = create<ContextMenuStore>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  items: [],
  openMenu: (x, y, items) => {
    // Keep menu on screen
    const menuWidth = 200;
    const menuHeight = items.length * 32 + 16;
    const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
    const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y;
    set({ isOpen: true, x: adjustedX, y: adjustedY, items });
  },
  closeMenu: () => set({ isOpen: false }),
}));
