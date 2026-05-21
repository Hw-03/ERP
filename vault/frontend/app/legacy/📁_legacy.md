---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/
tags: [vault, index, folder-marker]
aliases:
  - "legacy"
  - "legacy.md"
---

# 📁 legacy

> [!summary] 역할
> DEXCOWIN MES 의 실제 활성 UI 루트. 이름은 "legacy" 지만 현재 유일하게 동작하는 화면 진입점이다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/` 의 vault 미러.

## 어떤 파일들이 있나

핵심 파일:
- `page.tsx` — `DepartmentsProvider` → `MesLoginGate` → `LegacyBody` 조합. 모바일(`MobileShell`)과 데스크톱(`DesktopLegacyShell`)을 분기 렌더

부수 폴더:
- `_components/` — 184개 .tsx 컴포넌트 모음 (도메인별 서브폴더로 분리)

## 도메인 컨텍스트

`page.tsx` 는 브레이크포인트(`lg:hidden`)로 모바일/데스크톱 셸을 분기한다.
로그인은 `MesLoginGate` 가 담당하고, 부서 목록은 `DepartmentsProvider` 로 전역 공급된다.
실제 도메인 화면(재고, 입출고, 이력, 관리)은 모두 `_components/` 하위에 위치한다.

## ⚠️ 위험 포인트

- 폴더 이름이 "legacy" 이므로 deprecated/불필요 코드로 오해하기 쉽다. 절대 삭제 금지.
- CLAUDE.md 에도 동일 주의사항이 명시되어 있다.
- `app/page.tsx` 가 이 폴더의 `page.tsx` 를 re-export 하는 구조이므로, 루트 라우트(`/`)와 직결된다.

## 관련 가이드

- [[erp/_vault/guides/frontend-routing]]

## 자식 폴더

- [[erp/frontend/app/legacy/_components/📁__components|_components/]] — 184개 컴포넌트 모음
