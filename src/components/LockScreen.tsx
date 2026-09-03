import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, Lock, Fingerprint } from "lucide-react";
import { useSystemStore } from "../store/systemStore";

export default function LockScreen() {
  const now = useSystemStore((s) => s.now);
  const setStage = useSystemStore((s) => s.setStage);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const wallpaper = useSystemStore((s) => s.quickSettings.wallpaper);

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const handleUnlock = (e?: React.FormEvent) => {
    e?.preventDefault();
    setUnlocking(true);
    setTimeout(() => setStage("desktop"), 400);
  };

  return (
    <motion.div
      animate={{ opacity: unlocking ? 0 : 1, scale: unlocking ? 1.03 : 1 }}
      transition={{ duration: 0.4 }}
      className="w-full h-full relative overflow-hidden flex flex-col items-center"
      style={{
        background: wallpaper 
          ? `url('${wallpaper}') center/cover no-repeat`
          : "radial-gradient(circle at 25% 20%, rgba(88, 60, 190, 0.55), transparent 45%)," +
            "radial-gradient(circle at 75% 15%, rgba(60, 100, 200, 0.4), transparent 40%)," +
            "radial-gradient(circle at 60% 75%, rgba(140, 60, 170, 0.45), transparent 50%)," +
            "linear-gradient(160deg, #0a0b16 0%, #12111f 45%, #1a1330 100%)",
      }}
      onClick={() => setShowPasswordField(true)}
    >
      <div className="mt-20 flex flex-col items-center text-white">
        <span className="text-8xl font-light tabular-nums">{timeStr}</span>
        <span className="text-lg text-white/70 mt-2">{dateStr}</span>
        <div className="flex items-center gap-1.5 mt-3 text-white/50 text-xs">
          <Cloud size={14} /> 22°C · Partly Cloudy
        </div>
      </div>

      {/* notification previews */}
      <div className="mt-8 flex flex-col gap-2 w-72">
        <div className="glass-panel rounded-xl px-4 py-2.5 flex justify-between items-center text-xs text-white">
          <span className="font-medium">Calendar</span>
          <span className="text-white/40">1h ago</span>
        </div>
        <div className="glass-panel rounded-xl px-4 py-2.5 flex justify-between items-center text-xs text-white">
          <span className="font-medium">Mail</span>
          <span className="text-white/40">10m ago</span>
        </div>
      </div>

      <div className="flex-1" />

      <AnimatePresence mode="wait">
        {!showPasswordField ? (
          <motion.div
            key="tap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mb-16 flex flex-col items-center gap-3 text-white/50 text-xs"
          >
            <Fingerprint size={26} className="text-white/40" />
            <span>Click anywhere to sign in</span>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleUnlock}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="mb-16 flex flex-col items-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xl font-semibold text-white mb-1">
              A
            </div>
            <span className="text-white text-sm">Alex</span>
            <div className="relative">
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter PIN (any value works)"
                className="glass-panel rounded-full px-4 py-2 text-xs text-white placeholder:text-white/30 outline-none w-56 text-center"
              />
              <Lock size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
            </div>
            <button
              type="submit"
              className="text-xs text-white/50 hover:text-white/80 mt-1"
            >
              Sign in →
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
