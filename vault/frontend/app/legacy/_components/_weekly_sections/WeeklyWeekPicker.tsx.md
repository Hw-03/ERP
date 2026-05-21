---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_weekly_sections/WeeklyWeekPicker.tsx
tags: [vault, code-note, auto-generated, stub]
---

# WeeklyWeekPicker.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_weekly_sections/WeeklyWeekPicker.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { StatusPill } from "../common";

const CAL_MIN = new Date(2026, 0, 1);

export function getWeekStartMonday(d: Date): Date {
  const mon = new Date(d);
  const dow = d.getDay();
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getWeekStartSun(d: Date): Date {
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  sun.setHours(0, 0, 0, 0);
  return sun;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeeksOfMonth(year: number, month: number): Date[][] {
```
