---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/HistoryStatsBar.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# HistoryStatsBar.tsx — HistoryStatsBar.tsx 설명

## 이 파일은 무엇을 책임지나

`HistoryStatsBar.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryStatsBar`
- `StatBox`
- `HistoryStatsBarProps`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { Building2, Layers, Sliders } from "lucide-react";
import type { TransactionSummary } from "@/lib/api/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export interface HistoryStatsBarProps {
  /** 기간만 필터한 전체 — 박스 숫자/Y(분모). 필터와 무관하게 고정. */
  baseline: TransactionSummary | null;
  /** 현재 필터(거래종류/검색/부서/모델)가 적용된 건수 — X(분자). */
  currentCount: number | null;
  loading: boolean;
  /** "이번달" / "오늘" / "이번주" / "전체" / 선택한 날짜. */
  periodLabel: string;
}

const NUM = (loading: boolean, n: number | null | undefined) =>
  loading || n == null ? "…" : n.toLocaleString();

/**
 * 입출고 내역 상단 요약 — 3차: **표시 전용**(클릭 필터 폐기, 필터는 "필터" 패널 단일).
 * 카운트는 "{기간} X건 / 전체 Y건" 정직 표기 — X=현재 필터, Y=기간 전체.
 * 3박스(창고/부서/수량조정)는 건수만 보여주는 표시판.
 */
export function HistoryStatsBar({
  baseline,
  currentCount,
  loading,
  periodLabel,
}: HistoryStatsBarProps) {
  return (
    <section className="card" style={{ paddingTop: 16, paddingBottom: 16 }}>
      {/* 정직 카운트 */}
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          {periodLabel}
        </span>
        <span className="text-3xl font-black leading-none" style={{ color: LEGACY_COLORS.blue }}>
          {NUM(loading, currentCount)}건
        </span>
        <span className="text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          / 전체 {NUM(loading, baseline?.total)}건
        </span>
      </div>

      {/* 3박스 — 건수 표시 전용 */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="창고"
          value={NUM(loading, baseline?.warehouseCount)}
          sub="창고 재고가 움직인 작업"
          color={LEGACY_COLORS.green}
        />
```
