# DEXCOWIN MES 직원 동기화 완료

**현재 판정: 실제 예약 동기화 완료.** 2026-09-16 KST에 승인된 접속자 가드 예외로 예약 단일 진입점을 실행했다. 직원 코드는 최신 상태, 직원·개발 DB는 `20260915_0034`, 코드 단계와 직원→개발 데이터 단계는 모두 exit 0이며 최종 receipt는 `COMPLETED`다.

## 원인과 수정

- `20260915_0034_as_research_approval.py`가 SQLite에서 `stock_requests`를 batch 재생성할 때 실제 직원 legacy FK의 `CASCADE`/`SET NULL` 동작으로 `stock_request_lines`, `io_batches.stock_request_id`, `notifications.related_request_id`가 유실됐다.
- 마이그레이션 직전 SQLite TEMP TABLE에 세 자식 데이터 묶음을 보존하고 신규 FK 생성 직후 원상 복원한 다음 임시 테이블을 제거한다.
- 비-SQLite 경로는 기존 FK 생성 흐름을 유지한다.
- 회귀 테스트는 실제 `ensure_schema()`와 `PRAGMA foreign_keys=ON`을 사용해 요청 라인 전체 열, 두 참조 값, 신규 FK 정의와 전체 FK 무결성을 검증한다.

## 완료 확인

- [x] RED 재현: 기존 코드에서 요청 라인이 사라져 테스트 실패.
- [x] GREEN: `test_as_research_approval.py` 2건 통과, Ruff 통과.
- [x] 관련 경계: AS·연구 마이그레이션, 직원 사전검증, schema state, Alembic foundation 묶음 exit 0. PostgreSQL 전용 1건은 환경 미설정으로 기존 skip이며 새 실패는 없다.
- [x] 최신 직원 DB 격리 사전검증 exit 0: schema `20260915_0034`, SQLite/FK PASS, 재고·예약·출하·불량·원장 blocking 0, 기존 v1 경고 645건 유지, data contract PASS, 활성화용 전체 백업 검증과 dry-run PASS.
- [x] 실제 직원 환경 보존 확인: 직원 원본 schema는 `20260910_0033`, SQLite integrity `ok`, FK 위반 0, `stock_request_lines` 2,120건. 8010 readiness와 3000 `/mes` 모두 HTTP 200.
- [x] 독립 코드 리뷰: Critical 0. 신규 FK 직접 검증과 요청 라인 전체 열 비교 지적을 반영했다. 실제 직원 legacy의 `io_batches.stock_request_id → stock_requests.request_id ON DELETE SET NULL`도 원본과 검증 복사본에서 직접 확인했다.
- [x] 실제 코드 동기화: 승인된 `anonymous / unknown` 활동 가드 예외 아래 직원 DB 백업, 마이그레이션, 사후 정합성 검증, 직원 8010/3000 재기동까지 성공했다.
- [x] 예약 wrapper 결함 수정: 코드 exit 0 뒤 Windows가 `receipt.json`을 잠깐 잠가 `File.Replace`가 실패한 경우 5초 한도로 재시도한다. 재현 테스트는 수정 전 실패, 수정 후 통과했다.
- [x] 불필요한 재배포 차단: `backend/tests`와 `frontend/tests` 변경을 직원 운영 코드 변경 감지에서 제외해 테스트 파일만 달라졌을 때 직원 서버를 내리지 않는다.
- [x] 최종 예약 단일 진입점: 코드 `COMPLETED / exit 0 / NO_CHANGES`, 데이터 `COMPLETED / exit 0 / SYNC_DATA_RESULT=APPLIED`, 전체 `COMPLETED / exit 0`.
- [x] 최종 독립 확인: 직원 8010 readiness·3000 `/mes`, 개발 8011 readiness·3001 `/mes` 모두 HTTP 200. 양쪽 DB 모두 revision `20260915_0034`, SQLite integrity `ok`, FK 위반 0, `stock_request_lines` 2,120건.

완료 11 / 진행 0.

## 증거와 다음 조건

- 최종 격리 스냅샷: `C:\ERP\_attic\runtime\sync-preparation-ready-final-20260916\preflight\mes_preflight_20260916_150844_9f9d85e8048a4e708ed6adb53718a0da.db`
- 활성화용 검증 백업: `C:\ERP\_attic\runtime\sync-preparation-ready-final-20260916\backups\sqlite\mes-before-employee-activation-preflight-20260916-150922-e5d694e5.db`
- 구현 계획: `docs/superpowers/plans/2026-09-16-employee-sync-preflight-preservation.md`
- 직원 코드 전환 receipt: `C:\ERP\_attic\runtime\scheduled-sync\20260916-152549-893d769818b24f64a43ae593a490720e\receipt.json` (코드 child exit 0, wrapper receipt 교체 오류로 데이터 미실행)
- 직원 코드 전환 전 DB 백업: `C:\ERP-dev\_attic\runtime\backups\sqlite\mes_20260916_153929_776403_d0179e9f9dd447d298606bd41c1feea0.db`
- 직원 활성화 전 DB 백업: `C:\ERP-dev\_attic\runtime\backups\sqlite\mes-before-inventory-operation-activation-20260916-155709-1736da8b.db`
- 프런트 릴리스 복구 journal: `C:\ERP-dev\_attic\runtime\frontend-releases\1bd829e5bf2244dbaf7c3ece87feacd0\journal.json` (`CONFIRMED`)
- 테스트 파일 오탐 확인 후 서비스 정지 전에 수동 중단한 receipt: `C:\ERP\_attic\runtime\scheduled-sync\20260916-160306-52877332624d41b5a37e7e8fc0ec2dc4\receipt.json`; 직원 8010/3000은 중단되지 않았다.
- 최종 성공 receipt: `C:\ERP\_attic\runtime\scheduled-sync\20260916-160829-b5bec45d24ad41299b20e54ee37a38ab\receipt.json`
- 직원 데이터 온라인 스냅샷: `C:\ERP\_attic\runtime\employee-data-sync\backups\sqlite\mes_20260916_160845_100262_73b7b2c2417c4058a7f688ba1728f90d.db`
- 개발 DB 교체 직전 롤백 백업: `C:\ERP\_attic\runtime\backups\sqlite\mes_20260916_161006_762955_90203793dd0c4ed3b109dd679ccf7586.db`
- 다음 예약 실행도 같은 단일 진입점을 사용한다. 접속자 가드 예외가 없으면 기존 가드 판정을 그대로 따른다.
- commit/push는 수행하지 않았다. 기존 작업 트리 변경은 보존했다.
