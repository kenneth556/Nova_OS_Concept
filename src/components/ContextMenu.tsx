import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useContextMenuStore } from "../store/contextMenuStore";

export default function ContextMenu() {
  const { isOpen, x, y, items, closeMenu } = useContextMenuStore();

  useEffect(() => {
    const handleGlobalClick = () => {
      if (isOpen) closeMenu();
    };
    window.addEventListener("pointerdown", handleGlobalClick);
    window.addEventListener("blur", closeMenu);
    return () => {
      window.removeEventListener("pointerdown", handleGlobalClick);
      window.removeEventListener("blur", closeMenu);
    };
  }, [isOpen, closeMenu]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className="fixed z-[100] w-48 glass-panel border border-white/10 rounded-xl shadow-2xl py-1 flex flex-col text-[11px] text-white/80 overflow-hidden"
          style={{ top: y, left: x }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()} // Prevent closing immediately
        >
          {items.map((item, idx) => {
            if (item.divider) {
              return <div key={`div-${idx}`} className="h-px bg-white/10 my-1 mx-2" />;
            }
            return (
              <button
                key={`${item.label}-${idx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  closeMenu();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-blue-500 hover:text-white transition-colors text-left"
              >
                {item.icon && <item.icon size={13} className="opacity-70" />}
                {item.label}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
