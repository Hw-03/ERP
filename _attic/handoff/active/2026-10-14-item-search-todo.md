# 검색 공통화와 대시보드 검색어 관리

- 사용자 승인: 공통 동의어 + 품목별 별칭, 복합 AND 검색, 전체 품목 검색 통합, 대시보드 편집, 로그인한 모든 직원 CRUD, 초기 데이터 비움.
- GOAL: 모든 화면에서 일관된 품목 검색을 제공하고, 직원 누구나 대시보드에서 공통 동의어와 품목별 별칭을 관리할 수 있게 한다.
- 시작 기준: C:/ERP main 63d1d731. 기존 frontend/next-env.d.ts 변경 보존. 브랜치 변경·커밋·푸시·배포 없음.
- 상태: 완료 5 / 진행 0 / 합계 5.
- 현재 작업 위치: `C:/Users/user/.codex/worktrees/item-search/ERP` (관리형 격리 워크트리, detached HEAD).
- 추가 사용자 요청(2026-10-14): 직원 서버 동기화에 섞이지 않도록 구현 변경 전체를 별도 워크트리로 이동. 검색 작업 파일만 이동하고 C:/ERP의 다른 작업 변경은 보존했다.
- C:/ERP에는 검색 코드·마이그레이션·테스트를 남기지 않았다. 개발 DB에 적용했던 빈 검색 테이블도 Alembic downgrade로 제거하여 0045로 복원했으며, 기존 업무 데이터의 해시가 모두 동일하다. 격리 워크트리에는 별도 DB 사본(0046, 검색 정보 비어 있음)을 보존했다.

## 계약

- GET /api/item-search/config: `{version: string, synonym_groups: [{group_id: string, version: number, terms: string[]}], item_aliases: {[item_id]: [{alias_id: string, alias: string}]}}`.
- POST /api/item-search/items/{item_id}/aliases: `{alias: string}` → 별칭 객체. DELETE /api/item-search/items/{item_id}/aliases/{alias_id}: 204.
- POST /api/item-search/synonym-groups: `{terms: string[]}` → 그룹 객체. PUT /api/item-search/synonym-groups/{group_id}: `{terms: string[], expected_version: number}`. DELETE는 expected_version 쿼리 사용, 204.
- 쓰기는 X-Operator-Session 인증. 읽기는 기존 공개 품목 읽기와 같은 경계. 그룹 버전 충돌은 409. 동일 품목 정규화 별칭 추가는 기존 객체 반환.
- 품목별 별칭과 그룹은 별도 테이블. 그룹 간 정규화 term은 unique. config version은 정렬된 실제 검색 설정 내용의 SHA256이며 재고 변경만으로 바뀌지 않는다.
- 검색: 대소문자·공백·하이픈·점·슬래시 무시. 쉼표(`,`) 구분 검색은 OR이고, 각 구간의 전체 정규화 입력 부분 일치와 공백 구분 조건 AND를 유지한다. 빈 쉼표 구간은 무시하며 쉼표만 입력하면 결과가 없다. 쉼표 이외의 나머지 문자는 리터럴. 같은 동의어 그룹 대안은 OR. 연속 입력 단어 중 등록 구문은 각 쉼표 구간 안에서 긴 구문부터 소비한다.
- 동의어는 품목명·별칭에만 적용. 코드·처리자·참조번호 등에는 원래 검색어만 적용. 짧은 ASCII 영문 약어(길이 3 이하)의 확장 대안은 영문/숫자 경계를 검사하여 BDRIVE 등의 내부에 매칭하지 않는다.
- config 변경 시 결과/커서 갱신, 업무 선택·초안 보존. 과거 스냅샷 품명 검색 보존.

## 2026-10-16 추가 변경: 쉼표 OR 검색

