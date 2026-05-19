# 계획: 대시보드 생산가능 재정의 · 개인 테마 · 헤더 · 입출고 요청 표시

## Context — 왜 이 작업을 하는가

현장 사용자(MES 운영)가 제기한 4가지 실사용 불편/오류를 해결한다.

1. **대시보드 "생산 가능 즉시/최대"가 현실과 안 맞음.** 현재 코드는 BOM 한 단계 부품의 MIN만 봐서, 중간에 반쯤 만들어둔 재공품(WIP)을 전혀 못 센다. 사용자는 "지금 라인에 떠 있는 걸 실제 공정대로 다 진행하면 완제품(PF)을 몇 개 뽑을 수 있나"를 보고 싶어 한다.
2. **테마가 브라우저 단위 저장**이라, 담당자가 다른 PC에서 로그인하면 매번 다시 맞춰야 한다. 담당자별로 따라다니게 한다.
3. **상단 "DEXCOWIN MES System"이 죽은 회색**이라 시스템이 살아있는 느낌이 안 난다.
4. **입출고 "내 요청"의 요청번호가 불필요**하고, 방금 넣은 요청이 **"9시간 전"**으로 뜨는 시간 오류가 있다(시간대 버그, 앱 전반 추정).

목표: 4건 모두 최소·외과적 수정으로 해결하고 5게이트 검증 통과.

---

## 인터뷰로 확정된 요구사항

### 1) 대시보드 생산가능 — 재귀 누적 빌더블로 재작성
- 계산 = **재귀 누적 가용 생산량(buildable)**. `producible(X) = 현재고(X) + (X의 BOM 자식으로 더 만들 수 있는 수)`, 자식도 재귀. 각 단계 부속·자재 실제 재고가 모자라면 그만큼만(병목 반영). 즉, **각 단계에 쌓인 재공품을 전부 위로 누적**.
- **즉시** = 시작 재고를 stage_order ≥ 60(NF) 인 품목에서만 인정. NF 미만(원자재 등)은 추가 생산 안 함(자체 재고만, 없으면 그 경로는 막힘 — 현실 도달 가능 수량).
- **최대** = 맨 아래 원자재(TR, stage_order 10)까지 전부 재귀, 모든 재고 사용.
- 표시 = **모든 PF(완제품) 항목 전부 나열**(현재 `.limit(15)` 제거), 각 PF의 즉시/최대 + 병목 자재명. 전체 합계도.
- BOM 구조·수량 = DB `BOM` 테이블 그대로(services/bom.py 재활용). `available` 정의(warehouse+production−pending, 불량 제외, stock_math.bulk_compute) 유지.

### 2) 개인별 테마 — 백엔드 저장 (담당자가 PC 옮겨다님)
- `employees`에 `theme` 컬럼 추가 + 직원 응답에 포함 + 저장 API. 프론트는 로그인 시 적용, 토글 시 저장. localStorage는 첫 화면 깜빡임 방지용 캐시로 유지.

### 3) 상단 헤더 — 제자리, 색·크기만 살림
- 위치·구조 그대로. 평상시 "DEXCOWIN MES System"만 활성 강조색·굵게. 일시 상태 메시지 동작은 보존.

### 4) 입출고 요청번호 제거(전부, 상세에서만) + 시간 9h 오차 근본 수정(앱 전체)
- 사용자 눈에 보이는 기본 화면들에서 요청번호 표시 제거. 기능 키 `request_id`(UUID)는 유지.
- 시간: 백엔드가 naive UTC를 시간대 표식 없이 직렬화 → 프론트가 KST로 오해 → +9h. **근본 수정**.

---

