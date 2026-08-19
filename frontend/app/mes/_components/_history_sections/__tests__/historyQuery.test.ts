import { describe, expect, it } from "vitest";
import {
  dateFilterToFrom,
  formatHistoryMonthLabel,
  resolveHistoryDateRange,
  type SelectedHistoryMonth,
} from "../historyQuery";

describe("historyQuery selected month", () => {
  it("uses the KST business day across a UTC month boundary", () => {
    const utcEveningBeforeKstMonth = new Date("2026-07-31T15:30:00.000Z");

    expect(dateFilterToFrom("TODAY", utcEveningBeforeKstMonth)).toBe("2026-08-01");
    expect(dateFilterToFrom("WEEK", utcEveningBeforeKstMonth)).toBe("2026-07-26");
    expect(dateFilterToFrom("MONTH", utcEveningBeforeKstMonth)).toBe("2026-08-01");
  });

  it("converts a zero-based selected month to its inclusive date range and label", () => {
    const selectedMonth: SelectedHistoryMonth = { year: 2026, month: 7 };

    expect(resolveHistoryDateRange("ALL", null, selectedMonth)).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      periodLabel: "2026년 8월",
    });
    expect(formatHistoryMonthLabel(selectedMonth)).toBe("2026년 8월");
  });

  it("keeps a selected day above a selected month and clears the end date to that single day", () => {
    expect(resolveHistoryDateRange("MONTH", "2026-08-14", { year: 2026, month: 7 })).toEqual({
      dateFrom: "2026-08-14",
      dateTo: "2026-08-14",
      periodLabel: "2026-08-14",
    });
  });

  it("handles February leap-year month boundaries without browser timezone conversion", () => {
    expect(resolveHistoryDateRange("ALL", null, { year: 2028, month: 1 })).toMatchObject({
      dateFrom: "2028-02-01",
      dateTo: "2028-02-29",
      periodLabel: "2028년 2월",
    });
  });
});