- 사용자 요청에 따라 `defect-size-summary` 워크트리의 공통 품목 검색에 쉼표 OR만 추가했다. `전극, 게터`는 둘 중 하나를 찾고, `전극 70, 게터`는 각 구간의 기존 공백 AND를 유지한다. `&` 등 다른 연산자는 추가하지 않았다.
- 완료 검증: 공유 계약에 쉼표·코드 목록·동의어·별칭·스냅샷·빈 구간·SQL 특수문자 사례를 추가하고 변경 전 프론트와 서버 메모리·SQL에서 실패를 확인했다. 변경 후 프론트 itemSearch 계약·기존 검색·검색 설정·불량 검색·공통 입력 검사, 서버 item_search 계약·소비자·API·search_utils 검사, 변경 파일 ESLint·전체 TypeScript·diff 검사가 통과했다. 별도 읽기 전용 리뷰에서도 추가 결함을 찾지 못했다.
- 실제 브라우저 검증 한계: 종료된 3016 미리보기를 동일 워크트리와 기존 8011 프록시 대상으로 복구하고 HTTP 200을 확인했다. 새 검증 탭에서는 현재 직원 계정에 로컬 검증용 PIN이 거부되어 로그인 후 검색 결과를 확인하지 못했다. 실제 화면 통과로 보고하지 않는다. 서버 검색 변경은 이 워크트리의 코드와 자동 검사로만 검증했으며 개발·직원 백엔드에 배포하지 않았다.

## 구현·검증

- [x] 1. 공통 계약 예제·프론트/서버 검색 엔진과 서버 검색 소비자 통합. 완료 2026-10-14: 공유 fixture TS 33 / Python 메모리·SQL 계약 검증.
- [x] 2. 빈 검색 테이블 마이그레이션·직원 CRUD·감사·설정 버전. 완료 2026-10-14: 권한·감사·중복·경합·커서 테스트 및 마이그레이션 검증. 삭제 그룹의 단어도 감사 기록에 보존.
- [x] 3. 단일 SearchInput·한글 IME·직원 combobox 및 기존 검색 입력 통합. 완료 2026-10-14: 공통 입력·직원 선택 테스트, 기존 역할·키보드 선택 보존.
- [x] 4. config 캐시·대시보드 품목 별칭/공통 동의어 편집·전체 프론트 품목 검색 통합. 완료 2026-10-14: 설정 갱신 순서·저장 실패·충돌 초안 보존·선택 품목 유지 검증.
- [x] 5. 계약·권한·동시성·초안 보존·타입/정적 검사·격리 DB PC/모바일 검증 및 최종 리뷰. 완료 2026-10-14: 아래 실제 관찰·자동 검증 범위와 격리 이동 증거 참조.

## 검증 증거

