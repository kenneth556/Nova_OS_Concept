import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Note {
  id: string;
  title: string;
  body: string;
  updated: string;
}

const initialNotes: Note[] = [
  { id: "1", title: "Project Ideas", body: "Build NovaOS — a browser OS with windows, apps, and themes.", updated: "2 hours ago" },
  { id: "2", title: "Grocery List", body: "Milk, eggs, coffee, spinach, bread.", updated: "Yesterday" },
  { id: "3", title: "Meeting Notes", body: "Discussed Q3 roadmap and hiring plan.", updated: "3 days ago" },
];

interface NotesState {
  notes: Note[];
  activeId: string;
  setNotes: (notes: Note[] | ((prev: Note[]) => Note[])) => void;
  setActiveId: (id: string) => void;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      notes: initialNotes,
      activeId: initialNotes[0].id,
      setNotes: (updater) =>
        set((state) => ({
          notes: typeof updater === "function" ? updater(state.notes) : updater,
        })),
      setActiveId: (activeId) => set({ activeId }),
    }),
    {
      name: "novaos-notes-store",
    }
  )
);
