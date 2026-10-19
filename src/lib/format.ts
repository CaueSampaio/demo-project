const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const weightEntryDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function toDate(date: Date | string): Date {
  return date instanceof Date ? date : new Date(date);
}

export function formatWorkoutDate(date: Date | string): string {
  return dateFormatter.format(toDate(date));
}

export function formatWorkoutDateLong(date: Date | string): string {
  return longDateFormatter.format(toDate(date));
}

export function formatWorkoutTime(date: Date | string): string {
  return timeFormatter.format(toDate(date));
}

export function formatWorkoutDateTime(date: Date | string): string {
  return `${formatWorkoutDate(date)} · ${formatWorkoutTime(date)}`;
}

export function formatWeightEntry(record: { recordedAt: Date | string; weightLbs: number }): string {
  return `${record.weightLbs} lbs — ${weightEntryDateFormatter.format(toDate(record.recordedAt))}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}
