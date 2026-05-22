---
type: file-explanation
source_path: "frontend/lib/mes-status.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-status.ts — mes-status.ts 설명

## 이 파일은 무엇을 책임지나

`mes-status.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `toMesTone`
- `inferTone`
- `getTransactionTone`
- `getTransactionLabel`
- `transactionColor`
- `transactionIconName`
- `TRANSACTION_META`
- `MesTone`
- `as`
- `TransactionIconName`
- 그 외 1개 항목

## 연결되는 파일

- [[ERP/frontend/lib/📁_lib]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * DEXCOWIN MES 공통 상태 톤 / 거래 타입 매핑
 *
 * 통합 정책:
 *   - 데스크톱 StatusPill 의 tone (info/success/warning/danger/neutral) 과
 *     모바일 StatusBadge 의 tone (ok/warn/danger/info/muted) 을
 *     단일 MesTone 체계로 흡수한다.
 *   - 1차 (이번 PR): StatusPill 만 본 모듈 사용. StatusBadge 는 다음 PR.
 *   - 두 컴포넌트 자체는 합치지 않는다 — props / 마크업 호환성 유지.
 *
 * 호환:
 *   - StatusPill 의 기존 export `StatusPillTone` 은 MesTone 의 alias 로 유지.
 *   - StatusBadge 의 "ok" / "warn" 은 success / warning 의 별칭으로 toMesTone 이 흡수.
 */

import type { TransactionType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

export type MesTone = "success" | "warning" | "danger" | "info" | "neutral" | "muted";

/**
 * StatusBadge 등 구버전 톤 명을 MesTone 으로 흡수.
 * 모르는 값은 "info" 로 떨어뜨린다.
 */
export function toMesTone(value: string | null | undefined): MesTone {
  if (!value) return "info";
  switch (value) {
    case "success":
    case "ok":
      return "success";
    case "warning":
    case "warn":
      return "warning";
    case "danger":
      return "danger";
    case "info":
      return "info";
    case "neutral":
      return "neutral";
    case "muted":
      return "muted";
    default:
      return "info";
  }
}

/**
 * 자유 텍스트 상태 → MesTone 추론.
 * StatusPill.inferToneFromStatus 의 동작을 그대로 보존한다.
 */
export function inferTone(status: string | null | undefined): MesTone {
  if (!status) return "info";
  if (status === "DEXCOWIN MES System") return "neutral";
  if (status.startsWith("방금 완료")) return "success";
  if (/실패|오류|불러오지 못|에러/.test(status)) return "danger";
```
