# Playwright E2E (P2-1)

브라우저 회귀를 잡아낼 자동 안전망. `.mcp.json` 의 Playwright MCP 와 별도 — 본 디렉터리는
**repo-native** 테스트로, CI 와 로컬 verify 에서 같은 코드로 돌릴 수 있다.

## 격리 실행 — 실 DB 미접촉 (2026-06-04~)

`globalSetup`/`globalTeardown` 이 **전용 DB·전용 서버**를 자동으로 띄우고 내린다. 실
`backend/mes.db` 는 절대 건드리지 않는다(teardown 에서 SHA256 불변 검증).

- 전용 DB: `backend/mes_e2e.db` (부트스트랩+시드, teardown 삭제)
- 전용 백엔드: 포트 **8021** (globalSetup 이 `DATABASE_URL` 로 기동)
- 전용 프론트: 포트 **3100** (`next dev`, `/api/*` → `BACKEND_INTERNAL_URL`=8021 프록시)
- dev(8011/3001)·prod(8010/3000) 스택과 무충돌.

```bash
cd frontend
npx playwright test            # globalSetup 이 전용 DB·서버·시드 자동 처리
npx playwright test io-receive # 단일 spec
```

또는 리포지토리 루트에서:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_e2e.ps1
```

> 첫 설치: `npm install` (이미 `@playwright/test` devDep 포함) + `npx playwright install chromium`.

## 로그인 우회

`_helpers.ts` `loginAsOperator(page, { role | code })` — MesLoginGate 3중 검증(operator·
boot_id·활성직원)을 런타임 조회로 inject. 결재 2-세션 테스트는 `code`(employee_code)로 제출자/
승인자를 분리한다.

## 시나리오

| 파일 | 시나리오 | 목적 |
|---|---|---|
| `io-receive.spec.ts` | 원자재 입고(낱개 → **부서 결재**) | 기본 흐름 + 라벨. 낱개 1라인은 즉시반영이 아니라 부서 결재(`hasManualLine`) |
| `io-warehouse-to-dept.spec.ts` | 창고 → 부서(**창고 결재**) | approval 경로 제출 |
| `io-dept-to-warehouse.spec.ts` | 부서 → 창고 회수(**창고 결재**) | 반대 방향 제출 |
| `io-process-produce.spec.ts` | 생산(BOM 자동 전개, **즉시 반영**) + 자식 강제 잠김 | BOM 분기. produce 는 자식 제외 불가(`isBomForced`) |
| `io-approval-cycle.spec.ts` | 제출(E01) → 창고 승인함 PIN 승인(E22) → 큐 소멸 | **2-세션 결재 풀사이클** |
| `io-defect.spec.ts` | 불량 격리 → 정상 복귀 | 불량 흐름(즉시 처리) |
| `io-history-labels.spec.ts` | 같은 작업이 화면에서 같은 라벨로 보임 | P0-1 라벨 회귀 방어 |

## 작성 원칙

- **user-facing locator** — `getByRole('button', { name })` / `getByText`. data-testid 는 쓰지 않는다
  (실 app 코드 미접촉 원칙). 행 기반은 `getByRole('row', { name }).getByRole('button', { name })`.
- **결재 정책 주의** — 창고 정/부가 창고-결재를 제출하면 **자가승인 즉시 반영**(큐 미적재). 풀사이클은
  제출자=일반직원, 승인자=창고/부서 정 으로 분리. 승인은 "승인" → PIN(기본 0000) → "승인 확정".
- **느린 트랜잭션 견디기** — 필요 시 `expect(...).toBeVisible({ timeout: 10_000 })`.

## CI

`.github/workflows/ci.yml` 의 `e2e` job 이 동일 코드로 돈다(전용 DB globalSetup). teardown 은
OS 분기(Windows taskkill / POSIX SIGKILL)로 크로스플랫폼.
