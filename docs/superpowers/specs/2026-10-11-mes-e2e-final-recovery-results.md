# E2E 안정화와 최종 묶음 정상 복구 기록

## 범위

작업 브랜치 `codex/mes-expectation-closure`, 시작 HEAD `d677366728c75a4a4f304811c6324092b1206236`. 2026-10-11~12 검증 실행은 검증·기록만 수행했으며 커밋·푸시·전체 CI·main 반영·직원 배포를 포함하지 않았다. 검증 종료 후 사용자에게 받은 커밋·푸시 승인은 마지막 절에 구분한다.

## 새 E2E 실행

- 기존 소스 기준: 대상 두 파일의 불량·PC 보정·모바일 보정 3검사 통과, 재시도 0.
- 변경 후: 각 검사 10회씩 순차 실행, 총 30통과, 실패/간헐 실패/건너뜀/재시도 0. 보호 작업본 `mes.db` 해시 불변을 teardown에서 확인했다.
- 카드: 사이드바의 실제 hover 전환에서 프레임별 두 카드의 폭을 함께 수집했다. 폭은 약 414→364.672px로 변하지만 같은 프레임의 두 카드 폭 차이는 0이었다. 다른 프레임의 수치를 비교하면 0.5px 기준을 초과한다. `io-warehouse-adjust.spec.ts`의 측정만 같은 프레임으로 바꾸고 다음 프레임에서 크기 안정을 확인한다. 기존 0.5px 기준, 실제 제출·미리보기·ADJUST 이력 검사는 유지한다.
- 연결 끊김: 프록시/직접 백엔드 각각 90회 병렬 보조 조회에서 실패가 재현되지 않았다. 당시 CI에는 해당 요청의 상세 백엔드 로그가 없으므로 원인은 **미확정**이다. `defect-auto-department.spec.ts`는 변경하지 않았으며 프록시 우회·재시도 증가는 하지 않았다. 10회 통과를 원인 해결로 표시하지 않는다.
- 관련 ESLint와 대상 E2E를 포함하는 임시 TypeScript 검사 통과. 기본 앱 tsconfig는 E2E를 제외하므로 별도 국소 tsconfig로 확인했다. 첫 국소 설정의 Node 타입 탐색 실패는 보존했고, 기존 `frontend/node_modules/@types`를 명시한 설정으로 통과했다.

