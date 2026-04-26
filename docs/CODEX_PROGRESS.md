# ERP 진행 기록

이 문서는 큰 기능 단위의 진행 이력을 요약한다. 최신 업무 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 현재 기준

- 품목 총수: 971건
- 공정코드: 18개
  - `TR/TA/TF` -> 튜브
  - `HR/HA/HF` -> 고압
  - `VR/VA/VF` -> 진공
  - `NR/NA/NF` -> 튜닝
  - `AR/AA/AF` -> 조립
  - `PR/PA/PF` -> 출하
- `BF`는 사용하지 않는다.
- ERP 코드 포맷: `{모델기호}-{process_type_code}-{일련번호:04d}[-{옵션코드}]`

## 완료된 큰 작업

### 데이터/코드 체계

- `product_symbols`: 제품별 모델 기호 관리
- `option_codes`: `BG`, `WM`, `SV` 옵션 코드
- `process_types`: 18개 공정코드 관리
- `items`: `erp_code`, `symbol_slot`, `process_type_code`, `option_code`, `serial_no` 확장
- 코드 파싱/생성 API와 서비스 레이어 도입

### 재고 구조

- `inventory.pending_quantity` 도입
- `Total = Available + Pending` 기준 도입
- 출고 검증을 가용 재고 기준으로 전환
- 예약, 해제, 확정 처리 서비스 분리

### Queue/BOM 작업

- 생산, 분해, 반품 Queue 배치 구조 도입
- BOM 전개 로직을 서비스 레이어로 이동
- Queue 확정 시 TransactionLog와 VarianceLog 연결
- Scrap, Loss, Variance 기록 API 추가

### 알림/실사

- 안전재고 알림 스캔 API 추가
- 실사 입력과 강제 조정 흐름 추가
- count variance 알림 도입

### 프론트엔드

- 레거시 UI에 재고/창고/관리자 데스크톱 화면 구성
- Queue, 알림, 실사 화면 추가
- ERP 코드, 가용/예약 재고, 예약자 표시 추가
- 재고 필터 UX 개선 진행

## 2026-04-23 재고 필터 이슈

- 현상: API는 971건을 로드했지만 모든 부서/모델 칩 선택 시 조회 품목이 967건으로 표시됐다.
- 원인: 일부 품목의 공정/부서 매핑이 현재 기준과 맞지 않았다.
- 결론:
  - “전체”와 “모든 항목 개별 선택”은 같은 결과여야 한다.
  - 부서 필터는 `process_type_code` 또는 백엔드 `department` 기준으로 통일한다.
  - 조립 F 타입은 `AF`이며 `BF`를 필터에 추가하는 방식으로 해결하지 않는다.

## 최근 커밋 요약

- `b890dc5`: 부서 필터 안전망, 품절 행 부서 배지 표시
- `7c47481`: `department` 단일 소스 도입
- `8850c6d`: 창고 입출고 UI 개선, DB 유틸 추가
- `66e93cf`: 아카이브 볼트 원본 제거, 재고뷰/로고 스크립트 추가
- `98fa3c1`: Obsidian vault 이동 및 프론트 UI 업데이트

## 2026-04-25 입출고 단계형 wizard 도입

- 입출고 탭을 **담당자 → 작업유형 → 품목 → 수량 → 실행 → 완료 피드백** 5단계 wizard로 재구성
- 부분 실패 안전 처리(결과 모달 + 실패 항목만 재시도 + 자동 refresh) 추가
- Topbar에 작업 상태 pill 표시(`방금 완료 …`)

## 2026-04-25 `feat/erp-overhaul` brunch — UX 마감 / 공용 부품 / 문서

### 구현 완료

- 공용 UI 부품 6종 신설 (`frontend/app/legacy/_components/common/`):
  EmptyState · LoadFailureCard · LoadingSkeleton · StatusPill · ConfirmModal · ResultModal
- 입출고 UX 마감 (필터 가림 안내, 음수 재고 강조, blockerText, 메모 200자 카운터, busy 잠금)
- 데스크톱 4화면 시각 언어 통일
- 운영 보조 스크립트: `scripts/ops/backup_db.bat`, `scripts/ops/healthcheck.bat`
- 문서 신설: USER_GUIDE / OPERATIONS / ARCHITECTURE / BACKEND_REFACTOR_PLAN / FRONTEND_HOOKS_PLAN

## 2026-04-25 `feat/erp-overhaul` Phase 3 — 대형 구조 정리

### 구현 완료

- **DesktopWarehouseView.tsx**: 924 → ~492줄
  - 신규 hook 5종: `useWarehouseFilters` · `useWarehouseWizardState` · `useWarehouseCompletionFeedback` · `useWarehouseData` · `useWarehouseScroll`
  - 신규 섹션 컴포넌트: `WarehouseHeader` · `WarehouseStickySummary` · `WarehouseCompletionOverlay` · `WarehouseStepLayout` · `WarehouseConfirmContent`
