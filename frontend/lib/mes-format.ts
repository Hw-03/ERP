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
const KST_TIME_ZONE = "Asia/Seoul";
const KST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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
 *
 * options.maximumFractionDigits: 기본 0 (정수 표시). 불량·BOM 은 2 권장.
 * options.trimTrailingZeros: true 이면 후행 0 제거 ("1.50" → "1.5").
 */
export interface FormatQtyOptions {
  maximumFractionDigits?: number;
  trimTrailingZeros?: boolean;
}

export function formatQty(
  value: number | string | null | undefined,
  options: FormatQtyOptions = {},
): string {
  const n = toFiniteNumber(value);
  if (n === null) return PLACEHOLDER;
  const { maximumFractionDigits = 0, trimTrailingZeros = false } = options;
  const formatted = n.toLocaleString("ko-KR", { maximumFractionDigits });
  if (trimTrailingZeros && formatted.includes(".")) {
    return formatted.replace(/\.?0+$/, "");
  }
  return formatted;
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
 * KST 24시간제 날짜+시간 — "2026년 08월 04일 09시 05분".
 */
export function formatKstDateTime(
  value: string | Date | null | undefined,
): string {
  const d = toValidDate(value);
  if (d === null) return PLACEHOLDER;

  const parts = Object.fromEntries(
    KST_DATE_TIME_FORMATTER.formatToParts(d).map(({ type, value: partValue }) => [
      type,
      partValue,
    ]),
  );
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${parts.hour}시 ${parts.minute}분`;
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
 * 품목코드 표시 포맷 — "DX3000-AA-007" → "DX3000-AA-7" (compact).
 *   - compact=true (기본): 3번째 segment 의 leading zero 제거 ("0" 자체는 유지).
 *   - compact=false: 입력 그대로.
 *   - 빈 입력: null 반환 (formatQty/formatDate 와 달리 placeholder "-" 반환 안 함 — 호출측 분기).
 *   - segment 가 3개 미만: 입력 그대로.
 */
export function formatMesCode(code?: string | null, compact = true): string | null {
  if (!code) return null;
  if (!compact) return code;
  const parts = code.split("-");
  if (parts.length < 3) return code;
  const stripped = [...parts];
  stripped[2] = stripped[2].replace(/^0+(\d)/, "$1") || "0";
  return stripped.join("-");
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
