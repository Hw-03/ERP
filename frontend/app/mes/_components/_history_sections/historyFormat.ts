/**
 * historyFormat.ts — 날짜/시간 파싱·포맷 순수 함수.
 * C2: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */

/** UTC ISO 문자열 → Date. Z/오프셋 없는 문자열에는 Z 추가. */
export function parseUtc(iso: string): Date {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

const KST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function getKstDateTimeParts(iso: string): Record<string, string> {
  return Object.fromEntries(
    KST_DATE_TIME_FORMATTER.formatToParts(parseUtc(iso)).map(({ type, value }) => [type, value]),
  );
}

/** `MM/DD HH:mm` 형식 단축 날짜. KST 기준. */
export function formatHistoryDate(iso: string): string {
  const parts = getKstDateTimeParts(iso);
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

/** 우측 상세 메타용 정본 형식 — `2026년 5월 14일    14시 21분` (초 제외). */
export function formatHistoryDateTimeLong(iso: string): string {
  const parts = getKstDateTimeParts(iso);
  return `${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일    ${parts.hour}시 ${parts.minute}분`;
}

/** ISO → KST `YYYY-MM-DD` 키 문자열. 달력/그룹 인덱스용. */
export function toDateKey(iso: string): string {
  const parts = getKstDateTimeParts(iso);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
