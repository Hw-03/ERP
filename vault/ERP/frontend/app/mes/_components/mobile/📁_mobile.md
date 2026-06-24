# 📁 mobile

## 이 폴더는 뭐예요?

모바일 전용 UI 폴더입니다. 데스크톱(`DesktopMesShell`)과 병렬로 존재하며, 모바일 기기에서 접속할 때 렌더링됩니다.

> **참고**: `DesktopMesShell`과 `MobileShell` 은 CSS(`lg:hidden`)로 DOM에 동시 렌더링됩니다. Playwright E2E locator는 반드시 `filter({visible:true})`를 사용해야 합니다.

## 주요 구조

| 경로 | 역할 |
|------|------|
| `MobileShell.tsx` | 5탭 바텀 내비게이션 + 슬라이딩 pill |
| `MobileUserMenuSheet.tsx` | 상단 사용자 메뉴 시트 |
| `screens/` | 7개 화면 (대시보드·입출고·불량·내역·주간·창고맵·더보기) |
| `warehouse/` | 모바일 창고 탭 전용 UI |
| `primitives/` | 모바일 전용 원자 컴포넌트 (45개+) |
| `hooks/` | 모바일 전용 훅 (4개) |
| `history/` | 모바일 내역 UI |
| `tokens.ts` | 모바일 디자인 토큰 |

## 건드릴 때 조심할 점

- `MobileShell.tsx` 탭 바 **디자인 동결** (2026-06-16). NavButton·`<nav>` 컨테이너·슬라이딩 pill 수정 금지
- "더보기" 탭은 BottomSheet가 아닌 `MobileMoreScreen` 5번째 탭으로 구현됨 (2026-06-17)
- 데스크톱과 동명인 컴포넌트는 의도적 분리. 재통합 요청 없으면 통합 시도 금지

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — V2 입출고 (모바일도 이 UI 사용)
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx]] — 모바일 입출고 wizard

> [!info]- 더 연결된 파일
> - [[ERP/frontend/app/globals.css]] — `button.no-btn-inset` 모바일 opt-out 규칙 (동결)
