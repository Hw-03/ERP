---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/historyFormat.ts
tags: [vault, code-note, auto-generated, stub]
---

# historyFormat.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/historyFormat.ts]]

## 원본 첫 줄

```
/**
 * historyFormat.ts — 날짜/시간 파싱·포맷 순수 함수.
 * C2: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */

/** UTC ISO 문자열 → Date. Z/오프셋 없는 문자열에는 Z 추가. */
export function parseUtc(iso: string): Date {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

/** `MM/DD HH:mm` 형식 단축 날짜. 로컬 시간 기준. */
export function formatHistoryDate(iso: string): string {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

/** 우측 상세 메타용 정본 형식 — `2026년 5월 14일    14시 21분` (초 제외). */
export function formatHistoryDateTimeLong(iso: string): string {
  const d = parseUtc(iso);
  const yyyy = d.getFullYear();
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}년 ${m}월 ${dd}일    ${hh}시 ${min}분`;
}
```
