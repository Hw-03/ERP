# DEXCOWIN MES 기대값 최종 마무리

**추천 모델: GPT-6 Astra** — 기대값 검증과 코드·DB 공동복구를 통합한다.
**추천 추론 수준: Extra High** — 검증 오판과 복구 중 데이터 손실을 방지한다.
**실행 방식: 하위 에이전트 병렬 작업** — 백엔드·프론트·복구를 분담하고 부모가 원장·검증·커밋을 통합한다.

**GOAL:** a8eda817 기준 별도 워크트리와 복제 DB에서 지도 보류를 제외한 모든 기대값을 현재 검증 근거로 닫고, 코드·DB 공동복구까지 검증한 배포 준비본을 세분화하여 커밋·푸시한다.

이 문서는 최초 계획이다. 2026-10-08 이후 실행 범위와 최종 목적지는 [후속 안전성 계획](2026-10-08-mes-safe-closure.md)이 우선한다. 주간보고의 제한된 동결 예외와 세 추천안이 승인되었으며 작업 브랜치만 푸시하고 해당 HEAD의 CI를 확인한다.

## 승인 범위

- 원본 기대값 ID·피드백·출처 SHA와 과거 관찰을 보존한다. G01~G10 및 승인된 이력·사유 정책을 적용한다.
- MAP-01~06은 모두 보류한다. HANDOVER 제외 항목은 별도 집계한다. 분모와 상태는 원장에서 계산한다.
- 원본 main의 기존 변경은 d9c1df01, a8eda817로 커밋·푸시했다. 이후 구현은 별도 워크트리에서 진행한다.
- 실제 직원·개발 DB 변경, 원본 서비스 start/stop, 예약 작업 변경, 직원 배포는 제외한다. 목표는 READY_NOT_APPLIED다.
- 동결된 주간보고·모바일 탭바 디자인·출하 고정 카드 수정은 제외하고 읽기 검증은 포함한다.

## 원장·실행 도구

- 모든 technical/staff 기대를 읽어 원자 조건으로 검토한다. 기존 테스트의 실제 assertion을 연결하고 부족한 조건만 보완한다.
- schema 2에 requiredEvidence(test/browser/both), 실제 실행 인스턴스와 근거를 연결한다. 연결 자체는 PASS가 아니다.
- run-mes-expectations.mjs는 smoke/P0/full/개별 ID 실행, run ID와 영구 증거 promote를 제공한다. full은 non-deferred 전체다.
- pytest JUnit, Vitest JSON, Playwright JSON, Node JUnit을 실제 runner 출력으로 수집한다. 누락·중복·0매칭·SKIP·파라미터 일부·retry 성공은 대상 PASS로 인정하지 않는다.
- 제품·테스트·설정·lock·fixture·조건 지문을 기록한다. 조건별 관련 입력이 그대로인 결과만 재사용하며 공통 변경은 소비자를 무효화한다. HEAD는 감사 정보이며 문서 커밋만으로 무효화하지 않는다.
- 필수 raw 보고서·manifest·화면은 원장 옆 sources/verification에 영구 보존하고 진단 trace/video는 runtime에 둔다.
- normalize --check --require-complete와 도구 안전성 테스트를 CI에 추가한다. 기존 전체 CI는 유지한다.

## 기능별 검증

- 공통 인증·설정·알림, 조회·품목·대시보드, 입출고·승인, 불량, 내역, 출하, 관리자·공급업체, 일일·주간보고, 도구 묶음의 누락·중복을 검사한다.
- 등급 제거·독립 승인 역할·최초 분류 발생량·원자재 입고·품목 상세 복원·취소 건수·탭 동기화·제출 묶음·사유 카테고리를 현재 근거로 연결한다.
- PC/모바일 정상 복귀: 처리 중 Back/취소→보관, 완료 후 보관의 작업 선택 및 Back 한 번→허브, Forward에서 완료 폼/중복 거래 없음. 직접 진입과 옛 history는 안전 fallback한다.
- B급/구형 × 부분/전량 × PC/모바일, 반복 처리·취소·수량·목록 갱신과 Next/탭 history 보존을 검증한다.
- 실제 브라우저는 mes-browser-regression 전용 환경에서 부모가 순차 수행한다. 복제 실데이터와 합성 QA fixture의 용도를 분리한다.

## 사전검증·공동복구

