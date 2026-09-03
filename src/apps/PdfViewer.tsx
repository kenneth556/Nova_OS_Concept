import { useState, useEffect } from "react";
import { handleCache } from "../store/fsStore";
import type { AppProps } from "../lib/types";

export default function PdfViewer({ appData }: AppProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appData?.path) {
      setError("No PDF file selected.");
      return;
    }

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

  if (error) {
    return <div className="h-full flex items-center justify-center text-white/50">{error}</div>;
  }

  if (!pdfUrl) {
    return <div className="h-full flex items-center justify-center text-white/50 animate-pulse">Loading PDF...</div>;
  }

  return (
    <div className="h-full w-full bg-white">
      <iframe
        src={`${pdfUrl}#toolbar=0`}
        className="w-full h-full border-none"
        title="PDF Viewer"
      />
    </div>
  );
}
