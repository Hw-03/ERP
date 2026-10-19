**추천 모델: GPT-6.1 Sol** — 기존 관측 도구를 재사용하고 두 실패의 경계를 보완한다.
**추천 추론 수준: Extra High** — 관측의 영향과 제품·자동화·실행 환경을 구분한다.
**실행 방식: 하위 에이전트 병렬 준비 + 부모 순차 실행** — BOM과 AS 도구를 분담하고 업무 실행·판정을 순차 처리한다.

# BOM·AS 실패 경계 직접 확인

**GOAL:** 정상 업무에서 BOM 값을 되돌린 상태 경로 또는 AS 연결 종료 주체를 포착하고, 재현된 결함만 최소 수정한다. 새 결함 해결과 과거 CI 사건의 인과 귀속은 별도 판정한다.

## CP0 환경·한도

- 후보 `codex/mes-main-candidate-comparison-20261016`, 시작 `63d4ed59`. 기존 AS 문구·문서 변경을 보존한다.
- 사용자 3038/8038과 DB·초안·연구 요청, main·직원 환경·예약은 변경하지 않는다.
- 새 실행 ID `flaky-boundaries-20261019-135838`, 동일 Linux의 3100/8021·합성 DB만 사용한다. Node20.20.2/Python3.11.17/Playwright1.60/Chromium1223과 lockfile을 유지한다. WSL/원 CI 커널 차이는 별도 기록한다.
- BOM 2·3 × 두 순서 최대4건, AS 요청 구간1건. retry0, 첫 실패에서 해당 묶음을 멈춘다. 정상 반복·전체 검사는 하지 않는다.

## CP1 BOM

사용자 A는 BOM 수량을 입력하고, B는 무관한 합성 품목의 구매 메모만 실제 UI로 저장한다. 실제 저장→SSE→목록 갱신을 사용한다.

1. A 입력·blur→B 저장→실제 재조회 완료→A 다음.
2. B 저장→후속 조회 시작→A 입력·즉시 다음.

각 순서를 수량2·3으로 한 번씩 비교한다. 실제 입력/갱신 겹침이 없으면 CONDITION_NOT_MET이며 재시도하지 않는다. 제품 기본 BOM·재고를 바꿔 조건을 맞추지 않는다.

기존 native writer 기록에 정확한 소스맵 위치의 false CDP breakpoint를 추가한다. onChange·초안 쓰기·기본 BOM·URL 복원·setItems·match 위치의 수량과 호출을 버퍼링한다. updater 재호출·함수형 변환·추가 렌더·pause는 하지 않는다. 예약/렌더/DOM을 구분하고 스택·소스 해시·누락을 기록한다. PIN·쿠키·메모 원문은 제외한다. 관측의 timing 영향은 한계로 남긴다.

## CP2 AS

원 trace의 preview·submit·items·drafts·detail과 필요한 배경 요청을 두 원 클라이언트(APIRequestContext/Chromium fetch)로 실제 Next 프록시에 보낸다. 새 preview의 ID/token을 연결하고 요청 본문을 임의 재사용하지 않는다.

원 anchor는 `GET /api/inventory/transactions/display-groups?limit=100&date_from=2026-10-01`의 HAR 완료 시각이다. 새 실제 본문 완료를 기준으로 submit4330.348ms, browser drafts4459.348ms, API detail4576.348ms와 원 구간의 다른 offset을 재생한다. 실제 발행 오차20ms를 넘거나 의존값이 늦으면 조건 미충족이며 일정을 미루지 않는다. upstream idle까지 복원했다는 주장은 하지 않는다.

실제 Node/Uvicorn/kernel 수집으로 요청→소켓→종료 주체·이유→FIN/RST→Next 오류를 연결한다. `read ECONNRESET / -104`와 cleanup 오류를 구분한다. 강제 종료/RST·응답 주입·timeout/Agent 변경은 금지한다. 한 번 정상 실행되면 반복하지 않는다.

## CP3 최소 수정·검증

실패를 cleanup 전에 보존하고 원인 변수 하나의 전후 대조로 확인한다. 수정 전 실패→최소 수정→성공→원인 변수 복원 대조 또는 동등 근거가 있어야 해결이다. 확인된 계층만 수정한다.

원인 확보 후 새 회귀10회, 직접 영향받은 원 선택자3회, retry0/첫 실패 중단/마지막 관측off. BOM2·3의 매칭·저장·기본 BOM, AS 제출1회201·조회·승인 전후 실제 위치 단언 유지. 제품 변경 시에만 production·3.25MiB 번들·별도 인앱 탭을 확인한다. 전체 검사 반복은 하지 않는다.

## CP4 기록·종료

각 문제마다 상세 보고서·첫 표·활성 TODO·인계를 갱신한다. 신규 결함/과거 귀속/직원 영향/신규·재사용·미실행/재개 식별값을 분리한다. 로컬의 구체적 환경 차이가 막을 때만 후보 전용 진단 CI를 사용한다. 정상 결과를 반복하려고 푸시하지 않는다.

원인 또는 수정 근거가 부족하면 해결·병합 가능으로 승격하지 않는다. 이 계획은 main 반영·직원 배포를 포함하지 않는다.
