> **추천 모델: GPT-5.6 Sol** - 데이터 무결성, 행위자 식별, 동시성, 운영 DB 계약, 프런트엔드 상태 흐름을 함께 판단해야 하는 광범위한 개선 계획이다.
> **추천 추론 수준: 매우 높음** - 개별 리팩터링보다 업무 규칙과 트랜잭션 경계를 먼저 보존해야 하며, 잘못된 순서는 재고 중복이나 감사 추적 손실로 이어질 수 있다.
> **추천 실행 방식: 하위 과제별 subagent + 상위 세션 통합** - 서로 독립적인 수직 과제는 병렬 검토하되, 최종 데이터 모델·인증 정책·검증·커밋은 한 세션에서 통합한다.

# DEXCOWIN MES 코드 품질 감사 및 단계별 개선 계획

- 작성일: 2026-07-10
- 감사 기준 커밋: 562d4e9f4e07d50e47a35d249d0792517f39755c
- 감사 범위: 기준 커밋과 2026-07-10 현재 미커밋 작업 트리
- 문서 성격: 분석과 향후 구현 계획만 포함
- 이번 작업에서 한 일: 소스, 테스트, 문서, 커밋 이력을 읽고 정적 분석
- 이번 작업에서 하지 않은 일: 코드 수정, 설정 수정, 테스트 실행, 서버 실행, DB 변경, 커밋, 푸시

> **GOAL:** DEXCOWIN MES의 데이터 무결성·권한·동시성 위험을 먼저 제거하고, 핵심 업무 흐름을 회귀 가능한 깊은 Module과 필수 품질 게이트로 정착시킨다.

---

## 1. 결론

DEXCOWIN MES의 현재 품질은 “구조가 나쁜 프로젝트”가 아니다. 재고 계산, 재고 효과 반전, 승인 규칙 드리프트 방지, API 오류 모델, Query Key, OpenAPI 기준선처럼 좋은 이음매가 이미 존재한다. 2026년 6월 이후의 정리 커밋도 실제 중복과 N+1을 줄이고 핵심 서비스 회귀 테스트를 보강했다.

다만 다음 네 종류의 위험은 화면 정리나 파일 분할보다 먼저 다뤄야 한다.

1. **요청 결과를 알 수 없는 실패의 중복 처리 위험**
   - 프런트엔드 타임아웃은 실제 요청을 중단하지 않는데, 재시도 키를 새로 만든다.
   - 서버가 첫 요청을 완료한 뒤 사용자가 재시도하면 재고가 두 번 반영될 수 있다.

2. **인증되지 않은 작업자 식별과 승인 정책의 불일치**
   - 현재 미커밋 출하 변경은 로그용 헤더를 업무 행위자 인증처럼 사용한다.
   - “관리자 권한만으로 승인할 수 없다”는 정책과 달리 일부 서비스는 여전히 관리자 자체 승인을 허용한다.

3. **동시성·트랜잭션 경계의 빈틈**
   - 출하 상태 전이, 거래 정정·취소, 무결성 복구와 감사 로그가 행 잠금·유일 제약·단일 커밋으로 보호되지 않은 경로가 있다.
   - 단일 사용자 순차 실행에서는 정상처럼 보이지만, 중복 클릭이나 두 작업자의 동시 처리에서 문제가 나타날 수 있다.

4. **운영 DB 계약 자체의 상충**
   - database.py의 production guard와 기본 Docker 구성은 PostgreSQL을 요구하지만, 기본 실행값·운영 매뉴얼·NAS 구성은 SQLite/WAL을 현행 운영 DB로 설명한다.
   - 일부 SQL 표현식은 SQLite 전용이고 자동 테스트도 SQLite만 강제하므로, 현재는 어느 DB를 정식 운영 계약으로 검증해야 하는지부터 합의해야 한다.

따라서 구현 순서는 반드시 다음과 같아야 한다.

1. 중복 재고·행위자 위조·승인 정책 차단과 DB 운영 계약 결정
2. 상태 전이와 정정·취소의 원자성 보강
3. 프런트엔드 저장/더티/비동기 경합 수정과 필수 E2E 복구
4. 깊은 업무 Module로 구조 정리
5. 보안, 접근성, 문서, 정적 품질 게이트 확장

파일 길이만 보고 분할하거나 기존 “100점” 문서의 숫자를 다시 올리는 방식은 권장하지 않는다. 이 프로젝트에서는 **업무 규칙의 단일성, 실패 시 원자성, 재시도 안전성, 실제 운영 환경에서의 검증 가능성**이 코드 줄 수보다 중요한 품질 지표다.

---

## 2. 감사 범위와 증거 규칙

### 2.1 감사한 자료

#### 현재 코드와 테스트

- backend/app 아래의 라우터, 서비스, 모델, 저장소, 인증·감사 유틸리티
- backend/tests 아래의 승인, 입출고, 출하, 트랜잭션, 서비스 회귀 테스트
- frontend/app/mes 아래의 데스크톱·모바일 실행 화면
- frontend/lib 아래의 API, Query, 업무 타입, 공용 접근성 이음매
- frontend의 Vitest, TypeScript, 번들, E2E 설정
- .github/workflows/ci.yml
- Docker 및 운영 문서의 DB 설정

#### 과거 품질 리뷰 문서

- _attic/docs/code-review-2026-06-02.md
- _attic/docs/research/2026-06-05-cleancode-review-prep.md
- _attic/docs/research/2026-06-10-clean-code-review-map.md
- _attic/docs/research/frontend-100-score-refactor-plan.md
- _attic/docs/research/frontend-100-score-final-review.md
- _attic/docs/research/frontend-100-score-round9-final.md
- _attic/docs/improve-codebase-architecture-2026-05-29-summary.md
- _attic/docs/BACKEND_REFACTOR_PLAN.md
- _attic/docs/research/pin-security-migration-plan.md
- _attic/docs/CODING_STYLE.md
- _attic/handoff/2026-06-04-cleanup-code-review.md
- _attic/handoff/2026-07-01-cleancode-type-hints-report.md
- _attic/handoff/2026-07-10-warehouse-conversion-final-polish-todo.md

#### 대표 개선 커밋

| 커밋 | 확인된 개선 | 현재 평가 |
|---|---|---|
| 4bbbb7c8 | 거래 공통 필터 추출 | 유지할 좋은 이음매 |
| 2297682e | 불량 조회 N+1 제거 | 실제 성능 개선 |
| 972391b4 | 생산 함수 책임 분리 | 후속 서비스 추출의 기반 |
| 86bde79c | production_receipt 서비스 추출 | 깊은 업무 Module의 좋은 사례 |
| 4333ee7d | schemas 패키지 분리 | 공개 import 호환성을 유지한 구조 개선 |
| 59f656f4 | transactions helper 분리 | 라우터 책임 축소 |
| 6e7a637e | app/legacy를 app/mes로 이동 | 제품 용어 정합성 개선 |
| 8904d1cf | DesktopLegacyShell을 MesShell로 변경 | 실행 경로 명명 개선 |
| 1541fe7e | 핵심 서비스 회귀 테스트 추가 | 리팩터링 안전망 강화 |
| 4c152b9b | 전용 DB E2E 구성 | 테스트 격리 개선 |
| e72d4068 | coverage, OpenAPI, build 게이트 | 품질 회귀 방지 기반 |
| 729d1fc4 | 번들 게이트 | 성능 예산 도입 |
| 0513a3eb | picker 정렬 순수 함수화 | 작고 검증 가능한 계산 분리 |
| a83dbb4f | 전체 E2E 작업을 비차단 처리 | 임시 안정화였으나 현재는 품질 게이트 약화 |
| 0afa5820 | 관리자 레벨 자동 승인 권한 제거 | 일부 실행 경로에 정책이 완전히 전파되지 않음 |

### 2.2 스냅샷 주의사항

현재 작업 트리에는 출하, 거래 이력, 품목 전환 등 다른 작업의 미커밋 변경이 존재한다. 본 문서는 이를 삭제하거나 정리하지 않았으며 다음 원칙으로 다뤘다.

- 기준 커밋에도 있는 문제는 일반 품질 부채로 분류했다.
- 현재 미커밋 변경에서 새로 생긴 문제는 **병합 차단**으로 분류했다.
- 현재 큰 폭으로 수정 중인 이력 화면은 안정된 실행 경로로 간주하지 않아 구조 평가에서 제외했다.
- 줄 번호는 이 스냅샷 기준이다. 구현 시작 시 심볼 이름으로 다시 검색하고 최신 줄 번호를 기록한다.

스냅샷 구분:

- QP-002의 actor 경로와 QP-022의 번들 임계값 상향은 현재 작업 트리 변경에 직접 관련된다.
- QP-010, QP-011, QP-012, QP-015, QP-016, QP-017과 반응형 Shell 문제는 기준 커밋에도 존재한다.
- QP-019가 검토하는 구조는 기준 커밋에도 있으나, 실제 중복은 확인되지 않았고 현재 IoComposeView 미커밋 변경은 별도 품목 전환 prop 전달이다.

### 2.3 증거 표기

- **확인됨:** 실제 실행 경로와 관련 테스트를 읽어 사실로 확인했다.
- **추정:** 코드상 위험은 있으나 운영 데이터·부하 측정 없이 실제 발생 빈도는 단정하지 않는다.
- **권고:** 확인된 사실에서 도출한 구현 방향이다.

문제를 등록할 때 “파일이 크다”, “이름상 중복 같다”, “테스트하기 어려워 보인다”는 표현만으로 결론을 내리지 않는다. 반드시 실제 호출 경로와 file:line을 붙인다.

---

## 3. 이번 감사의 품질 기준

기존 “100점” 방식 대신 다음 여덟 축을 사용한다. 축마다 동일한 점수를 부여하지 않고, 업무 위험에 따라 우선순위를 정한다.

### 3.1 업무·데이터 정확성

- 재고 수량, 상태, 거래 로그가 하나의 명령에서 함께 성공하거나 함께 실패하는가
- 같은 요청의 재시도가 한 번만 반영되는가
- 삭제된 품목이나 유효하지 않은 작업자가 신규 업무에 사용되지 않는가
- 업무 규칙이 라우터, 서비스, 화면마다 다르게 복제되지 않는가

### 3.2 인증·감사 신뢰성

- 감사 로그의 작업자 ID가 사용자가 임의로 보낸 값이 아닌 검증 결과인가
- PIN, 권한, 활성 상태, 속도 제한이 모든 민감 작업에서 같은 정책을 사용하는가
- 실패한 업무 변경과 성공 로그가 서로 어긋나지 않는가

### 3.3 동시성·트랜잭션

- check-then-write 구간이 행 잠금 또는 DB 유일 제약으로 보호되는가
- 여러 재고 행을 잠글 때 정렬 순서가 결정적인가
- 서비스가 내부에서 임의로 커밋해 상위 작업의 원자성을 깨지 않는가

### 3.4 Module 깊이와 지역성

- 복잡한 업무 규칙을 작은 공개 Interface 뒤에 숨기는 깊은 Module인가
- 라우터와 React 화면이 조정자 역할만 하는가
- 관련 규칙과 테스트가 가까이 있어 한 변경의 영향 범위를 찾기 쉬운가
- 단순히 줄 수를 줄이기 위해 얕은 파일을 늘리지는 않는가

### 3.5 계약·타입·DB 호환성

- 백엔드 OpenAPI와 프런트엔드 DTO가 함께 검증되는가
- 선택한 운영 DB와 빠른 테스트 DB의 dialect 차이를 CI가 잡는가
- TypeScript 테스트 코드도 실제 컴파일 대상인가

### 3.6 테스트·품질 게이트

- 실패하면 배포를 막아야 할 핵심 흐름이 실제로 차단 게이트인가
- 상태 전이, 재시도, 경합, 롤백 같은 위험 기반 테스트가 있는가
- 커버리지 숫자가 이미 테스트된 유틸리티만 대상으로 하지 않는가

### 3.7 사용자 상태·접근성

- 저장되지 않은 변경, 요청 중, 결과 불명, 실패, 성공 상태가 구분되는가
- 오래된 비동기 응답이 최신 입력을 덮어쓰지 않는가
- 모달의 초점, ESC, 키보드 조작, 오류 안내가 일관적인가

### 3.8 문서·운영 진실성

- 문서가 실제 실행 경로, 현재 DB 계약, 현재 화면 목록을 설명하는가
- 역사 문서와 현재 규칙 문서를 구분하는가
- 측정하지 않은 성능·복잡도를 사실처럼 쓰지 않는가

### 3.9 우선순위와 담당 난이도

| 표기 | 의미 |
|---|---|
| P0 | 병합 또는 배포 전에 막아야 하는 데이터·인증·운영 계약 문제 |
| P1 | 다음 릴리스에서 해결해야 하는 높은 회귀·사용자 오류 위험 |
| P2 | 계획된 구조 개선과 품질 게이트 |
| P3 | 측정 후 진행할 위생·정리 작업 |
| J | 주니어가 체크리스트대로 구현 가능, 리뷰 필수 |
| P | 주니어와 시니어 페어링 권장 |
| S | 보안·DB·아키텍처 결정을 포함하므로 시니어 주도 |

상태 표기는 다음 의미로만 사용한다.

| 상태 | 의미 |
|---|---|
| OPEN | 실행 경로에서 확인된 문제이며 구현 결정을 내릴 수 있음 |
| MERGE-BLOCKER | 현재 미커밋 변경에 새로 생긴 위험으로 병합 전 해결 필요 |
| DECISION | 코드보다 제품·운영 정책 결정이 먼저임 |
| DEFER | 선행 카드가 끝나기 전 구현하지 않음 |
| MEASURE FIRST | 측정 또는 중복 증명 전 코드 변경 금지 |
| RESOLVED | 현행 코드·테스트·커밋으로 해결 확인 |
| SUPERSEDED | 후속 구조나 정책이 과거 제안을 대체함 |
| REJECTED | 실제 코드 확인 결과 문제 아님 또는 실익보다 위험이 큼 |
| NO CHANGE | 측정 결과 구현이 불필요해 코드 변경 없이 종료 |

---

## 4. 잘된 부분과 반드시 보존할 자산

### 4.1 재고 계산의 단일 진실 공급원

- backend/app/services/stock_math.py:35-57, 95-139
- StockFigures는 품목·재고 조회, IO preview, production capacity에서 파생 재고 값을 계산하는 깊은 Module 역할을 한다.
- 계산식이 화면이나 라우터에 흩어지는 것을 막고, 순수 계산 중심이라 회귀 테스트가 쉽다.

**보존 원칙:** 새로운 조회·preview 파생값을 추가할 때 별도 계산식을 만들지 말고 StockFigures의 Interface를 먼저 검토한다. write 불변식은 기존 inventory service와 DB constraint가 우선이며 StockFigures를 모든 쓰기 검증에 억지로 확장하지 않는다.

### 4.2 재고 효과 기록과 반전

- backend/app/services/inv_effect.py:1-10, 71-103
- 업무 명령이 어떤 재고 열을 얼마나 바꿨는지 일반화해 기록하고 되돌릴 수 있다.
- 취소 기능을 “원래 명령을 추측해 반대로 실행”하는 방식보다 안전하게 만든다.

**보존 원칙:** 정정·취소 개선에서도 기존 effect 모델을 우회하지 않는다. 신규 명령은 effect 기록 누락 테스트를 반드시 가진다.

### 4.3 DB 제약과 결정적 잠금 순서

- backend/app/models/inventory.py:69-78, 110-114
- backend/app/services/inv_base.py:143-154
- backend/app/services/sr_execution.py:371-386
- 음수 또는 중복을 막는 DB 제약이 있고, 여러 품목 잠금 순서를 정렬해 교착 위험을 낮춘 경로가 있다.

