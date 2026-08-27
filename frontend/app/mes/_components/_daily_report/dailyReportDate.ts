const KST_TIME_ZONE = "Asia/Seoul";
const KOREAN_WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function toKstDateKey(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isFutureKstDate(workDate: string, today = toKstDateKey()): boolean {
  return workDate > today;
}

export function formatWorkDateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = KOREAN_WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${value} ${weekday}요일`;
}
