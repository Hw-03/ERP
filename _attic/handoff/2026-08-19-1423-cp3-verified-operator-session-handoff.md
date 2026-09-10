# CP3 검증된 작업자 세션 구현 핸드오프

## 목표와 현재 상태

- 목표: DEXCOWIN MES 체크포인트 3의 `IC-01`만 구현해 DB-backed 12시간 작업자 세션과 모든 업무 mutation의 단일 `VerifiedActor` 경계를 만든다.
- 실행 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 브랜치: `codex/full-code-quality-improvement`
- 현재 HEAD: `27da6e25718453378160fb9b930d8ed9cff8b622`
- 현재 HEAD는 확정된 최신 `main` `c01034a3b923ed2b96a75dd30f825eab9d0eb3a8`을 병합한 merge commit이다.
- 원격 품질 브랜치 HEAD는 `1074a8ff65bb7fe22fbc053a5e7b85b561e58e29`이며 로컬 브랜치는 5커밋 앞서 있다. 이 핸드오프에서는 푸시하지 않았다.
- CP3 제품 구현은 아직 시작하지 않았다.

## 구현 정본과 사용자 결정

1. 먼저 `AGENTS.md`를 읽는다.
2. 승인된 설계 정본은 `docs/superpowers/specs/2026-08-19-verified-operator-session-design.md`다.
3. 전체 로드맵과 완료 조건은 `_attic/docs/research/2026-08-13-full-code-quality-audit-and-improvement-plan.md`의 `IC-01` 및 체크포인트 3 절이다.
4. 기존 4자리 직원 PIN을 실제 로그인 자격 증명으로 사용한다.
5. PIN이 없거나 기본 PIN `0000`인 직원은 최초 로그인에서 새 PIN을 설정하기 전까지 재고·업무 mutation을 수행할 수 없다.
6. 작업자 세션은 DB-backed opaque token, HttpOnly·SameSite=Lax 쿠키, 12시간 절대 만료를 사용한다.
7. 로그아웃, PIN 변경·초기화, 직원 비활성화·삭제, backend `boot_id` 변경 시 기존 세션을 폐기한다.
8. HTTPS와 회사 도메인·DNS·인증서·Caddy 도입은 후속 `SEC-01` 범위다. 이번 CP3에서는 회사 홈페이지나 도메인을 건드리지 않는다.
9. 현재 HTTP LAN에서는 `Secure` 쿠키를 강제하지 않으며, 시스템을 인터넷이나 신뢰할 수 없는 LAN에 안전하다고 주장하지 않는다.
10. `C:\ERP-dev`는 파일 읽기·해시·검색·DB 연결·프로세스·포트 확인을 포함해 전혀 접근하지 않는다.

## 현재 미커밋 변경

아래 6개 파일은 최신 `main` 병합 뒤 CP2 검증 정책과 맞추기 위해 만든 병합 호환 수정이다. CP3 변경으로 오인하거나 되돌리지 않는다.

- `frontend/app/mes/_components/__tests__/CapacityDetailModal.test.tsx`
- `frontend/app/mes/_components/__tests__/DesktopHistoryView.state.test.tsx`
- `frontend/app/mes/_components/_hooks/__tests__/useHistoryData.test.tsx`
- `frontend/app/mes/_components/mobile/screens/__tests__/MobileHistoryScreen.history-data.test.tsx`
- `frontend/scripts/check-bundle-size.mjs`
- `frontend/scripts/check-bundle-size.test.mjs`

변경 내용은 새 `main` 테스트의 엄격한 타입 게이트 호환과 생산 가능수량 화면 병합 후 실제 번들 2.318MB를 수용하는 승인 한도 `2.320MB` 조정뿐이다. 이 핸드오프 문서도 새 untracked 파일로 남는다. 커밋·푸시는 사용자가 명시적으로 요청하기 전까지 하지 않는다.

## 메인 워크트리 보호 경계

`C:\ERP` 메인 워크트리는 현재 HEAD `c01034a3`이며 다음 사용자 변경이 존재한다. 읽거나 수정·복사·stash·reset·commit하지 않는다.

