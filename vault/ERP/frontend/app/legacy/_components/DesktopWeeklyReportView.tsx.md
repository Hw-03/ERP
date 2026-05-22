---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopWeeklyReportView.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopWeeklyReportView.tsx — DesktopWeeklyReportView.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopWeeklyReportView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopWeeklyReportView`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import type { WeeklyReportResponse, WeeklyProductionModelRow } from "@/lib/api/types/weekly";
import { WeeklyGroupCards } from "./_weekly_sections/WeeklyGroupCards";
import { WeeklyDetailTable } from "./_weekly_sections/WeeklyDetailTable";
import { WeeklyProductionMatrix } from "./_weekly_sections/WeeklyProductionMatrix";
import { LoadingSkeleton } from "./common";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 생산 매트릭스를 CSV로 변환 */
function matrixToCsv(rows: WeeklyProductionModelRow[]): string {
  const header = ["모델", "튜브", "고압", "진공", "튜닝", "조립", "출하", "합계"].join(",");
  const lines = rows.map((r) =>
    [r.model_label, r.tf_qty, r.hf_qty, r.vf_qty, r.nf_qty, r.af_qty, r.pf_qty, r.total_qty].join(",")
  );
  return [header, ...lines].join("\n");
}

function downloadCsv(content: string, filename: string) {
  const bom = "﻿"; // UTF-8 BOM — 한글 엑셀 호환
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  weekMon: Date;
}

export function DesktopWeeklyReportView({ weekMon }: Props) {
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState("TF");

  const weekStart = toDateStr(weekMon);
  const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * 86400000));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getWeeklyReport({ week_start: weekStart, week_end: weekEnd })
```
