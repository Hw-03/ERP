# 예약 접속자 가드 승인 우회 구현 계획

**GOAL:** 예약 동기화가 최근 활동을 승인 우회하되 접속 증적을 보고하도록 스킬·래퍼·예약을 갱신하고 검증한다

**Goal:** 예약 동기화가 최근 활동 때문에 중단되지 않고, 감지한 활동의 최소 증적을 결과에 남긴다.

**Architecture:** `auto-sync-to-employee.ps1`만 `-Force`를 전달하도록 제한해 수동 실행의 기본 가드는 보존한다. 래퍼는 실제 동기화 전에 활동 로그의 마지막 사용자 이벤트를 기계 판독 가능한 한 줄로 내보내며, 스키마 변경은 기존 `-AutoSchema` 사전검증 경로를 유지한다.

## 작업

1. `backend/tests/ops/test_employee_sync_safety.py`에 예약 래퍼가 dry-run·실반영·`-AutoSchema`에 `-Force`를 전달하고 활동 증적 결과를 출력하는 실패 테스트를 추가한다.
2. `scripts/dev/auto-sync-to-employee.ps1`에 예약 전용 활동 증적 추출과 `-Force` 전달을 최소 구현한다. `SYNC_CHANGES=0`도 활동 증적을 남기되 서버 재기동은 하지 않는다.
3. `C:\Users\user\.agents\skills\deploy-to-employee\SKILL.md`를 갱신해 예약의 명시 승인 정책, 익명 이벤트 보고 형식, 유지되는 금지 사항을 명시한다. 기존 스킬의 압박 시나리오와 갱신 뒤 준수 시나리오를 비교한다.
4. 예약 프롬프트를 갱신해 래퍼 단 한 번 호출, 활동 증적 보고, 코드 성공 뒤 데이터 반영 규칙을 일치시킨다.
5. 관련 pytest와 PowerShell 구문 검사를 실행하고, 현재 예약을 한 번 조회해 최종 프롬프트를 검증한다.
