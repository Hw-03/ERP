---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx
tags: [vault, code-note, c-tier]
---

# MobileHistoryList — 입출고 내역 카드 리스트

> [!summary] 와이드 테이블(HistoryTable) 대신 모바일 카드 렌더링. buildGroups/컬러 로직은 데스크탑과 동일

## 1. 역할

TransactionLog[] → 묶음 그룹화(buildGroups) → 카드 리스트. 행 탭 콜백(onSelectLog/onSelectBatch). 로딩/무더보기 상태.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx` ([[erp/frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/mobile/screens/MobileHistoryScreen.tsx|MobileHistoryScreen (부모)]]
- [[erp/frontend/app/legacy/_components/_hooks/useHistoryData.ts|useHistoryData]]
