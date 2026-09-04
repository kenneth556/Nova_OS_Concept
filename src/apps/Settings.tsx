import { useState } from "react";
import {
  Settings as SettingsIcon, Palette, Accessibility, User, HardDrive, Grid3x3,
  Shield, RefreshCw, Terminal, Lock, Globe, Keyboard, Mouse, Monitor,
  Volume2, Bell, Info, Search,
} from "lucide-react";
import { useSystemStore } from "../store/systemStore";
import { ACCENTS, resolveAccent } from "../lib/theme";

const categories = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
  { id: "accounts", label: "Accounts", icon: User },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "apps", label: "Apps", icon: Grid3x3 },
  { id: "security", label: "Security", icon: Shield },
  { id: "updates", label: "Updates", icon: RefreshCw },
  { id: "developer", label: "Developer", icon: Terminal },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "language", label: "Language", icon: Globe },
  { id: "keyboard", label: "Keyboard", icon: Keyboard },
  { id: "mouse", label: "Mouse", icon: Mouse },
  { id: "displays", label: "Displays", icon: Monitor },
  { id: "sound", label: "Sound", icon: Volume2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "about", label: "About", icon: Info },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-10 h-5.5 rounded-full p-0.5 transition ${checked ? "bg-blue-500" : "bg-white/15"}`}
      style={{ height: 22 }}
    >
      <div className={`w-4.5 h-4.5 rounded-full bg-white transition-transform ${checked ? "translate-x-4.5" : ""}`} style={{ width: 18, height: 18, transform: checked ? "translateX(18px)" : "translateX(0)" }} />
    </button>
  );
}

export default function Settings() {
  const [active, setActive] = useState("appearance");
  const [query, setQuery] = useState("");
  // Individual selectors: subscribing to the whole store re-rendered Settings
  // once a second, because the clock lives in there too.
  const quickSettings = useSystemStore((s) => s.quickSettings);
  const setQuickSetting = useSystemStore((s) => s.setQuickSetting);

  const filtered = categories.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="h-full flex bg-[#141420] text-white text-sm">
      <div className="w-56 border-r border-white/10 flex flex-col">
        <div className="p-3 border-b border-white/10">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
            <Search size={13} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a setting"
              className="bg-transparent text-xs outline-none placeholder:text-white/30 w-full"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left ${
                active === c.id ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/5 text-white/70"
              }`}
            >
              <c.icon size={15} /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {active === "appearance" && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Appearance</h2>
            <p className="text-white/40 text-xs mb-5">Personalize how NovaOS looks and feels.</p>

            <div className="space-y-1">
              <Row label="Dark mode" desc="Use a dark color scheme across the system">
                <Toggle checked={quickSettings.darkMode} onChange={(v) => setQuickSetting("darkMode", v)} />
              </Row>
            </div>

            <h3 className="text-sm font-medium mt-6 mb-2 text-white/70">Display</h3>
            <div className="space-y-3 mb-2">
              <label className="block">
                <span className="text-xs text-white/60">Brightness — {quickSettings.brightness}%</span>
                <input
                  type="range"
                  min={35}
                  max={100}
                  value={quickSettings.brightness}
                  onChange={(e) => setQuickSetting("brightness", Number(e.target.value))}
                  className="w-full mt-1 accent-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-xs text-white/60">Volume — {quickSettings.volume}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={quickSettings.volume}
                  onChange={(e) => setQuickSetting("volume", Number(e.target.value))}
                  className="w-full mt-1 accent-blue-500"
                />
              </label>
            </div>

            <h3 className="text-sm font-medium mt-6 mb-2 text-white/70">Background</h3>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {[
                "/wallpapers/neon_glass.png",
                "/wallpapers/synthwave.png",
                "/wallpapers/minimal_dark.png",
              ].map((w) => (
                <button
                  key={w}
                  onClick={() => setQuickSetting("wallpaper", w)}
                  aria-label={`Use wallpaper ${w.split("/").pop()}`}
                  className={`aspect-video rounded-lg bg-cover bg-center ring-2 ring-offset-2 ring-offset-[#141420] transition ${quickSettings.wallpaper === w ? "ring-white" : "ring-transparent hover:ring-white/40"}`}
                  style={{ backgroundImage: `url(${w})` }}
                />
              ))}
            </div>

            <h3 className="text-sm font-medium mt-6 mb-2 text-white/70">Accent color</h3>
            <div className="flex gap-2 mb-2">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.value}
                  onClick={() => setQuickSetting("accentColor", accent.value)}
                  aria-label={accent.name}
                  className={`w-8 h-8 rounded-full ring-2 ring-offset-2 ring-offset-[#141420] transition ${
                    resolveAccent(quickSettings.accentColor) === accent.value ? "ring-white" : "ring-transparent hover:ring-white/40"
                  }`}
                  style={{ backgroundColor: accent.value }}
                />
              ))}
            </div>
            <p className="text-[11px] text-white/35">
              The accent recolors selections, focus rings and primary buttons across every app.
            </p>
          </div>
        )}

        {active === "general" && (
          <div>
            <h2 className="text-xl font-semibold mb-1">General</h2>
            <p className="text-white/40 text-xs mb-5">Core system preferences.</p>
            <div className="space-y-1">
              <Row label="Wi-Fi" desc="Home_5G">
                <Toggle checked={quickSettings.wifi} onChange={(v) => setQuickSetting("wifi", v)} />
              </Row>
              <Row label="Bluetooth" desc="Discoverable to nearby devices">
                <Toggle checked={quickSettings.bluetooth} onChange={(v) => setQuickSetting("bluetooth", v)} />
              </Row>
              <Row label="Airplane mode" desc="Disable all wireless connections">
                <Toggle checked={quickSettings.airplaneMode} onChange={(v) => setQuickSetting("airplaneMode", v)} />
              </Row>
            </div>
          </div>
        )}

        {active === "about" && (
          <div>
            <h2 className="text-xl font-semibold mb-1">About</h2>
            <p className="text-white/40 text-xs mb-5">Device specifications and system version.</p>
            <div className="bg-white/5 rounded-xl p-5 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-white/40">System</span><span>NovaOS Phase 1</span></div>
              <div className="flex justify-between"><span className="text-white/40">Version</span><span>0.1.0</span></div>
              <div className="flex justify-between"><span className="text-white/40">Build</span><span>alpha</span></div>
              <div className="flex justify-between"><span className="text-white/40">Device</span><span>Web Browser</span></div>
            </div>
          </div>
        )}

        {!["appearance", "general", "about"].includes(active) && (
          <div className="flex flex-col items-center justify-center h-full text-white/30 gap-2">
            <SettingsIcon size={32} />
            <p className="text-sm">{categories.find((c) => c.id === active)?.label} settings coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-white/40">{desc}</div>
      </div>
      {children}
    </div>
  );
}
