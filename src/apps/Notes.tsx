import { useState, useMemo } from "react";
import { Search, Plus, FileText, Trash2 } from "lucide-react";
import { useNotesStore, type Note } from "../store/notesStore";
import { useFsStore } from "../store/fsStore";

export default function Notes() {
  const { notes, setNotes, activeId, setActiveId } = useNotesStore();
  const { writeFile, ensureDir } = useFsStore();
  const active = notes.find((n) => n.id === activeId) || notes[0];
  const [query, setQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  }, [notes, query]);

  const updateActive = (field: "title" | "body", value: string) => {
    const now = new Date().toLocaleString();
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, [field]: value, updated: now } : n)));
  };

  const addNote = () => {
    const id = String(Date.now());
    const now = new Date().toLocaleString();
    const note: Note = { id, title: "New Note", body: "", updated: now };
    setNotes((prev) => [note, ...prev]);
    setActiveId(id);
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeId === id) {
      const next = notes.find((n) => n.id !== id);
      if (next) setActiveId(next.id);
    }
    setContextMenu(null);
  };

  const saveNote = (note: Note) => {
    ensureDir("/home/user/notes");
    const filename = `/home/user/notes/${note.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    writeFile(filename, `# ${note.title}\n\n${note.body}`);
  };

  return (
    <div className="h-full flex bg-[#17151f] text-white">
      <div className="w-56 border-r border-white/10 flex flex-col">
        <div className="p-3 border-b border-white/10">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
            <Search size={14} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              className="bg-transparent text-xs outline-none placeholder:text-white/30 w-full"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-xs text-white/30 text-center">No notes found</div>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => setActiveId(n.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu(n.id);
                }}
                className={`w-full text-left px-3 py-2.5 border-b border-white/5 ${
                  n.id === activeId ? "bg-yellow-500/15" : "hover:bg-white/5"
                }`}
              >
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  <FileText size={12} className="text-yellow-400 shrink-0" /> {n.title || "Untitled"}
                </div>
                <div className="text-[11px] text-white/40 mt-0.5 flex justify-between">
                  <span className="truncate">{n.body.slice(0, 20) || "No content"}</span>
                  <span className="shrink-0 ml-1">{n.updated}</span>
                </div>
              </button>
            ))
          )}
        </div>
        <button
          onClick={addNote}
          className="m-3 flex items-center justify-center gap-1.5 text-xs bg-yellow-500 text-black font-medium rounded-lg py-2 hover:bg-yellow-400"
        >
          <Plus size={14} /> New Note
        </button>
      </div>

      {active ? (
        <div className="flex-1 flex flex-col p-6">
          <input
            value={active.title}
            onChange={(e) => updateActive("title", e.target.value)}
            className="bg-transparent text-2xl font-semibold outline-none mb-1"
            placeholder="Note title"
          />
          <div className="text-xs text-white/30 mb-4">{active.updated}</div>
          <textarea
            value={active.body}
            onChange={(e) => updateActive("body", e.target.value)}
            className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed text-white/80"
            placeholder="Start typing..."
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => saveNote(active)}
              className="px-3 py-1.5 rounded-md text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-medium"
            >
              Save to disk
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-white/30">
          <div className="text-center">
            <FileText size={48} className="mx-auto opacity-50 mb-3" />
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
        >
          <div
            className="absolute bg-[#1b1a26] border border-white/10 rounded-xl shadow-2xl py-1.5 min-w-[160px]"
            style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
          >
            <button
              onClick={() => {
                const note = notes.find((n) => n.id === contextMenu);
                if (note) saveNote(note);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 text-white/70"
            >
              Save to disk
            </button>
            {contextMenu && (
              <button
                onClick={() => deleteNote(contextMenu)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-500/10 text-red-300 flex items-center gap-2"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