## 핵심 데이터 모델 (확인됨)
- `Item.process_type_code`(1개, FK→process_types) = 공정 단계. `ProcessType.stage_order`: TR10·HR15·TA20·TF/VR25·HA30·HF35·VA40·VF/AR45·NR50·NA/PR55·**NF60**·AA65·AF70·PA75·**PF80**.
- `services/bom.py`: `build_bom_cache`, `explode_bom`, `merge_requirements`, `direct_children`. 사이클 가드 `visited`+`MAX_DEPTH=10`.
- `stock_math.bulk_compute(db, ids)` → `{id: StockFigures(.available)}`.
- 마이그레이션: Alembic 없음. `bootstrap_db.py:_MIGRATION_DDL`에 `ALTER TABLE … ADD COLUMN` 추가 → `cd backend; python bootstrap_db.py --migrate` (멱등).
- OpenAPI 게이트: 변경 시 `cd backend; python -c "from app.main import app; import json; open('../_attic/docs/openapi.json','w',encoding='utf-8').write(json.dumps(app.openapi(),indent=2,sort_keys=True,ensure_ascii=False)+chr(10))"`. 검증 스크립트 실경로: `_attic/scripts/dev/verify_local.ps1`.

---

## 구현 계획 (파일·단계)

### Feature 1 — `backend/app/routers/production.py`
1. import에 `ProcessType` 추가(models, :12).
2. `get_production_capacity`(:288–439) 재작성:
   - `.limit(15)` 제거(:327) → 모든 top-level PF.
   - `bom_cache=build_bom_cache(db)`(기존 :335 재활용).
   - 대상 id 집합 = top-level ∪ bom_cache의 모든 parent/child. `fig_by_id=stock_math.bulk_compute(db, ids)`; `items_map`; `stage_by_item = {id: ProcessType.stage_order map(it.process_type_code)}`.
   - 신규 모듈 헬퍼 `_buildable(item_id, *, bom_cache, fig_by_id, stage_by_item, immediate_mode, memo, visiting, depth=0) -> (qty, bottleneck_id)`:
     - `own = max(available, 0)`; children = bom_cache.get; stage = stage_by_item.get.
     - suppress 조건: 자식없음 OR 사이클(`depth>MAX_DEPTH or in visiting`) OR (`immediate_mode and stage is not None and stage < 60`) → `(own, None)`.
     - 아니면 각 자식 재귀, `extra = min(child_qty / per_unit)`, 병목 자식 기록. `return (own+extra, btl)`.
     - **memo는 traversal(즉시/최대)별 분리** — immediate_mode가 traversal 내 상수일 때만 메모 유효.
   - top별 `imm,btl=_buildable(...immediate_mode=True, memo={}, visiting=frozenset())`; `mx,_=_buildable(...False, memo={}, ...)`. 행: immediate=int(imm), maximum=int(mx), limiting_item=items_map[btl].item_name.
   - 기존 totals/status/sort/early-return(:423–439) 그대로. dead `_min_by_components`/`direct_by_top`/`leaf_by_top` 삭제, import에서 `direct_children` 제거(나머지 유지).
3. **schemas.py 변경 없음**(CapacityResponse shape 동일). OpenAPI에 들어가는 docstring은 건드리지 않음 → **OpenAPI 무변경**. 프론트 `InventoryCapacityPanel.tsx`/`CapacityDetailModal.tsx` **무변경**(이미 top_items 전체 map + 스크롤).
4. 테스트 `backend/tests/routers/test_capacity.py`: ① PF 재고만→즉시=최대=재고 ② PF→AA(65)→AR(45), AR=0 → 즉시는 AA 재고만/추가생성 안됨, 최대는 AR재고시 더 큼 ③ 사이클 무한루프 없음 ④ top 16개 → `len(top_items)==16`(limit 제거 증명).

