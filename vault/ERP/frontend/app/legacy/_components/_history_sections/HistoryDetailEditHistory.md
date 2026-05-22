---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/HistoryDetailEditHistory.tsx
tags: [vault, code-note, frontend, b-tier]
---

# HistoryDetailEditHistory — 거래 수정 이력

> [!summary] 역할
> TransactionEditLog 목록을 카드로 표시. 수정자·시간·사유·보정거래 여부.

## 1. 이 파일의 역할

거래 상세 패널의 수정 이력 섹션. 각 수정 기록(edit_id)을 카드로 나열. 수정자명(edited_by_name), UTC 파싱 시간, 수정 사유. correction_log_id 있으면 "수량 보정 거래 생성됨" 표시. 외부 카드 wrapper 없음(부모가 담당).

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/HistoryDetailEditHistory.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/HistoryDetailEditHistory.tsx|원본]])

## 3. 주요 import

- `TransactionEditLog` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `parseUtc` from `./historyFormat`

## 4. 어디서 쓰이는지

- HistoryDetailPanel (Collapsible 섹션)
- 부모: 거래 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] parseUtc 실패 시 invalid date → 안내 필요

## 6. 수정 전 체크

- [ ] TransactionEditLog 필드 추가 시 렌더 로직 갱신
- [ ] toLocaleString("ko-KR") 날짜 형식 일관성