- 증거: 현재 워크트리 `_attic/runtime/item-search-20261014/`. 최초 QA 사본·DB·session.json은 `C:/ERP/_attic/runtime/mes-browser-regression/item-search-20261014-a`와 `item-search-20261014-b`에 보존. 두 QA 서버는 소유 프로세스만 종료했다. b의 전체 overlay SHA256이 이동 전 최종 소스와 일치함을 확인했다.
- 서버 관련 선택 검증: `backend-final.log` 176 통과. 이후 삭제 감사 보강은 `backend-audit-green.log` 6 통과로 직접 재검증. 마이그레이션 HEAD·재실행·빈 테이블 검증 포함.
- 프론트 핵심 입력·사전·관리·실시간 검증: `frontend-core-final.log` 95 통과. 실사·이력/출하 커서 `draft-cursor-final.log` 109 통과. 창고 지도 `map-green.log` 14 통과. 입출고 전환·BOM·PC/모바일 이력 등 직접 관련 7 suite 88 통과(별도 지도 suite 실패는 placeholder 기반 테스트를 접근성 이름으로 수정 후 14 통과).
- 출하 전체 171 통과(하위 에이전트 실행), 부모의 최종 갱신 회귀 `shipping-refresh-final.log` 9 통과. 숨김 화면에서 설정 변경 후 이력 복귀 누락을 RED로 재현하여 수정했고 최종 읽기 전용 리뷰에서 해소 확인.
- 실제 브라우저 관찰: PC·모바일 동의어 등록, 공유 상세의 별칭 등록, `보드 battery` 복합 검색과 BDRIVE 제외, `내장재` 별칭 검색, 모바일 입출고 반영. 저장 API 실패 주입 시 모바일 입력 보존. 같은 브라우저 컨텍스트의 별도 탭에서 QA-ASM 직원이 동의어를 등록해도 QA-ADMIN의 출하 인보이스·수량 7 유지. 화면 PNG는 증거 폴더에 보존. 관찰하지 않은 모든 화면의 UI를 일괄 통과로 주장하지 않는다.
- 전수조사 PC·모바일 선택·계수 입력 보존은 Provider 실제 캐시를 갱신하는 자동 회귀로 검증했다. 키의 설정 버전 의존성을 잠시 제거했을 때 4개가 RED, 복원 후 GREEN. 한글 조합 및 직원 초성·한영 입력은 공통 입력·combobox 자동 테스트로 검증했다.
- 이동 검증: 명시적 manifest 110 파일의 SHA256 동일성, 원본의 해당 tracked diff 없음·신규 파일 제거, 다른 작업 10 파일의 바이트 동일성, 원본 DB 전체 기존 업무 테이블 해시 동일성·0045·검색 테이블 없음. `verify_isolation.py` PASS 및 `original-schema-check.log` ready=True.
- 이동 후 워크트리 직접 검증: `worktree-frontend.log` 37 / `worktree-backend.log` 45 통과, `worktree-typecheck.log` TypeScript exit 0, DB `--check` 0046 ready=True, OpenAPI 기준 일치, diff 검사 통과. 작업 위치가 바뀐 것 외에는 검증된 소스·설정·의존성이 동일하다.
- 동결된 주간보고·모바일 하단 탭 디자인·출하 5단계 카드 배분은 변경하지 않았다. 실제 사용되는 입력만 통합했고, 호환 이름의 얇은 wrapper는 단일 SearchInput을 사용한다. 미사용 AddRDirectModal/AddQuarantineModal은 건드리지 않았다.
- 직원 서버 배포·동기화, 브랜치 전환, 커밋·푸시는 실행하지 않았다. 이후 변경도 이 워크트리에서만 수행한다.

## 2026-10-15 상세 카드 검색용 이름 탭 — 완료

- 사용자 브라우저 의견 반영: 상세 정보 본문의 검색용 이름 편집 카드를 제거하고, `상세 정보 / 최근 내역 / 검색용 이름` 세 번째 탭으로 옮겼다. PC 우측 상세와 모바일 품목 상세 시트에 함께 적용했다.
- 기존 ItemSearchAliases를 그대로 사용하며 선택 품목의 공식 이름·코드 헤더를 유지한다. 탭 이동 중 별칭 초안은 유지하고 품목 변경 시 새 품목의 입력으로 분리한다. 삭제·조회 실패 등 편집 차단 상태도 적용한다. 공통 동의어 관리의 위치·서버 API·권한은 변경하지 않았다.
- PC 세 탭의 방향키·Home/End 이동과 모바일 순환 이동을 맞췄고, 좁은 탭에서 문구가 줄바꿈되지 않도록 했다. 동결된 하단 내비게이션은 변경하지 않았다.
- 검증: 새 동작 7개 RED 확인 후 관련 상세/모바일/별칭 관리 4개 suite 79개 GREEN, 해당 TS/TSX ESLint 및 전체 TypeScript exit 0, diff 검사 통과. 증거: `_attic/runtime/item-search-preview/alias-tab-red.log`, `alias-tab-green.log`.
- 실제 브라우저 자동 검수는 인앱 제어 연결 시간 초과와 별도 브라우저의 직원 PIN 불일치로 완료하지 못했다. 로그인 정보를 바꾸지 않았으며, 실행 중인 3032 미리보기의 컴파일 오류가 없는 것을 로그로 확인했다. UI 전체 관찰 PASS로 기록하지 않는다.

