# 관리자 로딩 표시의 첫 개별 반영

## 범위

후보 `255895914416a55b41fd9b5c185e4e7f5a39bd77`의 관리자 로딩 표시 수정만 main 기준 `c71eafdc006d7976a1013d68b9cd32f3064dcdb7`에 옮긴다. 후보 전체나 과거 테스트·진단 도구를 병합하지 않는다. 공통 화면 묶음의 일부를 반영하는 것이며 다른 업무 묶음의 완료를 뜻하지 않는다.

- 제품 파일: `frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminReadState.tsx:39`
- 실제 소비 경로: `DesktopAdminView`의 `AdminReadProvider` → `AdminEmployeesSection`의 `AdminReadBoundary`.
- 원인: `display:contents` 외곽에 둔 로딩 status의 자식이 모두 aria-hidden이면 Chromium에서 상태를 찾지 못한다.
- 수정: 페이드 ref와 외곽은 유지하고, 로딩 role·이름·busy만 실제 flex 요소에 둔다.
- DB·재고·결재·API·서버 설정·번들 한도 변경은 없다. 직원 서비스·DB·배포·예약을 조작하지 않는다.

## 관련 검증

로컬 근거는 ignored `_attic/runtime/admin-loading-main-20261027/`에 보관한다.

| 검사 | 결과·범위 | 근거 |
|---|---|---|
| 수정 전 Chromium | 실제 컴포넌트의 렌더 결과에서 status를 찾지 못해 실패 | `browser-red-02.log`, `browser-results/` |
| 수정 후 Chromium | 로딩 안내·busy 인식, 완료 후 안내 제거와 버튼 표시 통과. worker1·재시도0 | `browser-final.log` |
| 기존 컴포넌트 검사 | 페이드·입력과 포커스 유지·오류/재시도·초기 덮개·모션 설정 5개 통과 | `unit-before.log`, `unit-green.log` |
| 정적 검사 | 제품 파일과 새 회귀 검사만 ESLint 확인 | `eslint-final.log` |
| 타입 검사 | 별도 tsconfig에서 제품 컴포넌트·회귀 검사와 직접 import만 확인 | `typecheck.log` |

브라우저 회귀는 실제 컴포넌트를 Vite로 읽고 정적 마크업을 Chromium에 표시한다. Next·백엔드·DB·로그인·업무 요청은 사용하지 않는다. CSR 이벤트와 페이드는 기존 Vitest로 구분해 확인했으며, 실제 직원 화면 업무 제출이나 전체 업무 검증으로 확대하지 않는다.

처음 Playwright가 CSS 모듈을 직접 읽지 못한 준비 실패는 `browser-red.log`에 보존했다. Vite 로더를 사용한 뒤의 status 누락이 수정 전 제품 실패 근거다. 초기 새 검사 ESLint의 children 전달 방식 오류는 `eslint.log`에 보존하고 React.createElement의 자식 인자로 수정했다. 제품 수정은 추가하지 않았다.

## 반영·보존

제품 파일·관련 회귀 검사·이 기록만 명시적으로 stage한다. 다른 세션의 출하·재고·불량·성능 작업은 포함하지 않는다. cached diff/check와 staged smart PlanOnly를 확인하고 실제 영향에 필요한 국소 검사만 사용한다. 전체 backend·E2E·커버리지·성능·복구 검사는 반복하지 않는다.

커밋·푸시 결과와 새 HEAD의 CI 링크·시작 상태는 로컬 `git-final.json` 및 최종 응답에 기록한다. CI 전체 종료는 기다리지 않는다. 직원 서버 직접 배포는 수행하지 않는다.

staged smart 계획은 다른 세션의 미스테이징 백엔드 변경 때문에 backend 전체 검사로 승격했다(`smart-plan.log`). 이번 로딩 DOM 변경과 무관하므로 실행하지 않았다. 공통 검사 설정·API·DB·의존성 변경 없이 직접 단위·Chromium·ESLint·좁은 타입·이 문서 링크/공백 검사로 범위를 한정했다. 다른 세션의 작업 파일은 그대로 보존한다.
