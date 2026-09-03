import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { AppProps } from "../lib/types";
import {
  useCalendarStore,
  compareEvents,
  eventStart,
  fromDateKey,
  toDateKey,
  toTimeKey,
  DEFAULT_EVENT_COLOR,
  type CalendarEvent,
} from "../store/calendarStore";
import { useSystemStore } from "../store/systemStore";
import { useWindowStore } from "../store/windowStore";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EVENT_COLORS = [
  { label: "Blue", value: "bg-blue-500" },
  { label: "Emerald", value: "bg-emerald-500" },
  { label: "Amber", value: "bg-amber-500" },
  { label: "Rose", value: "bg-rose-500" },
  { label: "Violet", value: "bg-violet-500" },
  { label: "Cyan", value: "bg-cyan-500" },
];

const REMINDER_OPTIONS = [
  { value: "", label: "None" },
  { value: "0", label: "At start" },
  { value: "5", label: "5 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "60 minutes before" },
];

const toolbarButton =
  "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-white/10 text-white/70";
const primaryButton =
  "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-blue-500 hover:bg-blue-400 text-white font-medium";
const inputClass =
  "bg-white/5 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500/60";
const fieldLabel = "block text-[10px] uppercase tracking-wide text-white/40 mb-1";

/** "09:30" -> "9:30 AM". Falls back to the raw value if it isn't parseable. */
const formatTime = (time?: string) => {
  if (!time) return "All day";
  const [hourPart, minutePart] = time.split(":");
  const hour = Number(hourPart);
  if (!Number.isFinite(hour)) return time;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minutePart ?? "00"} ${hour < 12 ? "AM" : "PM"}`;
};

/** Compact form for the cramped month-grid cells: "9a", "9:30p". */
const formatTimeShort = (time?: string) => {
  if (!time) return "";
  const [hourPart, minutePart] = time.split(":");
  const hour = Number(hourPart);
  if (!Number.isFinite(hour)) return time;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "a" : "p";
  return minutePart && minutePart !== "00" ? `${display}:${minutePart}${suffix}` : `${display}${suffix}`;
};

const formatDuration = (minutes?: number) => {
  if (!minutes || minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

/** "9:00 AM – 9:45 AM", "9:00 AM", "All day" or "All day · 45m". */
const formatEventTime = (event: CalendarEvent) => {
  const duration = formatDuration(event.durationMinutes);
  if (!event.time) return duration ? `All day · ${duration}` : "All day";
  const start = eventStart(event);
  if (!start || !duration) return formatTime(event.time);
  const end = new Date(start.getTime() + (event.durationMinutes ?? 0) * 60000);
  return `${formatTime(event.time)} – ${formatTime(toTimeKey(end))}`;
};

const formatShortDate = (dateKey: string) => {
  const date = fromDateKey(dateKey);
  return date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : dateKey;
};

const reminderText = (minutes?: number) => {
  if (minutes == null) return "";
  if (minutes === 0) return "At start";
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h before`;
  return `${minutes}m before`;
};

type Draft = {
  /** null while creating, the event id while editing. */
  id: string | null;
  title: string;
  date: string;
  time: string;
  duration: string;
  notes: string;
  color: string;
  /** "" = no reminder, otherwise the minutes-before as a string. */
  reminder: string;
};

