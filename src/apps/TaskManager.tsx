import { useState, useEffect } from "react";
import { useWindowStore } from "../store/windowStore";
import { getApp } from "./registry";
import { Cpu, MemoryStick } from "lucide-react";

export default function TaskManager() {
  const windows = useWindowStore(s => s.windows);
  const closeWindow = useWindowStore(s => s.closeWindow);
  
  const [cpuUsage, setCpuUsage] = useState(0);
  const [ramUsage, setRamUsage] = useState(0);

  useEffect(() => {
    const updateStats = () => {
      // Mock CPU usage based on window count with some jitter
      const baseCpu = Math.min(100, windows.length * 4 + Math.random() * 5);
      setCpuUsage(baseCpu);
      
      // Use real memory API if available, else mock
      const perf = performance as any;
      if (perf.memory) {
        const used = perf.memory.usedJSHeapSize / 1048576; // MB
        const limit = perf.memory.jsHeapSizeLimit / 1048576;
        setRamUsage(Math.min(100, (used / limit) * 100));
      } else {
        const baseRam = Math.min(100, 20 + windows.length * 8 + Math.random() * 2);
        setRamUsage(baseRam);
      }
    };
    
    updateStats();
    const id = setInterval(updateStats, 2000);
    return () => clearInterval(id);
  }, [windows.length]);

  return (
    <div className="h-full flex flex-col bg-[#1e1e2e] text-white/80">
      <div className="flex gap-4 p-4 border-b border-white/10 bg-white/5">
        <div className="flex-1 glass-panel rounded-lg p-3 flex items-center gap-4">
          <Cpu className="text-blue-400" size={24} />
          <div>
            <div className="text-xs text-white/50">CPU Usage</div>
            <div className="text-xl font-semibold text-white">{cpuUsage.toFixed(1)}%</div>
          </div>
        </div>
        <div className="flex-1 glass-panel rounded-lg p-3 flex items-center gap-4">
          <MemoryStick className="text-purple-400" size={24} />
          <div>
            <div className="text-xs text-white/50">Memory Usage</div>
            <div className="text-xl font-semibold text-white">{ramUsage.toFixed(1)}%</div>
          </div>
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
                  <td className="px-4 py-2 text-green-400 text-xs">Running</td>
                  <td className="px-4 py-2 text-xs">{(15 + Math.random() * 30).toFixed(1)} MB</td>
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