**보존 원칙:** 출하와 거래 정정도 같은 잠금 유틸리티를 재사용한다. 각 서비스가 임의 순서로 행을 잠그지 않는다.

### 4.4 세션 롤백·종료 계약

- backend/app/database.py:75-87
- 요청 실패 시 롤백하고 세션을 닫는 경계가 명확하며 관련 테스트가 존재한다.

**보존 원칙:** 요청-scoped 도메인 서비스가 상위 unit of work에 참여할 때는 내부 commit을 하지 않고 flush까지만 수행해 요청 경계가 최종 commit을 소유하게 한다. 명시적 transaction-boundary Adapter와 독립 CLI는 소유권이 문서화된 예외다.

### 4.5 승인 정책 드리프트 테스트

- backend/app/services/approval_rules.py:1-29
- backend/tests/test_approval_rules_drift.py:1-50
- 프런트엔드와 백엔드의 기본 승인 상수를 비교하는 테스트가 있다.

**보존 원칙:** 상수 일치만 검증하는 현재 테스트를 역할 조합과 실행 결과까지 확장한다. 기존 테스트를 삭제하지 않는다.

### 4.6 프런트엔드 업무 Interface와 오류 모델

- frontend/lib/io/glossary.ts 및 관련 테스트
- frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts
- frontend/lib/api-core.ts:44-99
- frontend/lib/queries/keys.ts:10-111
- frontend/lib/mes/useFocusTrap.ts

업무 용어, 작업 타입, API 오류, Query Key, 초점 관리가 공용 Interface로 이미 분리되어 있다. 이것은 새 추상화보다 우선 재사용해야 할 기반이다.

### 4.7 테스트와 호환성 Facade

- OpenAPI 기준선, 프런트엔드 lint·tsc·Vitest·build·bundle, 격리 DB E2E가 존재한다.
- schemas와 API re-export Facade는 이동 후 기존 import를 보존하는 의도적 호환 계층이다.

**보존 원칙:** re-export 파일을 “내용이 없다”는 이유로 제거하지 않는다. 공개 import 경로 변경은 별도 마이그레이션으로 다룬다.

### 4.8 현재 구조를 유지해야 하는 영역

- IoComposeView는 크지만 여러 업무 Hook과 골든 테스트를 통해 이미 이음매를 갖는다. 줄 수만으로 다시 분할하지 않는다.
- production_capacity의 legacy/AF 이중 경로는 실제 업무 차이를 반영하고 서비스 테스트가 있다. 증거 없이 합치지 않는다.
- BOM cache의 전체 조회는 메모리·쿼리 측정 전까지 결함으로 단정하지 않는다.
- 주간보고 화면·백엔드와 모바일 하단 탭 디자인은 동결 영역이다. 본 계획의 전역 리팩터링 대상에서 제외한다.

---

## 5. 과거 품질 리뷰에 대한 재평가

### 5.1 유효하게 계승할 내용

- 실제 실행 경로를 먼저 찾은 뒤 평가한다.
- 확인된 사실, 추정, 권고를 분리한다.
- 위험도, 테스트, 완료 조건을 함께 기록한다.
- 해결됨, 거절됨, 대체됨 상태를 남겨 같은 문제를 반복 분석하지 않는다.
- 서비스 추출 전후에 회귀 테스트를 둔다.
- 폴더 이동 뒤 공개 import와 문서를 함께 검색한다.

### 5.2 폐기할 내용

frontend-100-score 계열 문서의 숫자는 현재 의사결정 지표로 사용하지 않는다.

확인된 이유는 다음과 같다.

- 빈 폴더 또는 준비용 디렉터리를 진행률로 계산한 항목이 있다.
- 서로 다른 위험에 임의의 동일 가중치를 적용했다.
- 파일 줄 수 임계값을 품질 점수로 직접 환산했다.
- 당시 언급한 일부 커밋 해시는 이후 이력 재작성으로 현재 브랜치에서 직접 도달할 수 없다.
- 일부 테스트 결과는 실제 실행 결과가 아니라 “통과 예상”으로 기재됐다.

따라서 이 문서들은 **역사적 정리 과정의 참고 자료**로만 유지하고, 현재 품질 상태를 나타내는 문서로 연결하지 않는다. 향후 완료 보고서는 점수 대신 다음을 보여준다.

- 어떤 실패 모드를 차단했는가
- 어떤 업무 규칙의 단일 진실 공급원을 만들었는가
- 어떤 회귀 테스트와 DB 제약이 추가됐는가
- 어떤 게이트가 배포를 실제로 차단하는가
- 남은 위험과 의도적으로 미룬 항목은 무엇인가

### 5.3 과거 주장별 현행 상태

| 과거 주장·작업 | 현행 상태 | 해결·거절 근거와 해석 |
|---|---|---|
| frontend Round 1~9의 개별 점수 상승 | SUPERSEDED | 개별 해시 일부는 이력 재작성 뒤 도달할 수 없고 실질 hardening 결과는 2026-05-02 b1a7948f 통합 commit과 후속 main 이력에 남아 있다. 숫자는 현재 지표로 쓰지 않는다. |
| 빈 features/mes 골조도 구조 진전으로 계산 | REJECTED | 실제 소비처가 없던 골조는 2026-06-05 b577189a에서 7개 파일이 삭제됐다. 빈 구조는 품질 성과가 아니다. |
| 공통 UI primitive 재사용 | RESOLVED | 2026-05-04 9a1b2798부터 7d0417f6까지 공통 primitive와 소비처 교체가 단계적으로 반영됐다. 현재 실행 경로를 기준으로 유지한다. |
| Inventory Python guard가 없어 무방비 | REJECTED | _attic/docs/code-review-2026-06-02.md:282-285에서 DB CHECK가 이미 4중 방어한다는 사실을 확인해 오판으로 정정했다. |
| soft delete 후 mes_code 재등록 충돌 | RESOLVED | 2026-06-02 274a2e0a가 deleted_at IS NULL 부분 unique를 추가했다. 다만 삭제 품목의 active lookup 문제는 별도 QP-009로 OPEN이다. |
| 거래 취소 역산을 새 서비스로 단순 이동 | REJECTED | inv_effect가 이미 반전 Interface를 제공해 얇은 pass-through 추출은 실익이 낮다고 판단했다. QP-007은 이 제안의 반복이 아니라 새 동시성·수명주기 문제다. |
| 생산 입고·거래 필터·N+1·schema 분리 | RESOLVED | 4bbbb7c8, 2297682e, 972391b4, 86bde79c, 4333ee7d, 59f656f4와 후속 회귀 테스트로 실질 개선을 확인했다. |
| 전체 E2E 비차단은 임시 안정화 | OPEN | a83dbb4f의 임시 선택이 현재도 전체 job을 비차단으로 만들어 QP-012에서 안정 smoke와 관찰 job을 분리해야 한다. |

---

## 6. 우선순위 요약

| ID | 우선순위 | 문제 | 상태 | 담당 |
|---|---:|---|---|---|
| QP-001 | P0 | 입출고 타임아웃 후 새 재시도 키로 중복 재고 가능 | OPEN | P |
| QP-002 | P0 | 미커밋 출하·품목 전환이 헤더·body 직원 ID를 검증 actor로 사용 | MERGE-BLOCKER | S |
| QP-003 | P0 | SQLite 현행 운영과 PostgreSQL production guard의 계약 상충 | DECISION | S |
| QP-004 | P0 | 관리자 자체 승인 정책이 경로마다 다름 | OPEN | P |
| QP-005 | P0 | 불량 등록 idempotency가 원 요청과 새 payload를 비교하지 않음 | OPEN | P |
| QP-006 | P1 | 상태 의존 출하 mutation 전반에 공통 잠금·명령 idempotency가 없음 | OPEN | S |
| QP-007 | P1 | 거래 정정·취소가 라우터에 집중되고 동시 실행 제약이 약함 | OPEN | S |
| QP-008 | P1 | 무결성 복구 서비스 내부 commit이 감사 로그 원자성을 깨뜨림 | OPEN | J |
| QP-009 | P1 | soft delete 품목을 신규 업무가 다시 사용할 수 있음 | OPEN | P |
| QP-010 | P1 | 부서 관리 더티 상태와 비동기 저장 계약이 연결되지 않음 | OPEN | J |
| QP-011 | P1 | 출하 BOM 비동기 응답 경합과 잘못된 더티 판정 | OPEN | J |
| QP-012 | P1 | 전체 E2E 작업이 continue-on-error라 핵심 회귀를 막지 못함 | OPEN | P |
| QP-013A | P0 | VerifiedActor 공통 식별 Interface와 시도 제한이 없음 | OPEN | S |
| QP-013B | P2 | 식별용 PIN을 보안 인증으로 격상할지와 안전한 이행 방식 | DECISION | S |
| QP-014 | P2 | 백엔드 운영 DB·Ruff·점진적 mypy·Python minor 필수 게이트가 없음 | OPEN | P |
| QP-015 | P2 | 프런트 테스트 타입 검사와 위험 기반 커버리지에 사각지대 | OPEN | J |
| QP-016 | P2 | 모달·상호작용 요소의 키보드·초점·오류 접근성이 불일치 | OPEN | J |
| QP-017 | P2 | React Query 외 별도 서버 상태 경로와 사용되지 않는 SWR 잔존 | OPEN | P |
| QP-018 | P2 | 출하 프런트 화면의 업무 조정 경계가 얕고 넓음, 선행 QP-006/011/021B | DEFER | P |
| QP-019 | P3 | 이미 공유 중인 데스크톱·모바일 IO에 추가 공통화 실익이 있는지 재검증 | MEASURE FIRST | P |
| QP-020 | P2 | OpenAPI와 프런트 DTO가 수동으로 이중 관리됨 | OPEN | P |
| QP-021 | P2 | 오류·health 의미와 출하 조회 비용의 운영 계약이 약함 | OPEN | P |
| QP-022 | P3 | 번들 지표, 반응형 Shell, 문서가 실제 구조를 정확히 반영하지 못함 | OPEN | P |
| QP-023 | P3 | Hook 억제, 업무 BOM cache, UTF-8 Byte Order Mark, 미사용 의존성은 측정 필요 | MEASURE FIRST | J |

### 6.1 구현 전에 닫아야 할 결정 대기 큐

| 결정 ID | 질문 | 연결 카드 | 결정 전 기본 행동 |
|---|---|---|---|
| D-01 | 현행 운영 DB를 SQLite로 공식화할지 PostgreSQL로 전환할지 | QP-003, 006, 007, 014 | dialect·lock 구조 변경 보류 |
| D-02 | 작업자 식별을 기존 PIN으로 유지할지 서버 인증 세션으로 바꿀지 | QP-002, QP-013 | 미커밋 actor mutation 병합 보류 |
| D-03 | component change와 item conversion을 누가 실행할 수 있는지 | QP-002 | active 직원만으로 충분하다고 추정하지 않음 |
| D-04 | 정정이 평생 1회인지, 활성 1회이며 취소 뒤 재정정 가능한지 | QP-007 | DB unique 제약 추가 보류 |
| D-05 | 열린 요청·출하가 참조하는 품목 삭제와 이후 보상 정책 | QP-009 | 새 효과 실행 시 active 재검증, 구조 변경 보류 |
| D-06 | 식별용 PIN을 보안 인증으로 격상하고 Argon2id로 이행할지 | QP-013B | 현행 hash를 직접 덮어쓰지 않음 |

결정자는 사용자와 해당 영역 시니어다. 주니어 구현자는 표의 선택지를 임의로 고르지 않고 ADR 번호와 결정 문장을 작업 카드에 연결한다.

---

## 7. 상세 수정 카드

## QP-001. 결과 불명 요청의 idempotency 보존

**목표:** 사용자가 네트워크 오류나 타임아웃 뒤 재시도해도 하나의 입출고 명령이 최대 한 번만 재고에 반영되고, 같은 키에 다른 명령이 들어오면 성공처럼 보이지 않게 한다.

### 확인된 증거

- frontend/lib/api-core.ts:189-213
  - Promise.race로 시간 초과를 반환하지만 진행 중인 fetch를 중단하지 않는다.
- frontend/lib/api-core.ts:202-208
  - 타이머가 이긴 뒤에도 서버 요청이 성공할 수 있다.
- frontend/app/mes/_components/_warehouse_v2/useIoSubmit.ts:21-44
  - 중복 방지용 client_request_id를 만들지만 ApiError 503을 제외한 대부분의 오류에서 키를 비운다.
- backend/app/routers/io.py:204-244
  - 서버는 client_request_id 기반 중복 요청을 처리한다.
- backend/tests/test_io_v2.py:372-399
  - 동일 키 재시도 테스트는 있으나 “클라이언트 타임아웃 뒤 서버 성공” 시나리오는 없다.
- backend/app/services/io_draft.py:107-128
- backend/app/routers/io.py:227-233
- backend/app/models/io_batch.py:52
  - 서버는 같은 키를 찾으면 payload 의미를 비교하지 않고 기존 batch를 반환한다. 중복 재고는 막지만 수정한 다른 명령이 처리된 것처럼 오인될 수 있다.

### 실패 시나리오

1. 사용자가 입고 버튼을 누른다.
2. 서버는 재고를 반영 중이지만 프런트엔드 제한 시간이 먼저 끝난다.
3. 프런트엔드는 실패로 보이고 기존 client_request_id를 버린다.
4. 첫 요청은 서버에서 commit된다.
5. 사용자가 재시도하면 새 client_request_id가 전송된다.
6. 서버 입장에서는 새 명령이므로 같은 재고를 한 번 더 반영한다.

### 구현 파일

- frontend/lib/api-core.ts
- frontend/app/mes/_components/_warehouse_v2/useIoSubmit.ts
- frontend/app/mes/_components/_warehouse_v2/useIoSubmit.test.ts 또는 동일 위치 신규 테스트
- 필요 시 frontend/lib/api-errors.ts
- backend/app/services/io_draft.py
- backend/app/models/io_batch.py와 해당 schema·migration
- backend/tests/test_io_v2.py

### QP-001A. 같은 화면 세션의 긴급 중복 차단

1. API 오류를 최소한 다음 세 범주로 분리한다.
   - 응답 확인 완료: 서버가 4xx 등 명시적 거절 응답을 반환함
   - 결과 불명: timeout, network error, 브라우저 abort, 연결 끊김, 5xx
   - 성공 확인: 2xx 응답과 결과 수신
2. api-core의 timeout에 AbortController를 연결하고 finally에서 타이머를 정리한다.
3. AbortController가 요청을 취소했더라도 서버 처리 여부는 알 수 없으므로 결과 불명으로 분류한다.
4. useIoSubmit은 같은 작성 중 명령에 대해 성공이 확인될 때까지 client_request_id를 유지한다.
5. 단순 오류 표시 재시도는 반드시 같은 키를 사용한다.
6. 성공 뒤 새 업무를 시작하거나 사용자가 명시적으로 폼을 초기화할 때만 새 키를 만든다.
7. client_request_id, 명령 payload snapshot·fingerprint, idle·submitting·outcome_unknown·known_rejected·success phase를 한 상태로 묶는다.
8. 422처럼 서버가 명령을 수행하지 않았다고 확정한 뒤 입력이 바뀌면 새 fingerprint와 키를 만들 수 있다.
9. outcome_unknown에서는 입력을 조용히 수정해 새 키로 다시 보내지 못하게 한다. 같은 payload·키로 결과를 재확인하거나, “첫 요청이 이미 반영됐을 수 있음”을 명시적으로 확인하고 새 업무를 시작하게 한다.

