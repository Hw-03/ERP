# 📁 e2e

## 이 폴더는 뭐예요?
Playwright 기반 e2e(엔드투엔드) 테스트 파일 모음입니다. 실 DB를 건드리지 않도록 전용 DB(`mes_e2e.db`)와 전용 백엔드(포트 8021)를 사용하며, 입출고 V2 wizard·결재 풀사이클·불량 처리 등 핵심 업무 시나리오를 브라우저 수준에서 검증합니다.

## 언제 여기를 보나요?
- e2e 테스트가 CI에서 실패했을 때 원인 파악
- 새 입출고·결재·불량 기능을 추가한 뒤 e2e spec을 작성하거나 기존 spec을 확인할 때
- 테스트 격리 구조(전용 DB·포트·시드)를 이해하거나 변경할 때

## 주요 파일
- `global-setup.ts` — 전용 DB 초기화·백엔드 기동·데이터 시드 (모든 spec 실행 전 1회)
- `global-teardown.ts` — 백엔드 종료·DB 삭제·실 DB 불변 검증 (모든 spec 실행 후 1회)
- `_helpers.ts` — 로그인 우회(`loginAsOperator`), 화면 진입, 시드 읽기 공용 유틸
- `io-receive.spec.ts` — 원자재 입고 wizard → 부서 결재 요청
- `io-warehouse-to-dept.spec.ts` — 창고→부서 wizard → 창고 결재 요청
- `io-dept-to-warehouse.spec.ts` — 부서→창고 회수 wizard → 창고 결재 요청
- `io-approval-cycle.spec.ts` — 결재 풀사이클 (2-세션: 제출 → PIN 승인 → 큐 소멸)
- `io-process-produce.spec.ts` — 생산 BOM 자동 전개 → 즉시 반영
- `io-defect.spec.ts` — 불량 격리 → 정상 복귀
- `io-history-labels.spec.ts` — 라벨 일관성 회귀 검증 (폐기 용어 노출 여부)

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/playwright.config.ts]] — globalSetup/globalTeardown 등록, webServer 설정
- [[ERP/backend/bootstrap_db.py]] — 전용 DB 초기화에 사용
