---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/historyTheme.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# historyTheme.ts — historyTheme.ts 설명

## 이 파일은 무엇을 책임지나

`historyTheme.ts`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `rowTint`
- `PROCESS_TYPE_META`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
/**
 * historyTheme.ts — 행 tint 색 + 공정 타입 메타 순수 상수/함수.
 * C2: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */
import { LEGACY_COLORS } from "@/lib/mes/color";

/** 거래 타입별 행 배경 tint (투명도 낮은 색조). */
export function rowTint(type: string): string {
  switch (type) {
    case "RECEIVE":
    case "PRODUCE":
      return "rgba(67,211,157,.05)";
    case "SHIP":
    case "BACKFLUSH":
      return "rgba(255,123,123,.05)";
    case "ADJUST":
      return "rgba(101,169,255,.05)";
    case "TRANSFER_TO_PROD":
    case "TRANSFER_TO_WH":
    case "TRANSFER_DEPT":
      return "rgba(78,201,245,.05)";
    default:
      return "transparent";
  }
}

/** 공정 타입 코드별 라벨·색·배경. */
export const PROCESS_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  TR: { label: "튜브 원자재", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TA: { label: "튜브 중간공정", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TF: { label: "튜브 공정완료", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  HR: { label: "고압 원자재", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  HA: { label: "고압 중간공정", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  HF: { label: "고압 공정완료", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  VR: { label: "진공 원자재", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  VA: { label: "진공 중간공정", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  VF: { label: "진공 공정완료", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  NR: { label: "튜닝 원자재", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  NA: { label: "튜닝 중간공정", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  NF: { label: "튜닝 공정완료", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  AR: { label: "조립 원자재", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  AA: { label: "조립 중간공정", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  AF: { label: "조립 공정완료", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  PR: { label: "출하 원자재", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
  PA: { label: "출하 중간공정", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
  PF: { label: "출하 공정완료", color: LEGACY_COLORS.green, bg: `color-mix(in sr
...
```
