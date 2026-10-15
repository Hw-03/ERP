---
name: mes-browser-regression
description: Use when DEXCOWIN MES fixes need repeatable browser regression checks, especially employee roles, occurrence statistics, raw receipt, inventory detail restoration, cancellation counts or appearance synchronization.
---

# DEXCOWIN MES 브라우저 회귀 검증

자동 테스트와 실제 브라우저 관찰을 각각 기록한다. 최신 코드 식별값이 없는 과거 검수 자료를 현재 결과로 쓰지 않는다.

## 준비

1. AGENTS.md와 해당 활성 TODO, 승인된 기대값을 읽는다. 보류·수정요청·승인은 원본 그대로 유지한다.
2. 이번 작업 파일만 `overlay.txt`에 저장한다(한 줄당 저장소 상대 경로). `git diff --name-only` 전체를 자동 포함하지 않는다. 커밋 코드만 검사하면 overlay를 생략한다.
3. 저장소의 백엔드 의존성과 프론트 `node_modules`, 저장소 전용 Node.js 20이 준비되어 있어야 한다. `psutil`이 없으면 `python -m pip install -r .agents/skills/mes-browser-regression/scripts/requirements.txt`로 QA 의존성을 설치한다.
4. 새 run ID로 아래 도우미를 실행한다. 원본 서버·DB를 재시작하거나 기존 QA 폴더를 재활용하지 않는다. 준비 과정은 새 QA DB만 초기화한다는 영향을 먼저 설명한다.

```powershell
python .agents/skills/mes-browser-regression/scripts/qa_session.py start --run-id review-20261006-a --overlay-file _attic/runtime/overlay.txt
```

`session.json`의 HEAD, overlay SHA256, boot ID, DB 경로, URL, KST를 확인한다. 도우미는 전용 소스 사본·DB·CSV·로그·Next 산출물을 준비한다. 기본 QA 포트는 8031/3031이고 보호 포트 또는 점유 포트는 거부한다. 실패하면 로그를 확인하고 새 ID를 사용한다. 포트를 점유한 임의 PID를 종료하지 않는다.

브라우저 검증은 순차 실행이 기본이다. 같은 호스트의 다른 포트는 쿠키를 공유하므로, 두 QA 환경을 병렬 확인할 때 두 번째 환경은 다른 포트와 `--frontend-host localhost`를 사용한다(첫 환경은 기본 `127.0.0.1`). 원본 브라우저가 같은 호스트를 사용하고 있다면 QA와 함께 로그인하지 않는다. QA 백엔드 재시작 후에는 다시 로그인해 서명 쿠키를 갱신한다.

전체 기대값 실행에 Vitest가 포함되면 공용 `frontend/vitest.setup.ts`가 미등록 요청을 오류로 처리하고 `frontend/lib/__tests__/msw/server.ts`가 감사 POST를 모의 응답하는지 먼저 확인한다. `frontend/lib/__tests__/msw-network-safety.test.tsx`의 감사·미등록 상대 주소·보호 포트·외부 주소·업무 fixture 검사를 실제 실행한다. jsdom의 상대 주소는 localhost:3000으로 해석될 수 있으므로 개발 서버가 켜져 있다는 이유로 미등록 요청 bypass를 허용하지 않는다. 테스트 실패를 실제 서버 응답으로 보완하지 않는다. 이 검사는 테스트의 모의 전송 경계를 확인하는 것이며 실제 브라우저의 QA 주소·서버 소유권 검사를 대신하지 않는다.

테스트 실행 중 원본 보호 자료의 변화가 발견되면 해당 실행의 보호 판정을 실패로 유지한다. 소유 프로세스·요청 경로·기존 외부 작업을 구분해 조사하고, 원본 DB 복원이나 감사 행 삭제로 실패 근거를 지우지 않는다. 원본 조사가 필요하면 안정된 파일 사본을 만들고 사본만 읽으며, 실행 완료·자료 보존·원인 확정 여부를 각각 기록한다.

## 브라우저와 판정

사용 가능한 브라우저 도구의 문서를 먼저 읽는다. `session.json`의 frontend URL에서 `/mes`를 열고 QA-ADMIN 계정의 로컬 기본 비밀번호 `0000`으로 로그인한다. 실제 UI 클릭·입력·저장·재열기를 수행한다. API·DB 확인은 보조 근거이며 UI 조작의 대체가 아니다.

[시나리오](references/scenarios.md)에서 이번 변경에 해당하는 부분만 선택한다. 테스트 fixture는 QA 환경에만 만든다. 관련 자동 테스트 결과와 UI 관찰을 혼합하지 않는다.

전체 기대값 마무리 또는 ID별 반복 실행은 [원장 실행과 추가 시나리오](references/expectation-closure.md)를 따른다. 자동 실행은 전용 Playwright DB·포트를 쓰며 수동 QA 세션과 구분한다. 현재 소스에 대한 실행 근거를 검증한 뒤에만 원장에 반영한다.