### QP-001B. 서버의 semantic idempotency

1. IoBatch에 command_type, canonical_schema_version, command_fingerprint를 저장한다.
2. 품목·수량·source·target·approval kind·작업자 등 실제 효과에 영향을 주는 필드를 정규화해 fingerprint를 만든다.
3. 같은 키와 같은 command/version/fingerprint면 기존 batch를 반환한다.
4. 같은 키라도 command, version, payload 중 하나가 다르면 409 idempotency conflict를 반환하고 기존 batch와 재고는 바꾸지 않는다.
5. unique race에서도 기존 행을 다시 읽어 같은 비교를 수행한다.
6. 과거 fingerprint null 행은 새 payload를 신뢰하지 않고 409 또는 별도 legacy conflict로 처리한다.

### 필수 테스트

- 첫 요청이 서버에서 늦게 성공하고 클라이언트가 timeout을 받은 뒤 재시도하면 두 요청의 client_request_id가 같다.
- network error, abort, 500에서도 키가 유지된다.
- 성공 응답 뒤 다음 제출은 새 키를 사용한다.
- 품목, 수량, 작업 타입 등 명령 payload를 수정하면 새 fingerprint와 새 키가 생긴다.
- outcome_unknown 상태에서는 편집이 잠기거나 명시적 위험 확인 없이 새 키가 만들어지지 않는다.
- outcome_unknown 재확인은 같은 payload와 client_request_id를 사용한다.
- 같은 키와 같은 payload는 기존 batch를 반환하고 재고 효과와 TransactionLog가 한 번만 생성된다.
- 같은 키와 다른 payload는 409이며 기존 batch, 재고, 효과, 로그가 바뀌지 않는다.
- 동시에 같은 키를 보낸 race에서도 같은 fingerprint 비교가 적용된다.

### 완료 조건

- QP-001A 완료 시에는 “정상 프런트 경로의 같은 화면 세션에서 timeout 재시도 중복을 차단”했다고만 평가한다.
- QP-001B까지 완료해야 “입출고 semantic idempotency 완료”라고 평가한다.
- 같은 화면 세션에서 “재시도”라는 사용자 행동으로 동일 명령의 재고 효과가 두 번 생기지 않는다.
- 같은 키에 다른 명령을 보내도 사용자가 성공으로 오인하지 않는다.
- 결과 불명인 첫 요청을 모른 채 수정 payload를 새 명령으로 추가 반영하지 않는다.
- 결과 불명 오류는 일반 입력 오류와 다른 문구로 안내한다.
- 타이머와 AbortController가 요청 완료 후 남지 않는다.
- 새로고침 전후까지 보존할지는 별도 제품 결정으로 남기되, 같은 화면 세션 안의 중복은 반드시 차단한다.

### 하지 말 것

- 단순히 timeout 시간을 늘려 문제를 숨기지 않는다.
- timeout이면 서버가 실패했다고 가정하지 않는다.
- 백엔드 idempotency를 제거하고 버튼 disabled만으로 중복을 막지 않는다.

---

## QP-002. 미커밋 행위자 위조 경로 차단

**목표:** 재고·출하 상태를 바꾼 직원 ID는 사용자 입력을 그대로 신뢰하지 않고, 서버가 검증한 동일한 VerifiedActor 경계에서만 파생되게 한다.

### 확인된 증거

- backend/app/_actor.py:44-51
  - X-MES-Employee-Code를 로그 상관관계용 fallback으로 허용한다.
- backend/app/routers/shipping.py:194-208
  - 현재 미커밋 변경의 _load_component_change_actor가 get_actor_emp를 호출한다.
- backend/app/services/shipping.py:986-1069
  - 위 값을 producer_employee_id에 기록하는 현재 미커밋 경로가 있다.
- backend/app/schemas/shipping.py:82-88
  - 관련 요청에 작업자 ID가 있으나 PIN 검증 계약이 없다.
- backend/app/routers/io.py:85-108
  - 현재 미커밋 item-conversion 경로는 body의 requester_employee_id로 직원 존재·active만 확인하고 해당 직원을 actor로 저장한다.
- 기준 커밋에는 이 경로가 없으므로 일반 부채가 아니라 현재 변경의 병합 차단 항목이다.

### 위험

사용자가 임의 헤더 또는 body의 직원 ID를 보낼 수 있다면 다른 직원으로 생산·출하 변경을 기록할 수 있다. 감사 로그가 존재해도 신원이 검증되지 않았으므로 오히려 잘못된 책임 추적을 만든다.

### 즉시 지켜야 할 불변식

- get_actor_emp는 로깅·추적용으로만 유지한다.
- 업무 변경에서는 fallback 헤더와 body의 직원 ID를 검증 완료 actor처럼 사용하지 않는다.
- 다음 세 mutation은 같은 VerifiedActor 경계를 사용한다.
  - 두 shipping component-change API
  - backend/app/routers/io.py의 item-conversion API
- action별 허용 역할을 먼저 표로 확정한다. 단순 active 직원이면 충분한지, 창고 정·부 또는 별도 권한이 필요한지 사용자 결정 없이 추정하지 않는다.

### 선결 제품 결정

backend/app/services/pin_auth.py:1-4는 현재 PIN을 “작업자 식별용이며 실제 보안 인증이 아님”이라고 명시한다. 따라서 이 카드에서 PIN을 보안 인증으로 조용히 격상하지 않는다. 다음 중 하나를 ADR과 사용자 확인으로 선택한다.

- A. 현재의 경량 식별 모델 유지: employee_id와 기존 PIN 검증, active 확인, 공통 시도 제한을 거친 VerifiedActor를 사용하되 이를 계정 보안 인증이라고 부르지 않는다.
- B. 인증 모델 도입: 서버가 서명한 작업자 세션 또는 별도 인증 수단에서 VerifiedActor를 얻는다.
- C. UX·정책 결정을 미룸: 해당 미커밋 mutation을 병합하지 않거나 기능을 비활성화한다.

어느 선택에서도 헤더·body 직원 ID만으로 성공하는 경로는 허용하지 않는다.

### 구현 절차

1. 중앙 행위자 검증 이음매를 만든다.
   - 후보: backend/app/services/actor_auth.py
   - FastAPI 주입이 필요하면 backend/app/dependencies/actor.py를 얇은 Adapter로 둔다.
2. 반환 타입은 검증된 직원 엔터티 또는 VerifiedActor 값 객체로 제한한다.
3. 선택 A라면 최종 확인 UI에서 작업자 ID와 PIN을 받고, PIN은 React 영속 상태, localStorage, 로그, Query String에 남기지 않는다.
4. 라우터는 중앙 Interface를 한 번 호출하고 서비스에는 문자열 직원 코드 대신 VerifiedActor를 전달한다.
5. producer_employee_id, requester_employee_id, TransactionLog actor, AuditLog actor는 같은 VerifiedActor에서 파생한다.
6. 존재하지 않음, 비활성, 식별 실패, 권한 부족의 내부 원인은 남기되 외부 메시지는 계정 탐색 수단이 되지 않게 한다.
7. 선택 A 또는 B의 실패 시도 제한은 QP-013A의 공통 Adapter를 사용한다.

### 필수 테스트

- 행위자 정보가 없으면 401 또는 프로젝트가 정한 인증 오류로 실패한다.
- 임의 X-MES-Employee-Code만 보내면 실패한다.
- 다른 직원 UUID만 body에 넣어도 실패한다.
- 선택 A에서는 다른 직원 ID와 잘못된 PIN이 실패한다.
- 비활성 직원은 올바른 PIN이어도 실패한다.
- 권한 없는 직원은 실패한다.
- 성공 시 producer_employee_id, audit actor, transaction actor가 같은 직원이다.
- 세 mutation 모두 같은 행위자 검증 계약 테스트를 통과한다.
- 검증 실패 시 재고, 출하 상태, TransactionLog, AuditLog가 하나도 바뀌지 않는다.

### 완료 조건

- 현재 미커밋 출하 변경은 위 테스트가 통과하기 전 병합하지 않는다.
- get_actor_emp 호출 결과가 업무 엔터티의 actor 필드에 직접 저장되는 경로가 전체 검색에서 0건이다.
- 헤더 또는 body에서 받은 직원 식별자가 actor 필드에 직접 저장되는 mutation이 0건이다.
- 모든 actor 필드 입력은 VerifiedActor에서만 파생된다.
- 행위자 검증 정책이 출하·IO 라우터에 복제되지 않고 공통 Interface 뒤에 있다.

### 담당

보안·감사 신뢰성 변경이므로 시니어 주도. UI 연결과 테스트 fixture는 주니어가 분담할 수 있다.

---

## QP-003. 운영 DB 계약 결정과 dialect 정합

**목표:** SQLite와 PostgreSQL을 동시에 “현행 운영 DB”처럼 설명하는 모순을 먼저 해소하고, 사용자가 선택한 운영 DB에서 실제 코드·백업·CI 계약이 성립하게 한다.

### 확인된 증거

- backend/app/database.py:12-18
  - 기본 실행값은 backend/mes.db SQLite다.
- backend/app/database.py:22-37
  - 반대로 APP_ENV=production 또는 REQUIRE_POSTGRES에서는 PostgreSQL URL을 요구한다.
- backend/app/models/item.py:61-68
  - mes_code 생성식이 SQLite printf를 사용하며 PostgreSQL to_char가 구현되지 않았다는 주석이 있다.
- backend/app/routers/inventory/_tx_filters.py:121-124
  - PostgreSQL에 없는 instr 함수를 사용한다.
- backend/app/routers/models.py:170-176
  - 같은 instr 의존이 중복된다.
- backend/tests/conftest.py:14-18
  - 테스트 DB가 SQLite로 강제되므로 단순히 CI 환경 변수만 바꿔서는 PostgreSQL 테스트가 되지 않는다.
- _attic/docs/OPERATIONS.md:41-54
  - backend/mes.db 단일 SQLite/WAL을 현행 운영 DB와 백업 대상으로 명시한다.
- _attic/docs/ARCHITECTURE.md와 AGENTS.md, NAS 구성도 SQLite 현행 운영을 설명하지만 기본 Docker 구성은 PostgreSQL을 사용한다.
- 따라서 현재 확인된 결함은 “PostgreSQL 지원 부족” 하나가 아니라 **운영 계약이 서로 모순된 상태**다.

### 먼저 내릴 결정

ADR과 사용자 확인 전에는 어느 분기도 확정하지 않는다.

#### 선택지 A. SQLite를 현행 정식 운영 DB로 유지

- 단일 현장, 로컬 디스크, 단일 writer 중심이라는 운영 전제를 문서에 명시한다.
- production guard를 해당 계약에 맞게 재설계하고 PostgreSQL Docker 구성은 실험·이행용으로 표시한다.
- WAL checkpoint, online backup, restore rehearsal, lock contention 관측을 필수 운영 절차로 둔다.
- SQLite 전용 SQL은 허용하되 dialect 전용 Module에 모아 향후 이전 비용을 드러낸다.
- 동시 쓰기, NAS 파일 배치, lock timeout 발생률 등 PostgreSQL 전환 조건을 수치와 함께 ADR에 기록한다.

#### 선택지 B. PostgreSQL로 운영 전환

- SQLite를 빠른 단위 테스트에만 사용하고 production과 필수 통합 테스트는 PostgreSQL로 고정한다.
- 현재 NAS의 mes.db를 어떻게 추출·이관·건수 대조·백업·rollback·cutover할지 운영 계획을 먼저 만든다.
- backend/bootstrap/migrate.py의 PRAGMA와 SQLite 전용 helper를 dialect별 Adapter로 분리한다.
- tests/conftest.py의 SQLite 강제를 우회할 별도 TEST_DATABASE_URL fixture 또는 별도 test process를 만든다.
- PostgreSQL generated column은 실제 PostgreSQL DDL에서 허용되는 불변 표현식임을 먼저 증명한다. locale에 영향을 받는 to_char를 계획 단계에서 확정하지 않는다.

### 두 선택지에 공통인 구현 절차

1. ADR에 현행 운영 DB, 지원 범위, 전환 조건, 백업·복원 소유자를 기록한다.
2. model membership 필터와 삭제 검증은 문자열 mes_code 검색 대신 Item.model_symbol 같은 원천 필드를 사용한다.
3. _tx_filters.py와 models.py의 func.instr 중 공통 의미를 한 필터 함수로 모은다.
4. mes_code 불변식은 선택한 운영 DB와 테스트 DB에서 같은 결과를 내도록 구현한다.
5. 모델, bootstrap, migration, seed가 같은 dialect 결정을 사용하게 한다.
6. 선택한 운영 DB에서 빈 DB 생성과 기존 운영 데이터 이행을 각각 검증한다.

### 필수 테스트

- 지원 대상으로 선언한 모든 DB가 serial 1, 9999, 10000 경계에서 같은 mes_code를 만든다.
- model_symbol이 부분 문자열인 모델 조합에서도 다른 모델 품목이 섞이지 않는다.
- 모델 삭제 가능 여부가 mes_code 문자열 포맷에 의존하지 않는다.
- 선택한 운영 DB에서 빈 DB bootstrap이 성공한다.
- 선택한 운영 DB에서 핵심 IO, 출하, 요청 승인 전이가 최소 한 번 실행된다.
- PostgreSQL 선택 시 실제 PostgreSQL fixture가 사용됐음을 dialect assertion으로 확인한다.
- 운영 DB 전환을 선택했다면 이관 전후 품목·재고·거래·요청 건수와 핵심 합계가 일치하고 rollback rehearsal이 성공한다.

### 완료 조건

- 운영 DB 문서, Docker, database.py, CI가 동일한 계약을 말한다.
- 선택한 운영 DB 통합 게이트는 continue-on-error가 아니며 실패 시 병합을 막는다.
- 지원하지 않는 dialect의 동작을 지원한다고 주장하는 코드·문서가 없다.
- ADR 결정 전에는 PostgreSQL 전환이나 SQLite 고착 중 어느 쪽도 완료로 처리하지 않는다.

### 하지 말 것

- 단순히 production guard를 제거하거나 운영 문서 한쪽만 고쳐 모순을 숨기지 않는다.
- 두 dialect SQL을 라우터마다 조건문으로 복제하지 않는다.
- generated column을 애플리케이션 계산 열로 바꾸면서 DB 일관성 보장을 잃지 않는다.
- PostgreSQL 선택 시 검증 없이 to_char generated expression을 사용하지 않는다.

---

## QP-004. 승인 정책의 단일 진실 공급원

**목표:** 관리자 여부, 부서 역할, 자체 승인, 목록 표시가 모든 API에서 같은 정책을 사용하게 한다.

### 확인된 증거

- 0afa5820과 backend/tests/test_dept_hierarchy.py:92-96, 115-118
  - 관리자 권한만으로 승인할 수 없다는 정책을 확인한다.
- backend/app/services/sr_execution.py:410-445
  - 일부 경로는 admin을 자체 승인 가능 조건으로 포함한다.
- backend/app/services/stock_requests.py:279-286
  - 같은 예외가 남아 있다.
- backend/app/services/sr_approval.py:114-134
  - 실제 코드는 거절하지만 docstring은 관리자를 허용한다고 설명한다.
- _attic/docs/CONTEXT.md
  - 생산 부서 정·부와 창고 정·부 역할을 승인 주체로 설명한다.

### 구현 절차

1. backend/app/services/approval_rules.py에 순수 정책 함수를 둔다.
   - can_warehouse_approve
   - can_department_approve
   - can_self_approve
   - approval_scope 또는 동일 의미의 값 객체
