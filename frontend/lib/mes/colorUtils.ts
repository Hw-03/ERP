/**
 * color-mix(in srgb, ...) 인라인 패턴을 줄이기 위한 헬퍼.
 * pct: 0–100 (정수 권장)
 * base: 기본값 "transparent"
 */
export function tint(color: string, pct: number, base = "transparent"): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${base})`;
}
