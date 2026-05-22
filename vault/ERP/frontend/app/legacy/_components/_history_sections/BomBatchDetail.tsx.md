---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/BomBatchDetail.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomBatchDetail.tsx — BomBatchDetail.tsx 설명

## 이 파일은 무엇을 책임지나

`BomBatchDetail.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomBatchDetail`
- `StatusBadge`
- `BundleRows`
- `BomLineRow`
- `LineSignTone`
- `Props`

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

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Package } from "lucide-react";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import {
  getHistoryBomParentLine,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  type LineSignTone,
} from "./historyBatchInterpreter";

const SIGN_TONE_HEX: Record<LineSignTone, string> = {
  increase: LEGACY_COLORS.blue,
  decrease: LEGACY_COLORS.red,
  move: LEGACY_COLORS.cyan,
  muted: LEGACY_COLORS.muted2,
};

type Props = {
  batchId: string;
  colSpan: number;
  /** 부모에서 캐시를 관리해 중복 요청을 방지. */
  cache: Map<string, IoBatch>;
  onCached: (batchId: string, batch: IoBatch) => void;
};

export function BomBatchDetail({ batchId, colSpan, cache, onCached }: Props) {
  const [batch, setBatch] = useState<IoBatch | null>(cache.get(batchId) ?? null);
  const [loading, setLoading] = useState(!cache.has(batchId));
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (cache.has(batchId)) {
      setBatch(cache.get(batchId)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void ioApi
      .getBatch(batchId)
      .then((b) => {
        if (cancelled) return;
        onCached(batchId, b);
        setBatch(b);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps
```
