import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CalculatorState {
  display: string;
  stored: number | null;
  op: string | null;
  fresh: boolean;
  setDisplay: (v: string) => void;
  setStored: (v: number | null) => void;
  setOp: (v: string | null) => void;
  setFresh: (v: boolean) => void;
}

export const useCalculatorStore = create<CalculatorState>()(
  persist(
    (set) => ({
      display: "0",
      stored: null,
      op: null,
      fresh: true,
      setDisplay: (display) => set({ display }),
      setStored: (stored) => set({ stored }),
      setOp: (op) => set({ op }),
      setFresh: (fresh) => set({ fresh }),
    }),
    {
      name: "novaos-calculator-store",
    }
  )
);
