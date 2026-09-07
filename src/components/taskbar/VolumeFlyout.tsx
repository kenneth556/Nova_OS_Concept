import { motion } from "framer-motion";
import { Volume2, Volume1, VolumeX, Settings2 } from "lucide-react";
import { useSystemStore } from "../../store/systemStore";
import { useWindowStore } from "../../store/windowStore";

interface Props {
  onClose: () => void;
}

/**
 * The taskbar's volume control. Separate from Quick Settings because the
 * speaker icon used to be one of four glyphs inside a single button that only
 * opened the whole panel — clicking "the volume button" never touched volume.
 */
export default function VolumeFlyout({ onClose }: Props) {
  const volume = useSystemStore((s) => s.quickSettings.volume);
  const muted = useSystemStore((s) => s.quickSettings.muted);
  const setQuickSetting = useSystemStore((s) => s.setQuickSetting);
  const openApp = useWindowStore((s) => s.openApp);

  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeX : effective < 50 ? Volume1 : Volume2;

  const setVolume = (value: number) => {
    setQuickSetting("volume", value);
    // Dragging away from zero is an unmute; that's what every OS does.
    if (value > 0 && muted) setQuickSetting("muted", false);
  };

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onPointerDown={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.14 }}
        className="absolute bottom-[60px] right-2 w-64 glass-panel rounded-2xl shadow-2xl z-[9999] p-3.5"
        role="dialog"
        aria-label="Volume"
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs text-white/70">Volume</span>
          <span className="text-xs text-white/45 tabular-nums">
            {muted ? "Muted" : `${volume}%`}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setQuickSetting("muted", !muted)}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
            className={`p-1.5 rounded-lg shrink-0 transition ${
              muted ? "bg-red-500/20 text-red-300" : "hover:bg-white/10 text-white/70"
            }`}
          >
            <Icon size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={effective}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume level"
            className="w-full accent-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-white/10">
          {[0, 25, 50, 75, 100].map((step) => (
            <button
              key={step}
              onClick={() => setVolume(step)}
              className="flex-1 text-[10px] py-1 rounded-md text-white/45 hover:bg-white/10 hover:text-white/80"
            >
              {step}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            onClose();
            openApp("settings");
          }}
          className="w-full mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-white/50 hover:bg-white/10 hover:text-white/80"
        >
          <Settings2 size={12} /> Sound settings
        </button>
      </motion.div>
    </>
  );
}