## 2026-10-15 같은 뜻의 검색어 연결 화면 — 완료

- 승인된 후속 계획 반영: 버튼은 `검색어 연결`, 제목은 `같은 뜻의 검색어`로 변경했다. 한 줄 입력 두 개와 추가·삭제 가능한 표현 입력, 연결 미리보기, 목적·공통 적용 범위 안내를 PC·모바일의 같은 컴포넌트에 적용했다. 예시는 placeholder에만 있으며 자동 등록하지 않는다.
- 등록된 연결은 실제 검색어 카드로 접어 표시한다. 수정·수정 완료·취소·연결 해제를 제공하며, 실패·버전 충돌·외부 삭제 시 초안을 보존한다. 기존 terms 배열·권한·감사·버전 검사 API와 DB 스키마는 변경하지 않았다.
- 자동 검증: 관리 컴포넌트 13개, PC·모바일 대시보드 15개 통과. 관련 ESLint와 전체 TypeScript exit 0, git diff --check 통과. 관리 테스트의 기존 UI에서 RED 11개 확인 후 GREEN 13개를 확인했다.
- 브라우저: 새 격리 QA `synonym-editor-20261015-a`(8033/3033, QA-ADMIN)에서 PC 등록·미리보기·기본 접힘·수정·취소·해제, 모바일 입력 추가·삭제·구문 보존·실패 시 입력 보존·재시도 성공을 실제 확인했다. 서버가 정렬해 반환하는 단어 순서에 맞춰 브라우저 검증 선택자를 보정했다. QA 연결을 해제하고 소유 QA 서버만 종료했다.
- 증거: `_attic/runtime/item-search-preview/synonym-editor-red.log`, `synonym-editor-green.log`, `synonym-desktop.png`, `synonym-desktop-saved.png`, `synonym-mobile.png`, `synonym-mobile-failure.png`; QA 서버 로그·소스 SHA256·프로세스 영수증은 `_attic/runtime/mes-browser-regression/synonym-editor-20261015-a/`에 보존했다.
- 현재 작업은 격리 워크트리에만 있다. 사용자 확인용 3032/8032는 계속 실행하며, 해당 DB에 예시를 추가하지 않았다. 직원 서버 동기화·커밋·푸시·배포는 실행하지 않았다.
- 후속 사용자 요청: 우측 상단 검색 설정 로딩 알림을 숨겼다. floating 안내는 실패 시에만 표시하고 화면 내부 로딩·재시도 안내는 유지한다. 직접 관련 useItemSearch 4개 테스트와 해당 컴포넌트 ESLint, diff 검사 통과.
- 후속 사용자 요청: PC 검색어 연결 패널에서 품목 행 선택 시 검색어 연결을 닫고 해당 품목 상세로 전환한다. 검색어 연결이 열린 동안에는 기존 선택 행도 상세 닫기 토글로 처리하지 않는다. 최초 선택·같은 품목 재선택 회귀를 RED로 확인 후 관련 suite 6개 GREEN, 관련 ESLint·diff 검사 통과.
- 후속 사용자 요청: 한글 마지막 음절이 IME 조합 상태인 동안 검색어 전달이 멈춰 포커스 이동 후에야 동의어 결과가 반영되는 문제를 수정했다. 공통 SearchInput이 조합 중에도 현재 입력을 검색에 전달하며, 조합 초안 유지·Enter 선택/submit 차단은 유지한다. 조합 종료 없이 포커스를 유지한 `배터리` 입력으로 `BATTERY COVER`를 찾는 회귀 등 3개 RED 확인 후 공통 입력·불량 입력·직원 선택 24개 GREEN, 관련 ESLint·diff 검사 통과. 실제 OS IME 브라우저 입력은 별도 관찰하지 않았으며 자동 회귀는 composition 이벤트로 검증했다.
- 최신 UI 요청: 상단 목적·적용 범위 두 문장, `검색어 연결하기` 제목, `서로 다른 표현을 두 개 이상 입력해 주세요.` 안내를 PC·모바일 공통 편집기에서 제거했다. 위 최초 구현의 설명 문구 제공 기록은 당시 상태이며 현재는 이 요청으로 대체한다. 입력 라벨·placeholder·미리보기·유효성 검사·오류 안내는 유지한다. 관리 테스트 13개 및 관련 ESLint·diff 검사 통과.
- 후속 크기·정렬 요청: 새 연결 카드는 기본 두 입력칸 높이 298px로 고정하고 추가 표현·미리보기는 카드 안에서 스크롤한다. 연결 저장 버튼은 카드 하단에 유지한다. 검색어 연결 PC 패널 제목은 닫기 버튼과 세로 중앙 정렬하며 다른 패널의 기본 정렬은 유지한다. 관리·공통 패널 테스트 20개, 관련 ESLint·전체 TypeScript·diff 검사 통과.
- 후속 스크롤 요청: 입력 카드와 등록된 연결 제목을 상단에 유지하고 등록된 연결 목록만 남은 높이 안에서 스크롤하도록 분리했다. 모바일 시트도 같은 구조로 높이를 제한하고, 내부 터치 스크롤을 시트 닫기 드래그와 분리했다. 관련 관리·PC·모바일 대시보드 총 30개 테스트와 ESLint·diff 검사 통과(관리 14개는 터치 처리 보강 후 재검증).
- 새 격리 QA `synonym-fixed-list-20261015-a`에서 PC·모바일 목록 스크롤 전후 입력 카드 y좌표·298px 높이 동일성을 실제 측정했다. 목록 scrollTop은 각각 463px/428px로 이동하고 바깥 패널은 scrollTop 0을 유지했다. `_attic/runtime/item-search-preview/fixed-list-desktop.png`, `fixed-list-mobile.png` 보존. 브라우저 증거 이후 추가한 모바일 touchStart 전파 차단은 자동 터치 회귀로 검증했다. QA 연결 6개 해제·소유 QA 프로세스 종료·뷰포트 복원 완료, 사용자 3032 미리보기는 유지한다.
- 사용자 취소·롤백: 바로 위 목록 분리 스크롤 변경과 관련 모바일 높이·터치 처리 및 전용 테스트를 모두 되돌렸다. 두 항목은 취소된 변경의 검증 이력이다. 현재는 입력 카드와 연결 목록이 기존처럼 함께 스크롤되며, 이전에 승인된 카드 높이 298px 고정·카드 내부 스크롤·제목 중앙 정렬은 유지한다. 관리 테스트 13개·관련 ESLint·diff 검사 통과.