### Feature 2 — 개인 테마 (OpenAPI 변경됨)
- `models.py` Employee: `theme = Column(String(10), nullable=True)`.
- `bootstrap_db.py:_MIGRATION_DDL` 끝에 `"ALTER TABLE employees ADD COLUMN theme VARCHAR(10)"` → `--migrate`.
- `schemas.py`: `EmployeeResponse`에 `theme: Optional[str]=None`; `class EmployeeThemeUpdate(BaseModel): theme: Optional[str]=Field(None, max_length=10)`.
- `routers/employees.py`: `_to_response`에 `theme` 추가; `PUT /{employee_id}/theme` (값 light/dark/None 검증, 404, commit_only). PIN 게이트 없음(기존 무인증 모델 일관, 비민감).
- 프론트: `lib/api/types/employees.ts`(+theme), `lib/api/employees.ts`(+`setEmployeeTheme`), `login/useCurrentOperator.ts`(Operator+theme 파싱), `login/OperatorLoginCard.tsx`(로그인 직후 theme→DOM+localStorage), `ThemeToggle.tsx`(operator.theme 적용 useEffect + toggle 시 fire-and-forget 저장 + setCurrentOperator 갱신). 기존 localStorage useEffect 유지.
- OpenAPI 재생성 실행.

### Feature 3 — 헤더 색·크기 (백엔드/ OpenAPI 무관)
- `common/StatusPill.tsx`: `StatusPillTone`에 `"brand"` 추가, `TONE_COLOR`에 `brand: LEGACY_COLORS.cyan`(시스템 액센트).
- `DesktopTopbar.tsx`(~86–90): `isBrand = status==="DEXCOWIN MES System"`; brand면 `tone="brand"` + `className="py-1.5 text-sm font-black tracking-[0.04em]"`, 아니면 기존 `inferToneFromStatus`. 일시 상태 메시지는 3초 후 기존대로 DEFAULT_STATUS(이제 brand)로 복귀. `inferTone` 미수정 → golden/unit 테스트 영향 없음.

### Feature 4a — 요청번호 제거 (프론트만, OpenAPI 무관)
- `_warehouse_sections/MyRequestRow.tsx`(:60,128-135): `요청번호` span + 미사용 `requestCode` const 제거(취소 버튼은 request_id 유지).
- `_warehouse_sections/WarehouseQueueRow.tsx`(:63-65): request_code span 제거.
- `mobile/screens/_io_parts/MyRequestsPanel.tsx`(:149): 카드 제목을 code→`req.lines[0]?.item_name_snapshot ?? 타입라벨`로 교체(빈 제목 방지).
- `mobile/screens/_io_parts/ApprovalQueuePanel.tsx`(:187-190): code 접두 제거, 날짜 표시 유지.
- `_history_sections`엔 request_code 렌더 없음(grep 0). `request_code`는 API 타입·백엔드 유니크 키로 잔존(테스트 의존). 기능 무영향.

### Feature 4b — 시간 9h 근본 수정 (앱 전체)  ⚠ 메커니즘 검증 선행
- 원인 확정: 백엔드 `datetime.utcnow()`(naive) → 직렬화 시 offset 없음 → 프론트 `new Date(iso)` 로컬 해석 +9h.
- **⚠ 위험**: Plan이 제안한 `default_response_class.render()` 오버라이드는 **작동 안 할 가능성 큼**. FastAPI는 `jsonable_encoder`가 datetime을 render 호출 *전에* 이미 `.isoformat()` 문자열로 변환함 → render 단계엔 이미 문자열이라 offset 못 붙임. SQLite는 tzinfo 미보존이라 모델 기본값을 aware로 바꿔도 읽을 때 naive로 돌아옴.
- **채택 방향(근본·낮은 위험): 프론트 단일 지점 UTC 파싱 헬퍼**.
  - `frontend/lib/mes-format.ts`에 `parseServerDate(iso)` 추가: 시간대 표식 없는 문자열이면 UTC로 간주(`new Date(iso + "Z")` 동등 처리), 이미 offset/Z 있으면 그대로.
  - `formatRelative`(MyRequestRow.tsx:29-38)와 모든 시간 표시(`formatDateTime`/`formatDate` 등)가 이 헬퍼를 거치도록 라우팅. 현재 모든 호출부가 raw `new Date(iso)`라 **이중보정 위험 없음**(아무 데도 보정 안 하고 있음 — grep 확인됨).
  - 호출부 일괄 점검·치환(약 36곳, 대부분 mes-format 경유). 고정 문자열 입력 golden 테스트는 영향 없음.
