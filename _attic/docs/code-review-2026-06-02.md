# 코드 리뷰 — DEXCOWIN MES (2026-06-02)

> **성격: 리뷰 전용.** 이 세션은 코드를 수정하지 않는다. 진단·검증 결과만 이 파일에 누적한다.
> **목적:** 권동환 사원(휴직 ~2026-06-15 전후 복귀) 복귀 리뷰 대비 + 클린코드 현황 고정.
> **방법:** `/team` 병렬 진단 2회 + `/improve-codebase-architecture` + R2 카탈로그를 **live 코드와 직접 대조**.
> 변동 수치(품목 수 등)는 적지 않는다 — `python _attic/backend-scripts/facts.py`.

## 갱신 로그
- 2026-06-02 최초 작성. 백/프/아키텍처 클린코드 + 첫방문자 혼란 + R2 6건 검증 수록.
- 2026-06-02 §7 "실행 코드 7눈 리뷰" 표준·계획 추가 + production.py 첫 채점.

---

## 0. 한 줄 총평

기반 구조는 탄탄하다(3계층 분리·단일 계산 소스·트랜잭션 안전·ADR 체계). 기술부채는 세 갈래:
**①라우터에 비즈니스 로직 누출 ②useEffect 의존성 회피·중복 복제(프론트) ③이름이 실체를 오도(legacy/·models.py·v2).**
용어 사전(GLOSSARY/glossary.ts)은 정확하나 **화면 라벨 2곳이 구식**으로 남아 사전과 어긋난다.

---

## 1. 클린코드 — 백엔드 (Python/FastAPI)

### 심각도 H
- `routers/production.py` `production_receipt` 231줄 단일 함수 — BOM 전개·재고 차감·트랜잭션 생성·로깅 혼재 (SRP 위반).
- `routers/inventory/transactions.py:544` `get_transactions_summary` 가 `list_transactions` 필터링 로직을 통째 복제.
- `routers/defects.py:113` `list_defect_locations` — 루프 안 단건 쿼리 반복 (N+1).

### 심각도 M
- `routers/stock_requests.py:71` — 라우터가 Employee 쿼리·활성검증을 직접 수행 (비즈니스 로직 누출).
- `services/bom.py:20` `build_bom_cache()` — 전체 BOM 메모리 로드, 상한 없음.
- `routers/inventory/transactions.py:482` — 검색 LIKE 9개 필드 양방향 와일드카드, 인덱스 미활용.

### 잘 된 점
- 타입 힌트 체계적, `http_error()`/ErrorCode 통일, `stock_math` 단일 계산 소스, audit 로그 일관, `commit_and_refresh`/rollback 트랜잭션 안전.

---

## 2. 클린코드 — 프론트엔드 (Next.js/TypeScript)

### 심각도 H
- `_history_sections/HistoryDetailPanel.tsx:74,97` — useEffect 의존성 2곳 모두 `eslint-disable` 로 회피 → race 잠재.
- `DesktopLegacyShell.tsx:124` — useMemo 의존성 15개(실필요 2개), `eslint-disable` 로 숨김.
- `_defect_hub/DisassembleTree.tsx:122` — `onChange` 콜백 의존성 누락.

### 심각도 M
- `_archive/` 4파일(DeptIOTab·HistoryTab·WarehouseIOTab·InventoryTab) — "로드→필터→테이블→모달→API" 구조를 450~550줄씩 반복 복제. (단 `_archive` 는 아카이브 정책상 보존 대상 — 신규 작업 시 참조 금지.)
- `mobile/MobileHistoryScreen.tsx:37` — `toggleModel`/`toggleDept`/`toggleOp` 동일 구현 3벌.

### 잘 된 점
- TypeScript 타입 명확, 도메인별 커스텀 훅 분리, React Query + MSW 테스트, URL 쿼리 딥링킹, LEGACY_COLORS 색상 단일화.

---

## 3. 아키텍처 (설계 원칙) — 6.5/10

