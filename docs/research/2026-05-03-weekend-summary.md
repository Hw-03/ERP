# 주말 작업 요약 (금·토·일) — 2026-05-03

> **작업 ID:** P-SUN-04
> **작성일:** 2026-05-03 (일)
> **기간:** 2026-05-01 ~ 2026-05-03 (3일)
> **최종 작업 브랜치:** `feat/hardening-roadmap` (canonical)
> **초기 분석 브랜치:** `claude/analyze-dexcowin-mes-tGZNI` — 폐기 (fast-forward 머지 후 로컬 삭제, 원격 수동 삭제 대기)
> **수정 여부:** 코드 변경 0건 / 문서 14건 신규 / PLAN.md 6곳 정정

---

## 1. 결론 (한 줄)

DEXCOWIN MES 프로토타입 하드닝 로드맵의 **35개 백로그 전수 분석 + 우선순위 재정렬 + 회사 PC 첫 주 작업 패키지 완성**.

---

## 2. 산출물 (총 14건)

### 금요일 (5건)

| 파일 | ID | 내용 |
|---|---|---|
| `MES_MOBILE_CLAUDE_CODE_EXECUTION_PLAN.md` | (정정 6곳) | 30→35개, P-SAT-05 6항 정렬, P-SUN-03 보강 |
| `docs/research/2026-05-01-erp-residue-map.md` | NAME-001~005, TERM-001~002 | 42개 ERP 잔재 분류 + 25개 용어 사전 |
| `docs/research/2026-05-01-folder-classification.md` | TREE-001~002 | 8금단 폴더, redirect-only 분석 |
| `docs/research/2026-05-01-doc-drift.md` | NAME-006~007 | 문서↔코드 4건 불일치 |
| `docs/research/2026-05-01-color-redundancy.md` | COMP-001 사전조사 | 색상 5곳 + bomCategoryColor 패턴 |

### 토요일 (6건)

| 파일 | ID | 내용 |
|---|---|---|
| `docs/research/2026-05-02-ui-screen-analysis.md` | UI-001~005, TREE-003 | DesktopAdmin/Warehouse/History 구조 + 10항 평가 |
| `docs/research/2026-05-02-admin-redesign.md` | ADMIN-001~002 | 8섹션→10영역 재설계, Mermaid |
| `docs/research/2026-05-02-warehouse-history-redesign.md` | WAREHOUSE-001~002, HISTORY-001~002 | 4단계 위저드, 가용재고 노출, 9 거래타입 매핑 |
| `docs/research/2026-05-02-common-modules-design.md` | COMP-002~005 | MesTone 통합, mes-status/format/toast 설계 |
| `docs/research/2026-05-02-backend-fix-plan.md` | BE-001~006 | update_item 버그 외 5건 |
| `docs/research/2026-05-02-execution-queue-draft.md` | SAT-06 | 35건 우선순위 4-Tier 재정렬 |

### 일요일 (4건)

| 파일 | ID | 내용 |
|---|---|---|
| `docs/research/2026-05-03-static-verification.md` | QA-001 | 정적 검증 명령 7섹션 |
| `docs/research/2026-05-03-monday-checklist.md` | QA-002 | 월요일 출근~퇴근 체크리스트 |
| `docs/research/2026-05-03-next-week-prompts.md` | QA-003 | P-MON-01~P-FRI-01 + 보너스 2건 |
| `docs/research/2026-05-03-weekend-summary.md` | SUN-04 | (이 문서) |

---

## 3. 핵심 발견 (5건)

### 3-1. update_item process_type_code 버그 (BE-001)

- `backend/app/schemas.py:41-51` `ItemUpdate` 에 `process_type_code` 필드 없음
- `backend/app/routers/items.py:415-444` 업데이트 루프에 미포함
- → 관리자 화면에서 공정 타입 변경 불가
- 수정 난이도: **2줄**, 위험도 C

### 3-2. ERP 식별자 영구 동결 (16건)

코드/DB/CSV/디렉토리에 깊이 박혀있어 변경 시 회귀 폭발:
- DB 컬럼: `items.erp_code`
- 함수: `formatErpCode()`, `ErpCode` 클래스
- 컴포넌트: `ErpLoginGate`
- 스토리지 키: `dexcowin_erp_operator`, `dexcowin_erp_boot_id`
- CSS: `erp-card-anim`, `erp-letter`
- 파일/경로: `erp.db`, `ERP_Master_DB.csv`, `Hw-03/ERP`, `C:/ERP/`

→ **시스템명은 DEXCOWIN MES, 식별자는 ERP 유지** 정책 확정.

### 3-3. 색상 정의 5곳 산재

- `useAdminDepartments.COLOR_PALETTE` (8색)
- `legacyUi.employeeColor()` switch (8색, hex 동일)
- `MobileTeamCard` 인라인
- `DesktopHomeView` 인라인
- `AdminBomProvider` BOM 색상 (CSS var 사용 — 가장 좋은 패턴)

→ `frontend/lib/mes-department.ts` 단일화 설계 완료. 점진 적용 계획.