- 대안(차선): 백엔드 pydantic v2 공유 datetime 직렬화 타입(`Annotated[datetime, PlainSerializer(... +00:00)]`)을 응답 스키마 datetime 필드에 적용. 구현 시 **엔드포인트 1개로 스파이크**해 `created_at`에 `+00:00`/`Z`가 실제로 붙는지 먼저 검증한 뒤 전면 적용. 붙으면 OpenAPI 무변경(`format:"date-time"` 동일). 안 붙으면 프론트 방향 확정.
- 결정: **구현 착수 시 백엔드 스파이크 1회** → 성공 시 백엔드 방향(전 엔드포인트 1점 수정), 실패 시 프론트 헬퍼 방향. 둘 다 "앱 전체 올바르게" 충족.

---

## 작업 순서
**Step 0 (집에서 이어가기용 — 승인 즉시 최우선)**: 이 계획을 레포 루트 `c:\ERP\PLAN_생산가능_테마_헤더_입출고.md`로 복사 → `git add` → 커밋 `2026-05-19 docs: 작업 계획 추가 (생산가능·테마·헤더·입출고)` → 현재 브랜치(`feat/history-phase3`)로 push. (집 PC에서 pull 해서 이어감. 코드 변경 없음.)
그 다음: F1 → F2 → F4b → F4a → F3 (F4b 먼저 끝내야 F4a 화면 시간 확인이 최종값)

## 검증 (end-to-end)
1. `cd backend; python bootstrap_db.py --migrate` (employees.theme).
2. OpenAPI 재생성 (F2만 변경) — 위 명령.
3. `powershell -ExecutionPolicy Bypass -File .\_attic\scripts\dev\verify_local.ps1` — 5게이트+drift. F1/F4b OpenAPI 무변경, F2만 재생성 필요 확인.
4. 수동:
   - F1: 대시보드 생산가능 → 모달에 PF 전부(>15) 나열, 즉시 ≤ 최대, AR=0인 PF는 즉시가 NF↑ 재고로 제한·원자재 추가생성 안 함, 최대는 더 큼.
   - F2: 직원A 토글→리로드 유지, 다른 브라우저 직원B 독립, A 복귀.
   - F3: 평상시 pill = cyan·굵게, 동작 시 색상 상태 깜빡 후 3초 뒤 brand 복귀.
   - F4a: 입출고 내 요청/승인대기·모바일 — 요청번호 없음, 취소 동작.
   - F4b: 요청 생성 직후 "방금 전"(기존 "9시간 전" 해소), 입출고 내역 절대시각이 벽시계와 일치.
5. 추가 테스트: `test_capacity.py`(F1), `test_employee_theme.py`(F2: light/dark·422·404·verify-pin 포함), F4b 방향 확정 후 해당 단위테스트(백엔드면 `+00:00` 정규식, 프론트면 `parseServerDate` 단위).

## 주요 수정 파일
- `backend/app/routers/production.py` (F1)
- `backend/app/models.py`, `backend/bootstrap_db.py`, `backend/app/schemas.py`, `backend/app/routers/employees.py` (F2)
- `frontend/.../ThemeToggle.tsx`, `login/useCurrentOperator.ts`, `login/OperatorLoginCard.tsx`, `lib/api/employees.ts`, `lib/api/types/employees.ts` (F2)
- `frontend/.../common/StatusPill.tsx`, `DesktopTopbar.tsx` (F3)
- `frontend/.../_warehouse_sections/MyRequestRow.tsx`·`WarehouseQueueRow.tsx`, `mobile/screens/_io_parts/MyRequestsPanel.tsx`·`ApprovalQueuePanel.tsx` (F4a)
- `frontend/lib/mes-format.ts` (+ 시간 표시 호출부) 또는 백엔드 공유 직렬화 타입 (F4b, 스파이크로 확정)
