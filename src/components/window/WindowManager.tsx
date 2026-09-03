import { AnimatePresence } from "framer-motion";
import { useWindowStore } from "../../store/windowStore";
import Window from "./Window";

export default function WindowManager() {
  const windows = useWindowStore((s) => s.windows);
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="relative w-full h-full pointer-events-auto">
        {/*
          Every window is rendered, including the ones on other virtual desktops.
          Window hides itself instead of unmounting so apps never lose state.
          AnimatePresence lives here so close animations actually run.
        */}
        <AnimatePresence>
          {windows.map((w) => (
            <Window key={w.windowId} win={w} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
