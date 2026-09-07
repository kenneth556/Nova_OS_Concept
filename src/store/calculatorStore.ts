import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HistoryEntry {
  expr: string;
  result: string;
}

interface CalculatorState {
  display: string;
  stored: number | null;
  op: string | null;
  fresh: boolean;
  scientific: boolean;
  history: HistoryEntry[];
  setDisplay: (v: string) => void;
  setStored: (v: number | null) => void;
  setOp: (v: string | null) => void;
  setFresh: (v: boolean) => void;
  toggleScientific: () => void;
  addHistory: (expr: string, result: string) => void;
  clearHistory: () => void;
}

export const useCalculatorStore = create<CalculatorState>()(
  persist(
    (set) => ({
      display: "0",
      stored: null,
      op: null,
      fresh: true,
      scientific: false,
      history: [],
      setDisplay: (display) => set({ display }),
      setStored: (stored) => set({ stored }),
      setOp: (op) => set({ op }),
      setFresh: (fresh) => set({ fresh }),
      toggleScientific: () => set((s) => ({ scientific: !s.scientific })),
      addHistory: (expr, result) =>
        set((s) => ({
          history: [{ expr, result }, ...s.history].slice(0, 50),
        })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "novaos-calculator-store",
    }
  )
);
