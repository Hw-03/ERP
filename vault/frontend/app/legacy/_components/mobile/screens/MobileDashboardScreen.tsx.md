---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/screens/MobileDashboardScreen.tsx
tags: [vault, code-note, c-tier]
---

# MobileDashboardScreen — 모바일 대시보드 (KPI + 품목 + 상세)

> [!summary] DesktopInventoryView 의 데이터/훅/필터를 재사용하되, 우측 슬라이드 → 하단 드래그-투-디스미스 BottomSheet로 상세 표시

## 1. 역할

KPI 패널 + 생산가능 용량 + 필터/검색 + 품목 리스트를 수직 스택. 행 탭 시 BottomSheet 상세 오픈. useInventoryData/필터/KPI 로직은 데스크탑과 공유.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/mobile/screens/MobileDashboardScreen.tsx` ([[erp/frontend/app/legacy/_components/mobile/screens/MobileDashboardScreen.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/mobile/MobileShell.tsx|MobileShell (탭 라우터)]]
- [[erp/frontend/app/legacy/_components/_hooks/useInventoryData.ts|useInventoryData (데이터)]]
- [[erp/frontend/app/legacy/_components/common/KpiCard.tsx|KpiCard 프리미티브]]
