---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx
tags: [vault, code-note, c-tier]
---

# MobileAdminScreen — 모바일 관리자 (PIN 게이트 + 섹션 드릴다운)

> [!summary] DesktopAdminView 의 PIN/훅/섹션 구조를 따르되, 사이드바+우측패널 → 섹션 허브 → 풀스크린 드릴다운으로 재구성

## 1. 역할

PIN 인증 → 섹션 허브(리스트) → 탭으로 섹션별 풀스크린 콘텐츠. useAdminBootstrap/ViewState/Settings 훅 공유.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx` ([[erp/frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/DesktopAdminView.tsx|DesktopAdminView (부모 로직)]]