- **God Service:** `services/inventory.py` 가 10+ 작업 담당. 내부는 `inv_base/calc/transfer/defective` 4모듈 분리됐으나 인터페이스는 단일 모놀리식.
- **라우터 책임 과다:** 검증·쿼리 최적화가 라우터에 기술됨 → Dependency 함수로 분리 여지.
- **에러 처리 표준화 미완:** 신식 `http_error()` ~50% 적용, 구식 `raise HTTPException` 혼재.
- **잘 된 점:** 3계층(라우터·서비스·DB) 명확, ADR·ARCHITECTURE.md 체계, N+1 회피 패턴, SQLite BEGIN IMMEDIATE 동시성 방어.

---

## 4. 처음 보는 사람 혼란 포인트 (= 권동환 사원 리뷰 시 질문 예상 지점)

### 4-1. 용어 — 사전은 정확, 화면 라벨 2곳만 구식 ⚠️
GLOSSARY 통일안과 어긋나는 화면 라벨 (사용자가 실제로 보는 텍스트):

| 파일 | 현재(구식) | GLOSSARY 기준 |
|---|---|---|
| `_warehouse_v2/DefectActionStep.tsx:87` | "폐기", "재작업" | "불량 처리", "분해" |
| `_history_sections/historyQuery.ts:26` | "새 격리", "격리 해제", "폐기" | "새 불량", "불량 해제", "불량 처리" |

재고 bucket 필드명·트랜잭션 enum 13종은 코드·프론트·GLOSSARY 완전 동기화(양호).

### 4-2. import 구조 (권동환 사원이 언급한 "임포트")
- **프론트 `lib/api.ts`(파일) vs `lib/api/`(폴더) 동명 공존.** 진입점 `api.ts → api/index.ts → api/core.ts` 3단계 → 어디서 import 할지 불명확.
- **백엔드 re-export 레이어:** `services/inventory.py` 는 실로직이 아니라 4모듈 재노출. `reserve()` 찾으려면 `inventory.py` 열고 → 출처 모듈 확인 → `inv_base.py` 열어야 함.
- **잠재 순환 import:** `services/sr_approval.py:91` 외 6곳에서 함수 내부 지연 import (`from app.services import io as io_svc`). 고리: `io.py → io_dispatch.py → stock_requests.py → sr_approval.py → io.py`. 모듈로드 순환을 함수 안에 숨긴 임시방편. **← 권동환 사원이 본 "임포트"가 이것일 가능성 높음.**

### 4-3. 이름이 실체를 오도
| 이름 | 실체 | 왜 헷갈리나 |
|---|---|---|
| `frontend/app/legacy/` | **현재 메인 운영 코드** | "legacy"=구식이라는 인식 |
| `routers/models.py` | 제품 모델 CRUD **라우터** | "models"=DB 모델로 오해 (실 DB 모델은 `models/` 폴더) |
| `_warehouse_v2/` | 현재 활성 컴포넌트 | V1 폴더 부재, 이전 버전은 `_warehouse_sections/` 에 분산 |
| `services/inventory.py` | re-export 껍데기 | 실로직은 `inv_*.py` |
| `_archive/` 3곳 | 위치별 역할 상이 | `frontend/_archive`·`_attic/_archive`·`_attic/backend/_archive` |
| `_` 접두어 규칙 | 문서화 안 됨 | private/숨김/관례 구분 불가 |

> 4-3 대부분은 **이름 변경 없이 CONTEXT.md 한 단락**(폴더 명칭 가이드)으로 해소 가능. 구조 자체는 양호.

---

## 5. R2 카탈로그 6건 — live 코드 검증 결과

> 출처: 다른 세션의 `~/.claude/plans/shimmying-skipping-metcalfe.md` Round 2.
> **검증 결론: 6건 전부 실측 일치(환각 0). 위치·문제 재현됨.** 아래는 보강 뉘앙스.

