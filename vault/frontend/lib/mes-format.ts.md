---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes-format.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-format.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes-format.ts]]

## 원본 첫 줄

```
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

```
