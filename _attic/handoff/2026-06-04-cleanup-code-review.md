# 핸드오프 — 2026-06-04 코드리뷰 클린업 세션

> 이 세션은 컨텍스트가 거의 소진됨. 아래를 읽고 바로 이어서 작업 가능.

---

## 브랜치 현황

- **작업 브랜치:** `cleanup/code-review-fixes`
- **베이스:** `refactor/data-foundation`
- **PR:** #18 (`gh pr view 18`) — **충돌 0, 머지 가능 상태** (fast-forward)
- **커밋 수:** 24개 (이미 푸시 완료)
- **베이스와 gap:** base에 새 커밋 0 (rebase 불필요)

---

## 이번 세션에서 완료한 것

### Wave 1~4 + 잔여 이슈 B1~B5 전부 완료, 푸시됨

| 커밋 | 내용 |
|---|---|
| `1541fe7e` | test: 안정성 핵심 5모듈 회귀 그물 테스트 110개 |
| `86f38e78` | test: inv_calc R2-4 재평가(DB CHECK 이미 방어) |
| `121f0c63` | backend: R2-6 symbol 캐시 빈맵 경고 로그 |
| `972391b4`~`3b2ebed4` | refactor: production/io_preview/io_dispatch/sr_execution 함수 분리 |
| `dc6fedfe` | frontend: 용어 통일(새 불량/불량 해제/불량 처리) |
| `4bbbb7c8` | refactor: transactions 중복 필터 빌더 |
| `2297682e` | refactor: defects N+1 제거 |
| `aee2707e` | refactor: inv_defective 분기 중복 추출 |
| `ce186907` | docs: CODING_STYLE + CONTEXT 이름가이드 |
| `d81160f7` | refactor: sr_approval import 5/6 정적화 |
| `fcd5797d` | chore: 죽은코드 _attic 이동 + toNumber 제거 |
| `9f8700be`~`e984a90e` | frontend: useEffect 주석 + R2-1 staleTime + R2-3 getModels |
| `b1a7b7c1` | docs: §9 처리 결과 |
| `a01a13d6` | frontend: R2-3 마무리(useAdminBootstrap+고아 useModels) |
| `224ad043` | frontend: R2-2 useAdminDepartmentsList 통합 |
| `f641a91f` | refactor: inv_defective dataclass(ReasonContext/DefectSource/NormalSource) |
| `507fc98c` | refactor: 에러표준 7곳 http_error 통일 |
| `274a2e0a` | backend: mes_code 부분 unique(WHERE deleted_at IS NULL) |
| `f982d2d5` | docs: §10 잔여 이슈 2차 해소 기록 |

### 보류 없음 — 의도적 한계 기록만

- **e2e 인프라 미완**: `@playwright/test` 미설치 상태에서 로그인 게이트로 baseline 미작동. 용어 변경은 정적으로 안전 확인.
- **PR #18**: 머지 안 됨(자동 진행 중 세션 종료).
- **dev mes.db**: 부분 unique 코드는 push됐지만 실 DB에 아직 미적용.

---

## 남은 작업 (다음 세션에서 진행)

### D. e2e 인프라 완성

**D1 — `@playwright/test` 설치 (완료)**
```bash
cd frontend
npm install -D @playwright/test@1.60.0   # 이미 완료됨 (package.json 반영)
npx playwright install chromium
```

**D2 — 전용 DB + globalSetup** ← 다음 시작 포인트
- `backend/mes_e2e.db` (e2e 전용, teardown에서 삭제 — 실 mes.db 절대 미접촉)
- `frontend/tests/e2e/global-setup.ts` 작성:
  - `DATABASE_URL=sqlite:///mes_e2e.db python bootstrap_db.py --all` 실행
  - 백엔드를 전용 DB로 포트 8011에 기동
  - 시드 주입 (아래 D4)
- `frontend/tests/e2e/global-teardown.ts`: 백엔드 종료 + `mes_e2e.db` 삭제
- `playwright.config.ts`: `globalSetup`/`globalTeardown` 경로 추가, `.gitignore`에 `mes_e2e.db`