| # | 항목 | 검증 | 보강 |
|---|---|---|---|
| R2-1 | staleTime 일률 | ✅ `client.tsx:22` `5*60_000` 전역 고정, 도메인 차등 0 | 주석에 "네트워크 절감" 의도 명시 — **버그 아닌 트레이드오프** |
| R2-2 | shallow admin 훅 | ✅ `useAdminDepartmentsList.ts:21` 완전 pass-through(본인 주석 자인) | **삭제 테스트 통과**. List만 정확 지목(wrapper는 실로직 보유) |
| R2-3 | getModels 무캐시 | ✅ 확인. **2곳 아닌 7곳+**(Desktop·Mobile·Admin 각자 fetch) | 카탈로그가 오히려 **과소평가** |
| R2-4 | _sync_total 음수 가드 | ✅ `inv_calc.py:60` 합산만, 음수 검증 0 | 개별 차감은 `WHERE qty>=`+rowcount 로 방어. 다단계 원자성은 **호출자 커밋 경계 의존 → "확정 결함" 아닌 "검토 요"** |
| R2-5 | 소프트삭제 unique | ✅ `models/item.py:69` `unique=True` 전체범위 + `deleted_at` → 재등록 충돌 | mes_code 가 `Computed STORED` 생성열 → 부분 unique 작업 까다로움("조율" 정확) |
| R2-6 | symbol 캐시 빈맵 | ✅ `mes_code.py:51` 미적재 시 빈맵→빈 문자열 silent | 주석에 **데드락 방지 의도** 명시. 위험은 "빈 코드 생성 silent" 쪽 |

### R2 보강 결론 (권동환 사원 전달 시 반영)
1. **R2-1·R2-6 은 "개선 시 의도를 깨지 말 것" 단서 필수.** R2-1=네트워크 절감, R2-6=BEGIN IMMEDIATE 락 위 2세션 데드락 회피. 의도를 모르고 고치면 회귀.
2. **R2-4 톤 하향:** `_sync_total` 음수 가드 부재는 확정, 다단계 부분실패 "불일치"는 호출자 트랜잭션 경계 추가 확인 후 단정.
3. **R2-3 범위 상향:** 영향 파일 2개 아닌 7곳+.

---

## 6. 권동환 사원 복귀 전 다듬기 우선순위 (작업은 향후 세션)

| 우선 | 항목 | 비용 | 근거 |
|---|---|---|---|
| 1 | 화면 라벨 2곳 수정(4-1) | 코드 1~2줄 | 사용자 노출 텍스트가 사전과 불일치 |
| 2 | CONTEXT.md 폴더 명칭 가이드(4-3)·`_` 규칙 | 문서 1단락 | 이름 오도를 변경 없이 해소 |
| 3 | R2-1~3 프론트(독립 실행 가능) | 중 | 권동환 "화면 느림" 직결 |
| 4 | `sr_approval.py` 지연 import 순환 정리(4-2) | 중 | 구조적 취약점 |
| 5 | R2-4~6 백엔드 | — | **다른 세션이 활성 리팩터 중 → 동시 수정 금지, 리뷰로 조율** |

---

## 7. 실행 코드 7눈 리뷰 — 표준 & 계획

> **배경:** 권동환 사원이 복귀 후 **실제 프로그램 구동에 쓰이는 코드를 직접(사람 눈으로) 한 줄씩 읽을** 예정.
> 그가 읽을 때 걸릴 곳이 없도록, 우리가 먼저 똑같은 7개의 눈으로 전수 진단해 둔다.
> 이 절은 **리뷰 표준 + 계획 + 점수표(누적)**. 채점하며 7-5 표에 행을 추가한다.

### 7-1. 7개의 눈 + 채점 룰 (리뷰 표준 — 확정)

사람이 파일을 위→아래로 읽을 때 멈칫하는 지점을 7개로 고정. 파일마다 각 눈을 ✓/⚠/✗로 매기고 종합한다. **흔들림 방지 위해 ✓/⚠/✗ 경계를 아래처럼 못박는다.**

| 눈 | 보는 것 | ✓ 통과 | ⚠ 애매 | ✗ 위반 |
|---|---|---|---|---|
| 1. 파일 머리말 | 맨 위 모듈 설명 | docstring 있고 정체 설명 | — | 없거나 부실 |
| 2. 함수 길이 | **최장 함수** 줄 수 | ≤50줄 | 51~80줄 | 81줄+ |
| 3. 한 가지 일만 | 한 함수의 독립 단계 수 | 단일 목표 | 단계 2개 경계 | `1)2)3)` 번호주석 **또는** 분리 가능한 독립 단계 3개+ |
| 4. 이름이 말하나 | 모호한 이름 비율 | 전부 의도 드러냄 | 일부 축약(`qty_before` 등) | `tmp`·`data`·`x`·`val` 남용 |
| 5. 인자·중첩 | 최대 인자/중첩 (**`db` 세션은 표준 의존성이라 인자 수에서 제외**) | 인자 ≤4 **그리고** 중첩 ≤3 | 인자 =5 **또는** 중첩 =4 | 인자 6+ **또는** 중첩 5+ |
| 6. 매직넘버·주석 | 숫자 상수화 + 주석이 "왜" | 둘 다 좋음 | 한쪽만 문제 | 둘 다 문제 |
| 7. 일관성 | 반환·에러 형식 | 통일 | 부분 혼재 | 명백 혼재(객체 vs 딕셔너리) |

