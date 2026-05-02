/**
 * DEXCOWIN MES 공통 포맷 모듈
 *
 * 50~60대 현장 사용자 가독성 우선:
 *   - 한국식 날짜: "2026년 5월 4일 오전 9:30"
 *   - 천 단위 콤마: "1,234"
 *   - 음수/소수 자르기: 정수 표기
 *
 * 호환 정책:
 *   - 기존 frontend/app/legacy/_components/legacyUi.ts 의 formatNumber 와
 *     동작이 동일한 자리는 formatQty 가 wrapper 로 동작한다.
 *   - 점진 마이그레이션을 위해 legacyUi.ts 는 이번 PR 에서 변경하지 않는다.
 */

const PLACEHOLDER = "-";

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 수량 포맷 — "1,234". null/NaN/공백은 "-".
 * legacyUi.ts::formatNumber 와 동일 동작 (ko-KR 콤마, 정수).
 */
export function formatQty(value: number | string | null | undefined): string {
  const n = toFiniteNumber(value);
  if (n === null) return PLACEHOLDER;
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

/**
 * 날짜+시간 — "2026년 5월 4일 오전 9:30".
 */
export function formatDateTime(value: string | null | undefined): string {
  const d = toValidDate(value);
  if (d === null) return PLACEHOLDER;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/**
 * 날짜 — "2026년 5월 4일".
 */
export function formatDate(value: string | null | undefined): string {
  const d = toValidDate(value);
  if (d === null) return PLACEHOLDER;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/**
 * 퍼센트 — 0.123 또는 12.3 형태 모두 입력 받음.
 *   - |value| <= 1 이면 비율로 보고 ×100
 *   - 그 외엔 이미 퍼센트 단위로 본다
 *   - 소수 1자리까지 표기
 */
export function formatPercent(value: number | null | undefined): string {
  const n = toFiniteNumber(value);
  if (n === null) return PLACEHOLDER;
  const percent = Math.abs(n) <= 1 ? n * 100 : n;
  return `${percent.toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}
