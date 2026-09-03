import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSystemStore } from "../store/systemStore";

const stages = [
  "Checking updates",
  "Initializing system",
  "Loading drivers",
  "Preparing desktop",
];

export default function Boot() {
  const setStage = useSystemStore((s) => s.setStage);
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIdx((i) => {
        if (i >= stages.length - 1) {
          clearInterval(interval);
          setTimeout(() => setStage("lock"), 500);
          return i;
        }
        return i + 1;
      });
    }, 550);
    return () => clearInterval(interval);
  }, [setStage]);

  return (
    <div className="w-full h-full bg-black flex flex-col items-center justify-center gap-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center"
      >
        <div className="grid grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-[3px] bg-white/90" />
          ))}
        </div>
      </motion.div>

      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-white/15 border-t-white/70 rounded-full animate-spin" />
        <motion.span
          key={stageIdx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white/50 text-xs tracking-wide"
        >
          {stages[stageIdx]}
        </motion.span>
      </div>
    </div>
  );
}
