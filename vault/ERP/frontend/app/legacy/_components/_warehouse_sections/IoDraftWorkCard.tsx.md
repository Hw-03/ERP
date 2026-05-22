---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_sections/IoDraftWorkCard.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# IoDraftWorkCard.tsx — IoDraftWorkCard.tsx 설명

## 이 파일은 무엇을 책임지나

`IoDraftWorkCard.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `IoDraftWorkCard`
- `DraftLineRow`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { IoBatch, IoLine, IoSubType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import {
  IO_WORK_TYPES,
  deptIoDisplayLabel,
  lineTagLabel,
  subTypeLabel,
} from "../_warehouse_v2/ioWorkType";

interface Props {
  draft: IoBatch;
  isBusy: boolean;
  onContinue: () => void;
  onRequestDelete: () => void;
}

const TAG_TONE: Record<string, string> = {
  blue: LEGACY_COLORS.blue,
  green: LEGACY_COLORS.green,
  red: LEGACY_COLORS.red,
  purple: LEGACY_COLORS.purple,
  muted: LEGACY_COLORS.muted2,
};

// 백엔드(services/io.py)가 datetime.utcnow() 로 timezone-naive UTC 를 저장하므로
// 응답 ISO 문자열에 "Z" 가 없으면 UTC 로 간주하고 보정.
// TODO(backend UTC 정리 후 제거): datetime.now(timezone.utc) 전환 완료 시 이 함수 불필요.
function parseServerTime(iso: string): number {
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : iso + "Z").getTime();
}

function formatRelative(iso: string): string {
  const diff = Date.now() - parseServerTime(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function formatQty(qty: number | string | null | undefined): string {
  const n = typeof qty === "number" ? qty : Number(qty);
  if (!Number.isFinite(n)) return "0";
```
