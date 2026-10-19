# AS 실시간 관측·BOM 자연 발생 기록 결과

**2026-10-19 17:34 KST: 승인한 도구 보완·검증·기록 완료. 과거 AS·BOM 원인은 미확정이며 병합 판단은 보류다.**

이번 [승인 계획](2026-10-19-mes-observation-reliability.md)은 업무 재현이 아닌 진단 도구의 신뢰성과 자연 발생 실패 보존 준비다. 신규 업무 처리·재고·취소 검증은 없다.

## 실행 식별과 보존

- W=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`
- R=`W/_attic/runtime/flaky-observation-reliability-20261019-165811`
- 시작 시각: 2026-10-19 16:58 KST. 후보 HEAD `63d4ed59acf223e6cad62b3a360d905825d92021`.
- main 참조 `f4f9d8d3f01fba1ee89161743cf9d8f2f7271822`. 읽기만 했다.
- `R/preflight.json`: 전체 변경 파일·보호 DB/session·lockfile·AS 문구 파일 해시와 PID. `R/start-files/`: 시작 미커밋/미추적 파일 사본.
- 검토 3038 PID46916, 8038 PID10744. 보호 DB SHA256 `bddc1c4f61c04fa2ecf3479b6e8d737886cb18f399ee24a005e1cd97a7716376`, session `c2a8b25f7d15b4ab269462d576aaa2dc67d79bb6030e86ddee6e48fa8bf95694`.
- 보호 DB를 열어 업무를 수행하거나 복사·초기화하지 않는다. 신규 검사는 업무 DB 없이 수행한다.

## 현재 상태

| 묶음 | 이번 결과 | 해석 |
|---|---|---|
| CP0 기준·보호 | 완료 | 기존 변경과 사용자 검토 자료 보존 |
| CP1 AS 실시간 중단 | 도구 검사 통과 | 감지 후 신규 발행 차단, 이미 발행한 요청의 결과 보존 |
| CP2 패킷 수집 | 도구 검사 통과 | 필터·구간 통계·손실 중단 연결. 과거 손실 2건의 구간은 여전히 미확인 |
| CP3 BOM 선택적 기록기 | 준비 완료 | 원래 검사가 별도로 필요해질 때만 연결. 이번 업무 실행 없음 |
| CP4 통합·종료 | 완료 | 실제 무업무 Next/React 검사·기록·소스/보호 자료 확인 |

기존 근거: [이전 입력 전달 결과](2026-10-19-mes-input-transport-results.md)의 AS 스냅샷 대기 제거·BOM 입력 네 조건과 10월 17일 RSC 선택/삽입 대조를 재사용한다. 원 업무 선택자·AS 요청 구간·전체 검사는 이번에 재실행하지 않는다.

## 도구 묶음별 새 근거

### AS: 수신·관측 지연을 그 자리에서 중단

1. **목적:** 이전에는 모든 요청이 끝난 뒤 Next 수신 시각을 평가했다. 새 도구는 지연·수집 오류를 알게 된 뒤 남은 요청을 계속 보내지 않게 한다.
2. **환경·순서:** 계정·품목·업무 DB 없이 Linux의 작은 Next 서버3100과 고정 응답 서버8021을 기동했다. 준비 GET 뒤 진단 GET 한 번을 실제 Next 프록시로 보냈다. 실제 worker PID694의 수신과 upstream 소켓을 연결하고 준비→관측 시작→발행 중단→보존→정리 ACK와 종료를 확인했다.
3. **예상·결과:** 업무 수량·예약·후속 사용·취소는 해당 없음. 고정 응답 요청 2건, 업무 요청/DB 접근 0건. 실제 worker 수신, 양방향 TCP data 각2기록, 마지막 누계10패킷/drop0, 채널 오류 없음. `result.json`의 도구 상태는 PASS, 제품 재현 판정은 UNREPRODUCED다.
4. **변경:** 기존250ms 파일 기록을 유지하면서 Unix 소켓에 비동기 전송한다. 실행 ID·worker PID·순번·수신 시각·전달 시각을 구분한다. 20ms 기준과 기존 시계10ms 기준, 발행 일정은 유지했다. 수신 확인을 기다려 다음 일정을 늦추지 않는다. `observation-controller.cjs:12`, `replay-as.cjs:249`, `replay-core.cjs:32`에 중단·발행 전 검사가 있다.
5. **판정·직원 영향:** 승인한 진단 도구 변경이다. main의 업무 동작이나 직원 서버는 바뀌지 않았다. 지연 전달, 실제 늦은 수신, 관측 미도착, IPC 단절·순번 손실·큐 초과를 구분한다. 감지 전 발행 요청은 강제로 끊지 않고 원래 결과를 보존한다. 원 AS의 `read ECONNRESET/-104` 원인은 이번 검사로 확정하지 않는다.
6. **최소 후속 수정:** 종료한 채널에서 파일 검증 실패를 발견했을 때 `stop_phase=PENDING`이 남는 기록 오류를 확인했다. 해당 경로만 `NOT_APPLICABLE / observation_channel_shutdown`으로 종료 상태를 기록한다(`replay-as.cjs:191`). 실패 판정과 발행 정책은 그대로다.
7. **근거:** `R/as-unit/green.log` 50검사 통과, 종료 상태 회귀의 `shutdown-stop-red.log`→`shutdown-stop-green.log` 26검사 통과. 이 최초 단위 검사는 Windows Node24.15.0이었다. 지정된 Linux Node20.20.2에서 최종51검사를 보충했고 모두 통과했다(`final-node20-linux.log`). 실제 probe는 `R/next-probe-01.log`, `R/linux-evidence/next-01/{result.json,source-hashes.json,probe-events.jsonl,next-receipts.jsonl,next-node.jsonl,packets.jsonl}`, 요약은 `R/linux-evidence/next-summary.json`이다.
8. **미실행·한계:** 원 AS 업무 구간, 원 실패 GET, 실제 업무 승인·재고 검사는 실행하지 않았다. 실제 Next probe는 development/webpack이고 production 기동 검사가 아니다. 고의 지연·손실은 도구 단위 검사에서만 사용했다. 실제 probe 이후 종료 상태 표시 두 파일이 달라져, 해당 정상 통신 근거와 종료 상태26검사 근거를 연결했으며 최종 코드의 전체 통과라고 표현하지 않는다.

### BOM: 정상 입력에 기록기가 끼치는 영향

- 목적: 기록기를 켠 것만으로 입력·React 처리·포커스가 달라지지 않는지 확인했다. 직원 화면/업무 검증이 아니다.
- 환경: Linux `L=/home/hw/mes-observation-reliability-20261019-165811`, DB 없는 `L/source`. Node20.20.2·Python3.11.17·기존 Chromium1223·설치된 React19.3 canary 사용. 서버·계정·업무 품목 없음.
- 순서: 같은 작은 React 숫자 입력에서 `fill(2)` → 즉시 다음 버튼, 별도 프로세스에서 기록 off/on 각 1회.
- 결과: 둘 다 입력/DOM/추적값/React 상태/제출값 2, 변경 이벤트 1회, 포커스 이벤트 2회, 업무 요청 0. 추가 포커스 호출·중단점·진단 pause 없음.
- 근거: `R/bom-probe.log`, `R/linux-evidence/bom/passive-{off,on}.json`, `R/bom-install.json`, `R/linux-evidence/prepared.json`. main/후보 업무 수량 전후·후속 사용·취소는 이번에 해당하지 않는다.
- 구현: 원본 shipping 테스트를 수정하지 않고 소유한 일회용 export에 선택형 복사본을 만든다. 원 `fill`, 즉시 다음, 단언·제한시간은 유지한다. 기본은 비활성이며 정상 경로의 조건부 중단점·상태 setter 계측·추가 포커스가 없다. 숫자 명령/native/DOM/React 추적값/매칭 요청을 제한된 메모리에 기록하고 최초 값 손실의 호출 스택을 보존한다.
- 실패 보존: 원 단언 오류를 다시 던지기 전에 수집기를 먼저 비우고 DB·화면·trace 보존을 거친 뒤 정리한다(`failure-boundary.ts:16`, `:59`, `:92`). 수집기 최종 attachment는 정리 뒤일 수도 있으므로 최초 실패 증거로 쓰지 않는다.
- 분류: ACK·대상 식별·무손실이 확인된 이벤트 부재는 `INPUT_FAILURE_EVIDENCE`; 준비·버퍼·문서 기록 누락은 `OBSERVATION_INSUFFICIENT`다. 값이 어긋난 사실만으로 제품/자동화 원인을 결정하지 않는다(`bom-input-transport.cjs:194`). 앞선 기본 수량1 매칭은 요청 시작·품목으로 분리한다.
- 검토 중 수정: History API 이동을 새 문서 손실로 세지 않도록 기존 전송 기록의 main-frame `Page.frameNavigated`만 사용한다. 1ms 시각 경계가 모호하면 원인 증거로 승격하지 않는다. 해당 변경 뒤 on만 국소 재확인했고 off 근거는 재사용했다.
- 추가 근거: `R/bom-unit/passive-implementation-receipt.json`의 11파일 해시·RED4종·`green-reviewed.log` 37/37. `R/bom-reviewed-probe.log`, `R/linux-evidence/bom/passive-on-reviewed.json`도 입력/제출2·input1·focus2·추가 요청0. 생성 복사본의 원 두 선택자는 `R/bom-generated-list.log`의 `--list`로 확인했으며 실행하지 않았다.
- 런타임 보충: 위37검사의 당시 Windows Node 버전 기록이 없어 지정 Linux Node20으로 확인했다. 36통과, 도구 React 번들 검사1건은 Windows 설치 esbuild를 참조한 준비 오류였다(`R/bom-unit/final-node20-linux.log`). 제품/테스트 소스는 바꾸지 않고 기존 Linux 의존성과 동일 소스의 해당1건만 다시 실행해 통과했다(`final-node20-platform-green.log`, `linux-platform-preparation.json`). 나머지15개 선택자 제외는 이 국소 재실행의 필터 결과이며 앞선36통과를 재사용한다. 이는37건을 한 번에 최종 통과한 실행으로 합치지 않는다.
- 판정·직원 영향: 선택형 기록 준비 완료. 제품 코드·기존 원 검사·업무 데이터 변경 없음. 실제 자연 발생 실패는 아직 없으므로 BOM 원인 미확정이다. 추가 로그는 PIN·쿠키·원문 메모를 복사하지 않는다. 기존 Playwright trace/화면/DB는 실제 자료를 포함할 수 있어 항상 ignored 로컬에만 둔다.
- 미확인: 원 실패 순간의 값 출처, 직원 영향, 실제 업무 실패 시 새 기록의 충분성은 아직 관찰되지 않았다. 도구 입력/실패 모형의 자체 검사를 실제 BOM 결함 재현으로 세지 않는다. 이번 작은 React 검사 수량은2이며 실제 수량2·3 업무 대조는 과거 근거만 재사용한다.

### 패킷: 필터와 실제 수집기의 구간 통계

- 목적: 업무와 관계없는 트래픽을 커널 단계에서 제외하고, 통계가 종료 때 한 번만 읽히는 한계를 보완했다.
- 실행: 실제 Linux 커널 cBPF에 합성 IPv4/TCP 헤더 10조건을 전달했다. 별도로 실제 AF_PACKET loopback/8021 수집기의 준비·100ms 통계·단계별 통계·정상 종료를 검사했다. 업무 TCP/API/DB 처리는 없다.
- 결과: 대상 포트 양방향·가변 IPv4 헤더·첫 fragment 허용, 다른 포트/UDP/비첫 fragment/IPv6/짧은 헤더 제외, 수집 길이 최대120바이트. 준비·단계·종료 통계 12회와 마지막 배치 완료. 실제 버퍼는 요청4MiB에 대해425,984바이트였다. 시스템 한도는 변경하지 않았다.
- 근거: `R/packet-linux-probe.log`, `R/linux-evidence/packet-linux-01/{packet-probe.json,packet-control.jsonl,packet-metadata.jsonl,packet-stderr.jsonl}`. 패킷 도구 단위25/25는 `R/packet-unit/{unit-green.txt,verification.json,source-sha256.txt}`다.
- 지정된 Linux Python3.11.17에서도25/25 통과를 보충했다(`R/packet-unit/final-python311-linux.log`). 실제 수집 probe를 반복한 것이 아니다.
- 손실 처리: 100ms 및 단계 경계의 조회 전후 시각, 리셋되는 구간값과 자체 누계를 남긴다. 실제 손실 패킷을 특정하지 않고 가능한 구간으로 표현한다. 소켓 drop, 사용자 기록 실패, BPF 손실을 분리하며 감지한 손실은 AS 중단 경로로 전달한다. 다음 배치를 받기 전에 앞선 파일 기록 확인을 마친다.
- 커널 연결: stderr를 종료 때까지 미루지 않고 stdout과 함께 읽는다. 손실 알림을 디스크보다 먼저 보내며, 파이프의 현재 기록을 처리하기 전에 단계 ACK를 보내지 않는다. overflow·IPC 실패·종료 제한 초과 시 부분 원문과 실패 영수증을 보존한다. 오류와 BPF 손실은 다른 수치로 유지한다(`kernel-capture.py:26`, `:42`, `:129`).
- 국소 검증: 커널 후속 회귀20/20을 실제 Linux에서 통과했다(`R/kernel-health-linux-green.log`). 기존 Windows 결과18통과/2Linux조건 제외는 그대로 보존하고 새 Linux 결과를 따로 연결했다. 이 검사는 실제 무해한 Python 자식 파이프와 통제된 자식 객체를 사용하며 BPF를 새로 실행한 것은 아니다.
- 실제 통신: 위 Next probe에서 최종 패킷 수집기 해시로 고정 GET의 양방향·최종 통계까지 확인했다. 앞선 standalone 필터 probe 이후 추가된 파일 오류 처리 경로는 단위 검사로 연결한다.
- 판정·한계: 승인된 관측 도구 수정이며 main·직원 업무 동작 변화 없음. 해당 짧은 고정 통신의 drop0을 모든 부하의 무손실로 일반화하지 않는다. 과거 drop2의 구간·패킷은 여전히 모른다. BPF 실제 커널 probe 생성/해석은 유효한 이전 근거를 재사용하며 이번 변경의 자식 수명·loss 전달은 새20검사로 확인했다.

## 실행·재사용 범위

| 근거 | 현재 적용 |
|---|---|
| AS 도구 검사 | 최초 Windows50·후속26 보존. 지정 Linux Node20의 최종51 통과로 연결 |
| 패킷25·커널20·BOM36+국소1 | Linux 고정 런타임·최종 도구 해시로 확인. BOM Windows37과 중복 합산하지 않고 준비 오류·보완 실행을 분리 |
| 실제 Linux Next·React·필터 검사 | 업무 DB 없는 도구 통합 확인. 제품 재현/production/전체 E2E 근거 아님 |
| 기존 AS 스냅샷 대기 제거, BOM fill/키2·3 및 SSE/RSC 대조 | 당시 통과 근거 유지. 같은 검사를 재실행하지 않음 |
| 과거 원 BOM·AS 실패 원문 | 그대로 보존. 새 도구 PASS로 원인 해결을 표시하지 않음 |

`R/final-audit.json`에서 최종 도구 소스28개의 검증 영수증 해시와 원 shipping spec, 복사한 Linux 근거19개의 해시를 확인했다. 실제 Next probe 후 달라진 `replay-as.cjs`·`observation-controller.cjs`는 채널 종료 상태 보완뿐이며 `shutdown-stop-green-source-hashes.json`으로 연결한다. 원문 보고서 해시는 갱신하거나 덮어쓰지 않았다.

다시 실행해야 할 때의 도구 명령은 `R/packet-unit/verification.json`, `R/kernel-health/verification.json`, `R/as-unit/` 로그와 아래 BOM 활성 절차를 따른다. 이번 실제 Next 명령은 고정 Node로 `scripts/dev/mes-flaky-diagnosis/io/observation-next-probe.cjs --output L/next-01 --frontend /home/hw/mes-flaky-input-transport-20261019-154319/source/frontend --python /home/hw/mes-flaky-20261019-0902/venv/bin/python`였다. AF_PACKET 권한이 필요한 부분만 WSL root에서 실행했다.

고정 Node 경로는 `/home/hw/mes-flaky-20261019-0902/tools/node/bin/node`다. AS 단위 명령은 `node --test scripts/dev/mes-flaky-diagnosis/io/observation-next-probe.test.cjs scripts/dev/mes-flaky-diagnosis/io/observation.test.cjs scripts/dev/mes-flaky-diagnosis/io/replay.test.cjs`였다. BOM 명령·최종 로그 연결은 `R/verification-index.json`에 남긴다. 이 기록은 재현 정보이며 현재 다시 실행할 지시가 아니다.

## 다음에 BOM 검사가 실제로 필요해졌을 때

1. 현재 제품 소스와 고정 의존성의 **새 전체 gitless 합성 export**를 준비한다. `L/source`는 이번 무업무 probe용 부분 사본이므로 업무 실행에 재사용하지 않는다. 실행 HEAD·원 shipping spec·제품·lockfile 해시, 소유권·3100/8021을 먼저 기록한다.
2. export의 `backend/mes.db`가 없어야 하며 합성 `backend/mes_e2e.db`와 `DATABASE_URL`이 일치해야 한다. `install-bom-passive.cjs <export>`를 실행해 원 검사의 선택형 복사본을 만든다. `_common-expectations.ts`, `_failure-boundary.ts`의 수집/보존 exports, native/transport/manifest, `snapshot-db.py`가 소유 export 내부의 일반 파일인지 확인한다.
3. 기존 진단 설정을 상속하고 생성 `bom-passive-original.spec.ts`의 `SHIP-VARIANT|SHIP-GENERATED-ROLES`만 선택한다. worker1/retry0, trace on, 기존 API retry0과 개별 timeout을 유지한다. `--list`로 선택을 확인한다.
4. 실제 해당 검사가 별도로 필요한 시점에만 `MES_BOM_PASSIVE=1`, `MES_DIAG_SOURCE`, 새 `MES_DIAG_OUTPUT`, 합성 `DATABASE_URL`, 내부8021 주소, `NODE_OPTIONS=--require=<export>/scripts/dev/mes-flaky-diagnosis/bom/bom-input-transport-preload.cjs`로 연결한다. `DEBUG/PWDEBUG/MES_BOM_INPUT_TRANSPORT`는 해제한다. 원 Playwright context와 trace를 그대로 사용한다.
5. 첫 실패에서는 `first-failures/.../passive-input-before-cleanup.json`, `before-cleanup-trace.zip`, 화면·DB·`receipt.json`, `failure-boundaries.jsonl`을 원 오류와 함께 읽는다. 수집 실패/문서 누락/모호한 시각이면 원인을 단정하지 않는다. 별도 반복 실행·예약·CI는 만들지 않는다.

## 종료·보호 상태

- `R/postflight-ports.json`: 3038/8038의 기존 PID 유지, Windows/Linux 진단3100/8021 해제. 기존 서비스를 종료하지 않았다.
- `R/final-audit.json`: 후보 HEAD·브랜치·main 참조, 보호 QA DB/session, lockfile, 기존 AS 완료 문구 파일 해시 불변. 원 shipping spec도 불변. 제품 변경은 시작 전 AS 문구 diff만 남아 있다.
- Linux 원문은 L에 보존했고 필요한 소형 근거만 R의 `linux-evidence/`로 복사해 양쪽 해시를 대조했다(`copy-index.json`). 코드/Node/빌드/DB의 대용량 사본을 추가하지 않았다.
- 이번 도구 구현·문서는 미커밋이다. 커밋·푸시·새 CI·main 반영·직원 서버/실제 DB/예약 변경 없음. 전체 E2E·백엔드·성능·복구·기대값·production 빌드도 실행하지 않았다.
- 다음 단계는 새 업무가 요구하는 정상 검증에 선택형 기록을 연결하거나 새 실제 실패 자료를 분석하는 것이다. 지금 동일한 정상 검사 반복을 다시 시작하지 않는다.
