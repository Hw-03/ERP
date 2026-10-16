# DEXCOWIN MES 기대값 근거 재사용 결과 — 2026-10-14

기준 브랜치는 `codex/mes-expectation-closure`, 시작 HEAD는 `8754c1cf2073560156bf1f7a42770234a69729e2`다. 기존 업무 실행을 반복하지 않고, 원본 실행과 현재 입력 사이의 검토 기록을 추가한다. 아래 집계는 이번 검증 시점의 원장에서 계산한 역사적 결과다.

## 상태와 실행 범위

| 구분 | 이번 처리 |
|---|---|
| 기존 NOT_RUN | 615조건의 이전 PASS와 재사용 검토를 연결 |
| 기존 PASS | 443조건 및 이전 실행 이력 보존 |
| 전체 실행 대상 | 345항목·1,058조건의 검증된 재사용 근거 연결 |
| 기존 제외 | 지도 6항목·6조건, 원장 밖 인수인계 제외 3항목 유지 |
| 새 실행 | 증거 도구 4개 테스트 파일, 71통과·실패/취소/SKIP 0, native exit 0 |
| 국소 E2E | 기존 2개 파일의 7통과·재시도 0 결과 재사용 |
| 업무 테스트·빌드·성능·복구 재실행 | 0회 |
| 마지막 원장 엄격 검사 | `--check --require-complete` native exit 0, 2026-10-14 10:06 KST 완료 |

도구 검사가 사용하는 임시 합성 fixture 실행은 검증 도구의 회귀 검사다. 실제 DEXCOWIN MES 업무 테스트 전체를 다시 실행한 것으로 세지 않는다. 커밋·푸시·main 반영·직원 배포는 수행하지 않는다.

후속 승인: 2026-10-14 사용자가 이 변경의 작업 브랜치 커밋·푸시를 요청했다. 위 범위는 구현·검증 종료 당시 기록이다. 기존 입력과 완료 근거를 대조해 재사용하고 세 커밋으로 저장한다. 실제 푸시 결과는 Git 결과 및 최종 보고를 따르며 main 반영과 직원 배포는 계속 제외한다.

최종 상태는 `STRICT_COMPLETE_WITH_REVIEWED_REUSE`다. [완료 영수증](2026-10-07-mes-expectations.sources/verification/reviewed-reuse-20261014/completion.json)에 실제 종료 코드와 원장 집계, 신규/재사용 구분을 기록했다. [보존 검사](2026-10-07-mes-expectations.sources/verification/reviewed-reuse-20261014/preservation-audit.json)는 원문·피드백·과거 이력·바인딩·생성 원장 일치, 설치된 Node/Python/패키지 동일성, 작업본 보호 DB 해시 일치를 확인했다. 마지막 엄격 검사 후 현재 입력 스냅샷도 검토 기록과 다시 대조했다.

## NOT_RUN의 원인과 재사용 판단

이전 전체 완료의 원문은 [원본 실행 폴더](2026-10-07-mes-expectations.sources/verification/not-run-closure-20261013-003/)에 그대로 보존한다. `21519c75`의 파일 내용으로 각 원본 스냅샷을 대조했다. 이후 `8754c1cf`에서 바뀐 E2E 두 파일이 보수적인 `frontend/` 전체 해시에 포함되면서 615조건의 현재 근거가 무효화됐다. 이는 615조건의 업무 실패를 관찰했다는 뜻이 아니다.

- `appearance-sync.spec.ts`: 공용 직원 설정을 바꾸던 검사를 독립 QA 직원으로 전환했다.
- `io-request-order-stock.spec.ts`: 상세 패널의 전환이 끝난 뒤 기존 표시 단언을 수행한다.
- 두 파일은 원본 9그룹의 argv·수집 결과·실제 실행 결과·조건별 선택자에 없다. 프론트 소스의 두 파일명 참조와 파일의 export를 검사해 공유 도우미로 소비되는 경로도 거부한다. 업무 코드, 공통 fixture, Playwright 설정, 패키지 입력에는 변경이 없다.
- 이번 도구 변경은 `normalize-mes-expectations.mjs`와 새 재사용 모듈·테스트에 한정한다. 새 호환성 검사 원문을 정확한 도구 소스 해시에 연결했다. 이 때문에 기존 PASS였던 나머지 443조건도 상태는 유지하면서 동일한 검토 기록으로 연결한다.
- `.github/workflows/ci.yml`에는 새 도구 회귀 검사 파일만 추가했다. 기존 CI 업무 검사·coverage·빌드·번들 검사는 유지한다.

