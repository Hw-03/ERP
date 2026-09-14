# 금요일 기준 복원 및 직원 환경 전환 완료

완료 확인: **2026-09-14 18:50:56 KST**. 직원 접속 주소는 `http://192.168.0.63:3000/mes`이다.

직원 배포 journal이 `CONFIRMED`이고, 공개 기동 명령은 종료 코드 0 및 `FRIDAY_ACTIVATION_RESULT=CONFIRMED`를 반환했다. 이어 실제 backend live, readiness 200, 공개 MES 200, 직접·프록시 boot ID 일치를 확인했다. 직원 DB의 실제 Alembic revision은 `20260910_0033`이다.

## 코드 보존과 복원

| 항목 | 결과 |
| --- | --- |
| 금요일 기준 | `76a564166d48b839131a4d2c99cd965da236457b` — 2026-09-11 09:41 KST |
| 품질·오늘 작업 보존 | `codex/quality-preserved-20260914`, `60e045b3c465fa07c23173920570784ad337e0a0`, 일반 push 및 원격 일치 확인 |
| 보존 워크트리 | `C:/ERP/.worktrees/quality-preserved-20260914` — 미검증 작업도 포함한 보존본 |
| 복원 브랜치·워크트리 | `codex/rollback-pre-quality-20260914`, `C:/ERP/.worktrees/rollback-pre-quality-20260914` — 유지 |
| 복원 커밋 | `0aacf11a85ecee327f42821d7d56ea6c8e46df71` |
| 최종 배포 코드 | `b2ab4f95c6d7465cf554e5c0737a73d34a67aee3` — 복구 동시성 및 기동 대기 보강 포함, main 일반 push 확인 |
| 추가 보존 | main의 기존 변경 108개 경로와 보존본의 해시 차이 0 확인, stash `a2fbfbb93035a76153dead4e1646b4d1fd3c3717` 유지 |

main 이력을 강제로 되감거나 강제 push하지 않았다. 배포에는 main과 같은 Git 내용인 검증 워크트리의 실제 바이트를 사용했다. main checkout의 CRLF 차이 때문에 준비 receipt를 고치거나 검증을 우회하지 않았다.

## 데이터와 복구 자료

오늘 업무 행, 정상 거래, 취소·복구 결과를 담은 원본에서 실제 Friday 스키마 후보를 생성했다. 과거 금요일 업무 데이터로 덮어쓰거나 복구 거래를 재실행하지 않았다. 격리 화면에서 만든 검증용 요청은 직원 DB에 넣지 않았다.

최종 admission의 공통 업무 테이블 비교 및 원장 표현 변환 결과는 원본·후보 projection SHA256이 모두 `cb991baf0f96ebb829e0a3f209507c2485228969c4c645fb6a99521cc1e265af`로 일치한다. 현재 업무 데이터의 표현을 Friday 구조로 옮겼으며, 현대 스키마 전용 세션·추가 메타데이터는 원본 FULL 백업에 보존했다. 모든 SQL 필드가 운영 DB에서 바이트 단위로 동일하다는 의미는 아니다.

- 최신 원본 FULL 백업: `C:/ERP-dev/_attic/runtime/backups/sqlite/mes-before-before-friday-cutover-after-recovery-20260914-20260914-183814-7d8f2765.db`
- 원본 SHA256: `dc97df4e568b587a04f20932aaf6fbb05f59a74e1fa005a137b7716343a96caf` — 최초 최종 백업과 동일한 바이트. 복귀 이후의 최신 파일 세대 증거로 다시 검증했다.
- 설치한 Friday FULL 후보: `C:/ERP-dev/_attic/runtime/backups/sqlite/mes-before-friday-candidate-20260914-20260914-162342-16580d73.db`
- 후보 SHA256: `e1e502c484865b665aece15d5d0fa28764f917b6c4246d186b85686b246c6ac0`
- 직전 직원 코드·프런트엔드·설정 복구 기록: `C:/ERP-dev/_attic/runtime/frontend-releases/dac2579d5dfb4e7f88dd7883a2850582/journal.json`
- 최종 기동 전 로그 백업: `C:/ERP/_attic/runtime/rollback-pre-quality-20260914/employee-final-prestart-logs-20260914` — 복사한 54개 파일의 원본·백업 해시 일치 확인.
- 초기 직원 코드·로그·비밀 설정과 Git bundle: `C:/ERP/_attic/runtime/rollback-pre-quality-20260914/preservation` — DB와 비밀 설정은 Git에 넣지 않았다.

최종 전환 증거는 `C:/ERP/_attic/runtime/rollback-pre-quality-20260914/employee-cutover-progress-02.json`, `employee-cutover-admission-02.json`에 있다. admission SHA256은 `99487c176dc0154c977b7b9995e49594043da54e86daba7b3392fefa03c4886c`이다.

## 금요일 대비 남긴 필수 수정