> **종합:** ✗ 2개+ = 🔴 / ✗ 1개 또는 ⚠ 2개+ = 🟡 / 그 외 = 🟢.
> **주의:** 3·4번은 가장 주관적 → 에이전트 채점 후 **사람이 재확인**. 나머지(2·5)는 숫자라 객관적.

### 7-2. 범위 = 실행되는 코드만

진입점에서 import 그래프로 **도달 가능한 파일만** 리뷰 대상. `_archive`·`_attic`·테스트·타입선언·죽은 코드는 제외.
- **죽은 코드는 리뷰 전에 목록으로 가려냄**(실제 이동/삭제는 나중). "폴더에 있다 ≠ 실행된다" — 진입점에서 아무도 `import`하지 않으면 죽은 코드.
- **확정 발견분:** `frontend/components/` 3개(`UKAlert`·`CategoryCard`·`AppHeader` — import 0 실증됨). **의심분:** `lib/api-core.ts:toNumber`, 화면 미연결 쿼리훅 다수, `glossary.listAll*`(테스트전용) → 동적 호출 가능성 있어 분리 전 재확인.

### 7-3. 3단계 계획

1. **실행 코드 인벤토리 + 죽은 코드 분리** — `main.py`/`page.tsx` 진입점에서 도달 가능 파일 목록 확정. 도달 불가 = 죽은 코드 목록(확정/의심 라벨).
2. **7눈 전수 채점** — 핵심 두뇌 파일은 직접 정독, 표시용 작은 파일은 에이전트 병렬 채점 후 사람 검수 → 7-5 점수표.
3. **빨간불 정독·개선**(후속) — ✗ 2개+ 파일부터 50줄 분리·이름·일관성 수정. §6 우선순위 / 9칸 로드맵으로 연결.

### 7-4. 실행 순서 (안정성 우선)

재고·결재 **두뇌부터** (사람이 가장 자주 열고, silent bug 위험 큰 곳):
1. 백엔드 핵심 서비스 `inv_*`·`stock_math`·`bom`·`sr_*`·`io_*`·`integrity`
2. 백엔드 라우터 `production`✅·`stock_requests`·`io`·`inventory/*`·`items`·`bom`·`defects`…
3. 백엔드 모델·유틸·`schemas.py`·`main`·`database`·`dependencies`
4. 프론트 진입·shell·핵심 화면 `_warehouse_v2`·`_history_sections`·`_inventory_sections`·`_admin_sections`
5. 프론트 훅·`lib/api`·`lib/queries`·`lib/mes`·`lib/io`
6. 프론트 mobile·common (실행 경로에 있는 것만)

> 실행 코드만 추려도 **150~200개** 예상 → 한 세션 = 1~2 도메인 묶음으로 분할.

### 7-5. 7눈 점수표 (누적 — 채점하며 행 추가)

| 파일 | 1머리말 | 2길이 | 3한일 | 4이름 | 5인자·중첩 | 6매직·주석 | 7일관성 | 종합 |
|---|---|---|---|---|---|---|---|---|
| `routers/production.py` | ✓ | ✗ 168·230줄 | ✗ 5단계 번호 | ✓ | ✗ 인자 8개 | ⚠ `60`/주석은✓ | ✗ 객체 vs 딕셔너리 | 🔴 빨간불 |

> 판정 규칙: ✗ 2개+ = 🔴 빨간불 / ✗ 1개 또는 ⚠ 다수 = 🟡 주황불 / 그 외 = 🟢 통과.

---

## 8. 추가 계획 (2026-06-02)

