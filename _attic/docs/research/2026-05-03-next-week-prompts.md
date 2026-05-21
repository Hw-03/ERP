# 다음 주 프롬프트 패키지 — 2026-05-03

> **작업 ID:** MES-QA-003
> **작성일:** 2026-05-03 (일)
> **목적:** 회사 PC 첫 주 (월~금) 에 그대로 복사해서 쓸 수 있는 프롬프트 모음
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (프롬프트 템플릿)

---

## 사용법

각 프롬프트는 독립적으로 클로드에게 던질 수 있도록 자기완결로 작성됨.
- 작업 ID, 변경 파일, 검증 절차, 커밋 메시지 모두 포함
- 위험도 표기로 자가검열 가능

---

## P-MON-01 — `update_item` `process_type_code` 누락 수정 (BE-001)

```
DEXCOWIN MES, feat/hardening-roadmap.

backend/app/schemas.py 의 ItemUpdate 클래스에 process_type_code: Optional[str] = None 필드를 추가해라.
backend/app/routers/items.py 의 update_item 함수 업데이트 루프에 "process_type_code" 를 추가해라.

검증: 백엔드 재기동 후 (라우트는 @router.put — PUT 메서드)
  curl -X PUT localhost:8010/api/items/1 -H "Content-Type: application/json" -d '{"process_type_code":"AS1"}'
응답에 process_type_code 가 변경 반영되어야 한다.

커밋: "2026-05-04 backend: fix update_item process_type_code missing field"
푸시까지.

위험도: C. 다른 필드 / 다른 함수 건드리지 마라.
```

---

## P-MON-02 — `/health/detailed` 문서 정정 (BE-003)

```
DEXCOWIN MES.

docs/OPERATIONS.md 의 /health/detailed 응답 예시 블록만 정정한다.
실제 응답 키와 일치시켜라:
  database → db
  tables → rows
  open_queue_count → open_queue_batches
  latest_transaction_at → last_transaction_at
  inventory_mismatch_count 추가

backend/app/main.py 의 실제 응답을 grep 으로 확인해서 누락 없는지 검증해라.

코드는 건드리지 마라. 문서만.
커밋: "2026-05-04 docs: align /health/detailed field names with main.py"

위험도: A.
```

---

## P-TUE-01 — `mes-format.ts` 신규 (COMP-005)

```
DEXCOWIN MES.

frontend/lib/mes-format.ts 를 신규 생성해라. 다음 함수만 export:

  fmtDate(iso): "2026년 5월 4일"
  fmtDateTime(iso): "2026년 5월 4일 오전 9:30"
  fmtRelative(iso): 1시간 미만은 "N분 전", 6시간 미만은 "N시간 전", 그 외 fmtDate
  fmtQty(n): "1,234개"
  fmtNumber(n): "1,234"

Intl.DateTimeFormat("ko-KR", ...) 사용. 외부 의존성 추가 금지.

기존 legacyUi.ts::formatNumber 가 있으면 그대로 두고 mes-format.ts 에서도 동일 동작 별도 export.
import 적용은 이번 작업 범위 아님 — 신규 파일만.

검증: npx tsc --noEmit 통과.
커밋: "2026-05-05 frontend: add mes-format.ts (date/number formatting)"

위험도: B.
```

---

## P-TUE-02 — `mes-department.ts` 신규 + 5곳 적용 (COMP-001)

```
DEXCOWIN MES.

전제: docs/research/2026-05-01-color-redundancy.md 의 5개 색상 정의 위치 확인 완료.

1단계 (이번 작업):
  frontend/lib/mes-department.ts 신규 생성.
  - getDeptColor(dept: { color_hex?: string | null }): string
    DB color_hex 우선, 없으면 fallback 팔레트.
  - DEFAULT_PALETTE: string[]  (8색, employeeColor 와 동일 hex)
  - deptLabelTone(dept): MesTone  (MES-COMP-002 mes-status.ts 의존 — 없으면 string union 사용)

2단계 (이번 작업):
  useAdminDepartments.ts 의 COLOR_PALETTE 를 mes-department.ts 의 DEFAULT_PALETTE re-export 로 교체.

3단계 (별도 PR):
  나머지 4곳 (employeeColor, MobileTeamCard, DesktopHomeView, AdminBomProvider) 점진 적용.

이번 작업은 1+2단계만. 3단계 손대지 마라.

검증: npx tsc --noEmit + npm run build.
커밋: "2026-05-05 frontend: add mes-department.ts and adopt in useAdminDepartments"

위험도: B (적용 1곳만이라 회귀 범위 좁음).
```

---

## P-TUE-03 — `mes-status.ts` 신규 (COMP-002)

```
DEXCOWIN MES.

frontend/lib/mes-status.ts 를 신규 생성:

  type MesTone = "info" | "success" | "warning" | "danger" | "neutral" | "muted"
  TONE_STYLES: Record<MesTone, { bg: string; text: string }>  (Tailwind 클래스)
  inferTone(status: string | null | undefined): MesTone
    COMPLETED/OK/ACTIVE/SUCCESS → success
    CANCELLED/ERROR/DANGER/FAILED → danger
    WARNING/PENDING/DRAFT → warning
    RESERVED/SUBMITTED/INFO → info
    그 외 → neutral

기존 StatusPill / StatusBadge 는 건드리지 마라. 신규 파일만.
검증: tsc.
커밋: "2026-05-05 frontend: add mes-status.ts (MesTone unification)"

위험도: B.
```

---

## P-WED-01 — 관리자 items 섹션에 `process_type_code` UI (ADMIN-002)

