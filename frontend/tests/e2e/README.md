# Playwright E2E (P2-1)

브라우저 회귀를 잡아낼 자동 안전망. `.mcp.json` 의 Playwright MCP 와 별도 — 본 디렉터리는
**repo-native** 테스트로, CI 와 로컬 verify 에서 같은 코드로 돌릴 수 있다.

## 격리 실행 — 실 DB 미접촉 (2026-06-04~)

공통 Node runner가 run token/nonce를 발급한 뒤, mutation 전에 원자적 ownership lock을 획득한다. `globalSetup`은
해당 worktree `backend/mes.db` 가족 상태를 기록하고 **합성 전용 DB**를 bootstrap한 뒤, nonce를 전달한 전용
loopback 백엔드를 기동한다. 기동 뒤에만 PID start token을 읽어 receipt로 저장하고 nonce·PID가 일치하는
readiness를 확인한 다음 합성 업무 seed를 준비한다. teardown은 캡처·저장된 receipt와 소유권을 대조해 정리하며, 불일치 또는 incomplete
cleanup이면 lock과 증거를 보존하고 실패한다.

- 합성 전용 DB: `backend/mes_e2e.db` (`DATABASE_URL`로 bootstrap+seed, 소유 teardown만 삭제)
- 전용 loopback 백엔드: 기본 **8021**, 승인 fallback **8022**
- 전용 프론트: 기본 **3100**, 승인 fallback 범위 **3300~3399**(`/api/*`는 선택된 `BACKEND_INTERNAL_URL` 프록시)
- `[HISTORICAL — 재확인 금지]` development(8011/3001)·employee(8010/3000) profile과의 무충돌 관찰은 과거 기록이다. 현재 안전 계약은 위 전용 port의 availability 확인과 ownership receipt뿐이며, 직원 경로·포트·DB를 조회하거나 실행하지 않는다.

```bash
cd frontend
npm run test:e2e                        # Node 20 guard + 전체 E2E
npm run test:e2e -- io-receive.spec.ts  # Node 20 guard + 단일 spec
```

세 npm 진입점(`test:e2e`, `test:e2e:headed`, `test:e2e:ui`)만 사용한다. raw
`npx playwright test`는 run lock과 현재 token이 없어 config 로딩 단계에서 거부된다. 기존 lock이나
receipt가 남아 있으면 자동 회수·PID 종료를 시도하지 않고 증거를 보존한 채 실패한다.

또는 리포지토리 루트에서:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_e2e.ps1
```

> 첫 설치: `npm install` (이미 `@playwright/test` devDep 포함) + `npx playwright install chromium`.

## 격리 작업자 로그인

`global-setup.ts`가 격리 DB의 E2E 직원 PIN을 `E2E_OPERATOR_PIN`(기본 `2468`)으로 설정한다.
setup은 지정 작업자별 `/api/operator-session`을 한 번 호출해 실제 HttpOnly cookie를 임시 시드에
보관하고, `_helpers.ts`의 `loginAsOperator(page, { role | code })`는 테스트별 새 browser context에
해당 cookie를 복제한 뒤 `GET /api/operator-session` 정본으로 actor를 재검증한다. 따라서 브라우저
상태는 격리하면서 production 세션 발급 예산을 테스트 수만큼 소모하지 않는다. 임시 시드와 cookie는
캡처된 teardown에서 삭제한다. 결재 2-세션 테스트는 `code`(employee_code)로 제출자/승인자를 분리한다.

## 시나리오

| 파일 | 시나리오 | 목적 |
|---|---|---|
| `io-receive.spec.ts` | 원자재 입고(낱개 → **부서 결재**) | 기본 흐름 + 라벨. 낱개 1라인은 즉시반영이 아니라 부서 결재(`hasManualLine`) |
| `io-warehouse-to-dept.spec.ts` | 창고 → 부서(**창고 결재**) | approval 경로 제출 |
| `io-dept-to-warehouse.spec.ts` | 부서 → 창고 회수(**창고 결재**) | 반대 방향 제출 |
| `io-process-produce.spec.ts` | 생산(BOM 자동 전개, **즉시 반영**) + 자식 강제 잠김 | BOM 분기. produce 는 자식 제외 불가(`isBomForced`) |
| `io-warehouse-adjust.spec.ts` | 창고 보정 입고·출고(**즉시 반영**) | 창고 정·부 권한, 데스크톱·모바일, ADJUST 이력 |
| `io-approval-cycle.spec.ts` | 제출(E01) → 창고 승인함 PIN 승인(E22) → 큐 소멸 | **2-세션 결재 풀사이클** |
| `io-defect.spec.ts` | 불량 격리 → 정상 복귀 | 격리·정상 복귀 즉시 처리 |
| `defect-quarantine-records.spec.ts` | 동일 품목 2건 → 부분 처리·메모·예약 승인/취소 | 건별 원장과 승인 예약 생명주기 |
| `io-history-labels.spec.ts` | 같은 작업이 화면에서 같은 라벨로 보임 | P0-1 라벨 회귀 방어 |
| `shipping-request-to-prep.spec.ts` | 출하 목록 → 요청 상세 → 준비 중 전환 | 실제 출하 화면과 API 상태 전이 smoke |
| `operator-session-ui.spec.ts` | 기본 PIN challenge → 새 PIN → 재로그인·새로고침·로그아웃·강제 폐기 | 실제 로그인 UI와 401 로그인 복귀 |

## 작성 원칙

- **user-facing locator** — `getByRole('button', { name })` / `getByText`. data-testid 는 쓰지 않는다
  (실 app 코드 미접촉 원칙). 행 기반은 `getByRole('row', { name }).getByRole('button', { name })`.
- **결재 정책 주의** — 창고 정/부가 창고-결재를 제출하면 **자가승인 즉시 반영**(큐 미적재). 풀사이클은
  제출자=일반직원, 승인자=창고/부서 정 으로 분리. 승인은 "승인" → E2E 작업자 PIN → "승인 확정".
- **느린 트랜잭션 견디기** — 필요 시 `expect(...).toBeVisible({ timeout: 10_000 })`.

## CI

`.github/workflows/ci.yml` 의 필수 `e2e` job 이 `npm run test:e2e`로 동일 코드 전체를 돈다
(공통 run lock + 전용 DB globalSetup). 캡처된 teardown은 OS 분기(Windows taskkill / POSIX
SIGKILL)로 크로스플랫폼이다.