## 2026-10-15 검색 기능 전체 점검 — 완료

사용자 요청에 따라 활성 화면의 import/render 경로와 검색 함수를 대조하고, 검색 계약·관련 화면·초안 보존 테스트를 실행했다. 세 갈래 읽기 전용 리뷰(활성 화면 적용, 서버 계약, 입력·실시간 상태)를 부모가 통합했다. 이번 점검은 코드와 자동 테스트 기준이며 모든 화면의 실제 브라우저 재시연을 뜻하지 않는다.

| 활성 영역 | 확인한 검색 연결 | 근거(프론트 경로는 frontend/app/mes/_components/ 기준) |
|---|---|---|
| 대시보드 PC·모바일 | 공통 입력 + 이름·코드·별칭·동의어 | DesktopInventoryView.tsx:70,113 / mobile/screens/MobileDashboardScreen.tsx:79,116 |
| 입출고·품목 전환 | 공통 입력 + 같은 검색 설정 | _warehouse_v2/IoTargetPicker.tsx:330,368,488 / ItemConversionView.tsx:124,152-153,583 |
| 불량·격리 품목 선택·B급/구형 | 공통 입력 + 품목 의미 검색, 사유·처리자는 literal | _defect_hub/DefectHubPanel.tsx:132,263,567 / DefectItemPicker.tsx:98,123,199 / DefectStorageView.tsx:85,112 |
| 출하·추가 품목·출하 이력 | 공통 입력 + 품목 검색, 서버 이력·설정 버전 연결 | DesktopShippingView.tsx:209-212,2797-2800,3686-3690 / mobile/shipping/MobileShippingRequestWizard.tsx:323-325,426,434 / frontend/lib/queries/useShippingQuery.ts:64,66 |
| 입출고 이력 | 공통 입력 + 서버 검색·스냅샷·설정 버전 연결 | _history_sections/HistoryFilterBar.tsx:57 / _hooks/useHistoryGroups.ts:64,78,169 / _history_hooks/useHistoryDerivations.ts:84,118-119 |
| 관리자 품목·BOM | 공통 입력 + 이름·코드·별칭·동의어 | _admin_hooks/useAdminMasterItemsList.ts:34,41 / _admin_sections/_admin_primitives/AdminListPanel.tsx:86 / _admin_sections/_bom_workbench/BomParentList.tsx:59,89,107 / BomChildAddBox.tsx:39,81,129 |
| 창고 지도·박스/칸 | 목록·강조 표시·품목 선택에 같은 검색 설정 | DesktopWarehouseMapView.tsx:248,601,825 / mobile/screens/MobileWarehouseMapScreen.tsx:120,138,229 / _warehouse_map_sections/AddBoxScreen.tsx:57,87,268 / JariColumn.tsx:44,69 / WarehouseJariPanel.tsx:40,167 |
| 전수조사·모바일 재작업 | 공통 입력 + 서버/로컬 검색 설정, 계수 초안 보존 | stocktake/StocktakeView.tsx:113,166-171,433,460-469 / mobile/rework/MobileReworkWorkspace.tsx:44,54,96 / mobileReworkModel.ts:110 |