격리 공동복구의 실제 기동 검사는 `scripts/recovery_readiness_probe.py`의 `bounded_readiness()` 문맥 안에서 기존 `recovery_rehearsal` lifecycle을 실행할 수 있다. 이 보조 도구는 고정한 원형 harness를 확인하고 준비 조회의 성공 판정 기한 90초를 유지한다. 요청 제한과 재시도 대기를 남은 시간으로 제한하며 본문 수신 뒤 기한을 검사해 늦은 200 응답도 거부한다. urllib의 제한은 개별 소켓 동작에 적용되므로 고정 JSON을 반환하는 로컬 건강 조회에 사용한다. 서버 로그의 200, 클라이언트의 수신 성공, 실제 복구 완료를 각각 기록한다. 요청 제한보다 느린 준비 조회를 반복하면 이전 조회와 겹칠 수 있으므로 원인을 확인하고 실패 근거를 보존한다. 제품의 성능 상한을 이 도구의 준비 대기 시간으로 대체하지 않는다. 원형의 경로·소유권·설치/복구 함수와 상태·조회 판정은 유지한다. 실패한 실행의 admission이나 결과를 삭제해 같은 회차를 재사용하지 않는다.

보조 도구를 사용하기 전 다음 순수 검사를 실행한다. 가짜 시간과 응답만 사용하며 실제 서버·DB·Node를 기동하지 않는다. 원형 소스 해시는 Git 체크아웃의 CRLF→LF만 정규화하고 다른 내용 변경은 거부한다. LF/CRLF 수용과 실제 내용 변경 거부를 모두 검증한다. 실제 설치/복구 실행은 승인된 격리 manifest·DB·포트·프로세스 소유권을 별도로 확인한 뒤 수행한다.

```powershell
python -m pytest .agents/skills/mes-browser-regression/scripts/test_recovery_readiness_probe.py --confcutdir=.agents/skills/mes-browser-regression/scripts -q
```

확정 기대값은 후속 원장 `docs/superpowers/specs/2026-10-07-mes-expectations.json`의 개별 검증 조건으로 확인한다. 연결 도구의 결과는 테스트 존재·검증 조건 연결 상태이며 실행 PASS가 아니다. 원본 사용자 보류를 승인으로 바꾸지 않는다. 신규 정책 시나리오를 검수할 때는 아래 참조의 정상 경로와 실패 경로를 각각 기록한다.

같은 직원의 두 탭은 같은 브라우저 컨텍스트에서 열어야 한다. 다른 직원 격리 확인도 같은 컨텍스트의 별도 탭에서 로그인한다. 별도 브라우저 프로필을 사용해 storage 이벤트가 전달되지 않는 것을 직원 격리 증거로 삼지 않는다. 설정 저장 실패·역순 응답·조회 실패 같은 주입 시나리오는 격리 Playwright 테스트로 검증하고, 실제 UI 정상 경로 관찰과 구분한다.

각 단계의 기대값, 실제값, 감사 ID와 **검증한 부분 범위**, URL, KST, 화면/다운로드/보조 근거를 실행 폴더의 `results.md`에 기록한다. 화면 증거는 도구가 지원하는 방식으로 저장한다. 결과는 `PASS`, `DIFFERENCE`, `BLOCKED`, `SKIP` 중 하나다. 관찰하지 않은 화면을 통과로 쓰지 않는다. 준비 취소 정합성만 확인한 `PC-DELTA-PF-03`은 F705 다운로드 전체 PASS가 아니다.

모델 삭제는 화면 확인창 뒤 브라우저의 native confirm이 한 번 더 나타날 수 있다. 클릭이 멈추면 현재 dialog를 확인하고, 도구의 문서에 나온 dialog 응답 또는 키 입력으로 처리한다. 인앱 브라우저에서 dialog 조회가 비어 있어도 확인창이 입력을 막는 경우 `tab.pressKey(null, 'Return')`으로 응답한 뒤 삭제 결과를 새로 읽는다. 같은 버튼을 반복 클릭하거나 제품 코드를 바꿔 확인을 우회하지 않는다. 화면 증거는 실제 JPEG/PNG 파일로 저장하고 결과 문서에서 연결한다.

## 종료

```powershell
python .agents/skills/mes-browser-regression/scripts/qa_session.py status --run-id review-20261006-a
python .agents/skills/mes-browser-regression/scripts/qa_session.py stop --run-id review-20261006-a
```

도우미는 관찰·기록한 PID·생성 시각·명령이 일치하는 소유 프로세스만 종료하고 증거·DB를 보존한다. 시작 직후 관찰 전에 부모가 비정상 종료하는 극단적인 경우의 자식 수명까지 OS 수준으로 보장하지는 않는다. 종료 결과와 원본 보호 상태를 기록한다. ownership mismatch는 원인을 조사하고 임의 강제 종료로 우회하지 않는다. 활성 TODO에는 완료된 부분과 남은 범위를 함께 반영한다.
