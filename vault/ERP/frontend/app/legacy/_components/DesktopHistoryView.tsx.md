---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopHistoryView.tsx"
importance: critical
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopHistoryView.tsx — DesktopHistoryView.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopHistoryView`
- `TransactionLog`
- `TransactionSummary`
- `HistorySelection`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { productionApi, type TransactionSummary } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HistoryFilterBar } from "./_history_sections/HistoryFilterBar";
import { HistoryFilterPanel } from "./_history_sections/HistoryFilterPanel";
import { HistoryCalendarPanel } from "./_history_sections/HistoryCalendarPanel";
import { HistoryStatsBar } from "./_history_sections/HistoryStatsBar";
import { HistoryTable } from "./_history_sections/HistoryTable";
import { DesktopHistoryRightPanel } from "./_history_sections/DesktopHistoryRightPanel";
import { useHistoryData } from "./_hooks/useHistoryData";
import { parseUtc, toDateKey } from "./_history_sections/historyFormat";
import { type HistorySelection } from "./_history_sections/historyConstants";
import { DATE_OPTIONS, dateFilterToFrom } from "./_history_sections/historyQuery";

const SEARCH_DEBOUNCE_MS = 350;

export function DesktopHistoryView() {
  // 3차: 상단 KPI 박스는 표시 전용(클릭 필터 폐기). 필터는 "필터" 패널 단일.
  // scope/typeFilter/activeBucket·부서 전개 상태 없음 — 항상 "전체"로 시작.
  // 대시보드식 독립 필터 패널 (부서·모델·거래종류 다중 선택).
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedOps, setSelectedOps] = useState<string[]>([]);
  const modelParam = selectedModels.join(",");
  const deptParam = selectedDepts.join(",");
  const opParam = selectedOps.join(",");
  const [dateFilter, setDateFilter] = useState("MONTH");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // search debounce — 목록과 달력 fetch 가 같은 값을 공유.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // 필터 패널 "모델 구분" 칩 소스 — 1회 로드.
  useEffect(() => {
    void api
      .getModels()
      .then((ms) => {
        const names = Array.from(
          new Set(ms.map((m) => m.model_name).filter((n): n is string => !!n)),
        );
        setAvailableModels(names);
      })
      .catch(() => {});
  }, []);
```