2. 관리자 플래그는 승인 역할을 대신하지 않는다고 명시한다.
3. 실행 서비스, 승인 서비스, 요청 조회가 이 정책 결과만 사용하게 한다.
4. 목록과 count가 서로 다른 조건을 쓰지 않게 동일 query builder를 공유한다.
5. stale docstring과 CONTEXT의 정책 문장을 같은 변경에서 갱신한다.
6. 프런트엔드 버튼 가시성은 서버 정책 응답을 우선 사용하고, 로컬 상수는 보조 표시 용도로만 둔다.

### 역할 매트릭스 테스트

최소 다음 조합을 모두 테이블 테스트로 작성한다.

department_role은 요청자의 소속 부서별 역할이 아니다. 현행 모델에서는 생산 부서 정·부 역할이며 창고를 제외한 비창고 부서 승인 범위를 가진다.

| 관리자 | warehouse_role | department_role | 대상 승인 단계 | 본인 요청 | 기대 |
|---|---|---|---|---|---|
| 예 | 없음 | 없음 | 전체 | 무관 | 관리자 단독으로 승인 불가 |
| 무관 | 정·부 | 없음 | 창고 | 아니오/예 | 현행 계약상 승인 가능 |
| 무관 | 없음 | 정·부 | 비창고 부서 | 아니오/예 | 현행 계약상 승인 가능 |
| 무관 | 없음 | 정·부 | 창고 | 무관 | 승인 불가 |
| 무관 | 정·부 | 정·부 | 창고와 부서 모두 | 예 | 현행 계약상 자가승인 가능 |
| 예 | 없음 | 정·부 | 비창고 부서 | 무관 | admin이 아니라 부서 역할로 승인 가능 |

0afa5820이 제거한 것은 admin 단독 특권이며 역할 보유자의 자가승인은 현행 계약에 남아 있다. 자가승인을 전면 금지하려면 이 카드에 섞지 말고 별도 제품 결정과 동작 변경으로 다룬다.

추가로 목록 결과 수와 count 응답이 각 조합에서 일치해야 한다.

### 완료 조건

- 승인 가능 여부를 직접 계산하는 admin 조건이 approval_rules 밖에 남지 않는다.
- 실행, 목록, count, 버튼 표시가 같은 역할 매트릭스를 통과한다.
- 관리자라는 이유만으로 승인되는 테스트가 없다.
- 필요한 창고·부서 역할을 가진 요청자의 현행 자가승인은 별도 결정 없이 제거되지 않는다.

---

## QP-005. 불량 등록 idempotency와 작업자 검증

**목표:** 동일 요청 키는 동일 명령에만 재사용되고, 응답은 기존 저장 결과에서 재구성되게 한다.

### 확인된 증거

- backend/app/routers/defects.py:224-232
  - 기존 client_request_id가 있으면 기존 로그가 아니라 새 payload의 item과 qty로 성공 응답을 만든다.
- backend/app/routers/defects.py:301-305
  - unique race의 IntegrityError 처리도 같은 동작이다.
- backend/app/routers/defects.py:234-237, 331-334
  - 작업자 존재만 확인하고 active, PIN을 검증하지 않는다.
- backend/app/models/transaction.py:61, 75
  - transfer_qty와 unique client_request_id가 이미 있다.

### 데이터 모델 결정

TransactionLog에 nullable client_request_fingerprint 64자 열을 추가한다. fingerprint는 정규화된 명령 JSON의 SHA-256으로 만든다.

포함 필드:

- command_type, 예: DEFECT_QUARANTINE
- canonical_schema_version
- actor_employee_id
- item_id
- 정수로 정규화한 quantity
- source와 target 위치·부서
- reason_category
- 앞뒤 공백을 제거한 reason_memo
- 의미에 영향을 주는 모든 enum 값

JSON은 키 정렬과 고정 구분자를 사용한다. 과거 행의 fingerprint가 null인데 같은 키가 들어오면 새 payload를 신뢰하지 말고 409로 거절한다.

### 구현 절차

1. fingerprint 생성 순수 함수를 서비스에 추가한다.
2. 첫 처리 시 TransactionLog에 client_request_id, fingerprint, transfer_qty를 함께 저장한다.
3. 같은 키를 찾으면 fingerprint를 비교한다.
4. 같으면 기존 TransactionLog의 item_id, transfer_qty, 저장된 위치 정보로 응답을 재구성한다.
5. 다르면 409 idempotency conflict를 반환한다.
6. unique race가 발생하면 rollback 후 기존 행을 다시 읽고 동일 비교를 수행한다.
7. 작업자 검증은 QP-002의 공통 actor auth를 사용한다.

### 필수 테스트

- 같은 키와 같은 payload를 순차 재시도하면 효과와 로그가 한 번만 생긴다.
- 같은 키와 다른 품목, 수량, 사유 중 하나라도 다르면 409다.
- 같은 키라도 command_type 또는 canonical_schema_version이 다르면 409다.
- 두 세션이 동시에 같은 키를 보내도 한 번만 반영된다.
- 과거 null fingerprint 행은 새 payload를 성공으로 위장하지 않는다.
- 재시도 응답 값이 새 요청 값이 아니라 기존 로그 값과 같다.
- 비활성 직원과 잘못된 PIN은 재고 변경 전에 실패한다.

### 완료 조건

- idempotency 성공 응답이 요청 payload를 그대로 반사하는 경로가 없다.
- 같은 키·같은 command type·같은 canonical version·같은 payload만 정상 재시도로 인정한다.
- conflict와 정상 재시도가 API 타입에서 구분된다.
- 새 schema, migration, bootstrap 경로가 모두 같은 열을 가진다.

---

## QP-006. 출하 상태 전이의 원자성과 동시성

**목표:** 현재 상태에 따라 허용 여부가 달라지는 모든 출하 mutation이 같은 잠금·전이 정책을 사용하고, 중복 클릭·동시 작업에서도 허용된 효과만 한 번 적용되게 한다.

### 확인된 증거

- backend/app/services/shipping.py:47-51
  - 요청 조회가 일반 SELECT이며 상태 변경용 행 잠금이 없다.
- backend/app/services/shipping.py:1188-1283
  - 준비 완료, 취소, 픽업이 상태, 재고, 로그, 배정을 함께 변경한다.
- backend/app/services/shipping.py:282-355, 1111-1138
  - update_request, delete_request, send_to_prep, checklist update·clear, component change도 상태를 확인한 뒤 같은 요청을 변경한다.
- 현재 경로에는 상태 전이 명령의 idempotency key와 동시 실행 테스트가 없다.

### 목표 구조

- backend/app/services/shipping_workflow.py
  - 공개 Interface: 상태에 의존하는 update, delete, send_to_prep, checklist, component_change, prepare_complete, cancel, pickup 명령
  - 내부 책임: 전이 검증, 요청 행 잠금, 재고 행 잠금, effect·로그·배정 기록
- 기존 shipping.py
  - 조회와 호환 Facade를 유지하되, 상태 변경은 새 Module로 위임
- 라우터
  - 인증, 입력 변환, 오류 매핑, 최종 commit만 담당

### 구현 절차

1. 상태 전이 표를 먼저 테스트 fixture로 만든다.
2. 선택한 운영 DB에 맞는 request lock Adapter로 변경 대상 ShippingRequest를 먼저 잠근다.
   - PostgreSQL: SELECT FOR UPDATE
   - SQLite 정식 운영 선택 시: 쓰기 트랜잭션을 읽기보다 먼저 직렬화하는 명시적 transaction-boundary 방식과 두 connection 검증
3. 현재 상태가 기대 상태와 다르면 명시적 conflict를 반환한다.
4. 관련 inventory row ID를 수집한 뒤 기존 결정적 잠금 유틸리티로 정렬 잠금한다.
5. 재고 변경, InventoryEffect, TransactionLog, allocation 변경을 같은 세션에서 수행한다.
6. 서비스는 flush까지만 하고 commit은 요청 경계에서 한 번 실행한다.
7. 별도 shipping command receipt에 client_request_id, command_type, payload_fingerprint, request_id를 저장한다.
8. 이미 완료된 같은 command와 fingerprint는 idempotent success, 다른 command 또는 payload는 409로 구분한다.
9. request_id와 event_type의 단순 unique 제약은 사용하지 않는다. 준비 취소 후 재준비처럼 정상 반복 가능한 전이를 막을 수 있다.

### 필수 테스트

- 같은 요청을 두 DB 세션에서 동시에 prepare_complete하면 하나만 효과를 만든다.
- pickup도 같은 방식으로 한 번만 재고를 차감한다.
- cancel과 pickup이 경합하면 허용된 한 전이만 성공한다.
- update_request와 prepare_complete가 경합해도 준비 완료 뒤 BOM·최종 품목이 바뀌지 않는다.
- component_change와 prepare_complete 경합에서 허용된 하나만 성공한다.
- delete_request와 send_to_prep 경합에서 삭제·전송이 동시에 성공하지 않는다.
- checklist update와 prepare_complete의 경합 결과가 전이 표와 일치한다.
- 로그 insert 실패를 주입하면 상태·재고·배정이 모두 rollback된다.
- 잠금 대상이 여러 품목일 때 정렬 순서가 항상 같다.
- QP-003에서 선택한 운영 DB의 서로 독립된 두 connection으로 실제 동시성 테스트를 실행한다.

### 완료 조건

- 라우터와 다른 서비스가 ShippingRequest.status를 직접 바꾸지 않는다.
- 상태에 따라 허용 여부가 달라지는 모든 출하 mutation이 같은 request lock과 transition policy를 거친다.
- 각 전이의 허용 전 상태, 결과 상태, 재고 효과, 로그가 한 표와 테스트에서 확인된다.
- 동시 실행에서 중복 TransactionLog, InventoryEffect, allocation이 생성되지 않는다.

---

## QP-007. 거래 정정·취소 수명주기 Module

**목표:** 거래 정정과 취소가 한 트랜잭션·한 정책·한 동시성 경계에서 실행되게 한다.

### 확인된 증거

- backend/app/routers/inventory/transactions.py:669-817
  - 정정 검증, 원 거래 조회, 재고 변경, edit log 기록이 라우터에 집중돼 있다.
- backend/app/routers/inventory/transactions.py:712-726
  - 기존 정정 확인 뒤 insert하는 check-then-write 구조다.
- backend/app/models/transaction.py:124-150
  - 원 거래당 정정 1회를 DB가 보장하는 unique 제약이 없다.
- backend/app/routers/inventory/transactions.py:857-965
  - 취소도 라우터가 업무 흐름을 직접 수행한다.

과거 리뷰가 거절한 것은 inv_effect에 이미 있는 취소 역산을 다시 얇은 서비스로 옮기는 제안이었다. 이 카드는 그 결정을 뒤집는 것이 아니라, 새로 확인된 정정·취소 경합과 DB 제약·단일 트랜잭션 문제를 해결한다.

### 선결 업무 규칙

TransactionEditLog에는 active 상태가 없고 연결된 ADJUST 거래의 cancelled 상태는 다른 테이블에 있다. 다른 테이블 상태를 partial unique index 조건으로 사용할 수 없으므로 먼저 다음을 결정한다.

- A. 원 거래는 평생 한 번만 정정할 수 있다.
- B. 취소되지 않은 정정만 한 개 허용하며 정정 취소 뒤 재정정할 수 있다.
- 정정된 원 거래 취소 시 원본과 정정 효과를 함께 되돌릴지, 먼저 정정 취소를 요구할지 결정한다.
- 이미 취소된 원 거래의 정정은 거절하는 것을 기본안으로 한다.

A라면 original transaction ID의 단순 unique 제약으로 충분하다. B라면 원 거래에 active_correction_id 또는 명시적 correction 상태를 두고 정정 생성·취소와 같은 트랜잭션에서 설정·해제한다.

### 목표 구조

- backend/app/services/transaction_lifecycle.py
  - CorrectionCommand와 CancellationCommand
  - correct_transaction
  - cancel_transaction
  - 공통 원 거래 검증과 effect 반전
- 라우터는 schema를 command로 바꾸고 서비스 결과를 응답으로 변환한다.

### 구현 절차

1. 현재 허용·거절 조건을 characterisation test로 먼저 고정한다.
2. QP-003에서 선택한 운영 DB의 lock Adapter로 원 TransactionLog와 관련 batch를 잠근다.
3. 위 선결 결정 A 또는 B에 맞는 명시적 DB 불변식을 추가한다. 다른 테이블 상태를 참조할 수 없는 partial unique index를 억지로 만들지 않는다.
4. 여러 재고 행은 기존 정렬 잠금 함수를 사용한다.
5. 취소는 원 effect 기록을 기준으로 반전한다. 라우터에서 업무 타입별 수량을 재계산하지 않는다.
6. edit log, effect, 새 transaction log, 원 거래 상태 변경을 단일 세션에 둔다.
7. IntegrityError는 광범위하게 409로 바꾸지 말고 해당 unique constraint 위반만 정정 conflict로 매핑한다.

### 필수 테스트

- 같은 원 거래를 두 세션이 동시에 정정하면 하나만 성공한다.
- 정정과 취소가 동시에 실행되면 한 명령만 성공한다.
- 정책 A에서는 두 번째 정정이 영구 거절된다.
- 정책 B에서는 활성 정정이 있을 때만 거절되고, 허용된 정정 취소 뒤 재정정 결과가 정책과 일치한다.
- 정정 → 정정 취소 → 재정정 시나리오를 검증한다.
- 정정 → 원 거래 취소 결과가 선택한 정책과 일치한다.
- 원 거래 취소 → 정정은 거절된다.
- 정정 ADJUST와 원 거래 동시 취소에서 하나의 허용된 결과만 남는다.
- 중간 로그 실패 시 재고와 원 거래 상태가 rollback된다.
- 순차 취소 재시도는 중복 반전을 만들지 않는다.

### 완료 조건

- transactions 라우터에 재고 산술과 직접 상태 변경이 남지 않는다.
- 정정·취소 규칙은 transaction_lifecycle과 테스트에서 한 번만 정의된다.
- QP-003에서 선택한 운영 DB의 실제 동시성 테스트가 필수 게이트에 포함된다.
- 정정 횟수와 원 거래 취소 상호작용이 ADR 또는 도메인 규칙 문서에 기록된다.

---

## QP-008. 무결성 복구와 감사 로그의 단일 commit

**목표:** 복구 결과와 감사 로그가 함께 저장되거나 함께 rollback되게 한다.

### 확인된 증거

- backend/app/services/integrity.py:121-160
  - 서비스가 내부에서 commit한다.
- backend/app/routers/settings.py:164-185
  - 서비스 호출 뒤 감사 로그를 추가하고 다시 commit한다.
- backend/app/services/audit.py:19-20
  - 감사 로그는 업무 변경과 같은 트랜잭션에 있어야 한다는 계약을 설명한다.
- backend/app/routers/settings.py:183과 backend/app/services/integrity.py:162-167
  - 라우터는 report.fixed_count를 읽지만 실제 RepairReport 필드는 repaired라 성공 감사 요약의 수정 건수가 물음표로 기록된다.

### 구현 절차

1. integrity 서비스의 commit을 flush로 바꾼다.
2. 서비스 반환값에 감사에 필요한 변경 요약을 포함한다.
3. settings 라우터가 복구 실행, audit add, 단일 commit을 순서대로 수행한다.
4. commit 실패는 요청 세션 경계에서 rollback된다.
5. 서비스 단위 테스트에서는 flush 이후 commit 전 상태를 확인한다.
6. 감사 요약은 report.repaired를 사용한다.

### 필수 테스트

