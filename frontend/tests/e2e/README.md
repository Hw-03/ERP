# Playwright E2E (P2-1)

브라우저 회귀를 잡아낼 자동 안전망. `.mcp.json` 의 Playwright MCP 와 별도 — 본 디렉터리는
**repo-native** 테스트로, CI 와 로컬 verify 에서 같은 코드로 돌릴 수 있다.

## 첫 사용

```bash
cd frontend
npm install -D @playwright/test
npx playwright install chromium
```

## 실행

```bash
# 백엔드를 먼저 띄운다 (별도 셸)
powershell -ExecutionPolicy Bypass -File ../scripts/dev/start-backend.ps1

# 그 다음 (다른 셸에서)
cd frontend
npm run test:e2e            # headless
npm run test:e2e:headed     # 브라우저 보임
npx playwright test --ui    # UI 모드
```

`webServer` 가 `npm run start` (production build) 를 자동 기동한다. 미리 `npm run build`
가 되어 있어야 한다.

이미 띄운 dev 서버를 재사용하려면:
```bash
E2E_BASE_URL=http://localhost:3000 npx playwright test
```

## 시나리오

| 파일 | 시나리오 | 목적 |
|---|---|---|
| `io-receive.spec.ts` | 원자재 입고 즉시 반영 | 가장 기본 흐름 + 라벨 검증 |
| `io-warehouse-to-dept.spec.ts` | 창고 → 부서 결재 요청 | approval 경로 |
| `io-dept-to-warehouse.spec.ts` | 부서 → 창고 회수 | 반대 방향 |
| `io-process-produce.spec.ts` | BOM 자동 전개 / 포함·제외 | BOM 분기 |
| `io-defect.spec.ts` | 불량 격리·해제 | 불량 흐름 + 라벨 |
| `io-history-labels.spec.ts` | 같은 작업이 화면 3곳에서 같은 라벨로 보임 | P0-1 회귀 방어 |

## 작성 원칙

- **user-facing locator** — `page.getByRole('button', { name: ... })` / `page.getByText(...)`.
  CSS selector·data-testid 는 마지막 수단.
- **테스트 간 격리** — 각 테스트는 자기 데이터 시드. 다른 테스트의 사이드이펙트에 의존 금지.
- **하드코딩 회피** — 동적 UUID 등은 응답에서 추출.
- **느린 트랜잭션 견디기** — `expect(...).toBeVisible({ timeout: 10_000 })` 처럼 명시.

## 백엔드 시드 전략 (Open Question)

현재 시나리오는 운영 시드(`backend/mes.db`) 위에서 동작 가정. 격리 DB 가 필요해지면
`bootstrap_db.py --all` 호출 또는 별도 픽스처 검토. 결정은 사용자/팀 협의 후.

## 권동환 사원님 백엔드 변경 중 일시 skip

P0-3 / P1-4 / P1-5 변경 중 일부 E2E 가 일시적으로 깨질 수 있다. 그럴 땐:

```ts
test.skip(true, "P0-3 인증 도입 중 — 2026-06-XX 복귀 예정");
```

태그 + 사유 + 복귀 예정일을 항상 함께. 영구 skip 금지.
