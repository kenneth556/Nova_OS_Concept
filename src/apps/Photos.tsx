import { useState, useEffect } from "react";
import { ZoomIn, ZoomOut, Image as ImageIcon } from "lucide-react";
import { handleCache } from "../store/fsStore";

export default function Photos({ appData }: { appData?: any }) {
  const [scale, setScale] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appData?.path) {
      const loadImg = async () => {
        try {
          const handle = handleCache.get(appData.path);
          if (!handle) throw new Error("File not found. Remount drive.");
          const file = await handle.getFile();
          const url = URL.createObjectURL(file);
          setImageUrl(url);
          return () => URL.revokeObjectURL(url);
        } catch (e: any) {
          setError(e.message);
        }
      };
      let cleanup: any;
      loadImg().then(fn => cleanup = fn);
      return () => cleanup?.();
    }
  }, [appData?.path]);

  return (
    <div className="h-full flex flex-col bg-[#141420] text-white">
      {/* Toolbar */}
      <div className="h-12 border-b border-white/10 flex items-center justify-center gap-4 bg-white/5">
        <button onClick={() => setScale(s => Math.max(0.1, s - 0.2))} className="p-2 hover:bg-white/10 rounded-md">
          <ZoomOut size={16} />
        </button>
        <span className="text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(5, s + 0.2))} className="p-2 hover:bg-white/10 rounded-md">
          <ZoomIn size={16} />
        </button>
      </div>
      
      {/* Image Viewer */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-black/50">
        {error ? (
          <div className="text-white/50">{error}</div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Viewer"
            style={{ transform: `scale(${scale})` }}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-white/30">
            <ImageIcon size={64} className="opacity-50" />
            <p>Open an image from the File Explorer</p>
          </div>
        )}
      </div>
    </div>
  );
}