> 7눈 리뷰(§7)는 **가독성**에 집중한다. 그 밖에 권동환 사원 복귀 전 메워둘 4개 계획.
> 권장 순서: **8-1(안정성) → 8-4(이름·저비용) → 8-2(작성표준) → 8-3(죽은코드)**.
> 전부 **계획만** — 실제 실행은 사용자 명시 승인 후.

### 8-1. 안정성 보강 계획 〔사용자 1순위 · 7눈 밖〕

**왜:** 7눈은 *읽어서 보이는 것*만 잡는다. "바꿔도 안 깨지나?"는 안 보임. 사용자가 최우선으로 둔 영역.

**대상 (이 세션 조사 결과):**
- **테스트 무방비 핵심 5모듈** — `inv_transfer`·`inv_defective`·`sr_approval`·`sr_execution`·`io_dispatch`. 전부 *상태변경 + 감사기록*을 동시에 해서 깨지면 silent. 현재 라우터 통합테스트로 *간접* 보호만.
- **DB 제약** — `mes_code` unique가 소프트삭제(`deleted_at`)와 충돌(P0), `StockRequestLine.status`·`department` 인덱스 누락(P1).

**어떻게:**
1. Red Zone 5모듈에 **서비스 단위테스트** — 재고 불변식(총량=창고+생산+불량)·결재 차감·다단계 부분실패.
2. R2-4 `_sync_total` 음수 가드 — **테스트 먼저 깔고** 가드 추가.
3. DB — 부분 unique(`WHERE deleted_at IS NULL`) + 누락 인덱스. **단 `mes_code` 생성열은 백엔드 다른 세션 활성영역 → 조율 필수.**

**완료기준:** 5모듈 단위테스트 존재 + 불변식 깨짐 케이스 통과 / 부분 unique·인덱스 적용 / `verify_local` 그린.

### 8-2. 작성 표준 문서 〔'이렇게 짠다'〕

**왜:** *리뷰 렌즈*(7눈)는 있는데 *작성 규칙* 문서가 없다. 권동환 사원이 "기준이 뭐냐" 물으면 보여줄 한 장.

**무엇:** 7눈을 "하라/하지 마라"로 뒤집은 짧은 문서.

| 7눈 | 작성 규칙 |
|---|---|
| 함수 길이 | 함수 ≤50줄, 넘으면 쪼갠다 |
| 인자·중첩 | 인자 ≤4, 중첩 ≤3 |
| 파일 머리말 | 파일 맨 위 1줄 설명 필수 |
| 이름 | 이름이 의도를 말한다 (약어·`tmp`·`data` 금지) |
| 매직넘버·주석 | 숫자는 상수로, 주석은 "왜"를 적는다 |
| 일관성 | 에러는 `http_error` 한 형식, 반환은 타입 객체(딕셔너리 금지) |

**어디:** `_attic/docs/`(예: `CODING_STYLE.md`) 또는 CONTEXT.md 절. **좋은 예/나쁜 예 1쌍** 실제 인용 — 나쁜 예 `production.py`, 좋은 예 `inv_calc.py`(73줄·함수당 한 일).

**완료기준:** 7눈 각각이 작성 규칙과 1:1 대응 + 좋은/나쁜 예 1쌍. **주의:** 새 규칙 만들지 말고 7눈에서만 파생. 기존 코드와 모순 금지.

### 8-3. 죽은 코드 정리 실행 계획

**왜:** §7-1단계는 *목록화*까지. 실제 *이동 절차*가 비어 있음.

**절차:**
1. 목록 확정 (확정/의심 라벨) — §7 1단계 산출물 사용.
2. **의심분 재검증** — import 재추적 + 동적 호출(문자열 import·라우터 자동등록) 확인.
3. 확정분만 `_attic` **이동**(삭제 아님 — 되돌리기 가능). ATTIC_POLICY 기준, "활성트리 고아 코드도 이동" 한 줄 추가.
4. 이동 후 `verify_local` 그린(끊긴 import 0).

**발견분:** `frontend/components/` 3개(확정) / `toNumber`·미연결 쿼리훅·`listAll*`(의심).

**완료기준:** 확정 죽은코드 `_attic` 이동 + verify 그린 + 죽은코드 재스캔 0건. **주의:** 사용자 명시 승인 후 실행.

