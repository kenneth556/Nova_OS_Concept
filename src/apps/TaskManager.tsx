import { useState, useEffect } from "react";
import { useWindowStore } from "../store/windowStore";
import { getApp } from "./registry";
import { Cpu, MemoryStick, Network, Activity } from "lucide-react";

export default function TaskManager() {
  const windows = useWindowStore(s => s.windows);
  const closeWindow = useWindowStore(s => s.closeWindow);

  const [cpuUsage, setCpuUsage] = useState(0);
  const [ramUsage, setRamUsage] = useState(0);
  const [networkSpeed, setNetworkSpeed] = useState(0);
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(20).fill(0));

  useEffect(() => {
    const updateStats = () => {
      const perf = performance as any;
      let ramPercent = 0;
      if (perf.memory) {
        const used = perf.memory.usedJSHeapSize / 1048576;
        const limit = perf.memory.jsHeapSizeLimit / 1048576;
        ramPercent = Math.min(100, (used / limit) * 100);
      } else {
        ramPercent = Math.min(100, 25 + windows.length * 6 + Math.random() * 3);
      }

      const baseCpu = Math.min(100, 5 + windows.length * 3);
      const cpu = Math.max(0, Math.min(100, baseCpu + (Math.random() * 10 - 5)));

      setRamUsage(ramPercent);
      setCpuUsage(cpu);
      setCpuHistory(prev => [...prev.slice(1), cpu]);

      if ((navigator as any).connection) {
        const downlink = (navigator as any).connection.downlink || 0;
        setNetworkSpeed(downlink);
      } else {
        setNetworkSpeed(Math.random() * 10);
      }
    };

    updateStats();
    const id = setInterval(updateStats, 2000);
    return () => clearInterval(id);
  }, [windows.length]);

  const getMemoryForWindow = (_win: any) => {
    const base = 15;
    const variance = Math.random() * 25;
    return `${(base + variance).toFixed(1)} MB`;
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e2e] text-white/80">
      <div className="grid grid-cols-3 gap-3 p-4 border-b border-white/10 bg-white/5">
        <div className="rounded-lg p-3 flex items-center gap-3 bg-white/[0.03] border border-white/[0.06]">
          <Cpu className="text-blue-400" size={20} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-white/40">CPU</div>
            <div className="text-lg font-semibold tabular-nums">{cpuUsage.toFixed(1)}%</div>
          </div>
        </div>
        <div className="rounded-lg p-3 flex items-center gap-3 bg-white/[0.03] border border-white/[0.06]">
          <MemoryStick className="text-purple-400" size={20} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-white/40">Memory</div>
            <div className="text-lg font-semibold tabular-nums">{ramUsage.toFixed(1)}%</div>
          </div>
        </div>
        <div className="rounded-lg p-3 flex items-center gap-3 bg-white/[0.03] border border-white/[0.06]">
          <Network className="text-emerald-400" size={20} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-white/40">Network</div>
            <div className="text-lg font-semibold tabular-nums">{networkSpeed.toFixed(1)} Mbps</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-1 h-8">
          {cpuHistory.map((val, i) => (
            <div
              key={i}
              className="flex-1 bg-blue-500/80 rounded-sm transition-all duration-300"
              style={{ height: `${Math.max(4, (val / 100) * 100)}%` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1 text-[10px] text-white/30">
          <Activity size={10} />
          <span>CPU history (20 ticks)</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#1e1e2e] border-b border-white/10 text-xs text-white/50">
            <tr>
              <th className="px-4 py-2 font-medium">Process Name</th>
              <th className="px-4 py-2 font-medium w-24">Status</th>
              <th className="px-4 py-2 font-medium w-32">Memory</th>
              <th className="px-4 py-2 font-medium w-16 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {windows.map(win => {
              const app = getApp(win.appId);
              if (!app) return null;
              const Icon = app.icon;
              return (
                <tr key={win.windowId} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-4 py-2 flex items-center gap-2">
                    <Icon size={14} className="text-white" />
                    <span className="text-white">{win.title}</span>
                  </td>
                  <td className="px-4 py-2 text-emerald-400 text-xs">Running</td>
                  <td className="px-4 py-2 text-xs tabular-nums">{getMemoryForWindow(win)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => closeWindow(win.windowId)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/20 px-2 py-1 rounded text-xs transition"
                    >
                      End Task
                    </button>
                  </td>
                </tr>
              );
            })}
            {windows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-white/40 text-xs">
                  No active processes
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
