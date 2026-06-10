# ADR-0003 — Mobile wizard 는 Desktop V2 컴포넌트를 재사용

**상태**: Accepted (2026-05-29)

## 맥락

`frontend/app/mes/_components/_warehouse_v2/MobileIoComposeWizard.tsx` 는
모바일 전용 입출고 화면이지만, 내부적으로 데스크탑 V2 의 컴포넌트와 hook 을 그대로 import 한다:

- `IoTargetPicker`, `IoBundleCart`, `IoConfirmStep`
- `useIoWorkState`, `useIoPreview`, `useIoDraft`, `useIoSubmit`

대안 1) 모바일 전용으로 별도 컴포넌트/hook 을 두면 같은 비즈니스 규칙(BOM 전개, draft
저장, 결재 분기 등)을 두 번 구현하게 됨. drift 위험 큼.

대안 2) 데스크탑 컴포넌트를 그대로 쓰면 UI 변경이 양쪽에 동시 영향 — 회귀 위험.

## 결정

**모바일 wizard 는 데스크탑 V2 의 컴포넌트/hook 을 직접 재사용한다.**

- 비즈니스 규칙(preview/draft/submit/approval/BOM)은 단일 구현 유지.
- 모바일 전용 chrome (단계 진행 UI, 가로 스크롤 방지 등)만 wizard 셸이 추가.
- **변경 시 양쪽 회귀 확인 필수** — desktop V2 컴포넌트를 수정하면 mobile wizard 시나리오도
  반드시 점검한다 (P2-1 Playwright E2E 에 모바일 viewport 시나리오 추가 검토).

## 결과

**좋은 점**
- 비즈니스 규칙 drift 0 보장.
- 모바일 ↔ 데스크탑 기능 패리티 자동.

**나쁜 점 / 주의**
- 데스크탑 UI 의 작은 변경(여백, 카드 크기 등)이 모바일에 의도치 않게 번질 수 있다.
- 데스크탑 컴포넌트가 desktop-only API(예: hover-only tooltip)를 추가하면 모바일에서 깨질 수 있음 → PR 리뷰 시 양쪽 확인.

## 관련

- `frontend/app/mes/_components/_warehouse_v2/MobileIoComposeWizard.tsx`
- `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx`
- P2-1 Playwright E2E (모바일 viewport 시나리오 향후 추가)
