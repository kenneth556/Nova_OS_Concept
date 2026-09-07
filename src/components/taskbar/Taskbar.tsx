import { useMemo, useState } from "react";
import { Search, Wifi, Bluetooth, Volume2, Volume1, VolumeX, Battery, Bell, ChevronUp, WifiOff } from "lucide-react";
import { useSystemStore } from "../../store/systemStore";
import { useWindowStore } from "../../store/windowStore";
import { useInstallStore } from "../../store/installStore";
import { useContextMenuStore } from "../../store/contextMenuStore";
import { availableApps } from "../../apps/registry";
import StartMenu from "./StartMenu";
import NotificationCenter from "./NotificationCenter";
import QuickSettings from "./QuickSettings";
import SearchOverlay from "./SearchOverlay";
import VolumeFlyout from "./VolumeFlyout";

export default function Taskbar() {
  const {
    startMenuOpen, toggleStartMenu,
    notificationCenterOpen, toggleNotificationCenter,
    quickSettingsOpen, toggleQuickSettings,
    searchOpen, toggleSearch,
    now, quickSettings, notifications,
  } = useSystemStore();
  const { windows, openApp, focusWindow, minimizeWindow, desktops, activeDesktopId, switchDesktop, addDesktop } = useWindowStore();
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const setQuickSetting = useSystemStore((s) => s.setQuickSetting);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const installed = useInstallStore((s) => s.installed);

  const effectiveVolume = quickSettings.muted ? 0 : quickSettings.volume;
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 50 ? Volume1 : Volume2;

  // Apps downloaded from the App Store appear here once installed.
  const pinnedApps = useMemo(
    () => availableApps(installed).filter((a) => a.pinned),
    [installed]
  );

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });

  const handleTaskClick = (appId: string) => {
    const activeDesktopWindows = windows.filter(w => w.desktopId === activeDesktopId);
    const win = activeDesktopWindows.find((w) => w.appId === appId);
    if (!win) {
      openApp(appId as any);
      return;
    }
    if (win.minimized) {
      focusWindow(win.windowId);
    } else {
      const isFocused = win.z === Math.max(...activeDesktopWindows.map((w) => w.z));
      if (isFocused) minimizeWindow(win.windowId);
      else focusWindow(win.windowId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      { label: "Task Manager", onClick: () => openApp("taskManager" as any) },
      { label: "Taskbar Settings", onClick: () => openApp("settings" as any) },
    ]);
  };

  return (
    <>
      {startMenuOpen && <StartMenu />}
      {notificationCenterOpen && <NotificationCenter />}
      {quickSettingsOpen && <QuickSettings />}
      {searchOpen && <SearchOverlay />}
      {volumeOpen && <VolumeFlyout onClose={() => setVolumeOpen(false)} />}

      <div
        onContextMenu={handleContextMenu}
        className="absolute bottom-0 left-0 right-0 h-14 glass-panel flex items-center px-2 gap-1 z-[9999]"
      >
        {/* Start */}
        <button
          onClick={toggleStartMenu}
          className={`w-11 h-11 rounded-lg flex items-center justify-center transition ${
            startMenuOpen ? "bg-white/15" : "hover:bg-white/10"
          }`}
        >
          <div className="grid grid-cols-2 gap-0.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="w-2 h-2 rounded-[2px] bg-gradient-to-br from-blue-400 to-indigo-500" />
            ))}
          </div>
        </button>

        {/* Search */}
        <button
          onClick={toggleSearch}
          className={`h-11 px-4 rounded-lg flex items-center gap-2 text-white/60 text-xs transition min-w-[160px] ${
            searchOpen ? "bg-white/15" : "hover:bg-white/10 bg-white/5"
          }`}
        >
          <Search size={14} /> Search
        </button>

        {/* Desktop Switcher */}
        <div className="flex items-center ml-2 bg-white/5 rounded-lg p-0.5">
          {desktops.map(d => (
            <button
              key={d}
              onClick={() => switchDesktop(d)}
              className={`px-2 py-1 h-10 rounded-md text-[11px] font-medium transition ${activeDesktopId === d ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
            >
              {d.split(' ')[1]}
            </button>
          ))}
          <button onClick={addDesktop} className="px-2 py-1 h-10 rounded-md text-[11px] text-white/50 hover:bg-white/10 hover:text-white">+</button>
        </div>

        {/* Pinned + running apps */}
        <div className="flex items-center gap-1 ml-2">
          {pinnedApps.map((app) => {
            const activeDesktopWindows = windows.filter(w => w.desktopId === activeDesktopId);
            const win = activeDesktopWindows.find((w) => w.appId === app.id);
            const isOpen = !!win;
            const isFocused = win && win.z === Math.max(0, ...activeDesktopWindows.map((w) => w.z)) && !win.minimized;
            return (
              <button
                key={app.id}
                onClick={() => handleTaskClick(app.id)}
                className={`relative w-11 h-11 rounded-lg flex items-center justify-center transition ${
                  isFocused ? "bg-white/15" : "hover:bg-white/10"
                }`}
                title={app.title}
              >
                <div className={`w-7 h-7 rounded-md ${app.iconBg} flex items-center justify-center`}>
                  <app.icon size={15} className="text-white" />
                </div>
                {isOpen && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* System tray — network and battery open Quick Settings */}
        <button
          onClick={toggleQuickSettings}
          aria-label="Network, Bluetooth and battery"
          className={`h-11 px-2.5 rounded-lg flex items-center gap-2 transition ${
            quickSettingsOpen ? "bg-white/15" : "hover:bg-white/10"
          }`}
        >
          {quickSettings.airplaneMode ? (
            <WifiOff size={14} className="text-white/50" />
          ) : (
            <Wifi size={14} className="text-white/70" />
          )}
          <Bluetooth size={14} className={quickSettings.bluetooth ? "text-white/70" : "text-white/30"} />
          <Battery size={14} className="text-white/70" />
        </button>

        {/* Volume gets its own button and its own control */}
        <button
          onClick={() => setVolumeOpen((v) => !v)}
          onAuxClick={(e) => {
            // Middle click mutes, the same shortcut most desktops offer.
            if (e.button === 1) setQuickSetting("muted", !quickSettings.muted);
          }}
          title={quickSettings.muted ? "Muted" : `Volume ${quickSettings.volume}%`}
          aria-label={quickSettings.muted ? "Volume: muted" : `Volume: ${quickSettings.volume} percent`}
          className={`h-11 w-9 rounded-lg flex items-center justify-center transition ${
            volumeOpen ? "bg-white/15" : "hover:bg-white/10"
          }`}
        >
          <VolumeIcon size={15} className={quickSettings.muted ? "text-white/40" : "text-white/70"} />
        </button>

        {/* Clock / Calendar */}
        <button className="h-11 px-3 rounded-lg hover:bg-white/10 flex flex-col items-center justify-center leading-tight">
          <span className="text-xs text-white">{timeStr}</span>
          <span className="text-[10px] text-white/50">{dateStr}</span>
        </button>

        {/* Notifications */}
        <button
          onClick={toggleNotificationCenter}
          className={`relative h-11 w-11 rounded-lg flex items-center justify-center transition ${
            notificationCenterOpen ? "bg-white/15" : "hover:bg-white/10"
          }`}
        >
          <Bell size={15} className="text-white/70" />
          {notifications.length > 0 && (
            <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
        </button>

        {/* Show desktop sliver */}
        <button className="h-11 w-2 hover:bg-white/10 rounded-l-md ml-1" title="Show desktop">
          <ChevronUp size={10} className="hidden" />
        </button>
      </div>
    </>
  );
}
