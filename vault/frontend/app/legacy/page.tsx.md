---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/page.tsx
status: active
tags:
  - erp
  - frontend
  - legacy
  - entrypoint
aliases:
  - legacy 진입점
  - 메인 화면 진입점
---

# legacy/page.tsx

> [!summary] 역할
> 현재 실제 메인 화면 진입점.
> 데스크톱은 `DesktopLegacyShell`, 모바일은 `MobileShell` + screen/wizard 조합으로 분기한다.

## 쉬운 말로 설명

이 파일은 "지금 사용자에게 어떤 화면 뼈대를 보여줄지" 결정하는 곳이다.  
예전처럼 데스크톱/모바일을 단순히 다른 탭 레이아웃으로 나누는 수준이 아니라, 모바일 쪽은 별도 스크린과 wizard 상태를 붙여서 더 적극적으로 분기한다.

## 핵심 책임

- 데스크톱과 모바일 UI 진입 분기
- 모바일 활성 탭 상태 관리
- 모바일 창고/부서 wizard provider 연결
- 공통 토스트 메시지 흐름 관리

## 관련 문서

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]]
- [[frontend/app/legacy/_components/mobile/mobile]]
- [[frontend/app/legacy/_components/mobile/io/io]]

Up: [[frontend/app/legacy/legacy]]

