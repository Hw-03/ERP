---
type: file-explanation
source_path: "frontend/app/legacy/_components/_weekly_sections/WeeklyWeekPicker.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# WeeklyWeekPicker.tsx — WeeklyWeekPicker.tsx 설명

## 이 파일은 무엇을 책임지나

`WeeklyWeekPicker.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `getWeekStartMonday`
- `monthlyWeekLabel`
- `shortWeekLabel`
- `WeeklyWeekPicker`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_weekly_sections/📁__weekly_sections]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
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
  const start = getWeekStartSun(new Date(year, month, 1));
  const endOfMonth = new Date(year, month + 1, 0);
  const weeks: Date[][] = [];
  const cur = new Date(start);
  while (cur <= endOfMonth) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function weekNumOf(weekMon: Date): { year: number; month: number; weekNum: number } {
  const year = weekMon.getFullYear();
  const month = weekMon.getMonth();
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const daysToFirstMon = (1 - dow + 7) % 7;
  const firstMonday = new Date(year, month, 1 + daysToFirstMon);
  const diffDays = Math.round((weekMon.getTime() - firstMonday.getTime()) / 86400000);
  return { year, month, weekNum: Math.floor(diffDays / 7) + 1 };
}
```
