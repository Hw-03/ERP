import { describe, expect, it } from "vitest";
import { isFutureKstDate, toKstDateKey } from "../dailyReportDate";

describe("일일 작업 일보 KST 날짜", () => {
  it("UTC 자정 경계에서도 KST 날짜를 사용한다", () => {
    expect(toKstDateKey(new Date("2026-07-27T16:30:00.000Z"))).toBe("2026-07-28");
  });

  it("오늘 다음 날짜만 미래로 판단한다", () => {
    expect(isFutureKstDate("2026-07-29", "2026-07-28")).toBe(true);
    expect(isFutureKstDate("2026-07-28", "2026-07-28")).toBe(false);
  });
});
