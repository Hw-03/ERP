---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/DesktopWeeklyReportView.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DesktopWeeklyReportView.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/DesktopWeeklyReportView.tsx]]

## 원본 첫 줄

```
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
```
