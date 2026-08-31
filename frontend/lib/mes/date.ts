const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** API 날짜가 브라우저나 테스트 실행 환경의 시간대에 따라 전날로 밀리지 않게 한다. */
export function formatKstDate(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