- 감사 로그 insert 실패를 강제로 만들면 복구 변경도 rollback된다.
- 복구 변경 실패 시 감사 로그가 남지 않는다.
- 성공 시 정확히 한 commit 경계에서 둘 다 저장된다.
- 실제 수정 행 수와 audit payload summary의 행 수가 정확히 같다.

### 완료 조건

- integrity.py 내부에 commit 호출이 없다.
- “업무 데이터는 바뀌었지만 감사 로그는 없음” 상태를 테스트로 재현할 수 없다.
- 성공 감사 로그에 “repaired ? rows”가 남지 않는다.

---

## QP-009. soft-deleted 품목의 명시적 조회 계약

**목표:** 삭제된 품목은 새 재고 효과를 만드는 업무에서 사용할 수 없고, 감사·이력·복원과 허용된 과거 거래 보상에서는 계속 조회할 수 있게 한다.

### 확인된 증거

- backend/app/models/item.py:82-83
  - deleted_at 기반 soft delete를 사용한다.
- backend/app/repositories/item_repository.py:1-18
  - get이 deleted_at을 확인하지 않는다.
- 생산, 출하, 재고 요청의 일부 검증이 이 get을 사용한다.

### 구현 절차

1. 저장소 Interface를 명시적으로 나눈다.
   - get_active: 신규 명령용, deleted_at이 null이어야 함
   - get_any: 이력, 감사, 삭제·복원, integrity 조사, 허용된 과거 거래 보상·취소용
2. 기존 get은 모호하므로 새 코드에서 사용 금지하고 단계적으로 제거한다.
3. 신규 재고 효과를 만드는 생산, BOM, 불량, 출하, 재고 요청·실행은 get_active를 사용한다.
4. 거래 이력 표시, 품목 삭제·복원, integrity 조사, 삭제 전에 발생한 거래의 허용된 취소·정정은 get_any를 사용한다.
5. 도메인 오류는 “품목 없음”과 “삭제됨” 중 외부 노출 정책을 일관되게 정한다.
6. RESERVED 요청과 PREPARING/PREPARED 출하가 품목을 참조한 상태에서 삭제할 수 있는지 먼저 결정한다. 권고는 열린 업무가 참조하면 삭제를 차단하고, 경합으로 먼저 삭제됐다면 실행을 거절하면서 pending·reservation을 원자적으로 해제하는 것이다.

### 필수 테스트

- 삭제된 품목은 생산 등록, BOM 구성, 불량 등록, 출하, 재고 요청에서 거절된다.
- 과거 거래 이력은 삭제된 품목명·코드를 계속 표시한다.
- 복원 기능은 get_any를 통해 품목을 찾는다.
- 삭제 직전 생성된 열린 요청을 실행할 때의 정책을 테스트로 고정한다. 권고는 실행 시점에도 active를 재검증해 거절하는 것이다.
- 삭제 품목의 과거 원 거래 취소·정정이 선택한 보상 정책대로 effect를 되돌린다.
- 삭제 전에 RESERVED가 된 요청의 승인이 실패하면 pending이 해제된다.
- PREPARING/PREPARED 출하 참조 품목 삭제 또는 실행 결과가 위 정책과 일치한다.

### 완료 조건

- 신규 재고 효과를 만드는 명령에서 item_repository.get 또는 무필터 Item 조회가 남지 않는다.
- get_any 사용처는 감사·이력·삭제·복원·integrity·명시적으로 허용된 보상으로 제한되고 코드 주석 또는 타입 이름으로 이유가 드러난다.

---

## QP-010. 부서 관리 더티 상태와 저장 Promise 계약

**목표:** 부서 편집 중 이동할 때 경고가 정확히 나타나고, 저장 성공을 기다린 뒤에만 이동하게 한다.

### 확인된 증거

- frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx:62-69
  - 실제 dirty를 계산해 부모에 전달한다.
- frontend/app/mes/_components/_admin_sections/AdminDepartmentsSection.tsx:55-72
  - 실제 전달값과 별개로 deptDirty를 false로 고정한다.
- 같은 파일 :303-304
  - 자식은 setDirty를 호출하지만 guard가 그 상태를 읽지 않는다.
- DeptDetailView.tsx:71-86
  - save는 void API 호출 형태이며 성공·실패를 호출자에게 Promise로 전달하지 않는다.
- frontend/lib/ui/dirty-guard.tsx:221-230
  - guard는 저장 Promise가 resolve된 뒤 이동하도록 설계됐다.
- dirty guard 문구가 입출고 전용인데 관리자 화면에서도 재사용된다.

### 구현 절차

1. AdminDepartmentsSection의 실제 dirty state를 deptDirty로 사용한다.
2. save ref 타입을 () => Promise<void>로 바꾼다.
3. DeptDetailView의 save는 async 함수가 되고 성공 시에만 baseline과 dirty를 갱신한다.
4. 저장 성공 시 onDirtyChange(false) 또는 부모 setDirty(false)를 완료한 뒤 Promise를 resolve한다. prop 변경 effect가 나중에 지워줄 것이라고 가정하지 않는다.
5. “저장하지 않고 이동”도 proceed 직전에 dirty를 false로 만들고 새 부서 baseline을 초기화한다.
6. API 실패는 UI 오류를 표시한 뒤 반드시 rethrow해 guard가 이동하지 않게 한다.
7. dirty guard에 copy 또는 mode를 전달한다.
   - 입출고: 임시 저장 또는 폐기
   - 관리자: 저장 또는 계속 편집
8. 저장 중 버튼 중복 클릭을 막고 modal을 닫지 않는다.

### 필수 테스트

- 부서 필드를 수정하고 다른 부서를 누르면 guard가 열린다.
- 수정 없이 이동하면 guard가 열리지 않는다.
- 저장 선택 시 Promise가 끝나기 전 선택 부서가 바뀌지 않는다.
- 저장 실패 시 현재 부서와 dirty가 유지되고 오류가 보인다.
- 저장 성공 시 dirty가 false가 된 뒤 이동한다.
- 저장 성공 직후 바로 다른 부서로 이동해도 새 부서가 dirty가 아니다.
- 저장하지 않고 나간 뒤 다음 부서에서 같은 경고가 반복되지 않는다.
- 관리 화면에서 “입출고”라는 잘못된 문구가 나오지 않는다.

### 완료 조건

- false 상수로 guard를 우회하는 코드가 없다.
- save ref의 TypeScript 타입과 실제 반환 계약이 일치한다.
- 오류를 삼키는 void API 저장이 없다.

---

## QP-011. 출하 BOM 응답 경합과 더티 의미 수정

**목표:** 오래된 BOM 응답이 최신 입력을 덮어쓰지 않고, 실제 편집이 있을 때만 이탈 경고가 나타나게 한다.

### 확인된 증거

- frontend/app/mes/_components/DesktopShippingView.tsx:755-776
  - 350ms 지연 뒤 BOM 요청을 보내지만 AbortSignal 또는 요청 세대 번호가 없다.
  - 먼저 보낸 요청이 나중에 도착하면 최신 matchResult를 덮을 수 있다.
- frontend/app/mes/_components/DesktopShippingView.tsx:569-604, 656-676
  - 준비 전 검사와 수동 BOM 검사도 같은 matchResult에 쓰므로 자동 debounce만 고치면 경합이 남는다.
- 같은 파일 :1228-1261
  - matchResult가 이후 선택·경고·제출 판단에 사용된다.
- 같은 파일 :262-265
  - requestWork, prepWork, historyWork 화면에 있다는 이유만으로 dirty라고 판단한다.
  - 읽기 전용 이력도 이탈 경고 대상이 될 수 있다.

### 구현 절차 A: BOM 경합

1. BOM 요청 payload를 정규화하는 순수 함수를 만든다.
2. 하나의 useShippingBomMatch Interface가 자동 debounce, 준비 전 검사, 수동 검사의 AbortController와 generation을 공동 소유한다.
3. 새 요청을 시작할 때 이전 AbortController를 abort한다.
4. 응답을 적용하기 전 현재 generation과 같은지 확인한다.
5. abort된 요청은 사용자 오류로 표시하지 않는다.
6. api 함수에 선택적 AbortSignal을 전달한다.
7. 명시적 준비·검사 요청은 대기 중 자동 debounce를 취소하고 가장 최신 generation이 된다.
8. unmount 시 진행 중 요청을 abort하고 이후 결과를 적용하지 않는다.

### 구현 절차 B: 더티 판정

1. 화면 이름을 dirty로 사용하는 조건을 제거한다.
2. 기존 요청 편집은 서버 데이터와 비동기 BOM hydrate가 끝난 직후 editable payload baseline을 만든다.
3. 현재 payload를 같은 정규화 함수로 비교한다.
4. 준비 작업처럼 즉시 저장되는 화면과 읽기 전용 이력은 false다.
5. 저장 성공, 명시적 초기화, 요청 변경 시 baseline을 갱신한다.
6. 저장 중 입력을 막거나, 저장을 시작한 payload와 이후 입력을 구분해 실제 저장된 값만 baseline으로 삼는다.

### 필수 테스트

- 두 BOM 요청을 역순으로 resolve하면 최신 입력의 결과만 남는다.
- 자동 요청 A 진행 중 준비 검사 B를 실행한 뒤 A가 마지막에 성공·실패해도 B 결과와 오류가 유지된다.
- abort된 이전 요청이 오류 toast를 만들지 않는다.
- 화면 unmount 뒤 도착한 응답이 상태를 갱신하지 않는다.
- 화면에 들어가기만 하고 편집하지 않으면 이탈 경고가 없다.
- 기존 요청의 지연 hydrate가 끝난 뒤 편집하지 않았다면 dirty가 false다.
- 수량·품목·BOM 선택을 바꾸면 경고가 있다.
- 저장·초기화 뒤 경고가 사라진다.
- prepWork와 historyWork는 실제 미저장 로컬 변경이 없으면 경고가 없다.

### 완료 조건

- matchResult를 설정하는 모든 경로에 최신 요청 확인이 있다.
- route 이름 기반 dirty 조건이 없다.
- baseline 비교는 UI 컴포넌트와 테스트가 공유하는 순수 함수다.

---

## QP-012. 필수 E2E 게이트 복구

**목표:** 안정된 핵심 흐름의 실패는 병합을 막고, 아직 불안정한 확장 시나리오는 별도 관찰 대상으로 유지한다.

### 확인된 증거

- .github/workflows/ci.yml:109-112
  - 전체 E2E job에 continue-on-error가 설정돼 있다.
- a83dbb4f
  - 불안정성 때문에 비차단 처리한 이력이 있다.
- frontend/tests/e2e/README.md:35-45
  - 현재 E2E 목록에는 출하 spec이 없다.
- frontend/tests/e2e/_helpers.ts:4-8, 43-70
  - loginAsOperator는 실제 로그인 UI가 아니라 localStorage 주입 helper다.

### 구현 절차

1. E2E를 두 job으로 나눈다.
   - blocking-smoke: 안정된 핵심 흐름
   - extended-observational: 간헐 실패 조사 대상
2. blocking-smoke에서 job-wide continue-on-error를 제거한다.
3. smoke 범위는 최소 다음을 포함한다.
   - storage 주입 helper를 쓰지 않는 실제 로그인 또는 작업자 선택 1건
   - 입출고 1건 생성과 결과 확인
   - 재고 요청 승인 핵심 경로
4. 출하 happy path는 QP-006과 QP-011 완료 뒤 신규 spec이 반복 실행에서 안정적임을 증명한 후 blocking smoke로 승격한다.
5. 각 테스트가 전용 DB reset 또는 독립 fixture를 사용하게 한다. 고유 문자열 prefix만으로 공유 재고 상태 격리가 된다고 가정하지 않는다.
6. 실패 시 trace, screenshot, server log는 always 조건으로 업로드한다.
7. flaky 테스트를 smoke에서 빼려면 소유자, 실패 링크, 복귀 조건을 문서에 남긴다.
8. extended-observational이 비차단이어도 실패 건수와 spec 이름을 job summary와 artifact에 남긴다.
9. QP-004 완료 뒤 E2E README와 승인 spec의 admin 단독·역할 기반 자가승인 설명을 실제 정책과 맞춘다.

### 완료 조건

- 고의로 smoke assertion을 깨뜨리면 CI가 실패한다.
- extended job 실패는 보이지만 병합을 막지 않는다.
- blocking-smoke에는 job-wide 또는 step-wide continue-on-error가 없다.
- extended-observational은 비차단일 수 있지만 실패가 녹색 성공처럼 숨지 않는다.
- flaky 목록에는 만료일과 담당자가 있다.

---

## QP-013. 작업자 식별 Interface와 PIN 보안 이행 결정

**목표:** Wave 0에서는 분산된 작업자 확인을 하나의 Interface로 모으고, PIN을 실제 보안 인증으로 격상할지는 별도 제품 결정과 되돌릴 수 있는 데이터 이행으로 다룬다.

### 확인된 증거

- backend/app/services/pin_auth.py:7-29
  - salt 없는 SHA-256, 일반 동등 비교, None을 0000으로 취급하는 경로가 있다.
- backend/app/routers/settings.py:44-55
  - 기본 0000을 자동 설정한다.
- backend/app/routers/employees.py:495-515
  - 속도 제한은 직원 로그인 일부에만 있다.
- backend/app/services/sr_approval.py:55, 133, 242, 287, 329
  - PIN 검증 호출이 승인 동작마다 분산돼 있다.
- backend/app/services/pin_auth.py:1-4
  - 현재 계약은 PIN을 실제 보안 인증이 아닌 작업자 식별용이라고 명시한다.
- backend/app/routers/employees.py:293-307, 554-580
  - 신규 직원은 pin_hash가 없을 수 있고 reset은 0000으로 초기화한다.
- backend/bootstrap/seed.py:116-124와 backend/bootstrap/migrate.py:1192-1197
  - seed와 migration도 기본 0000 경로를 가진다.
- 전역 관리자 PIN은 Employee가 아니라 SystemSetting에 있어 별도 이행이 필요하다.

### 선결 제품 결정

다음 질문에 ADR과 사용자 확인이 필요하다.

- PIN은 현장 작업자 식별 수단인가, 권한을 보호하는 보안 인증 수단인가
- 작업별 허용 역할은 무엇인가
- 신규 직원의 최초 PIN은 누가 어떤 화면에서 설정하는가
- 관리자 reset 뒤 임시 PIN과 변경 강제 절차는 무엇인가
- 전역 관리자 PIN을 유지할지 직원 기반 권한으로 없앨지

### QP-013A. Wave 0 공통 식별 경계

1. VerifiedActor Interface와 action별 역할 정책을 만든다.
2. 선택한 식별 방식의 검증 Adapter를 이 Interface 뒤에 둔다. 현행 경량 모델을 유지한다면 기존 SHA 검증은 임시 Adapter로만 캡슐화한다.
3. 직원 존재, active, 식별 성공, action 권한, 공통 시도 제한을 한 흐름에서 수행한다.
4. 승인, 출하, 품목 전환 호출부는 해시 알고리즘을 직접 알지 못한다.
5. QP-013B에서 저장 알고리즘을 바꿔도 호출부 Interface를 다시 고치지 않게 한다.

### QP-013B. 보안 이행을 선택한 경우

1. 과거 pin-security-migration-plan.md의 dual-column 롤백 설계를 기본안으로 사용한다.
   - Employee.pin_hash는 Phase 1~2 동안 보존한다.
   - Employee.pin_hash_v2에 Argon2id를 저장한다.
   - 관리자 SystemSetting에도 별도 V2 키와 이행 절차를 둔다.
