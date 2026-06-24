---
type: file-explanation
source_path: "frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-06-24
project: DEXCOWIN MES
---

# MobileIoComposeWizard.tsx — 모바일 입출고 마법사

## 이 파일은 뭐예요?

데스크톱 `IoComposeView`와 동일한 입출고 흐름을 모바일에서 구현한 컴포넌트입니다. 레이아웃만 모바일에 맞게 다르고, 핵심 훅(`useIoWorkState`, `useIoPreview`, `useIoSubmit` 등)은 데스크톱과 동일하게 재사용합니다.

## 언제 보나요?

- 모바일 입출고 화면 이상 시
- 데스크톱과 모바일 동작 차이를 비교할 때
- `locationQuantity` 헬퍼 복제 이유를 확인할 때

## 중요한 내용

**데스크톱·모바일 의도적 분리**

[ADR-0003](adr) 에 따라 두 컴포넌트는 의도적으로 분리됩니다. 훅은 공유하되 레이아웃 컴포넌트는 분리. "왜 통합 안 하지?" 질문이 들면 ADR-0003을 먼저 확인.

**`locationQuantity` 복제**

IoComposeView와 동일한 4줄 헬퍼가 이 파일에도 있습니다. 두 컴포넌트만의 사용처이고, 공용 모듈 추출 비용이 복제 유지 비용보다 크기 때문에 의도적으로 복제 유지 (파일 내 주석으로 설명됨).

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 데스크톱 동일 흐름
- `_attic/docs/adr/ADR-0003-mobile-reuses-desktop-v2.md` — 분리 설계 근거

> [!info]- 더 연결된 파일
> - [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 모바일 네비게이션 (동결)
