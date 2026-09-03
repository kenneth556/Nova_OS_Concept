import { useState, useRef, useEffect } from "react";
import { Play, Pause, Home, Search, Library, ListMusic, Shuffle, MoreHorizontal, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { handleCache } from "../store/fsStore";
import { useSystemStore } from "../store/systemStore";

const tracks = [
  { id: 1, title: "Cybernetic Engine", artist: "NovaOS", album: "Sci-Fi Sounds", time: "1:02", src: "https://actions.google.com/sounds/v1/science_fiction/cybernetic_engine.ogg" },
  { id: 2, title: "Space Ship", artist: "NovaOS", album: "Sci-Fi Sounds", time: "0:45", src: "https://actions.google.com/sounds/v1/science_fiction/space_ship_engine.ogg" },
  { id: 3, title: "Alien Breath", artist: "NovaOS", album: "Sci-Fi Sounds", time: "0:12", src: "https://actions.google.com/sounds/v1/science_fiction/alien_breath.ogg" },
  { id: 4, title: "Sci-Fi Door", artist: "NovaOS", album: "Sci-Fi Sounds", time: "0:05", src: "https://actions.google.com/sounds/v1/science_fiction/sci_fi_door_open.ogg" },
];

export default function Music({ appData }: { appData?: any }) {
  const systemVolume = useSystemStore((s) => s.quickSettings.volume);
  const setQuickSetting = useSystemStore((s) => s.setQuickSetting);
  const [playing, setPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState(1);
  const [localTrack, setLocalTrack] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // The system volume slider is the real volume control.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, systemVolume / 100));
    }
  }, [systemVolume, localTrack, activeTrackId]);

  useEffect(() => {
    if (appData?.path) {
      let objectUrl: string | null = null;
      let cancelled = false;
      const loadAudio = async () => {
        try {
          const handle = handleCache.get(appData.path);
          if (handle) {
            const file = await handle.getFile();
            if (cancelled) return;
            objectUrl = URL.createObjectURL(file);
            setLocalTrack({
              id: 999,
              title: file.name,
              artist: "Local File",
              album: "Mounted Drive",
              time: "Unknown",
              src: objectUrl,
            });
            setActiveTrackId(999);
            setPlaying(true);
          }
        } catch (e) { console.error(e); }
      };
      void loadAudio();
      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }
  }, [appData?.path]);

  /*
   * One list, one index. The old code navigated by numeric id and looked the
   * track up with a non-null assertion, so a locally opened file (id 999) plus
   * SkipBack produced id 998, an undefined track, and a render throw.
   */
  const playlist = localTrack ? [...tracks, localTrack] : tracks;
  const activeIndex = Math.max(
    0,
    playlist.findIndex((t) => t.id === activeTrackId)
  );
  const activeTrack = playlist[activeIndex] ?? playlist[0];

  const goToOffset = (offset: number) => {
    if (playlist.length === 0) return;
    const next = (activeIndex + offset + playlist.length) % playlist.length;
    setActiveTrackId(playlist[next].id);
    setCurrentTime(0);
    setProgress(0);
    setPlaying(true);
  };

  useEffect(() => {
    if (audioRef.current) {
      if (playing) audioRef.current.play().catch(() => setPlaying(false));
      else audioRef.current.pause();
    }
  }, [playing, activeTrackId, localTrack]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const { currentTime: t, duration } = audioRef.current;
      setCurrentTime(t);
      setProgress(Number.isFinite(duration) && duration > 0 ? (t / duration) * 100 : 0);
    }
  };

  const handleEnded = () => goToOffset(1);

  const togglePlay = () => setPlaying(!playing);

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-full flex flex-col bg-[#151220] text-white">
      <div className="flex flex-1 min-h-0">
        <div className="w-44 border-r border-white/10 p-3 flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/20 text-pink-300"><Home size={14}/> Home</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:bg-white/5"><Search size={14}/> Explore</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:bg-white/5"><Library size={14}/> Library</div>
          <div className="mt-4 text-xs uppercase text-white/30 px-3">Playlists</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:bg-white/5"><ListMusic size={14}/> Chill Vibes</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:bg-white/5"><ListMusic size={14}/> Workout Mix</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:bg-white/5"><ListMusic size={14}/> Focus</div>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="p-5 flex flex-col items-center gap-4 border-r border-white/10 w-56 shrink-0">
            <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-pink-500 via-purple-600 to-orange-400" />
            <div className="text-center">
              <div className="font-semibold">{activeTrack.title}</div>
              <div className="text-xs text-white/40">{activeTrack.artist} · {activeTrack.album} · 2024</div>
              <div className="text-xs text-white/30 mt-1">4 sounds</div>
            </div>
            <button
              onClick={togglePlay}
              className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 rounded-lg py-2 text-sm font-medium"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Pause" : "Play"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/30 text-xs border-b border-white/10">
                  <th className="px-4 py-2 w-8">#</th>
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Artist</th>
                  <th className="px-2 py-2">Album</th>
                  <th className="px-4 py-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => {
                      setActiveTrackId(t.id);
                      setPlaying(true);
                    }}
                    className={`cursor-pointer border-b border-white/5 ${
                      activeTrackId === t.id ? "bg-blue-500/15 text-blue-300" : "hover:bg-white/5"
                    }`}
                  >
                    <td className="px-4 py-2">{t.id}</td>
                    <td className="px-2 py-2">{t.title}</td>
                    <td className="px-2 py-2 text-white/50">{t.artist}</td>
                    <td className="px-2 py-2 text-white/50">{t.album}</td>
                    <td className="px-4 py-2 text-right text-white/50">{t.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="h-16 border-t border-white/10 flex items-center px-4 gap-4 shrink-0">
        <div className="w-9 h-9 rounded-md bg-gradient-to-br from-pink-500 via-purple-600 to-orange-400 shrink-0" />
        <div className="w-32 shrink-0">
          <div className="text-xs font-medium truncate">{activeTrack.title}</div>
          <div className="text-[10px] text-white/40 truncate">{activeTrack.artist}</div>
        </div>
        <div className="flex items-center gap-3 text-white/70">
          <button
            onClick={() => setShuffle((s) => !s)}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            className={`hover:text-white ${shuffle ? "text-pink-400" : ""}`}
          >
            <Shuffle size={14} />
          </button>
          <button onClick={() => goToOffset(-1)} aria-label="Previous track" className="hover:text-white">
            <SkipBack size={14} />
          </button>
          <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200">
            {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
          <button onClick={() => goToOffset(1)} aria-label="Next track" className="hover:text-white">
            <SkipForward size={14} />
          </button>
        </div>
        <div className="flex-1 flex items-center gap-2 text-[10px] text-white/40">
          <span>{formatTime(currentTime)}</span>
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
            if(audioRef.current) {
               const rect = e.currentTarget.getBoundingClientRect();
               const percent = (e.clientX - rect.left) / rect.width;
               audioRef.current.currentTime = percent * audioRef.current.duration;
            }
          }}>
            <div className="h-full bg-white transition-all duration-100" style={{ width: `${progress}%` }} />
          </div>
          {/* Real duration once the element knows it, not the hardcoded string. */}
          <span>{duration > 0 ? formatTime(duration) : activeTrack.time}</span>
        </div>
        <Volume2 size={14} className="text-white/50" />
        <input
          type="range"
          min={0}
          max={100}
          value={systemVolume}
          onChange={(e) => setQuickSetting("volume", Number(e.target.value))}
          aria-label="Volume"
          className="w-20 accent-blue-500"
        />
      </div>
      <audio 
        ref={audioRef} 
        src={activeTrack.src} 
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
    </div>
  );
}