**D3 — 로그인 우회 헬퍼 + io-history-labels 그린**
- `frontend/tests/e2e/_helpers.ts`:
  ```typescript
  export async function loginAsOperator(page) {
    // 백엔드에서 첫 활성 직원 조회 후 localStorage inject
    await page.addInitScript((op) => {
      localStorage.setItem('dexcowin_mes_operator', JSON.stringify(op));
      localStorage.setItem('dexcowin_mes_boot_id', 'e2e-boot');
    }, operatorObj);
  }
  ```
- 로그인 게이트 구현 참고: `frontend/app/legacy/_components/login/MesLoginGate.tsx` (localStorage `dexcowin_mes_operator` + `dexcowin_mes_boot_id` 확인)
- `io-history-labels.spec.ts`에 `beforeEach(() => loginAsOperator(page))` 추가
- `npx playwright test io-history-labels` 그린 → baseline 확인

**D4 — 시드 데이터** (쓰기 spec 전제)
- globalSetup에서 API 호출로:
  - 직원: warehouse_role=primary 1명, department_role=primary 1명 (PIN 0000)
  - 품목: 원자재(process_type_code=TR) + 완제품(PF) + BOM 연결
  - 창고 재고: 원자재 충분히
- 기존 `_attic/backend-scripts/` 시드 스크립트 참고

**D5 — 쓰기 4 spec 구체화** (`test.fixme(E2E_SEED_READY)` → 실제 동작)
- io-receive: 원자재 입고 시나리오
- io-warehouse-to-dept: 결재 요청
- io-dept-to-warehouse: 회수
- io-process-produce: BOM 전개 + 생산
- 막히는 spec은 `test.skip('시드 미비: ...')` + 로그 (작동분 보존)

**D6 — verify_local 통합**
- `scripts/dev/verify_local.ps1`에 e2e 섹션 추가 또는 별도 `verify_e2e.ps1`
- 커밋: `2026-06-04 test: e2e 인프라 + 로그인 우회 + spec 5개`
- push

### E. PR #18 머지
```bash
git fetch origin
git log --oneline origin/refactor/data-foundation..HEAD | wc -l  # 여전히 0이어야
gh pr merge 18 --merge  # 충돌 0 재확인 후
```

### F. dev mes.db 부분 unique 적용
```bash
# 1. 백업
cp backend/mes.db _attic/data/db_backups/mes_2026-06-04_before-partial-unique.db

# 2. 적용
cd backend && python bootstrap_db.py --all

# 3. 확인
python -c "
import sqlite3; c=sqlite3.connect('mes.db')
print(c.execute(\"SELECT sql FROM sqlite_master WHERE name='ix_items_mes_code'\").fetchone())
"
# 출력에 'WHERE deleted_at IS NULL' 있어야 함
```

---

## 주요 파일 위치

| 목적 | 경로 |
|---|---|
| 리뷰 문서(§1~10) | `_attic/docs/code-review-2026-06-02.md` |
| 작성 표준 | `_attic/docs/CODING_STYLE.md` |
| 마이그레이션 | `backend/bootstrap/migrate.py` |
| e2e spec 디렉토리 | `frontend/tests/e2e/` |
| playwright 설정 | `frontend/playwright.config.ts` |
| 로그인 게이트 | `frontend/app/legacy/_components/login/MesLoginGate.tsx` |
| 플랜 파일 | `~/.claude/plans/gleaming-seeking-pillow.md` |

## 가드레일 (반드시 유지)

- **`backend/mes.db` 절대 미접촉** — e2e는 `mes_e2e.db` 전용, teardown에서 삭제
- **dev DB 백업 필수** (F 진행 전)
- 동결 영역 우회: `_weekly_sections/`, `DesktopWeeklyReportView.tsx`, `weekly_report.py`
- 커밋 메시지: `YYYY-MM-DD area: 요약` (conventional commits 금지)
- 커밋/푸시 명시 요청 시만(자율 진행 중이면 자동)

## 체크리스트 (완료 표시하며 진행)

- [x] Wave 1~4 + B1~B5 완료·푸시
- [ ] D2: 전용 DB globalSetup
- [ ] D3: io-history-labels 그린
- [ ] D4: 시드 데이터
- [ ] D5: 쓰기 4 spec (각 그린/skip)
- [ ] D6: verify 통합 + 커밋·push
- [ ] E: PR #18 MERGED
- [ ] F: dev mes.db 부분 unique 적용·확인