### 8-4. 이름 가이드 문서화 〔저비용·즉효〕

**왜:** 오해 유발 이름들. rename은 위험(CLAUDE.md 금지) → **문서로 해소**.

**무엇:** CONTEXT.md에 "폴더·파일 명칭 가이드" 한 단락.
- `legacy/` = **현재 메인** (구식 아님)
- `routers/models.py` = 제품모델 **라우터** (DB 모델은 `models/` 폴더)
- `_warehouse_v2` = 현재 활성 (V1은 `_warehouse_sections`에 분산)
- `services/inventory.py` = re-export 껍데기, 실로직은 `inv_*.py`
- `_` 접두어 규칙 / `_archive` 3곳 차이

**완료기준:** CONTEXT.md 가이드 추가 + 처음 보는 사람이 위 항목 안 헷갈림. **주의:** 실제 rename은 별건(명시 승인). 지금은 문서화만.

---

## 9. 처리 결과 — 자율 실행 (2026-06-02, 브랜치 `cleanup/code-review-fixes`)

> Wave 0~4 자율 실행. 각 Wave `verify_local` 그린 게이트 통과 후 커밋·푸시. backend pytest 432 + frontend 643 그린 유지. PR로 머지 검토.

### 완료 ✅
| 항목 | 처리 | 커밋 |
|---|---|---|
| §8-1 안정성 테스트 | inv/sr/io 회귀 110 + inv_calc 8 | `1541fe7e`·`86f38e78` |
| §5 R2-4 음수가드 | DB CHECK 이미 방어 → 재평가 + 방어망 테스트 | `86f38e78` |
| §5 R2-6 캐시 빈맵 | 경고 로그 | `121f0c63` |
| §7 함수분리(빨간불 4) | production·sr_execution·io_preview·io_dispatch | `972391b4`~`3b2ebed4` |
| §1 중복제거·N+1 | transactions 필터빌더·defects 일괄 조회 | `4bbbb7c8`·`2297682e` |
| §7 inv_defective 분기중복 | `_consume_normal_source` 추출 | `aee2707e` |
| §4-1 용어 2곳 | 새 불량/불량 해제/불량 처리 | `dc6fedfe` |
| §4-2 import 순환 | sr_approval 5/6 정적화(io_persist 무순환) | `d81160f7` |
| §8-3 죽은코드 | components 3 `_attic` + `toNumber` 제거 | `fcd5797d` |
| §8-2·8-4 문서 | CODING_STYLE + CONTEXT 이름가이드 | `ce186907` |
| §5 R2-1 staleTime | 도메인별 차등(VOLATILE 30s/MASTER 30m) | `4426342c` |
| §5 R2-3 getModels | `useModelsQuery` 7곳 캐시 공유 | `e984a90e` |
| §2 useEffect | 의도적 정당 → 의도 주석 보강 | `9f8700be` |

### 보류 ⏭️ (위험 대비 실익 낮음 — R2식 보수적 판단, 사유 기록)
- **에러표준 전수통일(§3)**: 라우터 광범위 + 프론트 에러 파싱 영향 + 회귀 위험 → 점진 마이그레이션. CODING_STYLE에 "새 코드는 `http_error`" 기준만.
- **mes_code 부분 unique(R2-5)**: `serial_no` 단조증가(`max+1`)로 소프트삭제 후 충돌이 실질적으로 없음 + `items` 테이블 재생성 위험 + 다른 세션 generated 컬럼 영역.
- **inv_defective 인자 dataclass(§7 인자폭증)**: 호출자(sr_execution 14핸들러 등) 광범위 영향 + 키워드 전용 인자라 이미 명시적. 분기 중복만 헬퍼로 추출.
- **R2-2 admin훅 통합**: 테스트가 `useAdminDepartmentsList`를 직접 import → 제거 시 회귀.
- **R2-3 getModels 2곳**: `useAdminBootstrap`(Promise.all 원자 그룹)·고아 `useModels`(소비처 0).