로컬 원문: `_attic/runtime/e2e-final-normal-20261011/`. 이전 CI 최초 실패·영상·재시도 결과는 `ci-general/`에 보존한다. 해당 CI는 [38021173115](https://github.com/Hw-03/ERP/actions/runs/38021173115)이며 이번에 새 CI를 실행하지 않았다.

## 기대값 연결

변경한 보정 테스트에는 기존 원장 바인딩이 없었다. `8.16-02 / warehouse-adjust-signed-cell-effect`에 실제 미리보기 +1과 ADJUST 이력 조건만 추가했다. 기존 백엔드 바인딩과 과거 실행은 유지하고 현재 `NOT_RUN`도 유지한다. 다른 위치의 불변·원장 전체 완료를 이번 E2E 통과로 승격하지 않는다. 불량 테스트의 기존 바인딩은 소스가 그대로이므로 갱신하지 않았다.

## 복구 검증

현재 상태: **최종 묶음의 새 정상 복구 실행 PASS**, 2026-10-12 00:29:19 KST에 실제 프로세스 종료 코드 0 확인. API 연결 끊김 원인은 이 결과와 별개로 미확정이다.

- 두 빌드 영수증은 이번 E2E 소스를 포함한다. 운영/QA 각각 3,144,949 bytes로 승인 한도 3,145,728 bytes 이내다.
- 새 manifest: `_attic/runtime/closure/recovery/n11/artifacts.json`, SHA `68bb07ae77253b02dd2cb3587ac968ffd527ce986d8830cc7e003c830f0efea9`.
- 새 QA 사본: `_attic/runtime/qa/n-1935d8ce/employee`. 이전 fixture와 결과/admission은 사용하거나 수정하지 않는다.
- 과거 용량 예산은 세 모드를 예약했지만 이번은 정상 한 모드다. 기존 측정에서 한 모드+새 두 빌드+임시 자료+5GiB 여유를 계산한 별도 예산으로 확인했으며 과거 예산 원문은 유지했다.

새 실행은 `normal-first-attempt`, `resume=false`다. 실제 구 0038 기동·조회·종료 → 최종 설치·0044 마이그레이션·새 기동·조회 → 정상 복구 → 구 0038 재기동·조회·종료를 수행했다. 세 기동 모두 백엔드 상태 확인과 직접/프록시 조회가 통과했다. 구 코드·운영 프론트 산출물·Node·선택 설정·DB 상태가 이전 묶음과 정확히 일치했고, 재기동 후에도 동일했다. 각 마이그레이션 단계에서 승인된 직원 `level` 제거 외 기존 행/컬럼 보존과 외래키를 확인했다. 신규 nullable 필드의 임의 백필은 없었다. DB 복원은 원형 snapshot digest와 행 비교를 모두 사용했다.

운영 설정 빌드는 원형 산출물 복원을 확인하고, 같은 소스·Node를 사용한 QA 주소 production 빌드는 격리 포트에서 실제 기동했다. 운영 주소로 만든 빌드를 직원 환경에서 기동한 결과로 해석하지 않는다. 테스트용 정상 어댑터는 `.agents/skills/mes-browser-regression/scripts/final_bundle_normal_recovery.py`다. 실제 실행 전/후 manifest·소스·산출물·실행기 해시와 승인된 검증 Python 환경 불변을 확인했다. readiness 기한 90초와 기존 경로·PID 소유권 가드는 유지했다.

| 새 실행 근거 | 위치 / SHA256 |
|---|---|
| 정상 실행 결과 | `_attic/runtime/qa/n-1935d8ce/normal-result.json` / `d9b72e007eeb19809f786ac1967be9c8e79a1eac670d358333bf043406669cb3` |
| 실제 복구 함수 영수증 | `employee/_attic/runtime/frontend-releases/36e63a1d28744ab7a73006b966bd009e/recovery.json` / `bdd393fdd9dcb50c55147d0556a78f11c563079381bea999c3e4a295f53d9014` |
| 실행 환경 전후 확인 | `_attic/runtime/e2e-final-normal-20261011/normal-supervisor.json` / `4b8ad22b3df3c7e659a028a4e2c7d7b6e850a87c0c6399a7673db524bba6e576` |
| 실제 종료 코드 | `_attic/runtime/e2e-final-normal-20261011/normal-exit.json` / `b5199035a75bdfbd5e55bf93d0fdcac3f91194bc4ba601152036f6a6ddfcfebe` |

위 표의 `employee/`는 새 QA 사본 아래 상대경로다. 실제 프로세스 소유권·조회·종료 원문은 같은 사본의 `lifecycle-logs/`에 보존한다. 복구 함수가 보관하는 `failed-code`/`failed.db`는 정상 복구 전 새 버전의 보존 자료이며, 이번 실패 주입 실행의 근거가 아니다.

새 어댑터는 이전 결과/admission을 수정하거나 이전 fixture를 재사용하지 않는다. manifest SHA·경로·새 fixture·QA 산출물/주소 가드 10검사와 동결 원형 readiness 검사 14검사를 통과했다. 제품 설치·DB 마이그레이션·복구 함수는 기존 구현을 호출한다.

## 종료와 보호 자료 관찰

전용 프로세스 종료와 8021/3100/8042/3042 포트 해제를 확인했다. 작업 브랜치와 시작 HEAD는 그대로이며 staged 변경은 없다. 소스 변경은 카드 측정 검사 한 파일, 새 정상 복구 어댑터/안전성 검사, 선택적 바인딩과 종료 문서다. 업무 API·스키마·재고 계산식은 이번에 수정하지 않았다.

개발 원본 `C:/ERP/backend/mes.db`와 작업본 `backend/mes.db`는 시작 SHA256과 일치했다. **직원 원본 `C:/ERP-dev/backend/mes.db`는 불변 검사에서 해시 변경을 감지했으므로 전체 보호 DB 불변 PASS로 기록하지 않는다.** 시작 `bc500e7711d62e2b0047412035468fe18f773cbc45fc6ca62c229bdbd8025b4a` → 종료 관찰 `8630f0be18f36574576e3e970816ba981ab60092511d840202c4585b7c7219ad`, 수정 시각 2026-10-12 00:00:03 KST였다.

읽기 전용 확인에서 기존 `DEXCOWIN MES Weekly Inventory Snapshot` 예약 작업의 00:00 실행/종료 코드 0, 직원 DB의 해당 주 `capture_source=scheduled` 및 00:00:03 KST 저장 시각이 확인됐다. 예약 작업은 `C:/ERP-dev/backend/scripts/capture_weekly_inventory_snapshot.py`를 실행한다. 이 스크립트의 `main()`은 `ensure_due_snapshot_committed(..., source="scheduled")`를 호출한다(해당 파일 26행). 이번 검증에서 그 작업을 실행·중단·수정하거나 직원 DB를 복원하지 않았다. 이는 기존 예약 작업과 일치하는 변경 근거이며, 시작 시점 직원 DB의 모든 행과 현재 행을 비교한 증거는 아니다.

원문은 `end-protection-observed.json`, `employee-snapshot-task-observed.json`, `employee-snapshot-row-observed.json`에 보존한다. 첫 종료 수집기의 전체 DB 불변 단언 실패도 이 관찰 결과로 남긴다. 후속 `finish.json`은 정상 복구 PASS와 직원 DB 변경 관찰을 별도 필드로 기록하며 전체 검증 PASS를 의미하지 않는다. 복구 사본·DB·원문 실패·대용량 진단은 로컬에 보존하며 저장소 변경에 포함하지 않는다.

## 재사용 범위

이전 C18과 현재의 설치·복구·백업 manifest·DB 복원·정합 비교·스키마 보존 검사·PID 소유권·원형 harness 구현은 LF 정규화 기준 동일하다. 이전 실패 주입/강제 종료 검증은 이 구현과 당시 입력에 대한 과거 근거로 보존한다. **새 프론트 산출물, 새 소스 스냅샷, 새 정상 어댑터와 admission, 변경된 의존성 명세에 대한 정확한 실패 복구 검증은 미실행**이다. 과거 실패를 새 빌드 PASS로 바꾸지 않는다.

## 후속 과제

무거운 조회 성능 2건의 절대 상한, 동시 30명 측정, 현재 전체 기대값 재실행은 기존 보류 TODO를 유지한다. 연결 끊김의 근본 원인도 미확정으로 남긴다.

## 2026-10-12 후속 커밋·푸시

검증 종료 후 사용자가 이번 변경만 작업 브랜치에 잘게 나눠 커밋·푸시하도록 승인했다. E2E 카드 측정 수정(`6fa431e3`), 정상 복구 어댑터/안전성 검사(`542e5239`), 선택적 기대값/종료 기록을 각각 분리한다. 앞 절의 HEAD 유지·커밋 없음·새 CI 없음은 검증 종료 시점의 사실이며 현재 커밋 상태를 뜻하지 않는다.

커밋 직전 소스·의존성 명세·설정·실행기 해시가 기존 통과 근거와 일치함을 다시 확인했다. E2E 30회·관련 ESLint/타입·안전성 24검사·새 빌드와 실제 정상 복구 결과를 재사용하며, 전체 검사나 복구를 반복하지 않는다. 각 커밋은 명시한 파일만 stage하고 staged diff/whitespace와 smart 계획을 확인한다. 기대값 JSON은 선택적 바인딩 외 과거 실행·현재 NOT_RUN·분모를 유지한다. DB·자격 증명·대용량 원문은 로컬 보존 자료이며 커밋 대상이 아니다.

작업 브랜치만 정상 푸시하고 전체 CI 완료는 기다리지 않는다. main 반영·강제 푸시·직원 배포는 제외하며, 최종 푸시 결과와 새 CI 링크/시작 상태는 사용자 보고로 확인한다.

## 2026-10-12 CI 바인딩 오류와 수정

HEAD `b59ce634`의 [기대값 근거 검사](https://github.com/Hw-03/ERP/actions/runs/38185343867/job/114606349794)가 `8.16-02/warehouse-adjust-signed-cell-effect: selector/assertion not found in actual test body`로 실패했다. 추가한 ADJUST 바인딩의 `transaction_type: "ADJUST",`는 실제 객체 속성이지만 실행 단언 전체가 아니었다. 이전의 단순 본문 포함 확인으로는 이를 발견하지 못했고, 실제 CI의 엄격 검사가 거부했다.

로컬 Node 20에서 CI와 같은 `node scripts/dev/normalize-mes-expectations.mjs --check`의 실패/종료 코드 1을 재현했다. 기대값 registry와 생성 JSON의 해당 바인딩을 기존 테스트에 있는 `expect(logs).toEqual(...)` 전체로 바꾼 뒤 같은 검사가 종료 코드 0으로 통과했다. 테스트·업무 API·DB·단언 검증기는 수정하지 않았다. 기존 source hash와 선택자·선언 행, 다른 바인딩·분모·과거 실행·현재 NOT_RUN은 유지한다.

원문 CI 실패 로그는 `_attic/runtime/e2e-final-normal-20261011/ci-38185343867-binding-failure.log`에 보존한다. 이번 통과는 원장 구조·실제 단언 연결 검사이며, 전체 기대값의 현재 실행 PASS가 아니다. 전체 테스트·브라우저·복구는 반복하지 않았고, 후속 푸시의 전체 CI 완료는 사용자 요청에 따라 기다리지 않는다.
