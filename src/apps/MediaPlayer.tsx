import { useEffect, useRef, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, PictureInPicture2,
  FolderOpen, TriangleAlert, Gauge,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import { handleCache, useFsStore } from "../store/fsStore";
import { useSystemStore } from "../store/systemStore";
import { baseName, extOf } from "../lib/fileTypes";
import FileDialog from "../components/FileDialog";

const AUDIO_EXT = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"];

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
};

const RATES = [0.5, 1, 1.25, 1.5, 2];

export default function MediaPlayer({ appData }: AppProps) {
  const nodes = useFsStore((s) => s.nodes);
  // The system volume slider in Quick Settings drives real playback volume.
  const systemVolume = useSystemStore((s) => s.quickSettings.volume);
  const setQuickSetting = useSystemStore((s) => s.setQuickSetting);

  const [path, setPath] = useState<string | null>(appData?.path ?? null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const isAudio = path ? AUDIO_EXT.includes(extOf(path)) : false;

  /* --------------------------------------------------------------- load file */

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setSrc(null);
    setError(null);
    setCurrent(0);
    setDuration(0);
    setPlaying(false);

    if (!path) return;

    const handle = handleCache.get(path);
    if (!handle) {
      setError(
        nodes[path]
          ? "This file came from a mounted drive in an earlier session. Remount the drive in File Explorer to play it."
          : "That file no longer exists."
      );
      return;
    }

    void (async () => {
      try {
        const file = await handle.getFile();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file);
        setSrc(objectUrl);
      } catch (err) {
        if (!cancelled) setError(`Couldn't read the file (${(err as Error).message}).`);
      }
    })();

    // Runs even if the read is still in flight, so the blob is never leaked.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, nodes]);

  /* ------------------------------------------------------------- volume sync */

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.volume = Math.min(1, Math.max(0, systemVolume / 100));
    el.muted = muted;
  }, [systemVolume, muted, src]);

  useEffect(() => {
    const el = mediaRef.current;
    if (el) el.playbackRate = rate;
  }, [rate, src]);

  /* ---------------------------------------------------------------- controls */

  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seekBy = (delta: number) => {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = Math.min(el.duration || 0, Math.max(0, el.currentTime + delta));
  };

  const seekTo = (fraction: number) => {
    const el = mediaRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = el.duration * Math.min(1, Math.max(0, fraction));
  };

  const onTimeUpdate = () => {
    const el = mediaRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
    if (el.buffered.length > 0) {
      setBuffered(el.buffered.end(el.buffered.length - 1));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key.toLowerCase() === "k") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seekBy(10);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekBy(-10);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setQuickSetting("volume", Math.min(100, systemVolume + 5));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setQuickSetting("volume", Math.max(0, systemVolume - 5));
    } else if (e.key.toLowerCase() === "m") {
      setMuted((m) => !m);
    } else if (e.key.toLowerCase() === "f") {
      void shellRef.current?.requestFullscreen?.();
    }
  };

  const progress = duration > 0 ? current / duration : 0;
  const bufferedFraction = duration > 0 ? Math.min(1, buffered / duration) : 0;

  /* ------------------------------------------------------------------ render */

  return (
    <div
      ref={shellRef}
      className="relative h-full flex flex-col bg-black text-white outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-[#15141d] border-b border-white/10 shrink-0">
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-white/10 text-white/70"
        >
          <FolderOpen size={13} /> Open
        </button>
        <span className="text-xs text-white/60 truncate flex-1">
          {path ? baseName(path) : "No media loaded"}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center bg-black relative">
        {error && (
          <div className="text-center px-8">
            <TriangleAlert size={26} className="mx-auto text-amber-400 mb-2" />
            <div className="text-xs text-white/60 max-w-sm leading-relaxed">{error}</div>
          </div>
        )}

        {!error && !path && (
          <div className="text-center px-8">
            <div className="text-sm text-white/70 mb-1">Nothing playing</div>
            <div className="text-xs text-white/40 mb-4">
              Open a video or audio file from the virtual filesystem.
            </div>
            <button
              onClick={() => setDialogOpen(true)}
              className="px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 font-medium"
            >
              Choose a file
            </button>
          </div>
        )}

        {src && !isAudio && (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={src}
            className="max-w-full max-h-full"
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={onTimeUpdate}
            onProgress={onTimeUpdate}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => setPlaying(false)}
          />
        )}

        {src && isAudio && (
          <div className="w-full max-w-sm px-8 text-center">
            <div className="w-40 h-40 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/60 to-fuchsia-500/60 mb-4" />
            <div className="text-sm truncate">{path ? baseName(path) : ""}</div>
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={src}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={onTimeUpdate}
              onProgress={onTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={() => setPlaying(false)}
            />
          </div>
        )}
      </div>

      {src && (
        <div className="bg-[#15141d] border-t border-white/10 px-3 py-2 shrink-0">
          <div
            className="relative h-1.5 bg-white/10 rounded-full cursor-pointer mb-2 group"
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
            }}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
          >
            <div
              className="absolute inset-y-0 left-0 bg-white/20 rounded-full"
              style={{ width: `${bufferedFraction * 100}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-2 text-white/70">
            <button onClick={() => seekBy(-10)} aria-label="Back 10 seconds" className="p-1 rounded hover:bg-white/10">
              <SkipBack size={14} />
            </button>
            <button
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="p-1.5 rounded-full bg-white text-black hover:bg-white/90"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button onClick={() => seekBy(10)} aria-label="Forward 10 seconds" className="p-1 rounded hover:bg-white/10">
              <SkipForward size={14} />
            </button>

            <span className="text-[11px] text-white/50 tabular-nums">
              {formatTime(current)} / {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute" : "Mute"}
                className="p-1 rounded hover:bg-white/10"
              >
                {muted || systemVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={systemVolume}
                onChange={(e) => {
                  setQuickSetting("volume", Number(e.target.value));
                  setMuted(false);
                }}
                aria-label="Volume"
                className="w-20 accent-blue-500"
              />
              <label className="flex items-center gap-1 text-[11px] text-white/50">
                <Gauge size={12} />
                <select
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  aria-label="Playback speed"
                  className="bg-white/5 rounded px-1 py-0.5 outline-none"
                >
                  {RATES.map((r) => (
                    <option key={r} value={r} className="bg-[#1b1a26]">
                      {r}×
                    </option>
                  ))}
                </select>
              </label>
              {!isAudio && (
                <>
                  <button
                    onClick={() => {
                      const el = mediaRef.current as HTMLVideoElement | null;
                      void el?.requestPictureInPicture?.();
                    }}
                    aria-label="Picture in picture"
                    className="p-1 rounded hover:bg-white/10"
                  >
                    <PictureInPicture2 size={14} />
                  </button>
                  <button
                    onClick={() => void shellRef.current?.requestFullscreen?.()}
                    aria-label="Fullscreen"
                    className="p-1 rounded hover:bg-white/10"
                  >
                    <Maximize size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {dialogOpen && (
        <FileDialog
          mode="open"
          initialDir={path ? path.split("/").slice(0, -1).join("/") || "/" : "/home/user"}
          onCancel={() => setDialogOpen(false)}
          onConfirm={(chosen) => {
            setDialogOpen(false);
            setPath(chosen);
          }}
        />
      )}
    </div>
  );
}