### 3-4. PIN 보안 SHA-256

- `backend/app/services/pin_auth.py` SHA-256 (no salt, no stretch)
- `DEFAULT_PIN = "0000"`
- 4자리 숫자 + 약한 해시 → 레인보우 테이블 즉시 역산
- → BE-005 별도 PR (D등급) 로 분리. 이번 주 작업 범위 아님.

### 3-5. 라우트 정리 후보

- 삭제 후보 (redirect-only): `app/admin/`, `app/inventory/`, `app/history/`
- 미사용 (archive 만 참조): `app/bom/`, `app/operations/`, `frontend/components/AppHeader.tsx`, `CategoryCard.tsx`, `UKAlert.tsx`
- 활성 유지: `app/alerts/`, `app/counts/`, `app/queue/`

→ 사용자 확인 후 별도 PR.

---

## 4. 진행도

### 35개 백로그 분석 진행도

```
████████████████████ 100% — 분석 완료
░░░░░░░░░░░░░░░░░░░░ 0%   — 코드 수정 (회사 PC 다음 주)
```

### 작업 카테고리별

| 카테고리 | 분석 | 설계 | 실행 |
|---|---|---|---|
| ERP 잔재 (NAME) | ✅ | ✅ | ⏳ 다음 주 |
| 폴더/라우트 (TREE) | ✅ | ✅ | ⏳ 사용자 확인 후 |
| 공통 모듈 (COMP) | ✅ | ✅ | ⏳ 화요일 시작 |
| UI/관리자 (ADMIN/UI) | ✅ | ✅ | ⏳ 수요일 시작 |
| 입출고/내역 (WAREHOUSE/HISTORY) | ✅ | ✅ | ⏳ 둘째 주 |
| 백엔드 (BE) | ✅ | ✅ | ⏳ 월요일 시작 |
| 문서 (DOC) | ✅ | ✅ | ⏳ 월요일 시작 |

---

## 5. 변경 파일 목록

### 신규 (14건)

```
docs/research/
├── 2026-05-01-erp-residue-map.md
├── 2026-05-01-folder-classification.md
├── 2026-05-01-doc-drift.md
├── 2026-05-01-color-redundancy.md
├── 2026-05-02-ui-screen-analysis.md
├── 2026-05-02-admin-redesign.md
├── 2026-05-02-warehouse-history-redesign.md
├── 2026-05-02-common-modules-design.md
├── 2026-05-02-backend-fix-plan.md
├── 2026-05-02-execution-queue-draft.md
├── 2026-05-03-static-verification.md
├── 2026-05-03-monday-checklist.md
├── 2026-05-03-next-week-prompts.md
└── 2026-05-03-weekend-summary.md
```

### 수정 (1건)

```
MES_MOBILE_CLAUDE_CODE_EXECUTION_PLAN.md (6곳 정정)
```

### 코드 변경

**0건** — 분석/설계 단계로 한정, 실제 코드 수정은 회사 PC 에서 다음 주.

---

## 6. 검증

| 항목 | 상태 |
|---|---|
| 모든 문서 마크다운 문법 정상 | ✅ |
| 식별 IDs (BE-001 등) 모두 docs 간 교차 참조 일치 | ✅ |
| Frozen 식별자 16건 정합성 (이중 확인) | ✅ |
| PLAN.md 정정 6곳 적용 후 30→35 일치 | ✅ |
| 모든 커밋 푸시 완료 | ✅ (3건 커밋) |

---

## 7. 잔여 이슈

### 사용자 액션 필요

1. **GitHub 웹 UI 에서 `claude/analyze-dexcowin-mes-tGZNI` 원격 브랜치 수동 삭제**
   - 이 브랜치는 **초기 분석 브랜치**였고, 모든 작업은 `feat/hardening-roadmap` 으로 이관됨
   - 로컬 삭제 + fast-forward 머지 완료
   - 원격은 web 세션 권한 부족으로 403 — 직접 삭제 필요
   - 이후 모든 머지/리뷰 기준은 **`feat/hardening-roadmap` 단일** 로 진행
2. **redirect-only / archive-only 파일 삭제 승인**
   - `app/admin/page.tsx`, `app/inventory/page.tsx`, `app/history/page.tsx` (redirect)
   - `frontend/components/AppHeader.tsx`, `CategoryCard.tsx`, `UKAlert.tsx` (archive 만)

### 다음 주 시작 직후 (월요일)

1. P-MON-01 (BE-001) 적용 — 30분 예상
2. P-MON-02 (BE-003 OPERATIONS.md) 적용 — 15분 예상
3. P-TUE-01~03 (mes-format / mes-department / mes-status) — 화요일 종일

### 별도 PR 로 분리

- BE-005 (PIN bcrypt/argon2id) — D등급, 인증 영향 큼
- DEFAULT_PIN 첫 진입 강제 변경 — BE-005 종속

---

## 8. 다음 1가지

**월요일 출근 직후 `docs/research/2026-05-03-monday-checklist.md` 의 0번~2번 섹션 순서대로 실행, P-MON-01 (BE-001) 로 진입.**