| 변경 | 이유 |
| --- | --- |
| Next 16.3.4 / React 19.2.8 / Node 20 및 필요한 타입 호환 | 사용자가 승인한 보안 수정 버전으로 금요일 화면 실행 |
| 원자재 권한, 작업 선택·복원 보호 | 권한 없는 진입과 잘못된 작업 자동 진행 방지 |
| URL 및 같은 탭 재선택의 작업 상태 보호 | 진행 중인 선택·작성 내용을 늦은 화면 상태가 덮어쓰지 않게 함 |
| 커스텀 BOM 양방향 처리 | 낱개 입고·출고 방향 및 승인 경로 유지, 중복 재고 반영 방지 |
| 예약 재고와 생산 가능량 계산 | 이미 예약한 재고를 다시 소비하지 않게 함 |
| 취소·재시도 검산 및 원장 해석 | 오늘 기록 해석과 실제 배정 위치의 예약 복원 유지 |
| 기존 PIN 해시 읽기 | 직원 PIN 일괄 초기화 없이 기존 계정 사용 |
| read-only readiness, FULL 검사·백업·변환·복구 도구 | DB 버전 위장 없이 실제 구조와 업무 정합성을 확인 |
| 외부 기동 대기 6회→90회 | 쓰기 차단 상태의 초기 기동 시간을 수용. readiness 200 요건과 실패 중단은 유지 |

품질개선 전체를 재병합하지 않았다. 상세 변경 경위는 [원래 실행 기록](2026-09-14-legacy-db-prototype.md)에 남겼다.

## 검증과 전환 경위

- 전체 backend 실행: 2,520 PASS / 56 SKIP / 실패·오류 0. PostgreSQL 환경 등 skip 조건은 해당 환경 검증 성공으로 해석하지 않는다.
- 전체 frontend: 276파일 / 2,607 PASS. E2E 19 PASS. production build·TypeScript·bundle 및 OpenAPI 일치 확인.
- 마지막 복구 동시성 회귀 26개, activation 관련 44개, 기동 대기 관련 Python 9개와 PowerShell 계약 검사 통과 및 독립 검토 승인.
- 처음 실패했던 smart gate를 성공으로 바꾸어 기록하지 않았다. 이후 영역별 전체 재검증과 마지막 좁은 변경의 직접 검증을 구분했다. 마지막 한 줄 기동 대기 변경 후 전체 장시간 게이트는 재실행하지 않았다.
- 격리 DB의 입출고·출하 및 기존 기록 조회 증거와 합성 업무 테스트는 확보했다. 다만 배포 후 완료 자료 대조에서 초기 직원 DB 복제본의 입고 취소·재시도, 부서 출고 승인·반려, 취소 후 새 요청 검사가 PIN 인증 403에서 중단된 것을 확인했다. 배포 전 모든 실제 복제본 업무 검사가 완료됐다는 의미로 해석하지 않는다.
- 2026-09-14 19:20 KST 보완 검증 완료: 최신 후보 `e1e502c4…`의 시나리오별 SQLite backup 복제본에서 위 4개와 기존 거래 취소까지 실제 API 커밋 검사 5/5 PASS, 종료 코드 0이다. 각 완료 복제본의 FULL 업무 무결성 15항목은 차단 오류 0이며 기존 V1 경고 645건은 그대로다. 진단 전후 DB·WAL 해시와 원본 후보 해시는 동일하다. 복제본의 지정 계정 PIN 해시만 테스트용으로 설정했고 실제 인증 함수는 우회하지 않았다. 직원의 실제 PIN을 알아내거나 운영 PIN을 변경한 검증이 아니다.
- 최종 증거: `C:/ERP/_attic/runtime/rollback-pre-quality-20260914/final-workflow-acceptance-01/final-report.json`, SHA256 `cce66d0830af7bc3d0b9ebf81fe234ff7314c90b9631532800461337285f1f6e`. 최초 `report.json`의 4 PASS / 1 PROBE_ERROR 기록은 보존했다. 마지막 오류는 정상 IoBatch 연결 상태를 가진 거래를 검증 스크립트가 제외한 문제였고, 해당 조건을 고친 별도 복제본에서 기존 원장 8행의 반대 수량·재고 8셀·취소 상태·중복 취소 차단을 확인했다. 운영 코드는 변경하지 않았다.
- 모바일 제출 후 별도 PC 세션의 자동 갱신, 새 로그인 세션의 새로고침 결과를 확인했다. 직원 DB에 검증 거래를 생성하지 않았다. 보완 검증 역시 직원 서비스나 직원 DB를 변경하지 않는다.
- 같은 데이터·부하의 비교에서 입출고 내역은 후보가 빨라졌으나 품목 조회 등 모든 경로가 일관되게 개선된 것은 아니다. 실제 직원 네트워크 부하 시험 결과로 과장하지 않는다.
- 최초 직원 기동은 짧은 readiness 대기로 두 번 실패했다. 쓰기를 재개하지 않고 실제 FULL 원본·직전 코드로 검증 복귀한 뒤, 대기 설정 한 줄을 검증·커밋·push하고 재배포했다. 최종 기동은 쓰기 차단 아래 데이터 비교와 HTTP 확인을 마친 후 `CONFIRMED`로 전환했다.

## 인계와 주의 사항

- 김종숙 주임의 미완료 9품목은 미완료로 인계한다. 임의 이동·완료 처리·재입력을 하지 않았다.
- 기존 원장의 알려진 V1 누락 경고는 보존했으며 자동 복구를 다시 실행하지 않았다.
- 직원 사용 재개 이후 신규 기록이 생겼다면 이 문서의 과거 백업으로 DB를 되덮지 않는다.
- 개발 서버 3001/8011은 중지 상태다. 개발 DB는 별도 데이터 동기화 없이 그대로 보존했으므로, 직원 환경의 전환 완료와 개발 DB 전환을 혼동하지 않는다.
