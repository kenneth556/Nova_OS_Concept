import { useState } from "react";
import { Search, Plus, FileText } from "lucide-react";
import { useNotesStore, type Note } from "../store/notesStore";

export default function Notes() {
  const { notes, setNotes, activeId, setActiveId } = useNotesStore();
  const active = notes.find((n) => n.id === activeId) || notes[0];
  const [query, setQuery] = useState("");

  const filtered = notes.filter((n) => n.title.toLowerCase().includes(query.toLowerCase()));

  const updateActive = (field: "title" | "body", value: string) => {
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, [field]: value, updated: "Just now" } : n)));
  };

  const addNote = () => {
    const id = String(Date.now());
    const note: Note = { id, title: "New Note", body: "", updated: "Just now" };
    setNotes((prev) => [note, ...prev]);
    setActiveId(id);
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
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveId(n.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-white/5 ${
                n.id === activeId ? "bg-yellow-500/15" : "hover:bg-white/5"
              }`}
            >
              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                <FileText size={12} className="text-yellow-400 shrink-0" /> {n.title}
              </div>
              <div className="text-[11px] text-white/40 mt-0.5 flex justify-between">
                <span className="truncate">{n.body.slice(0, 20) || "No content"}</span>
                <span className="shrink-0 ml-1">{n.updated}</span>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={addNote}
          className="m-3 flex items-center justify-center gap-1.5 text-xs bg-yellow-500 text-black font-medium rounded-lg py-2 hover:bg-yellow-400"
        >
          <Plus size={14} /> New Note
        </button>
      </div>
      <div className="flex-1 flex flex-col p-6">
        <input
          value={active.title}
          onChange={(e) => updateActive("title", e.target.value)}
          className="bg-transparent text-2xl font-semibold outline-none mb-1"
        />
        <div className="text-xs text-white/30 mb-4">{active.updated}</div>
        <textarea
          value={active.body}
          onChange={(e) => updateActive("body", e.target.value)}
          className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed text-white/80"
          placeholder="Start typing..."
        />
      </div>
    </div>
  );
}