2. pin_state 또는 must_change 같은 명시적 상태로 미설정, 임시 PIN, 변경 필요, 정상 상태를 구분한다.
3. 신규 직원 one-time 설정, 관리자 reset, 기존 None 사용자, legacy 기본 0000 사용자를 각각 이행한다.
4. legacy SHA 사용자가 성공적으로 식별되면 같은 트랜잭션에서 V2를 lazy 생성한다.
5. 실패 시에는 hash와 상태를 바꾸지 않는다.
6. Phase 1~2에서는 V1 코드로 rollback 가능하게 기존 열을 유지한다.
7. V1 열 삭제는 V2 전환율·복구 rehearsal·사용자 승인을 거친 별도 변경으로 진행한다.
8. PIN은 React 영속 상태, Query String, access log, 예외, audit payload에 남기지 않는다.

### 필수 테스트

- QP-013A에서 승인, 출하, 품목 전환이 같은 VerifiedActor와 limiter를 사용한다.
- 헤더 또는 body 직원 ID만으로는 식별에 성공하지 않는다.
- 호출부는 V1·V2 hash 저장 형식을 알지 못한다.
- QP-013B를 선택하면 새 PIN은 Argon2id 형식으로 저장된다.
- QP-013B에서 legacy SHA-256 PIN은 성공 식별 시 업그레이드된다.
- QP-013B의 실패 식별에서는 hash가 바뀌지 않는다.
- QP-013B에서 None, 임시 0000, 정상 설정 PIN의 pin_state와 허용 동작이 각각 정책과 일치한다.
- QP-013B에서 신규 직원 최초 설정과 관리자 reset 후 변경 강제가 동작한다.
- QP-013B에서 전역 관리자 PIN의 V1→V2 이행과 rollback이 동작한다.
- 연속 실패 시 제한되고 제한 시간 뒤 복구된다.
- 로그와 audit payload에 평문 PIN이 없다.

### 완료 조건

- QP-013A 완료 시 모든 민감 mutation이 한 VerifiedActor Interface를 사용한다.
- QP-013B는 사용자·ADR 결정 전 시작하지 않는다.
- QP-013B를 선택하면 pin_auth Adapter 밖에 PIN hash 알고리즘 비교가 없다.
- 자동 기본 0000, 신규 설정, reset, None 사용자, 관리자 PIN의 이행 경로가 빠짐없이 문서와 테스트에 있다.
- Phase 1~2 rollback rehearsal이 성공하기 전 기존 pin_hash를 삭제하지 않는다.
- PIN을 보안 인증으로 격상하지 않는 선택을 하더라도 그 한계와 허용 업무 범위를 운영 문서에 명시한다.

---

## QP-014. 백엔드 품질 게이트 확장

**목표:** 문법 오류뿐 아니라 dialect, 명백한 정적 오류, 의존성 변동을 CI에서 조기에 잡는다.

### 확인된 증거

- .github/workflows/ci.yml:14-53
  - 백엔드는 compile, SQLite pytest, OpenAPI 기준선 중심이다.
- Ruff, mypy, 선택된 운영 DB의 필수 통합 job이 없다.
- requirements는 여러 패키지의 하한만 두어 설치 시점에 해석 결과가 달라질 수 있다.
- pytest-cov는 있으나 백엔드 위험 기반 coverage gate는 없다.
- backend/Dockerfile:1과 CI는 Python 3.11, _attic/docs/ARCHITECTURE.md:13은 3.13, 현재 로컬은 3.12로 Python minor 계약도 어긋난다.

### 구현 절차

1. 지원·운영 Python minor를 ADR로 확정하고 Docker, CI, 로컬 안내, lock 생성 버전을 맞춘다.
2. 직접 의존성 입력 파일과 재현 가능한 lock 파일을 분리한다.
3. Dependabot 또는 정기 작업에서만 lock을 갱신하고 일반 CI는 lock 설치를 사용한다.
4. Ruff는 우선 app과 tests의 오류 규칙부터 적용한다.
5. 전체 mass format은 하지 않는다. 기존 파일 대량 변경 없이 새·변경 코드부터 규칙을 강화한다.
6. mypy는 새 깊은 Module부터 엄격 적용한다.
   - actor_auth
   - shipping_workflow
   - transaction_lifecycle
7. QP-003에서 선택한 운영 DB job을 필수화한다. PostgreSQL을 선택하면 SQLite로 강제되는 기존 conftest와 별도 fixture·process를 사용한다.
8. coverage는 전체 숫자보다 QP-001, 004, 005, 006, 007 서비스의 branch 누락을 막는 방식으로 시작한다.

### 완료 조건

- 확정한 Python minor와 lock 파일로 같은 의존성 집합을 재현한다.
- Docker, CI, 개발 안내, lock metadata의 Python minor가 일치한다.
- 새 핵심 Module은 Ruff와 mypy를 통과한다.
- 선택한 운영 DB 통합 테스트 실패가 병합을 막는다.
- 도구 도입 커밋에 무관한 포맷 변경이 섞이지 않는다.

---

## QP-015. 프런트 테스트 타입과 위험 기반 커버리지

**목표:** 테스트 자체의 잘못된 fixture와 핵심 Hook의 미검증 분기를 CI가 잡게 한다.

### 확인된 증거

- frontend/tsconfig.json:37-46
  - test와 e2e 파일이 주 TypeScript 검사에서 제외된다.
- frontend/app/mes/_components/__tests__/DesktopShippingView.test.tsx:1017-1018과 frontend/app/mes/_components/_admin_hooks/__tests__/useAdminDepartmentsCommands.test.tsx:29
  - 불완전한 Operator fixture와 any 사용 예가 있다.
- vitest.config.mts:15-35
  - coverage 대상이 이미 테스트가 많은 일부 lib 파일에 집중돼 있다.
- useIoSubmit, dirty guard, 출하 workflow 같은 위험 경로는 coverage 계약 밖이다.

### 구현 절차

1. Vitest와 Playwright의 환경 타입이 다르므로 tsconfig.vitest.json과 tsconfig.e2e.json을 분리한다.
2. 두 설정은 앱 tsconfig의 공통 compilerOptions를 상속하고 test:typecheck가 둘을 실행한다.
3. Employee, Operator, Item, ShippingRequest 등 typed fixture builder를 만든다.
4. 기존 any를 한 번에 전부 없애지 말고, 변경하는 위험 테스트부터 builder로 이동한다.
5. coverage include에 다음을 추가한다.
   - useIoSubmit
   - dirty-guard
   - shippingWorkflow와 BOM 경합 Hook
   - 부서 편집 저장 Hook
6. JSX 전체 커버리지 숫자를 무리하게 올리지 않는다. 명령 분기와 실패 경로를 우선한다.
7. 위험 Module은 전체 aggregate 75%와 별도로 per-file 또는 전용 risk config의 branch gate를 둔다. 기존 고커버리지 파일이 신규 위험 분기 누락을 상쇄하지 못하게 한다.

### 완료 조건

- 테스트 fixture에서 필수 필드 누락이 tsc로 실패한다.
- QP-001, 010, 011의 실패 분기가 coverage 대상이다.
- 위 위험 Module에서 명시한 실패 분기 하나를 제거하면 전용 branch gate가 실패한다.
- test:typecheck가 CI 차단 게이트다.

---

## QP-016. 접근성 공통 계약

**목표:** 모든 활성 모달과 클릭 가능한 요소가 키보드와 보조 기술에서 같은 방식으로 동작하게 한다.

### 확인된 증거

- frontend/app/mes/_components/CapacityDetailModal.tsx:39-67
  - dialog role, 제목 연결, focus trap, ESC 계약이 없다.
- 같은 파일 :214-220, 395-401
  - div onClick 토글 영역 안에 이미 별도 “기준 PF 해제” 버튼이 있어 외부를 통째로 button으로 바꾸면 nested button이 된다.
- frontend/lib/ui/dirty-guard.tsx:51-76, 221-233
  - focus trap, aria-labelledby, 화면 내 저장 오류 표시가 충분하지 않다.
- ResultModal과 useFocusTrap이라는 좋은 기존 패턴이 있다.
- axe-playwright가 설치됐지만 명확한 필수 script와 gate가 없다.
- frontend/scripts/mobile-a11y.mjs:25-31, 86-104, 124-129
  - 존재하지 않는 admin 탭을 포함하고 일부 현재 탭을 누락하며, 위반을 찾아도 non-zero로 실패하지 않는 false-green 가능성이 있다.

### 구현 절차

1. 기존 useFocusTrap을 공통 dialog 계약으로 사용한다.
2. dialog에 role, aria-modal, aria-labelledby를 연결한다.
3. 열릴 때 첫 의미 있는 컨트롤로 초점을 이동하고 닫힐 때 트리거로 복원한다.
4. ESC 동작을 저장 중·위험 확인 상태와 일관되게 정의한다.
5. 그룹 헤더 전체를 button으로 감싸지 않는다. 펼침 전용 button과 기준 PF 해제 button을 형제 요소로 분리한다.
6. 펼침 button에는 aria-expanded, aria-controls, 안정된 panel id를 연결한다.
7. 저장 실패는 aria-live 또는 role alert 영역에 표시한다.
8. test:a11y는 QP-012의 전용 서버·DB 시작 절차를 재사용하고 serious·critical 위반 또는 스캔 실패에서 non-zero로 종료한다.
9. dashboard, warehouse, defect, history, more, shipping, warehouseMap처럼 실제 비동결 화면 목록과 예상 화면 heading을 검증한다. 잘못된 URL이 dashboard로 fallback한 것을 성공으로 기록하지 않는다.
10. MobileShell.tsx의 NavButton, nav, pill 구현·스타일과 globals.css의 button.no-btn-inset는 관찰만 하고 별도 명시 승인 없이 수정하지 않는다.
11. 동결된 주간보고는 비차단 baseline으로만 기록한다.

### 필수 테스트

- Tab과 Shift+Tab이 모달 밖으로 빠지지 않는다.
- ESC와 닫기 버튼이 같은 cleanup을 수행한다.
- 닫힌 뒤 원래 버튼으로 초점이 돌아온다.
- 토글 버튼이 키보드 Enter·Space로 작동한다.
- 펼침 버튼과 기준 PF 해제 버튼이 각각 독립적으로 Enter·Space에 반응하고 button 중첩이 없다.
- 저장 실패 메시지가 보이고 alert로 노출된다.

### 완료 조건

- 활성 비동결 화면의 serious·critical 위반과 스캔 실패가 CI를 실패시킨다.
- 스캐너가 실제 기대 화면에 도달했음을 assertion으로 확인한다.
- 동결된 모바일 하단 탭과 주간보고 파일에는 변경 diff가 없다.

---

## QP-017. 서버 상태 이음매 통일

**목표:** 서버 상태는 React Query 한 경로로 관리하고 Context는 업무 친화적 조회 Adapter만 제공하게 한다.

### 확인된 증거

- frontend/lib/queries/client.tsx
  - React Query provider가 이미 공식 실행 경로에 있다.
- frontend/app/mes/_components/_hooks/CONTRACT.md
  - React Query와 useResource를 사용하지 않는다는 오래된 규칙이 남아 있다.
- useResource는 현재 production caller가 없고 SWR 의존성도 사용 흔적이 없다.
- frontend/app/mes/_components/DepartmentsContext.tsx:25-46
  - 별도 state와 inflight를 관리하며 오류를 삼켜 빈 목록과 실패를 구분하기 어렵다.

### 구현 절차

1. “서버 상태는 React Query”를 프런트 아키텍처 계약으로 문서화한다.
2. departments query key와 fetch function을 queries 계층에 둔다.
3. DepartmentsContext는 query 결과에서 이름·색상 조회 같은 도메인 편의 Interface만 제공한다.
4. 기존 useDepartments, useRefreshDepartments, useDeptColor, useDeptColorLookup의 반환 계약은 Adapter가 유지한다.
5. loading, empty, error가 필요한 소비자용 useDepartmentsState를 별도로 노출한다.
6. mutation 성공 시 query cache를 직접 갱신하거나 invalidate한다.
7. Query retry는 Abort와 확정된 4xx에서 0회, network와 5xx에서 최대 1회로 상태 기반 분기한다.
8. 전체 import 검색으로 useResource와 SWR의 production caller가 0인지 다시 확인한 뒤 제거한다.
9. CONTRACT.md와 ARCHITECTURE.md를 같은 변경에서 갱신한다.

### 필수 테스트

- 여러 소비자가 동시에 요청해도 fetch가 한 번만 발생한다.
- 부서 수정 후 모든 소비자가 최신 이름을 본다.
- 실패가 빈 부서 목록으로 위장되지 않는다.
- 404와 abort는 한 번만 호출되고, 503과 network error는 최대 두 번 호출된다.
- 오류 상태에서도 기존 색상 fallback 계약은 유지된다.
- 사용하지 않는 SWR 제거 뒤 build와 bundle이 통과한다.

---

## QP-018. 출하 프런트 Module 심화

**선행 조건:** QP-006, QP-011, QP-021B를 먼저 완료한다. 구조를 먼저 바꾸면 동시성·비동기·조회 계약 버그가 새 파일들로 퍼질 수 있다.

### 확인된 증거

- frontend/app/mes/_components/DesktopShippingView.tsx
  - URL, cache, draft, API, modal, workflow state와 여러 하위 view를 한 루트가 소유한다.
- 테스트도 하나의 큰 파일에 집중돼 있다.

### 프런트 목표 구조

- _shipping/shippingWorkflow.ts
  - 순수 reducer, 상태, event, 전이 불변식
- _shipping/useShippingWorkflow.ts
  - API command와 cache invalidation
- _shipping/useShippingBomMatch.ts
  - debounce, abort, generation
- ShippingRequestEditor.tsx
- ShippingPrepDetail.tsx
- ShippingHistoryDetail.tsx
- DesktopShippingView.tsx
  - URL과 상위 화면 조립만 담당하는 Facade

### 구현 절차

1. 현재 전이 골든 테스트를 만든다.
2. 순수 reducer를 먼저 추출하고 화면 동작을 바꾸지 않는다.
3. view를 한 번에 모두 이동하지 말고 request, prep, history 순서로 이동한다.
4. 기존 DesktopShippingView 공개 import를 Facade로 유지한다.
5. QP-021B가 제공한 상태별 목록 query와 ID detail query를 그대로 사용한다. 이 카드에서 또 다른 read abstraction을 만들지 않는다.

### 완료 조건

- 루트 화면은 업무 규칙을 직접 계산하지 않는다.
- reducer 전이 표와 백엔드 workflow 상태 표가 이름과 의미에서 대응한다.
- URL 뒤로·앞으로, 저장→준비→픽업 시나리오가 회귀 테스트로 유지된다.
- mutation 뒤 영향받은 상태 목록과 상세 cache만 갱신된다.

### 하지 말 것

- “파일이 길다”만을 완료 기준으로 사용하지 않는다.
- 얕은 Hook을 다수 만들어 데이터 흐름을 더 찾기 어렵게 하지 않는다.
- 공개 import 경로를 한 번에 깨지 않는다.

---

## QP-019. 데스크톱·모바일 입출고 추가 공통화 재검증

**선행 조건:** QP-001을 먼저 완료한다. 현재 구조가 이미 공유하는 정책을 다시 추출하지 않는다.

### 확인된 증거

- frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx:112-143, 566-619
- frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx:75-82, 106-141, 412-464
  - 모바일은 상태·제출·초안·BOM 로직에 데스크톱과 같은 Hook과 순수 함수를 이미 호출한다고 명시한다.
- _attic/docs/adr/ADR-0003-mobile-reuses-desktop-v2.md:7-25
  - 모바일이 데스크톱 V2 로직을 직접 재사용하는 결정은 Accepted 상태다.