- **DesktopInventoryView.tsx**: 1,015 → ~308줄
  - `_inventory_sections/`: KpiPanel · ActionRequired · CapacityPanel · FilterBar · ItemsTable · DetailPanel
- **DesktopHistoryView.tsx**: 919 → ~336줄
  - `_history_sections/`: FilterBar · CalendarStrip · Table · DetailPanel + shared 상수
- **DesktopAdminView.tsx**: 1,794 → ~830줄
  - `_admin_sections/`: MasterItems · Employees · Bom · Packages · Models · Export · DangerZone + shared 상수
- **공용 부품 배럴**: `common/index.ts` 신설, 사용처 import 정리
- **백엔드 helper (제한적)**:
  - `backend/app/services/_tx.py`: `commit_and_refresh` / `commit_only` 도입, `inventory.py` 라우터 10건 치환
  - `backend/app/services/export_helpers.py`: `csv_streaming_response` 도입, inventory + items CSV export 보일러플레이트 단축
  - **API spec / DB schema / endpoint 응답 / transaction 의미 동일**

### 보존됨 (변경 금지)

- `submit()` / `dispatchSingleItem()` 본체
- `selectedItems: Map<string, number>` 구조
- 부분 성공 successIds 제거 동작
- API 호출 시그니처 / DB schema
- completionFlyout 1100+380ms 타이밍
- Topbar pill 메시지 형식
- ConfirmModal/ResultModal `busy={busy}` 잠금
- KPI 계산식 / 카테고리 그룹 / 거래 색상화 / TransactionType 매핑
- BOM 등록·삭제 / 직원 토글 / 패키지 추가·제거 / PIN lock / DB 초기화 동작

### 보류 (다음 단계로 이월)

- 에러 detail dict 표준화 (프론트 파싱 동시 수정 필요)
- `transactional` 컨텍스트 매니저로 commit 책임 서비스로 이동
- ship-package N+1
- `useResource` 데이터 페칭 헬퍼 (외부 라이브러리 도입 정책 검토 필요)
- 운영 파일 위생(루트 `erp.db` 정리, seed 스크립트 이동, docker-compose 포트 정렬)
- 보안/권한·테스트·CI

## 2026-04-26 Phase 5.1 — 정합 fix · 성능 · 백업 안전성

GPT 교차 리뷰에서 코드로 확인된 정합성 결함을 일괄 정리.

### 백엔드

- **`/api/production/capacity` 계산식 통일**: `inv.quantity - pending` 으로 부서 생산재고/불량재고까지 가용으로 계산하던 식을 `StockFigures.warehouse_available` (= warehouse - pending) 로 교체. `production_receipt` 의 실제 차감 검사식과 일치 → "생산 가능 = 화면 표시" 보장.
- **/capacity N+1 제거**: 루프 내 단건 쿼리 4종을 `build_bom_cache()` 1회 + `bulk_compute()` 1회 + `Items IN` 1회로 압축.
- **`bom.py get_all_bom` N+1 제거**: parent/child 단건 쿼리 N×2회 → `Items IN` 1회.
- **`services/bom.py explode_bom` 메모리 캐시화**: `BomCache` 타입 도입, `cache=` 키워드로 호출 간 공유 가능. 단독 호출에서도 진입 시 1회 BOM 전체 로드 후 메모리에서 재귀 → 깊이마다의 BOM/Item 단건 쿼리 제거.

### 프론트엔드

- **`erp_code` 타입 정합**: `TransactionLog` · `ShipPackageItemDetail` · `ProductionCheckComponent` · `BackflushDetail` + ship 응답 inline 타입을 `string | null` 로 정정 (백엔드는 Optional). `HistoryDetailPanel.tsx` 의 `[string,string][]` 단언 자리에 `?? "-"` 가드 추가.
- **`useAdminBom.saveBomQty` 후 전체 BOM 갱신**: BOM 수량 수정 후 `refreshAllBom()` 호출 누락을 추가. add/delete 와 동일하게 우측 "전체 BOM 현황" 즉시 반영.

### 운영

- **WAL 안전 백업**: `scripts/ops/backup_db.bat` 가 `sqlite3 .backup` → Python `sqlite3.backup` → WAL checkpoint+3종 파일 복사 폴백 순서로 동작. 백엔드 가동 중 백업의 트랜잭션 일관성 보장.
- **OPERATIONS.md 백업 절차** 갱신.

### 검증

- `python -m compileall backend` — 0 오류
- `npx tsc --noEmit` — 0 오류
- `npm run lint` — 0 warning

## 다음 우선순위

- `BF -> AF` 마이그레이션 결과 검증
- 모든 부서/모델 개별 선택과 전체 필터의 품목 수 일치 검증
- `min_stock` 미설정 품목의 정상/부족 분류 기준 검증
- BOM 가계도/Where-Used 시각화 기획
- 출하 스펙/거래처 관리 기능 설계
- API 인증 헤더화 (외부 노출 계획 시)
- 루트 `erp.db` 정리 + seed 스크립트 이동
- (위 보류 항목)