- 적용 누락: 현재 사용되는 위 화면에서 공통 입력 또는 품목 설정 연결 누락을 확인하지 못했다. 직원 로그인·관리자 직원·부서·업체·불량 사유명 검색도 공통 입력을 쓰지만 품목 동의어는 적용하지 않는 것이 정상이다. 직원 초성·한영 변환·키보드 선택은 유지한다. 주간보고·일일 작업 일보에는 별도 텍스트 검색창이 없음을 읽기 전용 확인했다.
- 미사용 구분: AddRDirectModal/AddQuarantineModal의 raw 검색 입력과 config 없는 예전 matchesSearch helper는 남아 있으나 현재 import/render·호출 사용처가 없다. 활성 누락으로 분류하거나 이번에 정리하지 않았다. 관리자 globalSearch 서버 필터 역시 실제 shell이 빈 문자열을 전달하므로 현재의 이중 검색 누락은 아니다.
- 수정한 결함: frontend/lib/queries/realtime.tsx에서 검색 설정 GET 실패를 삼키고 revision을 이미 반영한 것으로 확정하여, 같은 revision에서는 이전 동의어를 계속 쓰던 경로를 RED로 재현했다. 이제 설정 조회 성공 후에만 결과를 갱신하고 revision을 확정하며, 실패 시 최신 대기 revision을 보존하고 1초부터 최대 30초 간격으로 재시도한다. 일반 void 호출에 새 미처리 rejection을 만들지 않도록 성공 여부를 반환한다. 부모 검증 후 별도 읽기 전용 재리뷰에서 추가 회귀를 발견하지 못했다.
- 테스트 기대값 갱신: 입출고·불량 품목 선택·B급/구형의 3개 테스트가 과거의 조합 종료 후 검색을 기대해 실패했다. 사용자 승인된 조합 중 즉시 검색에 맞춰 고쳤다. 제품 코드를 이전 동작으로 되돌리지 않았다.
- 현재 검증: 중복 제외 프론트 23 suite의 575개 사례, 백엔드 검색 관련 5파일 47개 사례 통과. 최초 코어 212개 + 화면별 362개 중 기대값 실패 3개는 관련 29개 재검증으로 해소, 실시간 복구 신규 1개를 포함한 최종 실시간/설정 검증 23개로 보강했다. SQL·메모리·프론트 공유 예제, 권한·중복·감사·동시 수정·커서·내보내기·출하/실사 초안 보존 포함. 변경 파일 ESLint, 전체 TypeScript, diff 검사 통과.
- 증거: `_attic/runtime/item-search-preview/audit-core.log`, `audit-backend.log`, `audit-surfaces.log`(초기 3개 기대값 실패 포함), `audit-realtime-red.log`, `audit-realtime-green.log`, `audit-fixes.log`(최종 52개 통과), `audit-types.log`(exit 0). 적용 범위가 그대로인 기존 통과 결과는 재사용했다. 전체 CI/빌드나 모든 브라우저 화면 통과로 확대 해석하지 않는다.
- 남은 환경 한계: 현재 SQLite는 명시 BEGIN으로 검색 설정과 결과가 동일 트랜잭션 스냅샷을 따른다. PostgreSQL 기본 READ COMMITTED에서는 backend/app/services/item_search.py:84-90의 여러 SELECT 사이에 동시 수정이 끼면 그룹 버전·단어·별칭을 서로 다른 시점으로 읽을 수 있고, backend/app/routers/shipping.py:715,743의 설정 버전과 별칭 결과 시점도 달라질 여지가 있다. 코드상 실행 순서로 확인한 PostgreSQL 한정 위험이며 실행 재현은 하지 않았다. 현재 SQLite 실행에는 해당하지 않으며, PostgreSQL 전환 시 같은 읽기 스냅샷 보장 및 별도 동시성 검증이 필요하다. 이번에는 공통 DB 세션 정책을 넓게 변경하지 않았다.
- 작업은 격리 워크트리에서만 수행했다. 실제 DB 내용·직원 서버 동기화·브랜치·커밋·푸시·배포는 변경하지 않았다. 사용자 확인용 3032/8032 미리보기는 유지한다.