- _attic/docs/research/2026-06-10-clean-code-review-map.md:44-47, 65-68
  - 추가 추출이 줄 옮기기와 dual-shell 검증 비용만 늘릴 수 있다는 과거 검증이 있다.
- 현재 IoComposeView 미커밋 변경은 품목 전환 requester prop 전달이며 이 카드가 덮어쓸 구조 부채로 간주하지 않는다.

### 판단 절차

1. preview, draft 저장·삭제·복원, approvalKind, submit, 결과 불명 재시도, 성공 reset의 실제 함수 정의와 두 호출자를 표로 작성한다.
2. 정책이 이미 useIoWorkState, useIoPreview, useIoDraft, useIoSubmit에 한 번만 정의돼 있으면 “중복 없음”으로 기록한다.
3. QP-001의 key와 fingerprint는 기존 공용 useIoSubmit 안에 구현해 양쪽에 자동 적용한다.
4. 같은 정책 변경을 데스크톱과 모바일에서 별도로 고쳐야 하는 실제 사례가 있는지 git 이력과 호출 경로로 확인한다.
5. 실질 중복이 확인되지 않으면 이 카드를 REJECTED 또는 NO CHANGE로 종료한다.
6. 실질 중복이 확인되면 가장 작은 순수 command builder 또는 기존 Hook 확장부터 적용한다.
7. useIoComposeController 신설과 화면별 로컬 state 제거는 공개 Interface가 현재 Hook보다 더 깊고 두 소비자의 변경 비용을 실제로 줄인다는 설계 리뷰를 통과할 때만 진행한다.

### 필수 테스트

- 같은 입력은 데스크톱·모바일에서 같은 command를 만든다.
- 같은 실패는 같은 idempotency 정책을 사용한다.
- preview, draft 삭제·복원, approvalKind, 결과 불명 재시도, 성공 reset 계약을 양쪽에서 확인한다.
- 공통 순수·Hook 테스트와 별도로 실제 MobileIoComposeWizard를 렌더하는 최소 통합 테스트를 둔다. 현재 모바일 화면 테스트처럼 wizard 자체를 mock한 테스트만으로 완료하지 않는다.

### 완료 조건

- 각 업무 정책의 정의 위치와 데스크톱·모바일 호출자가 표로 확인된다.
- 실제 중복이 없으면 코드 변경 없이 NO CHANGE로 끝낼 수 있다.
- 추가 추출 시 기존 ADR-0003의 직접 재사용 계약과 dual-shell 회귀 테스트를 유지한다.

---

## QP-020. OpenAPI와 프런트 타입 연결

**목표:** 백엔드 필수 필드 변경이 프런트엔드 타입 오류 또는 계약 테스트 실패로 즉시 드러나게 한다.

### 확인된 증거

- frontend/lib/api/types/io.ts 등 DTO가 수동 작성된다.
- frontend/lib/api-core.ts는 generic cast로 응답을 신뢰한다.
- OpenAPI drift gate는 백엔드 기준선만 비교하고 프런트 타입 생성과 연결되지 않는다.

### 구현 절차

1. 전체 API를 한 번에 생성하지 않는다.
2. 위험이 높은 IO와 shipping schema부터 OpenAPI 생성 타입을 도입한다.
3. 입력은 _dev/baselines/openapi.json, 출력은 frontend/lib/api/generated/openapi.ts로 고정한다.
4. package-lock에 고정한 openapi-typescript를 사용하고 package script를 다음처럼 둔다.
   - npm run api:types: generated 파일 재생성
   - npm run api:types:check: 재생성 후 해당 파일의 git diff --exit-code 검사
5. generated 파일 header에 생성 명령과 직접 수정 금지를 기록한다.
6. 기존 @/lib/api 공개 타입은 generated type의 alias 또는 좁힌 Adapter로 유지한다.
7. API 경계에서 날짜·nullable·enum 차이를 Adapter가 명시적으로 변환한다.
8. backend baseline만 갱신하고 generated 파일을 갱신하지 않으면 frontend CI가 실패하게 한다.

### 필수 테스트

- 백엔드 응답에 필수 필드를 추가하고 생성물을 갱신하지 않으면 CI가 실패한다.
- enum 값 제거·추가가 switch exhaustiveness에 반영된다.
- 기존 공개 import 소비자는 마이그레이션 기간 동안 깨지지 않는다.
- 생성 타입은 compile-time 계약일 뿐 runtime JSON 검증을 제공하지 않는다. 이번 범위에서 runtime validator를 도입하지 않으면 fetcher의 신뢰 cast 위험을 남은 위험으로 기록한다.

---

## QP-021. 오류·health 의미와 출하 조회 운영성

### A. 오류와 health

#### 확인된 증거

- backend/app/main.py:194-221
  - 일반 ValueError를 전역 422로 처리한다.
- 일부 부서 조정·생산 경로가 내부 예외 문자열을 응답에 노출한다.
- backend/app/main.py:302-314
  - /health/live가 DB 상태에 의존한다.
- backend/app/main.py:322-361
  - 상세 health는 DB 실패 후에도 일부 검사를 이어간다.

#### 구현 계획

1. 공개 API별 현재 정상 4xx 응답을 characterisation test로 먼저 고정한다.
2. DomainError 계층과 HTTP status·안정된 error code 매퍼를 추가한다.
3. 업무용 ValueError, ShippingError, PermissionError를 Module별로 DomainError로 전환한다.
4. 전체 검색으로 잔여 일반 예외를 전수 분류하고 승인된 예외 목록을 기록한다.
5. 기존 업무 오류 전환이 끝난 마지막 단계에서만 전역 ValueError→422 handler를 제거한다.
6. 예상하지 못한 오류는 500과 request_id로 기록하고 외부 응답에 내부 SQL·경로·원문 예외를 노출하지 않는다.
7. /health/live는 프로세스 event loop 생존만 검사한다.
8. /health/ready는 DB와 필수 의존성을 검사한다.
9. 서버·DB 사용 가능 상태를 기다리는 소비자는 ready로 옮기고 진짜 liveness probe만 live를 사용한다.
   - scripts/dev/start-backend.ps1:66-68
   - scripts/dev/sync-to-employee.ps1:241
   - frontend/tests/e2e/global-setup.ts:12, 50
   - Docker와 배포 healthcheck

#### 완료 조건

- 프로세스는 살았지만 DB가 내려간 경우 live는 성공, ready는 실패한다.
- 도메인 입력 오류와 프로그래밍 오류가 같은 422로 숨지 않는다.
- 기존 정상 업무 4xx가 500으로 바뀐 endpoint가 0건이다.
- 로그의 request_id로 외부 일반 오류를 추적할 수 있다.
- DB down에서 live 200, ready 503이며 내부 예외가 응답에 노출되지 않는다.
- start, sync, E2E는 ready가 되기 전에 다음 단계로 진행하지 않는다.

### B. 출하 조회

이 하위 카드가 출하 read 계약과 pagination의 단일 소유자다. QP-018은 완료된 계약을 소비하는 프런트 Module 정리만 담당한다.

#### 확인된 증거

- backend/app/routers/shipping.py:265-274, 386-394
  - 요청과 이력 목록이 제한 없이 반환된다.
- backend/app/services/shipping.py:84-90
  - 행별 추가 transaction 조회 경로가 있다.
- frontend/lib/queries/useShippingQuery.ts:25-30, frontend/lib/api/shipping.ts:15-22
  - 프런트는 전체 배열 하나를 받은 뒤 상태별 목록으로 나눈다.
- frontend/app/mes/_components/DesktopShippingView.tsx:244-260
  - 단순 첫 페이지 전환 시 화면 뒤쪽 상태의 기록이 사라질 수 있다.

#### 구현 계획

1. 기존 list endpoint를 즉시 깨지 않는다. 새 paged endpoint 또는 opt-in query를 추가한다.
2. 요청 상태를 서버 filter로 명시하고 프런트 Query Key도 상태별로 분리한다.
3. cursor는 created_at과 request_id 같은 안정된 복합 정렬 키를 사용한다.
4. 목록 summary에는 화면에 필요한 최소 필드만 둔다.
5. 상세 transaction, shortage, allocation은 GET /requests/{id} detail로 이동한다.
6. URL로 선택된 ID가 현재 페이지에 없어도 detail endpoint로 표시한다.
7. selectinload 또는 bulk map으로 행별 추가 쿼리를 제거한다.
8. 프런트를 상태별 paged query와 detail query로 전환한 뒤 기존 endpoint 사용처가 0인지 검색한다.
9. 사용처 0과 deprecation 기간을 확인한 후 legacy list endpoint를 제거한다.
10. 1, 20, 최대 page size에서 query count가 일정한지 테스트한다.

#### 완료 조건

- 목록 쿼리 수가 행 수에 비례하지 않는다.
- 무제한 전체 출하·이력 반환 endpoint가 없다.
- 프런트는 목록 선택 시에만 상세를 요청한다.
- page size보다 많은 REQUESTED, PREPARING, PICKED_UP 데이터가 있어도 각 탭에서 끝까지 탐색할 수 있다.
- 두 페이지 사이에 중복·누락이 없고 첫 페이지에 없는 ID 딥링크도 상세를 표시한다.
- mutation 뒤 영향받은 상태 목록과 해당 detail cache만 갱신된다.
- OpenAPI baseline과 프런트 전환이 완료되기 전 legacy 응답 계약을 제거하지 않는다.

### C. 프런트 오류 경계와 관측성

#### 확인된 증거

- frontend/app/error.tsx:15-28과 frontend/app/global-error.tsx:15-26
  - console 기록만 사용하고 raw error.message를 사용자에게 표시한다.
- frontend/lib/client-events.ts:7-30
  - 허용 이벤트가 login, logout, nav 중심이라 UI 오류 추적 계약이 없다.

#### 구현 계획

1. 사용자 UI에는 고정된 친화적 문구와 opaque 추적 ID만 표시한다.
2. ui_error 이벤트는 route, source, digest 또는 안정된 code만 허용한다.
3. stack, raw message, response body, PIN, 직원 개인정보는 UI와 전송 payload에서 금지한다.
4. 같은 boundary mount에서 동일 오류 이벤트를 한 번만 전송한다.

#### 완료 조건

- 테스트용 비밀 문자열이 UI와 client event payload에 나타나지 않는다.
- 같은 오류에서 관측 이벤트가 정확히 한 번 기록된다.
- 사용자는 추적 ID를 보고할 수 있고 서버·클라이언트 로그에서 같은 ID를 찾을 수 있다.

---

## QP-022. 번들, 반응형 Shell, 문서의 실제성

### A. 번들 지표

현재 bundle script는 모든 chunk 합계를 중심으로 보므로 실제 /mes 첫 로드 비용과 다를 수 있다. 임계값만 올리는 변경은 회귀 원인을 숨긴다.

구현 계획:

1. Next build manifest에서 /mes 첫 로드 chunk를 계산한다.
2. desktop, mobile entry, 공통 chunk, 최대 단일 chunk를 raw와 gzip 중 어느 기준인지 명시해 별도 출력한다.
3. 임계값 변경에는 이전 값, 현재 값, 증가 원인, 제거 계획을 기록한다.
4. 현재 미커밋 임계값 상향은 새 지표 없이 확정하지 않는다.
5. 관계없는 lazy chunk 추가가 /mes first-load 예산을 올리지 않는 fixture로 계산기를 검증한다.

### B. 반응형 Shell

현재 page는 desktop과 mobile을 정적으로 import하고 resize 시 subtree를 바꾼다. 상태 유실과 번들 포함 가능성은 측정 후 개선한다.

구현 계획:

1. Next dynamic import로 desktop과 mobile entry를 분리한다.
2. 최초 client mount에서 폭을 한 번 읽어 Shell 종류를 해당 mount 동안 고정한다.
3. 같은 mount에서 resize해도 Shell을 교체하지 않고, 새로고침 또는 새 mount에서 새 폭을 반영한다.
4. 실시간 Shell 전환이 제품 요구가 되면 업무 state를 Shell 위로 이동하는 별도 설계를 먼저 한다.
5. hydration 전 null 대신 접근 가능한 loading shell을 표시한다.
6. /와 /mes 모두 같은 선택 정책을 사용한다.

필수 테스트:

- 1280에서 mount 후 430으로 resize해도 desktop Shell이 unmount되지 않는다.
- 새 mount를 430에서 시작하면 mobile만 mount된다.
- build 산출물에서 mobile, desktop dynamic chunk가 초기 공통 chunk와 구분된다.

### C. 문서

확인된 drift:

- _attic/docs/ARCHITECTURE.md:118-134는 React Query 미사용과 오래된 단계·경로를 설명한다.
- frontend/app/mes/README.md:16-24는 shipping 실행 화면을 누락한다.
- frontend/app/mes/_components/_warehouse_v2/README.md:8-27는 품목 전환을 누락한다.
- frontend/tests/e2e/_helpers.ts:77-79는 두 Shell이 CSS로 동시에 mount된다고 설명하지만 현재 page는 하나만 렌더한다.
- _attic/docs/CODEX_PROGRESS.md의 과거 coverage 50 도입 기록은 당시 역사적 사실이므로 현재 75와 다르다는 이유로 고치지 않는다.

구현 계획:

1. 코드 변경 PR마다 영향 문서를 검색한다.
2. 현재 문서 상단에 verified-at commit을 기록한다.
3. frontend-100-score 문서는 역사 자료로 표시하고 본 문서를 현재 진입점으로 연결한다.
4. 실제 개수는 문서에 하드코딩하지 않고 facts.py 명령만 안내한다.
5. E2E selector 주석을 현재 단일 Shell render와 맞춘 뒤 visible filter가 여전히 필요한지는 실제 테스트로 판단한다.

---

## QP-023. 측정 후 처리할 위생 항목

이 항목은 즉시 대량 정리하지 않는다.

### Hook dependency 억제

production 실행 경로에 react-hooks/exhaustive-deps 억제가 다수 있다. 억제 수 자체가 버그 수는 아니다.

절차:

1. 억제마다 intentional snapshot, stable callback, 실제 stale closure 위험으로 분류한다.
2. 실제 위험 항목은 실패 테스트를 먼저 만든다.
3. 정당한 억제에는 이유와 보장 테스트를 연결한다.
4. 새 억제는 이유 없이 허용하지 않는다.

### BOM cache 전체 조회

build_bom_cache의 전체 조회는 데이터 규모와 메모리 측정 전까지 결함으로 단정하지 않는다.

측정:

- 실제 BOM 행 수
- 요청당 메모리
- cold와 warm latency
- 호출 빈도

기준을 넘을 때만 필요한 모델·품목 범위 조회 또는 캐시 수명 변경을 설계한다.

### UTF-8 BOM, 즉 Byte Order Mark

여러 코드·테스트 파일에 UTF-8 BOM이 있어 단순 AST 도구가 실패할 수 있다.

절차:

1. .editorconfig의 charset 계약을 확인·추가한다.
2. 현재 대규모 미커밋 작업이 안정된 뒤 별도 기계적 커밋에서만 정규화한다.
3. 바이트 안전 방식으로 처리한다. 제거 전후 최초 EF BB BF 3바이트를 제외한 byte sequence가 같아야 하며 줄바꿈·공백·본문 문자는 변하지 않아야 한다.

### 미사용 의존성

SWR은 production import가 없는 것으로 보이며 Alembic 등도 실제 실행 경로를 확인할 필요가 있다.

절차:

1. import, script, CI, 문서를 전체 검색한다.
2. lock과 bundle 영향도 확인한다.
3. 사용처가 0이고 복구 명령이 명확한 의존성만 한 개씩 제거한다.

### 완료 조건

