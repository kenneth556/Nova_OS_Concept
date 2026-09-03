import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useSystemStore } from "../../store/systemStore";

export default function NotificationCenter() {
  const { notifications, clearNotifications, closeNotificationCenter } = useSystemStore();

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onPointerDown={closeNotificationCenter} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-[60px] right-2 w-[320px] max-h-[70vh] glass-panel rounded-2xl shadow-2xl z-[9999] p-4 flex flex-col"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white">Notifications</span>
          <button onClick={clearNotifications} className="text-[11px] text-white/40 hover:text-white/70">
            Clear all
          </button>
        </div>

        {notifications.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 py-10 gap-2">
            <Bell size={26} />
            <span className="text-xs">No new notifications</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                <div className={`w-8 h-8 rounded-lg ${n.iconBg} shrink-0 flex items-center justify-center text-white text-xs font-semibold`}>
                  {n.app[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-medium text-white">{n.title}</span>
                    <span className="text-[10px] text-white/30 shrink-0 ml-2">{n.time}</span>
                  </div>
                  <div className="text-[11px] text-white/50 truncate">{n.body}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}