- 최신 직원 온라인 snapshot의 복제본으로 0039→0040→0041→0042→0043을 검증한다. level 삭제만 예외로 직원 정보·PIN·역할·설정·연결·대기·예약을 보존한다. 0041의 nullable 제출 payload hash, 0042의 nullable 부서 표시명, 0043의 nullable 거래 품목 snapshot은 기존 행 값을 바꾸거나 백필하지 않는다.
- 0040은 옛 업무 행/컬럼/자식/사유를 비교한다. 허용 테이블 전체를 비교 제외하지 않는다.
- 일반 recover CLI는 record, employee-root, admission-sha256을 요구한다. admission은 journal/root/DB target/old backup·manifest·revision/old code·Node/new code·migration/validator hash를 고정한다.
- admission이 연결된 MIGRATING만 복구하고 CONFIRMED·legacy·Friday 혼용·변조·drift·불확실 ownership을 차단한다. 기존 rollback/Friday 보호는 유지한다.
- 일반 activation은 BEGIN IMMEDIATE 쓰기 차단을 start→health→confirm까지 유지한다. 실패 시 서비스 정지·포트 해제 후 해제한다.
- 공동복구는 owned stop→실패 자료 보존→옛 DB→보존형 멱등 옛 code/Node→옛 validator 검증→ROLLED_BACK 순서다. 기본 재시작은 없다.
- 부분 실패의 실제 DB/code 상태와 receipt를 보존한다. 동일 admission 및 명시 resume/hash로만 재개한다.
- 최종 격리 0038→0039→0040→0041→0042→0043→0038, 단계별 fault/resume/tamper/writer/owner/confirmed 거부를 검증한다. 실제 환경에서 recover/activate는 실행하지 않는다. 진행 중 0042 캡처 리허설은 해당 revision과 artifact의 진단 근거로 별도 보존한다.
- 최종 리허설은 실제 old/new 프론트 production 빌드와 lockfile·Node·artifact manifest를 사용한다. `_attic/runtime/closure/recovery/prepare_rehearsal_artifacts.py`가 직원 소스를 읽기 전용으로 캡처하고 변경 중인 새 소스도 별도 고정한다. 활성 `.next`를 빌드하지 않으며, Windows 경로 길이를 피한 전용 runtime에서 설치·빌드·bundle 검사와 SHA 검증을 수행한다.
- `_attic/runtime/closure/recovery/rehearse_0042.py --hard-exit --target-revision 20261007_0043`는 최종 고정 artifact의 head가 0043인지 확인하고 전용 임시 설치본에서 실제 install/install_code·admission·복구 함수를 호출한다. 모든 기존 테이블의 기존 컬럼과 행을 각 revision에서 비교하고, DB 설치 직후 별도 프로세스 강제 종료→receipt hash를 지정한 resume→0038 전행 및 옛 frontend·Node·code 일치를 확인한다. 보존 baseline DB의 SHA도 실행 전후 같아야 한다. 대상 옵션을 생략한 0042 실행은 기존 캡처 진단용이다.
- 한계: 옛 프론트는 직원 소스에서 다시 빌드한 것이므로 기존 운영 빌드와 바이트가 같다고 주장하지 않는다. 서비스 시작·중지와 실제 포트 ownership은 임시 root만 허용하는 대체 함수이며 HTTP health·예약 작업 실동작 검증을 대신하지 않는다. 병렬 변경 중 캡처는 최종 배포 근거가 아니므로 전체 소스 고정 후 snapshot/manifest와 결과를 다시 생성한다. 과거 대체 프론트 0040 리허설은 그 범위의 역사 근거로 보존한다.

## 통합·종료

- 관련 테스트를 먼저 실행하고 검증 체계 통합 후 전체 로컬 게이트는 한 번 수행한다. 좁은 후속 변경은 관련 검사만 반복한다.
- full 기대값, strict 완료 검사, 타입/정적/커버리지/E2E/build/승인된 3.00MB bundle을 확인한다.
- 부모만 명시 stage·cached check·smart 계획·실제 날짜/한국어 제목의 기능별 commit/push를 수행한다. 최종 CI 성공까지 확인한다.
- 활성 TODO·사용자 가이드·운영 안내·증거를 갱신한다. eligible의 미검토/미연결/NOT_RUN/PARTIAL/FAIL/대상SKIP이 없어야 완료다.
