---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/historyFormat.ts
tags: [vault, code-note, frontend, b-tier]
---

# historyFormat — 거래 날짜/시간 포맷 유틸

> [!summary] 역할
> UTC ISO 파싱 및 3가지 포맷 함수. Z 자동 추가, 로컬 시간 변환.

## 1. 이 파일의 역할

순수 함수 모음. parseUtc: ISO 문자열 → Date (Z 자동 추가), formatHistoryDate: MM/DD HH:mm, formatHistoryDateTimeLong: "2026년 5월 14일 14시 21분", toDateKey: YYYY-MM-DD 달력 키.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/historyFormat.ts` ([[erp/frontend/app/legacy\_components\_history_sections/historyFormat.ts|원본]])

## 3. 주요 내보내기

- `parseUtc(iso: string): Date`
- `formatHistoryDate(iso: string): string`
- `formatHistoryDateTimeLong(iso: string): string`
- `toDateKey(iso: string): string`

## 4. 어디서 쓰이는지

- HistoryLogRow, HistoryDetailRecentLogs, HistoryDetailEditHistory 등 거래 표시 컴포넌트
- HistoryCalendarPanel 달력 인덱싱
- 부모: 거래 이력 전체

## 5. ⚠️ 위험 포인트

> [!warning] parseUtc: Z 자동 추가 — timezone 있는 문자열 시 중복 확인

## 6. 수정 전 체크

- [ ] 새 포맷 함수 추가 시 UTC 정규화 유지
- [ ] 로컬 타임존 변환 오프셋 검증
