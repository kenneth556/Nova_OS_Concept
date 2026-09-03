import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSystemStore } from "./systemStore";

export interface CalendarEvent {
  id: string;
  title: string;
  /** "YYYY-MM-DD" in the user's *local* calendar, never a UTC instant. */
  date: string;
  /** "HH:MM" 24h. Absent means an all-day event. */
  time?: string;
  durationMinutes?: number;
  notes?: string;
  /** A tailwind background class, e.g. "bg-blue-500". */
  color: string;
  /** undefined = no reminder, 0 = at start. */
  reminderMinutesBefore?: number;
  /** Epoch ms, set once the reminder has fired so it only fires once. */
  notifiedAt?: number;
}

/** What callers hand to `addEvent`: everything but the generated id. */
export interface CalendarEventInput extends Omit<CalendarEvent, "id" | "color"> {
  color?: string;
}

export type CalendarEventPatch = Partial<Omit<CalendarEvent, "id">>;

interface CalendarState {
  events: CalendarEvent[];
  /** Generates the id and returns it. */
  addEvent: (input: CalendarEventInput) => string;
  /** Pass `notifiedAt: undefined` to re-arm a reminder that already fired. */
  updateEvent: (id: string, patch: CalendarEventPatch) => void;
  deleteEvent: (id: string) => void;
  markNotified: (id: string) => void;
}

export const DEFAULT_EVENT_COLOR = "bg-blue-500";

/** Events start firing reminders at `start - lead` and stop this long after start. */
const REMINDER_GRACE_MINUTES = 60;

const pad2 = (n: number) => String(n).padStart(2, "0");

const newEventId = () =>
  `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * "YYYY-MM-DD" from a Date using **local** getters. `toISOString()` would shift
 * the day across the timezone offset, which is the classic off-by-one here.
 */
export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** "HH:MM" from a Date using local getters. */
export const toTimeKey = (date: Date): string =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/**
 * Parses "YYYY-MM-DD" (+ optional "HH:MM") into a Date in local time.
 * Returns null for anything malformed instead of an Invalid Date, so callers
 * never have to defend against NaN arithmetic.
 */
export const fromDateKey = (dateKey: string, time?: string): Date | null => {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? "");
  if (!date) return null;

  const year = Number(date[1]);
  const month = Number(date[2]);
  const day = Number(date[3]);
  let hours = 0;
  let minutes = 0;

  if (time) {
    const parts = /^(\d{1,2}):(\d{2})/.exec(time);
    if (!parts) return null;
    hours = Number(parts[1]);
    minutes = Number(parts[2]);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) return null;

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  // Date rolls 2025-02-31 over into March; a round-trip check rejects that,
  // and also rejects two-digit years that the constructor maps into the 1900s.
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** The event's start instant, or null when its date/time is unusable. */
export const eventStart = (event: CalendarEvent): Date | null =>
  event ? fromDateKey(event.date, event.time) : null;

/** Chronological, with all-day events first within a day. */
export const compareEvents = (a: CalendarEvent, b: CalendarEvent): number => {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // "" (all-day) sorts before any zero-padded "HH:MM".
  const at = a.time ?? "";
  const bt = b.time ?? "";
  if (at !== bt) return at < bt ? -1 : 1;
  return (a.title ?? "").localeCompare(b.title ?? "");
};

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      events: [],

      addEvent: (input) => {
        const id = newEventId();
        const event: CalendarEvent = {
          ...input,
          id,
          title: (input.title ?? "").trim() || "Untitled event",
          color: input.color || DEFAULT_EVENT_COLOR,
        };
        set((s) => ({ events: [...s.events, event] }));
        return id;
      },

      updateEvent: (id, patch) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e)),
        })),

      deleteEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

      markNotified: (id) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, notifiedAt: Date.now() } : e)),
        })),
    }),
    {
      name: "novaos-calendar-store",
      version: 1,
    }
  )
);

/** "Starts in 15 minutes" / "Starting now" / "Started 5 minutes ago". */
const reminderBody = (msUntilStart: number): string => {
  const minutes = Math.round(msUntilStart / 60000);
  if (minutes === 0) return "Starting now";
  if (minutes < 0) {
    const ago = Math.abs(minutes);
    return `Started ${ago} minute${ago === 1 ? "" : "s"} ago`;
  }
  if (minutes < 60) return `Starts in ${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest
    ? `Starts in ${hourPart} ${rest} minute${rest === 1 ? "" : "s"}`
    : `Starts in ${hourPart}`;
};

/**
 * Raises system notifications for due reminders. Deliberately a plain function
 * rather than a store action so `App.tsx` can run it from an interval.
 *
 * An event fires when it has a `time`, a `reminderMinutesBefore`, no
 * `notifiedAt`, `start - lead` is already in the past, and the start itself is
 * no more than an hour old — the age cap keeps a week of stale events from
 * flooding the notification centre on the first tick after a reload.
 *
 * While Do Not Disturb is on nothing fires and nothing is marked, so the
 * pending reminders still arrive once it is switched off (subject to the same
 * age cap).
 */
export const checkCalendarReminders = () => {
  try {
    const system = useSystemStore.getState();
    if (system.quickSettings?.doNotDisturb) return;

    const { events, markNotified } = useCalendarStore.getState();
    const now = Date.now();

    for (const event of events) {
      if (!event || event.notifiedAt) continue;
      if (!event.time) continue;

      const lead = Number(event.reminderMinutesBefore);
      if (event.reminderMinutesBefore == null || !Number.isFinite(lead) || lead < 0) continue;

      const start = eventStart(event);
      if (!start) continue;

      const startMs = start.getTime();
      if (startMs - lead * 60000 > now) continue; // not due yet
      if (startMs < now - REMINDER_GRACE_MINUTES * 60000) continue; // too stale to be useful

      system.addNotification({
        app: "Calendar",
        title: event.title || "Untitled event",
        body: reminderBody(startMs - now),
        iconBg: "bg-red-500",
      });
      markNotified(event.id);
    }
  } catch {
    // An interval callback that throws would stop rescheduling in some hosts;
    // a missed reminder is better than a dead timer.
  }
};
