---
type: index
project: ERP
layer: frontend
source_path: frontend/app/legacy/
status: active
tags:
  - erp
  - frontend
  - legacy
  - ui
aliases:
  - 레거시 UI
  - 활성 메인 UI
---

# frontend/app/legacy

> [!summary] 역할
> 현재 실제로 동작하는 메인 UI 폴더.
> 이름은 legacy지만, 이번 브랜치에서는 데스크톱 화면과 모바일 전용 흐름이 모두 여기서 확장된다.

## 핵심 문서

- [[frontend/app/legacy/page.tsx.md]] - 현재 메인 진입점
- [[frontend/app/legacy/_components/_components]] - 레거시 컴포넌트 허브
- [[frontend/app/legacy/_components/mobile/mobile]] - 모바일 전용 허브

## 구조 변화 포인트

- 데스크톱은 여전히 `DesktopLegacyShell` 중심이다.
- 모바일은 단순 탭 나열보다 `MobileShell + screen + wizard` 구조로 확장됐다.
- 예전 모바일 탭 파일 일부는 `_components/_archive/` 로 이동해 참고용으로 남아 있다.

## 읽는 순서

1. [[frontend/app/legacy/page.tsx.md]]
2. [[frontend/app/legacy/_components/_components]]
3. [[frontend/app/legacy/_components/mobile/mobile]]
4. [[frontend/app/legacy/_components/_archive/_archive]]

## 관련 문서

- [[frontend/app/app]]
- [[frontend/lib/api.ts.md]]
- [[_vault/guides/처음_읽는_사람]]

Up: [[frontend/app/app]]

