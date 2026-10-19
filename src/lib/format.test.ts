import { describe, expect, test } from "bun:test";
import {
  formatNumber,
  formatWeightEntry,
  formatWorkoutDate,
  formatWorkoutDateLong,
  formatWorkoutDateTime,
  formatWorkoutTime,
} from "./format";

const date = new Date(2026, 9, 17, 18, 30);

describe("format", () => {
  test("formats workout date and time", () => {
    expect(formatWorkoutDate(date)).toBe("Sat, Oct 17, 2026");
    expect(formatWorkoutDateLong(date)).toBe("Saturday, October 17, 2026");
    expect(formatWorkoutTime(date)).toBe("6:30 PM");
    expect(formatWorkoutDateTime(date)).toBe("Sat, Oct 17, 2026 · 6:30 PM");
  });

  test("formats weight entries and numbers", () => {
    expect(formatWeightEntry({ recordedAt: date, weightLbs: 182 })).toBe("182 lbs — Oct 17, 2026, 6:30 PM");
    expect(formatNumber(1840)).toBe("1,840");
  });
});