- 수정: `_attic/docs/UI_REVIEW_LOG.md`
- 수정: `frontend/app/mes/_components/CapacityDetailModal.tsx`
- 수정: `frontend/app/mes/_components/__tests__/CapacityDetailModal.test.tsx`
- 수정: `frontend/app/mes/_components/_capacity_sections/DesktopCapacityPfWorkspace.tsx`
- 미추적: `_attic/handoff/2026-08-19-dashboard-followup-todo.md`
- 미추적: `_attic/handoff/2026-08-19-dashboard-table-header-todo.md`

CP3의 모든 읽기·쓰기·테스트는 품질 개선 워크트리 안에서만 수행한다.

## 완료된 준비와 검증

- `main` 병합: 충돌 없이 완료.
- 병합 후 신규 테스트 TypeScript 진단 5종: 원인을 확인하고 테스트 타입만 최소 수정.
- 관련 Vitest: 4파일, 66테스트 통과.
- 테스트 TypeScript baseline: 386개 기존 진단, 신규 종류·증가 0.
- 프런트엔드 lint, 앱 typecheck, 테스트 typecheck, E2E typecheck 통과.
- 프런트엔드 전체 coverage: 245파일, 2,014테스트 통과.
- Next production build 통과.
- bundle gate: 실제 2.318MB, 승인 한도 2.320MB로 통과.
- 백엔드 전체 pytest: exit 0, 100% 완료.
- OpenAPI 생성 결과와 `_dev/baselines/openapi.json` 일치.
- Playwright 전용 E2E: 15개 통과, `mes_e2e.db` 제거 및 실제 `mes.db` 불변 확인.
- `git diff --check` 통과.
- 8021·3100 listener 0, 전용 E2E DB 잔존 0.
- 로컬 `TEST_POSTGRES_URL`이 없어 병합 HEAD의 PostgreSQL 검증은 `NOT_VERIFIED`다. PostgreSQL 증거를 성공으로 추정하지 않는다.

## CP3 구현 범위

- additive Alembic migration: `operator_sessions`, `employees.pin_requires_change` 및 인덱스·backfill.
- PBKDF2-HMAC-SHA256 PIN 포맷과 legacy SHA-256 점진 업그레이드.
- 로그인, 최초 PIN 변경 challenge, 현재 세션 조회, 로그아웃, 일반 PIN 변경·관리자 초기화 폐기 계약.
- 공용 runtime `boot_id`, operator session service, `VerifiedActor` dependency.
- 등록된 모든 FastAPI `POST`·`PUT`·`PATCH`·`DELETE` route를 필수 actor·인증 bootstrap·비업무 예외로 양방향 분류하는 manifest gate.
- IO, StockRequest, 불량, 생산, 출하, 부서조정, 거래 정정·취소, 인수인계, 창고 지도, 설정·관리자 재고 복구 mutation이 body/header가 아니라 서버 actor를 사용하도록 전환.
- 프런트엔드는 `GET /api/operator-session`을 로그인 정본으로 사용하고 기본 PIN 변경, 새로고침 복원, 로그아웃, 401 복귀를 처리한다.
- spoof·expiry·revoke·restart·transaction rollback·SQLite 및 가능한 PostgreSQL 경합 검증.
- CP3 외 `IC-03` 이후 카드는 시작하지 않는다.

## 비범위와 금지

- HTTPS/TLS, 회사 도메인, DNS, 인증서, Caddy, 외부 공개.
- 관리자 PIN 체계 전체 재설계, MFA·SSO·JWT, 승인 역할 정책 재설계.
- 동결된 주간보고, 모바일 하단 탭, 출하 5단계 카드 크기·grid·overflow 변경.
- 실제 직원 DB나 직원 서버 접근.
- 브랜치 생성·전환, main 병합, commit, push, PR.

## 단일 다음 작업

현재 working tree와 위 6개 기존 변경을 다시 확인한 뒤, 승인 설계를 비판적으로 검토하고 `IC-01`의 migration·PIN/session core부터 TDD의 RED로 시작한다. 기존 미커밋 변경을 덮어쓰거나 CP3 변경과 섞어 정리하지 않는다.

그 뒤에는 설계의 배포 순서대로 API·프런트 전환·전체 mutation manifest를 구현하고, 카드별 명세 리뷰와 코드 품질 리뷰, focused gate, 마지막 통합 gate를 수행한다. `IC-01` 합격 조건이 모두 충족되면 체크포인트 3 결과만 보고하고 멈춘다.
