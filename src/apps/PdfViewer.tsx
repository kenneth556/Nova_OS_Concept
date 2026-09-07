import { useState, useEffect } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { handleCache } from "../store/fsStore";
import type { AppProps } from "../lib/types";

export default function PdfViewer({ appData }: AppProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (!appData?.path) {
      setError("No PDF file selected.");
      return;
    }

    setFileName(appData.path.split("/").pop() ?? "document.pdf");

    const loadPdf = async () => {
      try {
        const handle = handleCache.get(appData.path);
        if (!handle) {
          setError("File handle not found. Please remount the drive.");
          return;
        }

        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        setPdfUrl(url);

        return () => URL.revokeObjectURL(url);
      } catch (err: any) {
        setError(err.message || "Failed to load PDF.");
      }
    };

    let cleanup: (() => void) | undefined;
    loadPdf().then(fn => cleanup = fn as any);

    return () => {
      if (cleanup) cleanup();
    };
  }, [appData?.path]);

  const openInBrowser = () => {
    if (pdfUrl) window.open(pdfUrl, "_blank");
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-white/50">
        <div className="text-center">
          <FileText size={48} className="mx-auto text-white/20 mb-3" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="h-full flex items-center justify-center text-white/50 animate-pulse">
        Loading PDF...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#141420] text-white">
      <div className="h-11 border-b border-white/10 flex items-center px-3 gap-2 bg-white/5 shrink-0">
        <FileText size={16} className="text-white/50" />
        <span className="text-xs text-white/70 truncate flex-1">{fileName}</span>
        <button
          onClick={openInBrowser}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-white/10 hover:bg-white/15 text-white/80"
          title="Open in browser for native PDF controls"
        >
          <ExternalLink size={13} />
          Open in browser
        </button>
      </div>
      <div className="flex-1 min-h-0 bg-white">
        <iframe
          src={pdfUrl}
          className="w-full h-full border-none"
          title="PDF Viewer"
        />
      </div>
    </div>
  );
}
