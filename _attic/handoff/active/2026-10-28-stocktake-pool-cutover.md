# 전수조사 재고 전환 실행 기록

사용자 승인에 따라 2026-10-28 개발 환경 `C:\ERP`의 기존 재고 기록을 전수조사용 공동재고에 연결했다. 전환 이력 담당자는 사용자가 선택한 김건호 부결재자다. 직원 환경 `C:\ERP-dev`에는 적용하지 않았다.

- [x] 최신 원본 백업과 읽기 전용 사전검사.
- [x] 외부 사본 전환 후 기존 모든 테이블의 행 보존 검사. 기존 재고·예약·작업·이력은 보존하고 전환 연결 정보와 기록만 추가했다.
- [x] 별도 검증용 사본에서 시작 대상 확인과 실제 조사 회차 시작 성공. 이 테스트 사본은 실제 설치에서 제외했다.
- [x] 원본 백업과 현재 DB의 동일성을 확인한 후 기존 restore 도구로 설치. 설치 후 보존 검사와 재고 무결성 검사 통과.
- [x] 개발 서버 정상화 및 실제 DB에서 관리자 PIN 검증 후 김건호 명의로 시작 대상 확인 명령 성공. 준비 정보만 저장했으며 실제 회차는 생성하지 않았다.
- [x] 사용자 로그인 후 김건호 계정의 실제 화면에서 `새 회차 시작 → 시작 대상 확인 → 회차 시작 검토` 성공. 회차 시작 버튼은 누르지 않았다. 화면 증빙은 `browser-start-preview.png`, 최종 재고·예약 보존 및 실제 회차 미생성 증빙은 `completion-audit.json`이다.

김건호 계정의 전수조사 메뉴 표시가 꺼져 있어 진입 시 대시보드로 돌아가는 상태였다. 실제로 전수조사에 접근할 수 있도록 관리자 화면에서 해당 계정의 재고 전수조사 메뉴 표시만 켜고 저장했다. 다른 직원·메뉴의 표시와 결재 권한은 변경하지 않았다. PIN은 변경하지 않았다.

실제 DB의 `stocktake_control.inventory_mode=POOL`, `active_round_id=NULL`을 확인했다. 실제 조사 회차는 생성하지 않았다. 과거 증빙 경고는 원기록과 함께 보존했으며 추정 이력은 추가하지 않았다.

전환 ID: `936143d5-5383-4d67-bf7f-d9eb0d950bb5`.

증빙은 `_attic/runtime/stocktake-cutover-20261028/`의 `preflight.json`, `receipt.json`, `preservation.json`, `clone-workflow.json`, `installed-preservation.json`, `paths.json`에 보관한다. 백업 경로는 `paths.json`을 기준으로 확인한다. 이후 직원 데이터 동기화로 개발 DB를 교체하면 이 전환 상태도 교체될 수 있으므로, 재개 시 실제 DB를 다시 확인해야 한다.

검증 명령: `.venv/Scripts/python.exe -m pytest tests/services/test_pool_cutover.py tests/services/test_pool_cutover_cli.py -q -o addopts=` (backend 디렉터리에서 실행, 통과). 실제 DB의 시작 준비 성공 증빙은 `_attic/runtime/stocktake-cutover-20261028/live-start-preview.json`이다.
