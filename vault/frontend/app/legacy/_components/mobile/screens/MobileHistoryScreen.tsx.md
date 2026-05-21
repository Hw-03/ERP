---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/screens/MobileHistoryScreen.tsx
tags: [vault, code-note, c-tier]
---

# MobileHistoryScreen — 모바일 입출고 내역 (필터 + 카드 리스트)

> [!summary] DesktopHistoryView 의 상태/훅/필터를 재사용하되, 와이드 테이블 → 모바일 카드 리스트(MobileHistoryList)로 교체

## 1. 역할

필터 바/필터 패널/달력 + 통계 + 카드 리스트. 행 탭 시 BottomSheet 상세/묶음상세 오픈. buildGroups 순수함수 공유(데스크탑과 동일).

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/mobile/screens/MobileHistoryScreen.tsx` ([[erp/frontend/app/legacy/_components/mobile/screens/MobileHistoryScreen.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx|MobileHistoryList (카드 리스트)]]
- [[erp/frontend/app/legacy/_components/_hooks/useHistoryData.ts|useHistoryData (데이터)]]