## 2026-10-15 PC·모바일 주요 탭 실제 검색 — 완료

- 새 격리 QA `search-all-tabs-20261015-a`(8033/3033)에서 QA-ADMIN으로 로그인해 검증했다. 68개 명시 overlay SHA256이 현재 소스와 모두 일치한다. 합성 품목·격리 기록은 QA DB에만 준비했고, 동의어 `배터리 ↔ battery`와 품목별 별칭 `현장커버`는 대시보드 UI에서 실제 등록했다.
- PC·모바일 각각 입출고(창고→부서 품목 선택), 불량(격리 목록), 출하(기준 PF 선택)에 동의어와 별칭을 직접 입력해 양성 품목 표시·대조 Motor 품목 제외를 확인했다. 별칭 미등록 AF 품목이 별칭 검색에서 제외되는 것도 확인했다.
- PC 관리자 품목 관리와 BOM 하위 품목 추가 검색에서도 두 검색어가 모두 적용됐다. BOM 상위는 동의어만 실제 확인했다. 모바일 관리자는 원래 제공하지 않는 탭(MobileShell.tsx:56)이므로 통과로 표시하지 않았다.
- 총 17개 실제 검색 조건 PASS(8개 검색 UI의 동의어·별칭 16개 + BOM 상위 동의어 1개). 스크린샷 16장, 등록 감사 ID 3개와 전체 결과는 `_attic/runtime/mes-browser-regression/search-all-tabs-20261015-a/results.md`, `search-evidence.json`, `session.json`에 보존했다. 물리 기기/OS IME와 관찰하지 않은 하위 업무 흐름까지 PASS로 확대하지 않는다.
- 사용자 3032 미리보기와 직원 서버는 변경하지 않았다. 브라우저 viewport 복원 및 소유 QA 서버 종료 완료. 제품 코드·커밋·푸시·배포 변경 없음.