```
DEXCOWIN MES. P-MON-01 (BE-001) 완료 전제.

frontend/app/legacy/_components/AdminMasterItemsSection.tsx 의 품목 상세 편집 패널에
process_type_code 필드를 추가해라.

  - 입력: <select> 또는 <input type="text">  (현재 ProcessType 마스터 드롭다운 있으면 select)
  - PUT /api/items/{id} 호출 시 payload 에 process_type_code 포함 (items.py 는 @router.put)
  - 저장 후 재조회로 갱신

기존 다른 필드 동작 영향 없도록.
검증: 관리자 화면에서 품목 1개 process_type_code 변경 → 새로고침 후 유지.
커밋: "2026-05-06 admin: expose process_type_code in items edit panel"

위험도: B.
```

---

## P-WED-02 — 입출고 화면 한국어 레이블 교체 (UI-002)

```
DEXCOWIN MES.

frontend/app/legacy/_components/_warehouse_steps/_constants.ts 의 WORK_TYPES label 만 수정:

  raw-io:             "원자재 입출고"     → "창고 입고 / 출고"
  warehouse-io:       "창고 이동"         → "창고 ↔ 부서 이동"
  dept-io:            "부서 입출고"       → "부서 입고 / 부서 출고"
  package-out:        "패키지 출고"       → "묶음 출고"
  defective-register: "불량 등록"         → "불량 격리"

WorkType 코드 (id) 는 절대 변경 금지. 라우팅/저장 전체에 영향.
description 도 같이 다듬되 50~60대 가독성 우선.

검증: 입출고 화면 진입 → 5개 카드 한국어 확인.
커밋: "2026-05-06 desktop: warehouse worktype labels for senior users"

위험도: B.
```

---

## P-THU-01 — `option_code` 길이 통일 (BE-002)

```
DEXCOWIN MES.

backend/bootstrap_db.py:72 의 option_code VARCHAR(2) → VARCHAR(10) 으로 변경.

기존 erp.db 는 영향 없음 (이미 String(10)). 신규 환경에서만 효과.

검증:
  rm -f /tmp/test.db
  cp backend/bootstrap_db.py /tmp/  (옵션)
  python -c "import sqlite3; ..." 로 신규 DB 만든 후 .schema items | grep option_code
  → VARCHAR(10) 확인.

커밋: "2026-05-07 backend: align option_code VARCHAR length to 10"

위험도: C.
```

---

## P-THU-02 — `/api/settings/integrity/inventory` POST 전환 (BE-006)

```
DEXCOWIN MES.

GET ?pin=... → POST body 로 전환.

backend/app/routers/settings.py:
  IntegrityRequest BaseModel (pin: str)
  @router.post("/integrity/inventory")
  payload.pin 으로 verify_admin_pin 호출

frontend 호출처 (검색 후 1곳 수정):
  fetch URL 에서 ?pin= 제거, method POST + body JSON.

기존 GET 핸들러 제거.
검증:
  POST 정상 응답
  GET ?pin=0000 → 404 또는 405

커밋: "2026-05-07 backend: switch integrity/inventory to POST with body PIN"

위험도: C. 액세스 로그에 PIN 평문 노출 방지가 목적.
```

---

## P-FRI-01 — 내역 화면 부서/직원/상태 필터 (UI-003)

```
DEXCOWIN MES. mes-format.ts 완료 전제 (P-TUE-01).

frontend/app/legacy/_components/DesktopHistoryView.tsx 에 추가 필터 3종:

  1. 부서 필터: <select> 부서 목록 (ALL + 활성 부서)
  2. 직원 필터: <select> 직원 목록 (ALL + 활성 직원)
  3. 상태 필터: <select> ALL/DRAFT/SUBMITTED/COMPLETED/CANCELLED

기존 typeFilter / dateFilter / search 옆에 같은 줄로 배치.
필터링 로직은 클라이언트 측 (현재 구조 유지).

날짜 표시는 mes-format.ts 의 fmtDateTime 사용.

검증: 필터 조합으로 결과 갱신 확인. 빈 결과일 때 안내 메시지.
커밋: "2026-05-08 desktop: add dept/employee/status filters to history view"

위험도: B.
```

---

## 사용 안내

- 위에서부터 순서대로 사용 (의존성 정렬됨)
- 한 프롬프트 끝나면 반드시 다음 가기 전에 푸시
- 막히면 사용자에게 보고 (자기 판단으로 우회 X)
- 프롬프트마다 위험도 명시되어 있으니 그대로 따름

---

## 추가 보너스 프롬프트 (시간 남으면)

### P-EXTRA-01 — `mes-toast.ts` 통합 (COMP-003)

```
DEXCOWIN MES.

현재 Toast 산재 위치를 grep 으로 먼저 확인:
  rg -n "Toast|setMessage|showToast" frontend/app/legacy/_components/ --glob "!_archive"

frontend/lib/mes-toast.ts 신규 생성:
  showToast(message, tone="info", duration=3000)
  showSuccessToast(message)
  showErrorToast(message)

mes-status.ts MesTone 의존.

기존 Toast 컴포넌트 호출처는 그대로 두고 신규 진입로만 추가.
점진 마이그레이션은 별도 PR.

위험도: B.
```

### P-EXTRA-02 — `TRANSACTION_META` 색상 확장 (COMP-004)

```
DEXCOWIN MES.

frontend/lib/mes-status.ts (또는 legacyUi.ts) 에
TRANSACTION_META: Record<TransactionType, { label: string; tone: MesTone }> 추가.

11개 거래 타입 (RECEIVE, SHIP, ADJUSTMENT, PRODUCE, SCRAP, LOSS, RETURN, TRANSFER, RESERVE, CANCEL, DEPT_TRANSFER) 모두 포함.

기존 transactionLabel 함수는 유지하되 내부에서 TRANSACTION_META.label 참조하도록 점진 변경.

위험도: A.
```
