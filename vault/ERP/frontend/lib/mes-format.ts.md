---
type: file-explanation
source_path: "frontend/lib/mes-format.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-format.ts — mes-format.ts 설명

## 이 파일은 무엇을 책임지나

`mes-format.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `formatQty`
- `formatDateTime`
- `formatDate`
- `formatItemCode`
- `formatPercent`

## 연결되는 파일

- [[ERP/frontend/lib/📁_lib]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
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
```