### 재평가 결론 (에이전트 진단 vs 실제 코드)
- **R2-4**: `Inventory`/`InventoryLocation` DB CHECK 4중으로 이미 방어 → "가드 부재"는 오판. Python 가드 대신 방어망 테스트로 고정.
- **StockRequestLine.status 인덱스**: 이미 존재(`ix_stock_request_line_item_status`) → 추가 불필요.
- **useEffect 회피 3곳**: 전부 의도적·정확한 deps 최적화(특정 필드만) → 버그 아님, 주석만 보강.

---

## 10. 잔여 이슈 2차 해소 (2026-06-02 — 보류 5건 전부 구현 + e2e 확인 + rebase)

> 사용자 결정으로 §9 보류 5건을 **전부 구현**(위험 감수). e2e 검증 + rebase로 PR #18 머지 가능 상태.

### 보류 5건 → 완료 ✅
| 보류 항목 | 처리 | 커밋 |
|---|---|---|
| R2-3 getModels 2곳 | 고아 useModels `_attic` + useAdminBootstrap `useModelsQuery({enabled:unlocked})` | `a01a13d6` |
| R2-2 admin훅 | useAdminDepartmentsList 인라인+삭제, 테스트 재작성 | `224ad043` |
| inv_defective dataclass | ReasonContext/DefectSource/NormalSource + 호출처 전체(sr_execution 6·io_dispatch·routers 3) | `f641a91f` |
| 에러표준(§3) | departments·admin_audit_csv 7곳 `http_error` (프론트 호환) | `507fc98c` |
| mes_code 부분unique(R2-5) | 부분 Index + 멱등 마이그레이션(dev 복사본으로 전체→부분 교체·멱등 검증) | `274a2e0a` |

### e2e 검증 결과 ⚠️ → 해소 ✅ (2026-06-04)
- 용어 변경은 **정적 안전**(내역 탭 banned 0건).
- ~~**e2e 인프라 미완 발견**: `@playwright/test` 미설치 + `/legacy` 로그인 게이트로 e2e가 baseline 부터 미작동(3 failed).~~ → **2026-06-04 전부 해소**.

#### e2e 인프라 완성 (2026-06-04, 커밋 `4c152b9b`) ✅
- **전용 DB 격리**: `frontend/tests/e2e/global-setup.ts`/`global-teardown.ts` — 전용 `backend/mes_e2e.db`(부트스트랩·시드) + 전용 백엔드 포트 8021 + 전용 프론트 3100(`BACKEND_INTERNAL_URL` 프록시). teardown 에서 실 `backend/mes.db` SHA256 불변 검증 — **실 DB 절대 미접촉 보장**.
- **로그인 우회**: `_helpers.ts` `loginAsOperator` — MesLoginGate 3중 검증(operator·boot_id·활성직원)을 런타임 조회로 inject(고정값 불가).
- **시드**: 창고/부서 primary 역할 부여 + 품목/BOM + 조립 부서 생산재고(produce 전제, `transfer_to_production`).
- **쓰기 4 spec 전부 그린**(`test.fixme` 제거, app 코드 미접촉·role/text 셀렉터만):
  - io-receive(낱개→**부서 결재**), io-process-produce(BOM→**즉시 반영**), io-warehouse-to-dept·io-dept-to-warehouse(**창고 결재**) + io-history-labels(라벨 baseline). **총 7 테스트 그린**.
  - 라이브 정책 재확인: receive 는 "즉시반영"이 아니라 **낱개 라인→부서 결재**(`hasManualLine`), produce 는 **즉시 반영**(BOM 라인은 manual 아님). io-history-labels 는 라이브 UI 기준 정정(work type 3개·정규식 메타문자 버그 수정).
- **verify 통합**: `scripts/dev/verify_e2e.ps1` 신설 + `verify_local.ps1 -IncludeE2E` 스위치.
- **PR #18 MERGED**(2026-06-04) + dev `mes.db` 부분 unique 적용 확인(`ix_items_mes_code … WHERE deleted_at IS NULL`).

### 추가 재평가 (2차)
- **에러표준(§3)**: 구식 `raise HTTPException` 실제 **2파일 7곳**뿐(§3 "95%" 과장). 프론트 `extractErrorMessage`가 str/dict 모두 호환 → 안전.
- **mes_code 부분unique**: `serial_no` 단조증가로 실 충돌은 드물지만, 부분 unique + 멱등 마이그레이션을 안전하게 구현·검증.
