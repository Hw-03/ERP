# 창고 정상 복귀 위치 수정

기준: main `838e1329`. 개발 적용 이후 사용자가 직원 DB의 기존 1개 정정과 오늘 수정분의 직원 배포·직원→개발 데이터 동기화를 추가 승인했다.

## 현황

- 개발 적용·검증 완료: 3 / 3
- 직원 정정·동기화 완료: 3 / 3
- 이번 승인 범위의 미완료: 없음
- 커밋·푸시: 2026-10-16 사용자 추가 승인. 이번 코드·회귀 테스트·이 기록만 현재 main의 origin에 반영하며, 실제 커밋 해시와 원격 반영 결과는 Git 기록으로 확인한다.

## 완료 (2026-10-16)

- [x] 병합 후보 `5927e532`의 `inv_defective.unmark_defective` 위치 수정만 개발 코드에 적용. 창고는 `Inventory.warehouse_qty`로, 생산 공정은 기존 `InventoryLocation.PRODUCTION`으로 복귀한다. 다른 후보 변경은 포함하지 않았다.
- [x] 수정 전 API 검사에서 창고 정상재고 대신 별도 창고 PRODUCTION 위치가 생기는 실패를 재현. 관련 4개 파일 164건 통과: 신규 위치 회귀, 기존 inv_defective·defect_actions·defect_flow. 신규 검사는 창고/출하 × 불량/B급/구형 × 부분/전량/일괄 복귀, 후속 사용, 거래 효과, 취소를 확인한다. 현재 main의 일괄 복귀 취소는 거래별 취소 계약을 유지한다.
- [x] 개발 DB 온라인 백업 후 개발 백엔드만 정상 재시작. 개발 브라우저에서 `7-PR-0095`의 기존 격리 1개 정상 복귀 수행. 창고 100→101, 출하 189 유지, 격리 1→0, 총량 290 유지. 별도 창고 PRODUCTION 행 없음. 다른 품목의 inventory·inventory_locations 전체 행은 백업과 동일. readiness의 DB·schema·inventory·ledger 통과.

## 근거 (로컬 전용)

- `_attic/runtime/warehouse-restore-20261016/backup.json`: SQLite online backup, integrity/FK 검사, SHA256.
- 같은 폴더 `code-verification.json`: 후보와 서비스 코드 동일, 수정 전 실패 및 관련 검사 기록.
- 같은 폴더 `development-restored.json`, `development-restored.png`: 개발 DB 결과·거래 ID·화면. 실제 자료는 커밋하지 않는다.

## 직원 정정·동기화 (2026-10-16 추가 승인)

- [x] 직원 DB 온라인 백업의 스키마·SQLite·외래키 검사 통과. 기존 UNMARK_DEFECTIVE를 정식 작업 취소 서비스로 역전한 뒤 수정된 복귀 서비스로 1개 재복귀를 한 outer 트랜잭션에서 원자 처리했다. 원래 거래·효과는 변경하지 않고 취소·새 복귀·감사 기록을 추가했다. 작업자는 직원 사칭 없이 `시스템 위치 정정`으로 기록했다. 창고 101, 출하 189, 격리 0, 잘못된 창고 PRODUCTION 0, 총량 290. 원래 거래 및 대상 재고·격리 원건 외 모든 기존 업무 행 보존을 커밋 전 검사했다. 실시간 revision 증가도 확인했다.
- [x] 백업에서 만든 복제본 2개로 취소 직후 고의 실패 전체 rollback, 정상 정정, 새 복귀의 취소(창고 100·격리 1), 원로그 불변, 모든 테이블 기존 행 보존을 확인했다. 중복 실행과 개발 DB 오지정도 쓰기 전에 거부했다. 실사·예약·주간 경계·LEGACY 모드 가드를 유지했다.
- [x] 표준 전체 동기화 1회 완료. 코드 내용 차이는 오늘 권한 수정과 창고 복귀 수정 8개 파일이며 나머지 비교 차이는 줄바꿈이다. production 빌드·번들 검사, 직원 사전검증·배포·재기동, 직원→개발 데이터 사전검증·반영·재기동 통과. 전체/코드/데이터 exit 0, `COMPLETED`, `SYNC_DATA_RESULT=APPLIED`, 임시 준비 캐시 정리 `COMPLETED`. 실행 영수증: `_attic/runtime/scheduled-sync/20261016-130729-142d746a03554979beaf3ef6dd63e64f/receipt.json`. 직원·개발 DB에 동일한 새 정정 거래와 창고 101·출하 189·격리 0·총량 290 확인. 8개 제품 파일 내용 일치, 직원·개발 backend live/ready 및 frontend 6개 HTTP 주소 200. 두 환경의 관리 프로세스·런타임 작업·스키마 확인 완료. 사전·사후 재고/원장 검사는 blocking=0, warning=0. 사용자 승인된 표준 래퍼의 최근 활동 가드 예외는 영수증의 코드 로그에 기록되어 있다.

직원 정정 근거는 `_attic/runtime/warehouse-restore-employee-20261016/`의 검증된 원형 백업·`clone-rollback.json`·`clone-repaired.json`·`safety-checks.json`·`employee-repaired.json`에 보존했다. 실제 DB·직원 원문 자료는 커밋하지 않는다.

추가 근거: 같은 폴더의 `employee-history-check.json`은 원 거래 `cancelled` / 역전 거래 `cancellation` / 새 복귀 `active`와 새 복귀 취소 허용을 확인한다. `sync-final-verification.json`은 종료 영수증·양쪽 DB·제품 파일·HTTP 결과를 연결한다.

관찰 한계: 상태 도구의 직원 readiness 3초 제한 조회는 한 번 False였다. 직접 확인에서는 직원 2.938초·개발 2.609초로 모두 HTTP 200, DB/schema/inventory/ledger ready였다(`readiness-confirmation.json`). 해당 조회 경로나 timeout 설정은 변경하지 않았으며 상태 도구 전체 무오류로 확대 보고하지 않는다.
