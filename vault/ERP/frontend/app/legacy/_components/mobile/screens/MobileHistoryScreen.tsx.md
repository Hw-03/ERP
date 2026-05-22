---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/screens/MobileHistoryScreen.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MobileHistoryScreen.tsx — MobileHistoryScreen.tsx 설명

## 이 파일은 무엇을 책임지나

`MobileHistoryScreen.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MobileHistoryScreen`
- `TransactionLog`
- `TransactionSummary`
- `HistorySelection`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/screens/📁_screens]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { productionApi, type TransactionSummary } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { HistoryFilterBar } from "../../_history_sections/HistoryFilterBar";
import { HistoryFilterPanel } from "../../_history_sections/HistoryFilterPanel";
import { HistoryCalendarPanel } from "../../_history_sections/HistoryCalendarPanel";
import { HistoryStatsBar } from "../../_history_sections/HistoryStatsBar";
import { HistoryDetailPanel } from "../../_history_sections/HistoryDetailPanel";
import { HistoryBatchDetailPanel } from "../../_history_sections/HistoryBatchDetailPanel";
import { useHistoryData } from "../../_hooks/useHistoryData";
import { parseUtc, toDateKey, formatHistoryDate } from "../../_history_sections/historyFormat";
import {
  getHistoryActor,
  getHistoryDisplayLabel,
} from "../../_history_sections/historyBatchInterpreter";
import { type HistorySelection } from "../../_history_sections/historyConstants";
import { DATE_OPTIONS, dateFilterToFrom } from "../../_history_sections/historyQuery";
import { MobileHistoryList } from "../history/MobileHistoryList";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * 입출고 내역 모바일 화면.
 *
 * DesktopHistoryView 의 state/훅 오케스트레이션을 그대로 따르되,
 * ① 와이드 HistoryTable → MobileHistoryList(카드) ② 우측 SlidePanel 상세
 * → 드래그 BottomSheet 로 교체. 데이터/포맷/그룹 순수함수(historyShared
 * golden)는 호출만.
 */
export function MobileHistoryScreen() {
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void api
      .getModels()
```