export default function Calendar({ windowId }: AppProps) {
  const events = useCalendarStore((s) => s.events);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const doNotDisturb = useSystemStore((s) => s.quickSettings.doNotDisturb);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [view, setView] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(new Date()));
  const [draft, setDraft] = useState<Draft | null>(null);

  /* -------------------------------------------------------------- ticking now */

  // Keeps "today" and the upcoming list honest across midnight without paying
  // for a re-render every second.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* ------------------------------------------------------------- month layout */

  const monthStart = new Date(view.year, view.month, 1);
  const monthLabel = monthStart.toLocaleString(undefined, { month: "long" });
  const firstWeekday = monthStart.getDay();
  // Day 0 of the next month is the last day of this one, so leap years are free.
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const todayKey = toDateKey(new Date(nowMs));

  const cells: (number | null)[] = [];
  for (let blank = 0; blank < firstWeekday; blank++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  /* -------------------------------------------------------------------- events */

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      if (!event || !event.date) continue;
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    }
    for (const key of Object.keys(map)) map[key].sort(compareEvents);
    return map;
  }, [events]);

  const selectedEvents = eventsByDate[selectedKey] ?? [];

  const upcoming = useMemo(() => {
    const today = toDateKey(new Date(nowMs));
    return events
      .filter((event) => {
        if (!event || !event.date) return false;
        if (!event.time) return event.date >= today; // date keys sort chronologically
        const start = eventStart(event);
        return start ? start.getTime() >= nowMs : event.date >= today;
      })
      .sort(compareEvents)
      .slice(0, 5);
  }, [events, nowMs]);

  const selectedDate = fromDateKey(selectedKey);
  const selectedLabel = selectedDate
    ? selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : selectedKey;

  /* ---------------------------------------------------------------- navigation */

  const shiftMonth = (delta: number) => {
    const shifted = new Date(view.year, view.month + delta, 1);
    setView({ year: shifted.getFullYear(), month: shifted.getMonth() });
  };

  const goToDate = (dateKey: string) => {
    const date = fromDateKey(dateKey);
    if (!date) return;
    setView({ year: date.getFullYear(), month: date.getMonth() });
    setSelectedKey(dateKey);
  };

  /* -------------------------------------------------------------------- editor */

  const patchDraft = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const openNew = (dateKey: string) =>
    setDraft({
      id: null,
      title: "",
      date: dateKey,
      time: "",
      duration: "",
      notes: "",
      color: DEFAULT_EVENT_COLOR,
      reminder: "",
    });

  const openEdit = (event: CalendarEvent) =>
    setDraft({
      id: event.id,
      title: event.title ?? "",
      date: event.date,
      time: event.time ?? "",
      duration: event.durationMinutes ? String(event.durationMinutes) : "",
      notes: event.notes ?? "",
      color: event.color || DEFAULT_EVENT_COLOR,
      reminder: event.reminderMinutesBefore == null ? "" : String(event.reminderMinutesBefore),
    });

  const saveDraft = () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return;

    const date = fromDateKey(draft.date) ? draft.date : selectedKey;
    const time = draft.time ? draft.time.slice(0, 5) : undefined;
    const durationValue = Number(draft.duration);
    const durationMinutes =
      draft.duration && Number.isFinite(durationValue) && durationValue > 0
        ? Math.round(durationValue)
        : undefined;
    // A reminder has nothing to count down from without a start time.
    const reminderMinutesBefore = !time || draft.reminder === "" ? undefined : Number(draft.reminder);

    const payload = {
      title,
      date,
      time,
      durationMinutes,
      notes: draft.notes.trim() || undefined,
      color: draft.color,
      reminderMinutesBefore,
    };

    if (draft.id) {
      const existing = events.find((e) => e.id === draft.id);
      // Re-arm a reminder that already fired when what it fires from changed.
      const rearmed =
        !existing ||
        existing.date !== date ||
        existing.time !== time ||
        existing.reminderMinutesBefore !== reminderMinutesBefore;
      updateEvent(draft.id, rearmed ? { ...payload, notifiedAt: undefined } : payload);
    } else {
      addEvent(payload);
    }

    goToDate(date);
    setDraft(null);
  };

  /* -------------------------------------------------------------- window title */

  useEffect(() => {
    setWindowTitle(windowId, `${monthLabel} ${view.year} — Calendar`);
  }, [windowId, monthLabel, view.year, setWindowTitle]);

  /* -------------------------------------------------------------------- render */

  return (
    <div className="relative h-full flex flex-col bg-[#17151f] text-white/85">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
        <CalendarDays size={14} className="text-red-400 shrink-0" />
        <div className="text-sm font-medium truncate">
          {monthLabel} {view.year}
        </div>
        <div className="flex items-center gap-0.5">
          <button className={toolbarButton} onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={14} />
          </button>
          <button className={toolbarButton} onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight size={14} />
          </button>
        </div>
        <button className={toolbarButton} onClick={() => goToDate(toDateKey(new Date()))}>
          Today
        </button>
        <button className={`${primaryButton} ml-auto shrink-0`} onClick={() => openNew(selectedKey)}>
          <CalendarPlus size={13} /> New event
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* month grid */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="grid grid-cols-7 gap-1 px-2 pt-2 text-center text-[10px] text-white/35 shrink-0">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-0.5">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 auto-rows-fr flex-1 min-h-0 p-2 pt-1">
            {cells.map((day, index) => {
              if (day === null) return <div key={`blank-${index}`} />;

              const cellDate = new Date(view.year, view.month, day);
              const key = toDateKey(cellDate);
              const dayEvents = eventsByDate[key] ?? [];
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;
              const fullLabel = cellDate.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              });

              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  onDoubleClick={() => openNew(key)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${fullLabel}, ${
                    dayEvents.length === 0
                      ? "no events"
                      : `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`
                  }`}
                  className={`flex flex-col items-stretch gap-0.5 overflow-hidden rounded-lg p-1 text-left transition-colors ${
                    isSelected
                      ? "bg-blue-500/25 hover:bg-blue-500/30"
                      : "bg-white/[0.03] hover:bg-white/[0.07]"
                  } ${isToday ? "ring-1 ring-red-400/80" : ""}`}
                >
                  <span
                    className={`text-[11px] leading-none shrink-0 ${
                      isToday ? "text-red-300 font-semibold" : "text-white/60"
                    }`}
                  >
                    {day}
                  </span>

                  {dayEvents.slice(0, 3).map((event) => (
                    <span key={event.id} className="flex items-center gap-1 min-w-0 text-[10px] leading-[13px]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${event.color || DEFAULT_EVENT_COLOR}`}
                      />
                      {event.time && (
                        <span className="text-white/45 shrink-0">{formatTimeShort(event.time)}</span>
                      )}
                      <span className="truncate text-white/75">{event.title}</span>
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] leading-[13px] text-white/40">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* day detail */}
        <aside className="w-[198px] shrink-0 min-h-0 flex flex-col border-l border-white/10">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{selectedLabel}</div>
              <div className="text-[10px] text-white/40">
                {selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}
              </div>
            </div>
            <button
              className={`${toolbarButton} ml-auto`}
              onClick={() => openNew(selectedKey)}
              aria-label={`Add an event on ${selectedLabel}`}
            >
              <Plus size={13} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
            {selectedEvents.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-white/35">
                Nothing planned. Double-click a day, or use New event.
              </p>
            ) : (
              selectedEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex gap-2 rounded-md px-2 py-1.5 bg-white/[0.03] hover:bg-white/[0.06]"
                >
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      event.color || DEFAULT_EVENT_COLOR
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[10px] text-white/45">
                      <Clock size={10} className="shrink-0" />
                      <span className="truncate">{formatEventTime(event)}</span>
                    </div>
                    <div className="text-xs text-white/85 break-words">{event.title}</div>
                    {event.notes && (
                      <div className="mt-0.5 text-[11px] text-white/40 whitespace-pre-wrap break-words">
                        {event.notes}
                      </div>
                    )}
                    {event.reminderMinutesBefore != null && (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-300/70">
                        <Bell size={10} className="shrink-0" />
                        <span className="truncate">
                          {reminderText(event.reminderMinutesBefore)}
                          {event.notifiedAt ? " · sent" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => openEdit(event)}
                      aria-label={`Edit ${event.title}`}
                      className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      aria-label={`Delete ${event.title}`}
                      className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-red-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-white/10 p-2 shrink-0">
            <div className="px-1 mb-1 text-[10px] uppercase tracking-wide text-white/35">Upcoming</div>
            {upcoming.length === 0 ? (
              <p className="px-1 text-[11px] text-white/30">Nothing scheduled ahead.</p>
            ) : (
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {upcoming.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => goToDate(event.date)}
                    aria-label={`Go to ${event.title} on ${formatShortDate(event.date)}`}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left hover:bg-white/10"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${event.color || DEFAULT_EVENT_COLOR}`}
                    />
                    <span className="w-10 shrink-0 text-[10px] text-white/45">
                      {formatShortDate(event.date)}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-[11px]">{event.title}</span>
                    {event.time && (
                      <span className="shrink-0 text-[10px] text-white/40">
                        {formatTimeShort(event.time)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-3 py-1 text-[11px] text-white/45 shrink-0">
        <span>
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
        <span className="truncate">Double-click a day to add</span>
        {doNotDisturb && (
          <span className="ml-auto flex items-center gap-1 shrink-0 text-amber-300/80">
            <BellOff size={10} /> Reminders paused
          </span>
        )}
      </div>

      {/* Event editor. The overlay is focusable so Escape still works after a backdrop click. */}
      {draft && (
        <div
          className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4 outline-none"
          role="dialog"
          aria-modal="true"
          aria-label={draft.id ? "Edit event" : "New event"}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            setDraft(null);
          }}
        >
          <div className="w-full max-w-sm max-h-full overflow-y-auto bg-[#1b1a26] border border-white/10 rounded-xl shadow-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarPlus size={14} className="text-blue-300" />
              <div className="text-sm font-medium">{draft.id ? "Edit event" : "New event"}</div>
              <button
                onClick={() => setDraft(null)}
                aria-label="Close editor"
                className="ml-auto p-1 rounded hover:bg-white/10 text-white/50"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2.5">
              <label className="block">
                <span className={fieldLabel}>Title</span>
                <input
                  autoFocus
                  value={draft.title}
                  onChange={(e) => patchDraft({ title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    saveDraft();
                  }}
                  placeholder="Event title"
                  className={`${inputClass} w-full`}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabel}>Date</span>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => patchDraft({ date: e.target.value })}
                    className={`${inputClass} w-full [color-scheme:dark]`}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Time (optional)</span>
                  <input
                    type="time"
                    value={draft.time}
                    onChange={(e) => patchDraft({ time: e.target.value })}
                    className={`${inputClass} w-full [color-scheme:dark]`}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabel}>Duration (min)</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={draft.duration}
                    onChange={(e) => patchDraft({ duration: e.target.value })}
                    placeholder="60"
                    className={`${inputClass} w-full`}
                  />
                </label>
                <label className="block">
                  <span className={`${fieldLabel} flex items-center gap-1`}>
                    <Bell size={10} /> Reminder
                  </span>
                  <select
                    value={draft.reminder}
                    disabled={!draft.time}
                    onChange={(e) => patchDraft({ reminder: e.target.value })}
                    className={`${inputClass} w-full disabled:opacity-40`}
                  >
                    {REMINDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#1b1a26]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!draft.time && (
                <p className="text-[10px] text-white/35">Add a start time to enable reminders.</p>
              )}

              <label className="block">
                <span className={fieldLabel}>Notes</span>
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => patchDraft({ notes: e.target.value })}
                  placeholder="Anything worth remembering"
                  className={`${inputClass} w-full resize-none`}
                />
              </label>

              <div>
                <span className={fieldLabel}>Colour</span>
                <div className="flex items-center gap-1.5" role="group" aria-label="Event colour">
                  {EVENT_COLORS.map((swatch) => (
                    <button
                      key={swatch.value}
                      onClick={() => patchDraft({ color: swatch.value })}
                      aria-label={swatch.label}
                      aria-pressed={draft.color === swatch.value}
                      className={`w-6 h-6 rounded-full flex items-center justify-center ${swatch.value} ${
                        draft.color === swatch.value
                          ? "ring-2 ring-white/70"
                          : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      {draft.color === swatch.value && <Check size={12} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setDraft(null)}
                className="px-3 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={saveDraft}
                disabled={!draft.title.trim()}
                className="px-3 py-1.5 rounded-md text-xs bg-blue-500 hover:bg-blue-400 text-white font-medium disabled:opacity-40 disabled:hover:bg-blue-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