전체 입력 변경 5개, 기준 커밋 이후의 변경 목록, CI·원장·문서 등 실행 입력 밖 변경 목록은 [검토 기록](2026-10-07-mes-expectations.sources/verification/reviewed-reuse-20261014/review.json)에 분리해 기록했다. 재사용 가능 여부는 목록의 설명 문구를 신뢰해 결정하지 않고 실제 파일 구성과 해시를 다시 대조한다.

## 근거 구조와 거부 조건

현재 원장의 각 실행은 `status: PASS`, `basis: reviewed-reuse`로 구분한다. `reviewedAt`은 검토 시각이고, 원본 보고서의 실행 시각·실행 ID·DB 식별값·스크린샷·조건별 단언 연결은 바꾸지 않는다. 새 wrapper는 원본 실행 파일의 해시와 별도 검토 기록의 해시만 연결한다. wrapper를 다시 wrapper로 감싸는 재사용은 허용하지 않는다.

검증기는 현재 전체 입력 구성을 대조하고, 검토한 이전 소스 사본으로 원본 스냅샷을 정확히 복원한 뒤 기존 `verifyExecution`을 그대로 호출한다. 따라서 기존 원문·영수증·수집 결과·PNG·DB 환경·조건 fingerprint·선택자·현재 테스트 단언 검사도 유지한다. 업무 코드·공통 fixture·설정·실제 실행 대상 변경, 입력 삭제, 변경 누락, 소스 사본이나 원문 변조, 재사용 기록 변조는 거부한다. 테스트 확장자가 있다는 이유로 일괄 제외하지 않는다.

도구 호환성 예외는 명시된 파일에만 적용하고, 필수 도구 테스트 파일과 코드 해시·native exit 0·JUnit의 모든 PASS를 요구한다. 새 검토 기록 없이 향후 소스가 바뀌면 현재 기록은 다시 검증 실패한다. 그때도 우선 영향 범위를 대조하며 전체 업무 재실행을 자동으로 요구하지 않는다.

## 재현과 원문

- [도구 회귀 검사 원문](2026-10-07-mes-expectations.sources/verification/reviewed-reuse-20261014/tool-compatibility.xml)
- [원장 엄격 완료 출력](2026-10-07-mes-expectations.sources/verification/reviewed-reuse-20261014/strict-completion.txt)
- [재사용한 E2E 7건 원문](2026-10-07-mes-expectations.sources/verification/reviewed-reuse-20261014/local-seven.log)과 [Playwright 종료 상태](2026-10-07-mes-expectations.sources/verification/reviewed-reuse-20261014/local-seven-last-run.json)
- [기준 소스 사본](2026-10-07-mes-expectations.sources/verification/reviewed-reuse-20261014/before/)
- [현재 원장](2026-10-07-mes-expectations.json), [정본 연결](2026-10-07-mes-expectations.assertions.json)

Node 20에서 다음 두 명령으로 도구와 현재 기록을 검증한다. 두 번째 명령은 기존 근거를 읽어 검사하며 업무 서버나 테스트를 기동하지 않는다.

```text
node --test scripts/dev/normalize-mes-expectations.test.mjs scripts/dev/mes-expectation-evidence.test.mjs scripts/dev/run-mes-expectations.test.mjs scripts/dev/mes-expectation-reviewed-reuse.test.mjs
node scripts/dev/normalize-mes-expectations.mjs --check --require-complete
```

새 재사용 기록을 작성할 때는 원본 v2 실행과 당시 소스를 보존하고, 현재 스냅샷·누락 없는 변경 목록·비수집/비공유 판단·적용 가능한 국소 결과를 기록한다. 검증기 변경이 있으면 해당 코드의 도구 검사 원문도 새로 연결한다. wrapper 검증이 성공한 뒤 정본에 연결하고 생성 원장과 엄격 완료 검사를 확인한다. 이번 작성용 로컬 스크립트와 종료 코드는 `_attic/runtime/ci-fix-20261014/`에 보존한다.

기존 전체 완료와 CI 실패 자료, 615조건을 NOT_RUN으로 전환했던 이력은 삭제하지 않았다. 1440px에서 펼침 사이드바와 상세 패널이 함께 열릴 때 품목명 폭이 부족한 기존 화면 한계도 이번 근거 복원으로 해결됐다고 주장하지 않는다. 이번 PASS는 기록된 조건의 검증된 재사용이며 모든 화면 조합을 새로 시험했다는 뜻이 아니다.