## 2026-10-15 main 통합·푸시·워크트리 정리 — 완료

사용자 승인 범위는 main 통합·커밋·푸시·워크트리 아카이브다. 직원 서버 직접 배포는 제외하고 기존 2026-10-16 04:00 KST 예약 동기화는 유지한다.

- 통합 체크리스트: 완료 4 / 진행 0 / 대기 0 / 합계 4.
- [x] 1. 실행 상태 재확인·보존. main은 별도 불량 UI 작업이 이미 커밋된 `2ade4e71`이며 origin/main과 동일하다. 미커밋 `frontend/next-env.d.ts`만 보존한다. 검색 소스 116개·미리보기 DB와 검증 자료 115개를 `C:/ERP/_attic/runtime/item-search-integration-20261015/`에 백업하고 해시 동일성을 확인했다. 검색 3032/8032만 소유 확인 후 종료했다.
- [x] 2. 검색 파일만 명시적으로 커밋하고 최신 main `2ade4e71` 위에 재배치했다. 불량 UI의 최신 디자인·필터·입력 계약과 전수조사 대기·최근 결과 동작을 검색·초안 보존과 함께 유지했다. 통합 서버로 재생성한 OpenAPI 기준은 커밋 내용과 동일하다. 최종 검색 커밋은 `ad15baf51d5873b45434a7c45a3b114e8cd3e334`이다.
- [x] 3. 직접 관련 프론트 15 suite 343개, 백엔드 78개 통과·PostgreSQL 환경 미설정 1개 제외, 변경 파일 ESLint·전체 TypeScript·diff 검사를 통과했다. 영향이 없는 이전 검색 계약·출하 초안 검증은 재사용했다. 새 격리 QA `search-main-integration-20261015-a`에서 PC·모바일 입출고·불량·출하, PC 관리자 품목·BOM의 동의어·별칭 검색 17개 조건을 다시 확인했다. 모바일 관리자와 물리 기기/OS IME는 검증 대상으로 확대하지 않았다.
- [x] 4. 개발 3001/8011 정지·DB 온라인 백업 후 `bootstrap_db.py --all`로 0046을 적용했다. 적용 전후 기존 업무 테이블 83개의 행 수·해시가 동일하고 검색 설정 테이블 3개는 비어 있음을 확인했다. 정식 스크립트 재기동 후 3001 페이지·프록시 API와 8011 readiness를 확인했다. 원래 next-env 파일은 SHA256 `b768474915d20d183c03db2fecb5892e7ebd97db6de4b7cb79ae02ec388d2703`로 복원했다. 검색 커밋만 origin/main에 일반 푸시했고 Codex 첨부가 `archived_worktree`로 전환된 것을 확인했다.

- 마지막 단계에서 다른 작업이 불량 화면·셸·관련 테스트·계획 파일을 새로 수정했다. 해당 미커밋 변경은 `live-unrelated-final-files/`와 해시 목록으로 추가 백업하고 편집·스테이징·커밋하지 않았다. 이번 통합의 검사 결과는 검증한 검색 커밋을 기준으로 하며 이후 다른 작업의 변경까지 통과로 보고하지 않는다.
- 증거: 위 백업 폴더의 `frontend-tests.log`, `backend-tests.log`, `lint.log`, `types.log`, `main-migration.log`, `main-before-apply-tables.json`, `final-health.json`, `qa-final/`, PC·모바일 화면 캡처. 미리보기·QA DB는 무결성을 확인해 따로 보관했으며 개발 DB로 옮기지 않았다. 검색·QA 프로세스만 종료했고 직원 서버와 기존 2026-10-16 04:00 KST 예약은 변경하지 않았다.
