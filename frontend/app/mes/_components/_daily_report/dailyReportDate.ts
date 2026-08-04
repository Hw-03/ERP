const KST_TIME_ZONE = "Asia/Seoul";

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
