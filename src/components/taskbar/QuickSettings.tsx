import { motion } from "framer-motion";
import { Wifi, Bluetooth, Moon, Plane, BatteryCharging, Focus, Sun, Volume1, VolumeX } from "lucide-react";
import { useSystemStore } from "../../store/systemStore";

function Tile({
  icon: Icon,
  label,
  sub,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 p-3 rounded-xl text-left transition ${
        active ? "bg-blue-500/25 text-blue-200" : "bg-white/5 text-white/70 hover:bg-white/10"
      }`}
    >
      <Icon size={16} />
      <div className="min-w-0">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] opacity-60 truncate">{sub}</div>
      </div>
    </button>
  );
}

export default function QuickSettings() {
  const quickSettings = useSystemStore((s) => s.quickSettings);
  const setQuickSetting = useSystemStore((s) => s.setQuickSetting);
  const closeQuickSettings = useSystemStore((s) => s.closeQuickSettings);

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onPointerDown={closeQuickSettings} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-[60px] right-2 w-[300px] glass-panel rounded-2xl shadow-2xl z-[9999] p-4"
      >
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Tile
            icon={Wifi}
            label="Wi-Fi"
            sub={quickSettings.wifi ? "Home_5G" : "Off"}
            active={quickSettings.wifi}
            onClick={() => setQuickSetting("wifi", !quickSettings.wifi)}
          />
          <Tile
            icon={Bluetooth}
            label="Bluetooth"
            sub={quickSettings.bluetooth ? "On" : "Off"}
            active={quickSettings.bluetooth}
            onClick={() => setQuickSetting("bluetooth", !quickSettings.bluetooth)}
          />
          <Tile
            icon={Moon}
            label="Dark Mode"
            sub={quickSettings.darkMode ? "On" : "Off"}
            active={quickSettings.darkMode}
            onClick={() => setQuickSetting("darkMode", !quickSettings.darkMode)}
          />
          <Tile
            icon={Plane}
            label="Airplane Mode"
            sub={quickSettings.airplaneMode ? "On" : "Off"}
            active={quickSettings.airplaneMode}
            onClick={() => setQuickSetting("airplaneMode", !quickSettings.airplaneMode)}
          />
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-3">
            <Sun size={15} className="text-white/50 shrink-0" />
            <input
              type="range"
              min={0}
              max={100}
              value={quickSettings.brightness}
              onChange={(e) => setQuickSetting("brightness", Number(e.target.value))}
              aria-label="Brightness"
              className="w-full accent-blue-500"
            />
            <span className="text-[10px] text-white/40 w-8 text-right tabular-nums shrink-0">
              {quickSettings.brightness}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuickSetting("muted", !quickSettings.muted)}
              aria-label={quickSettings.muted ? "Unmute" : "Mute"}
              aria-pressed={quickSettings.muted}
              className={`p-1 rounded-md shrink-0 transition ${
                quickSettings.muted ? "bg-red-500/20 text-red-300" : "text-white/50 hover:bg-white/10"
              }`}
            >
              {quickSettings.muted ? <VolumeX size={15} /> : <Volume1 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={quickSettings.muted ? 0 : quickSettings.volume}
              onChange={(e) => {
                const value = Number(e.target.value);
                setQuickSetting("volume", value);
                if (value > 0 && quickSettings.muted) setQuickSetting("muted", false);
              }}
              aria-label="Volume"
              className="w-full accent-blue-500"
            />
            <span className="text-[10px] text-white/40 w-8 text-right tabular-nums shrink-0">
              {quickSettings.muted ? "—" : `${quickSettings.volume}%`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Tile
            icon={BatteryCharging}
            label="Battery"
            sub="100%"
            active={false}
            onClick={() => {}}
          />
          <Tile
            icon={Focus}
            label="Do Not Disturb"
            sub={quickSettings.doNotDisturb ? "On" : "Off"}
            active={quickSettings.doNotDisturb}
            onClick={() => setQuickSetting("doNotDisturb", !quickSettings.doNotDisturb)}
          />
          <Tile
            icon={Focus}
            label="Focus"
            sub="On"
            active={true}
            onClick={() => {}}
          />
        </div>
      </motion.div>
    </>
  );
}