- Hook 억제는 이유 없는 production suppression이 0건이며 새 억제는 이유·보장 테스트 없이는 CI 또는 리뷰에서 거절된다.
- 업무 BOM cache는 측정치가 기준 미만이면 NO CHANGE로 종료할 수 있다.
- UTF-8 Byte Order Mark 정리를 실행했다면 추적 대상 파일의 EF BB BF가 0건이고 나머지 byte와 줄바꿈이 같다.
- SWR 등 의존성은 production import, script, 현재 문서 참조가 0임을 확인한 뒤 제거하고 build·bundle을 통과한다.
- “업무 BOM”과 “UTF-8 Byte Order Mark”를 같은 약어만으로 혼동해 기록하지 않는다.

---

## 8. 구현 파동과 의존 관계

## Wave 0. 병합 차단과 데이터 안전

순서:

1. QP-003 운영 DB 계약 ADR과 사용자 결정
2. QP-013A VerifiedActor Interface, 현행 식별 Adapter, 공통 limiter
3. QP-002 미커밋 출하·품목 전환 actor 위조 차단
4. QP-001A·B 입출고 결과 불명과 semantic idempotency
5. QP-004 승인 정책 단일화
6. QP-005 불량 idempotency

완료 게이트:

- 임의 헤더·body 직원 ID로 재고 변경 불가
- timeout 재시도 중복 재고 불가, 같은 IO 키의 다른 payload는 409
- 관리자 단독 승인 불가, 역할 기반 현행 자가승인은 보존
- 같은 불량 키의 다른 payload는 409
- 운영 DB 선택이 ADR로 확정되고 선택한 DB의 최소 통합 smoke가 차단 게이트로 동작

## Wave 1. 원자성과 동시성

순서:

1. QP-008 integrity 단일 commit
2. QP-009 active item 계약
3. QP-006 shipping workflow
4. QP-007 transaction lifecycle

완료 게이트:

- 모든 상태 전이의 실패 주입 rollback
- 선택한 운영 DB의 두 connection 경합 테스트
- 선택한 업무 규칙에 맞는 DB 불변식과 서비스 정책의 이중 방어

## Wave 2. 프런트 정확성과 실제 차단 게이트

순서:

1. QP-010 부서 dirty/save
2. QP-011 출하 BOM race/dirty
3. QP-012 blocking E2E
4. QP-015 test typecheck와 위험 coverage

완료 게이트:

- 오래된 응답이 최신 입력을 덮지 않음
- 저장 실패 뒤 이탈하지 않음
- 핵심 smoke 실패가 CI를 실제 실패시킴

## Wave 3. 깊은 Module과 상태 이음매

순서:

1. QP-017 React Query 단일 서버 상태
2. QP-021B shipping read 계약과 pagination
3. QP-018 shipping frontend Module
4. QP-019 IO 추가 공통화 측정, 증거가 있을 때만 구현

완료 게이트:

- 라우터와 화면은 조정자 역할만 함
- 공개 Facade 경로 유지
- 기존 골든 테스트와 새 전이 테스트 모두 통과
- QP-019는 중복이 없으면 NO CHANGE로 종료 가능

## Wave 4. 보안·운영·계약 게이트

순서:

1. QP-013B 사용자 결정 시 dual-column Argon2id·PIN 상태·rollback 이행
2. QP-014 lock, Ruff, 점진적 mypy, Python minor·운영 DB 필수화
3. QP-020 OpenAPI 생성 타입
4. QP-021A·C health/error와 프런트 오류 관측성

완료 게이트:

- PIN 보안 이행을 선택했다면 legacy·None·기본 PIN·관리자 PIN의 점진 이행과 rollback
- 재현 가능한 의존성
- 백엔드 필드 drift가 프런트 CI 실패로 연결
- live와 ready 의미 분리

## Wave 5. 접근성·문서·측정형 정리

순서:

1. QP-016 접근성 공통 계약
2. QP-022 번들·Shell·문서
3. QP-023 억제·BOM cache·인코딩·의존성 측정

완료 게이트:

- serious·critical 접근성 위반 차단
- 실제 첫 로드 번들 지표
- 현재 문서와 실행 경로 일치
- 측정 없는 대량 정리 없음

---

## 9. 주니어 개발자용 공통 실행 절차

각 카드를 구현할 때 아래 순서를 그대로 따른다.

### 9.1 시작 전

1. 카드의 증거 file:line을 최신 코드에서 심볼로 다시 찾는다.
2. 기준 커밋과 현재 미커밋 변경을 구분한다.
3. 동결 영역과 겹치는지 확인한다.
4. 관련 기존 테스트를 먼저 읽는다.
5. 현재 동작을 설명하는 실패 시나리오를 한 문장으로 작성한다.

### 9.2 테스트 먼저

1. 정상 경로만 추가하지 않는다.
2. 최소 다음을 검토한다.
   - 같은 요청 재시도
   - 다른 payload에 같은 키
   - 두 세션 동시 실행
   - 중간 예외와 rollback
   - 비활성·권한 없음·잘못된 PIN
   - 오래된 비동기 응답
3. 기존 버그가 재현되는 테스트가 먼저 실패하는지 확인한다.
4. 잠금·경합은 QP-003에서 선택한 운영 DB의 실제 두 connection 테스트로 작성한다.

### 9.3 구현

1. 업무 규칙은 서비스 또는 순수 Module에 둔다.
2. 라우터는 인증, 변환, 오류 매핑, commit 경계만 담당한다.
3. React 화면은 표시와 사용자 이벤트 연결만 담당한다.
4. 상위 unit of work에 참여하는 요청-scoped 도메인 서비스는 commit하지 않는다. 명시적 transaction-boundary Adapter와 독립 CLI는 문서화된 예외다.
5. 동일 규칙을 두 파일에 복사하지 않는다.
6. 기존 Facade와 공개 import는 마이그레이션 기간 동안 유지한다.

### 9.4 문서

1. 정책이 바뀌면 CONTEXT, ADR, README의 관련 문장을 검색한다.
2. 거짓이 된 문장은 같은 변경에서 고치거나 STALE로 표시한다.
3. 해결한 카드는 상태를 RESOLVED로 바꾸고 검증 커밋을 기록한다.
4. 구현 방향을 바꿨다면 이유와 대안을 기록한다.

### 9.5 검증

1. 변경 영역에 맞는 빠른 테스트를 반복한다.
2. 완료 전 efficient-verification 기준으로 필요한 최종 게이트를 한 번 실행한다.
3. DB 변경이면 빈 DB bootstrap과 기존 DB migration을 둘 다 검증한다.
4. concurrency 변경이면 선택한 운영 DB에서 두 독립 connection 테스트를 실행한다.
5. 최종 보고에는 실행한 명령과 실제 결과만 쓴다. “통과 예상”은 쓰지 않는다.

### 9.6 리뷰 요청 양식

- 해결하려던 실패 모드:
- 변경한 업무 불변식:
- 새 DB 제약 또는 트랜잭션 경계:
- 같은 규칙의 단일 진실 공급원:
- 추가한 실패·경합·rollback 테스트:
- 의도적으로 건드리지 않은 영역:
- 남은 위험:
- 되돌리는 방법:

---

## 10. 카드별 산출물 체크리스트

| 카드 | 코드 산출물 | 테스트 산출물 | 문서 산출물 |
|---|---|---|---|
| QP-001 | transport error 분류, AbortSignal, key+fingerprint 상태 | timeout 후 동일 키, 성공 후 새 키 | API 재시도 계약 |
| QP-002 | VerifiedActor 인증 이음매 | 헤더 위조·비활성·PIN·권한 | 인증·감사 ADR |
| QP-003 | 선택한 DB Adapter, 원천 필드 필터 | 운영 DB 통합·이관 또는 현행 복구 | DB 운영 ADR·운영 문서 |
| QP-004 | approval_rules 단일화 | 역할 매트릭스, list/count 일치 | CONTEXT와 docstring |
| QP-005 | command fingerprint, 기존 로그 응답 | 동일·상이 payload, race | idempotency API 계약 |
| QP-006 | shipping_workflow | 전이 표, 동시성, rollback | 상태 전이 표 |
| QP-007 | transaction_lifecycle, unique constraint | 정정·취소 race | 정정·취소 규칙 |
| QP-008 | flush-only integrity | audit 실패 rollback | 트랜잭션 경계 설명 |
| QP-009 | get_active/get_any | 삭제 품목 명령 거절 | 저장소 계약 |
| QP-010 | Promise save와 실제 dirty | 실패 유지·성공 이동 | guard mode 문구 |
| QP-011 | request generation, baseline | 역순 응답·no-edit | 출하 편집 상태 |
| QP-012 | smoke/extended CI 분리 | 고의 실패 검증 | flaky 목록 |
| QP-013A | VerifiedActor, 현행 식별 Adapter, limiter | 위조·active·권한·rate limit | 행위자 식별 정책 |
| QP-013B | 결정 시 dual-column Argon2id, pin state | legacy·None·기본·관리자 PIN·rollback | PIN 이행 운영 절차 |
| QP-014 | lock, Ruff, mypy, PG job | CI 실패 검증 | 개발 검증 명령 |
| QP-015 | test tsconfig, fixture builder | fixture 누락 컴파일 실패 | 테스트 작성 규칙 |
| QP-016 | 공통 dialog 계약 | focus, ESC, restore, alert | 접근성 체크리스트 |
| QP-017 | Query 기반 department adapter | single fetch, error/empty | frontend 계약 |
| QP-018 | shipping reducer와 view Adapter | 전이·URL·상태별 cache | 프런트 Module 책임도 |
| QP-019 | 중복 측정 보고서 또는 최소 기존 Hook 확장 | 실제 mobile render와 desktop/mobile 계약 | ADR-0003 확인·NO CHANGE 근거 |
| QP-020 | generated API types | schema drift 실패 | 생성 명령 |
| QP-021 | DomainError, live/ready, pagination | error/health/query count | 운영 Runbook |
| QP-022 | manifest metric, dynamic entry | resize 상태·chunk | 최신 README |
| QP-023 | 측정 리포트와 최소 정리 | byte/import 검증 | 결정 근거 |

---

## 11. 단계별 완료 정의

검증된 결함 수정과 장기 현대화 로드맵을 한 완료 문구로 섞지 않는다.

### 11.1 안전성 개선 완료

다음을 모두 만족하면 “P0/P1 안전성 개선 완료”라고 보고할 수 있다.

- 같은 화면 세션의 결과 불명 재시도로 재고가 중복 반영되지 않는다.
- IO와 불량 등록에서 같은 키·다른 command 또는 payload는 409다.
- 민감 mutation actor는 모두 VerifiedActor에서 파생된다.
- 관리자 플래그만으로 승인되지 않고 현행 역할 기반 자가승인 계약은 의도 없이 바뀌지 않는다.
- 운영 DB 계약이 ADR로 확정되고 선택한 DB의 실제 동시성 테스트가 필수 CI에서 통과한다.
- 상태 의존 출하 mutation과 거래 정정·취소가 선택한 잠금·DB 불변식으로 보호된다.
- 중간 실패 시 재고, 상태, 효과, 로그, 감사가 함께 rollback된다.
- 삭제 품목은 새 재고 효과에 사용되지 않고 허용된 과거 보상은 유지된다.
- 저장되지 않은 변경과 화면 위치를 혼동하지 않는다.
- 오래된 BOM 응답이 최신 입력을 덮지 않는다.
- blocking smoke 실패가 병합을 막는다.

### 11.2 전략 백로그 완료

P2/P3는 아래 항목을 각각 독립적으로 완료·거절·NO CHANGE 처리한다. 전부 끝나야 안전성 개선을 인정하는 것은 아니다.

- PIN을 보안 인증으로 격상하기로 선택했다면 dual-column Argon2id, pin state, 관리자 PIN, rollback 이행이 완료된다.
- Python minor, lock, Ruff, 점진적 mypy, 선택한 운영 DB 게이트가 재현 가능하다.
- 테스트 소스가 분리된 TypeScript strict 검사와 위험 Module branch gate를 받는다.
- 핵심 비동결 모달과 상호작용이 키보드·초점·자동 접근성 계약을 통과한다.
- 서버 상태는 React Query 이음매를 사용하되 기존 Context 공개 Interface를 보존한다.
- 출하 read pagination과 프런트 Module 심화가 호환 전환 순서대로 완료된다.
- OpenAPI 생성 타입을 선택했다면 backend baseline drift가 frontend CI 실패로 연결된다.
- live, ready, 외부 오류, 프런트 오류 경계의 의미가 운영 계약과 일치한다.
- 번들·Shell 측정에서 변경 실익이 없으면 NO CHANGE로 종료할 수 있다.
- 현재 아키텍처 문서는 실제 React Query, shipping, 품목 전환 경로를 설명한다.
- 과거 100점 문서는 역사 자료로 표시된다.

### 11.3 모든 완료 보고의 공통 증거

- 각 카드에 실제 테스트 명령과 결과, 해결 커밋, 남은 위험을 기록한다.
- DECISION 카드는 ADR·사용자 결정 없이 RESOLVED로 바꾸지 않는다.
- MEASURE FIRST 카드는 측정 없이 코드 변경으로 완료하지 않는다.
- 테스트를 실행하지 않은 상태를 “통과 예상”으로 기록하지 않는다.

---

## 12. 명시적으로 하지 않을 일

- 본 계획만으로 코드가 이미 수정됐다고 간주하지 않는다.
- 파일 줄 수를 목표로 대량 분할하지 않는다.
- 동결된 주간보고와 모바일 하단 탭 디자인을 전역 정리 대상에 넣지 않는다.
- 현재 작업 중인 이력 화면을 안정된 품질 기준으로 평가하지 않는다.
- BOM cache를 측정 없이 성능 결함으로 단정하지 않는다.
- re-export Facade를 빈 파일처럼 취급해 삭제하지 않는다.
- 전체 저장소를 한 번에 포맷하거나 타입 엄격화하지 않는다.
- 테스트를 실행하지 않고 “통과 예상”을 완료 증거로 쓰지 않는다.
- 품질을 단일 숫자나 100점으로 보고하지 않는다.

---

## 13. 다음 구현 세션의 시작점

첫 구현 세션에서는 범위를 QP-001A로 제한하는 것을 권장한다. 백엔드 schema 변경 없이 프런트 transport 오류 분류와 같은 화면 세션의 재시도 키 보존을 먼저 단단하게 만든다. 이 단계만 끝나면 “정상 프런트 경로의 timeout 중복 차단”으로만 보고하고 semantic idempotency 완료라고 쓰지 않는다.

단, 현재 미커밋 출하·품목 전환 actor 변경을 먼저 병합해야 하는 상황이라면 QP-013A와 QP-002가 절대 우선이다. QP-002 검증을 통과하지 않은 상태에서는 해당 변경을 배포하거나 병합하지 않는다.

첫 세션 종료 시 필요한 증거:

1. 버그를 재현하는 실패 테스트
2. 동일 client_request_id가 유지되는 Hook 테스트
3. timeout, network, abort, 5xx와 확정 4xx 분류 테스트
4. 성공 또는 명시적 새 명령에서만 키가 바뀌는 테스트
5. 변경 영역 verify_local 실제 통과 결과
6. QP-001A의 제한된 보장 범위를 적은 재시도 계약 문서

두 번째 세션에서 QP-001B의 IoBatch fingerprint schema·migration과 같은 키·다른 payload 409 통합 테스트를 완료한다.

이후 QP-004와 QP-005를 각각 독립 수직 과제로 진행하고, QP-003의 운영 DB 계약은 시니어와 사용자가 ADR을 확정한 뒤 선택한 분기로 진행한다.
