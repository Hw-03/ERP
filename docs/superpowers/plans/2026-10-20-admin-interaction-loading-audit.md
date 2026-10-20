**추천 모델: GPT-6.1 Sol** — 관리자 화면의 공통 전환, 목록 렌더링, 조회 캐시를 함께 수정하는 프런트엔드 작업입니다.
**추천 추론 수준: High** — 빠른 연속 선택, 조회 응답 순서, 미저장 입력과 캐시 갱신이 얽혀 있어 회귀 경로를 함께 검증해야 합니다.
**실행 방식: 단독 작업** — 공통 전환부터 목록과 조회까지 순서대로 바꾸고 같은 브라우저에서 비교합니다.

# DEXCOWIN MES 관리자 상호작용 점검과 개선 계획

**GOAL:** 현재 디자인을 유지하면서 관리자 8개 화면의 반짝임·불필요한 대기·입력 유실을 해결하고, 기존 기능의 정상·실패·재시도 흐름을 검증해 일관된 사용 경험으로 완성한다.

작성일: 2026-10-20. 상태: **2026-10-21 구현·검증 완료, 커밋·푸시 전**.
실행 시 `.agents/skills/executing-plans/SKILL.md`를 적용한다. 브랜치 변경·커밋·푸시는 별도 요청이 있을 때만 수행한다.

최종 변경과 실제 검증 범위는 [완료 보고서](../specs/2026-10-21-admin-completion-verification.md)를 기준으로 확인한다. 아래 조사 내용과 코드 예시는 수정 전 원인을 보존한 기록이다.

### 승인된 확장 범위와 실행 기록

- 같은 관리자 세션 안에서 화면별 검색·필터·선택·상세 탭·스크롤을 복원한다. PIN과 미저장 입력은 복원 저장소에 넣지 않는다.
- 현재 선택이 필터 밖으로 나가면 상세와 입력을 유지하고 상태를 설명한다.
- 관리자 8개 화면의 정상·오류·재시도·미저장·키보드 흐름을 검증한다. 내보내기는 실제 파일과 선택 옵션을 대조한다.
- 테스트 데이터의 변경은 격리 QA 환경에서 수행한다. 원본 DB를 변경하지 않는다.
- 2026-10-20: 직원 메뉴 집합 비교, 조건부 확인창 최초 포커스, 부서 미저장 가드와 저장 Promise, 중복 창고 옵션을 재현 테스트 후 수정했다.
- 2026-10-20: 상세 스냅샷의 불투명 바탕, 진입 커버 중 내부 read reveal 억제를 테스트 후 수정했다.
- 2026-10-20: BOM 미배치 원자재 펼침에서 전체 페이드를 제거했다. 준비된 조회 데이터가 있는 품목·BOM의 첫 진입/재진입은 스켈레톤과 이중 프레임 지연을 생략한다. 선택 180ms·조회/진입 220ms 토큰을 적용했다.
- 첫 배치 관련 단위 검사: 직원 폼 14개, 확인창 4개, 부서 상세 4개, 부서 화면 8개, 상세 카드 12개, 품목 필드 16개, read boundary 5개 통과. 당시 브라우저·타입·성능 검증 전이었으며 최종 결과는 아래와 같다.
- 추가 검사: BOM workbench 22개, 화면 전환 10개, 전환 시간 1개 통과. 시간 토큰 변경 후 상세 카드/read boundary도 재실행 통과.
- 2026-10-20 후속 구현: 품목/전체 BOM/상세/사용처를 공유 조회 캐시로 연결하고, 사용 중인 BOM 모드만 조회하며 저장 전 진행 조회를 취소한다. 상세 재선택 캐시와 저장 중 부모 전환 경합 테스트를 통과했다.
- 대용량 품목·BOM 부모/후보/결과/사용처 목록에 가상 행을 적용했다. 포커스·드래그·펼친 행을 유지하며 마지막 행 키보드 이동을 검사했다. BOM 검색/결과 헤더는 고정하고 본문 스냅샷만 전환한다. 관련 67개 테스트와 타입 검사 통과.
- 관리자 세션의 검색·필터·모델/품목/직원 선택·품목 상세 탭·공통 목록 스크롤 복원을 구현했다. 브라우저에서 품목 상세 탭이 초기화되는 후속 결함을 발견하고 수정한 뒤 품목 탭/직원 선택 복원을 다시 확인했다. 브라우저는 원본 화면 읽기·선택만 수행했다.
- 품목/직원 저장 실패가 Promise 성공으로 처리되던 경로를 재현 테스트로 확인하고 수정했다. 모델 저장도 실제 완료를 기다린다. 공통 저장 단일 실행과 저장 중 버튼 상태, 부서 필수 이름/색상 검증, 품목 수정 원복의 의미상 dirty 비교를 추가했다. 이 배치 관련 98개 테스트와 타입 검사 통과.
- 격리 QA `admin-completion-20261020-a`를 준비했다. 사본 식별값·DB·프로세스는 `_attic/runtime/mes-browser-regression/admin-completion-20261020-a/session.json`에 기록한다.
- 2026-10-21 마무리: BOM 결과별 스크롤 복원/필터 밖 선택 설명, 추가·삭제 단일 실행/실패 전달, 늦은 저장 응답 방어, 스냅샷 라벨 중복 제거를 완료했다.
- 최종 검사: 단위 425개, Chromium 고유 시나리오 14개, 변경 파일 ESLint, 프로덕션 빌드/타입 검사, 번들 검사 통과. 두 뷰포트의 위치 차이 ≤1px와 재진입 중앙값 218~233ms를 확인했다. 상세 범위·수동 제외 항목·번들 예산 변경은 완료 보고서에 기록했다.

## 1. 실제로 확인한 범위

Chrome의 개발 서버 `http://192.168.0.63:3001/mes?tab=admin`에서 확인했다. 현재 관리자 화면과 같은 개발 서버이며 운영용 포트는 사용하지 않았다. Chrome의 실제 뷰포트는 1920×855였다. 앞선 부서 점검은 인앱 브라우저에서도 수행했다.

| 화면 | 직접 조작한 대상 | 확인 범위 |
|---|---|---|
| 모델 | 실행 당시 전체 모델 행, 추가 폼, 이름·기호 입력, 삭제 확인창 | 선택 전환, 입력 길이 제한, 활성/비활성 버튼 상태, 확인창 취소 |
| 품목 | 목록의 연속된 대표 행, 삭제된 품목, 상세 탭 전체, 제품 선택, 부서·공정·자재분류, 재고·구매 입력, 추가 폼의 초기 재고 위치, 삭제 확인 | 선택 전환, 잠금·복구 표시, 상세 탭 전환, 로컬 입력과 취소 |
| 직원 | 실행 당시 전체 직원 행, 모든 목록 부서 필터·직급 선택지, 검색과 지우기, 연락처·부서 입력, 결재 권한, 메뉴 체크, 담당 모델 추가·제거·순서, 추가 폼, PIN 초기화·비활성화·삭제 확인창 | 선택 결과와 이름의 일치, 입력 원복, 미저장 경고, 필수값 오류, 확인창 취소 |
| 부서 | 실행 당시 전체 부서 행, 상태 필터, 검색, 추가 폼, 이름·색상 입력, 전체 색상 팔레트, 펼침·접힘, 비활성화·영구 삭제 확인창 | 전환 중 버튼 밝기, 팔레트 영역, 수정 후 다른 행 선택, 확인창 취소 |
| BOM | 상태 KPI, 단계·부서 필터의 모든 선택지, 양쪽 검색, 완료·작업중·미착수 부모, 편집·사용처, 사용처에서 부모 이동, 미배치 원자재 펼침·접힘, 수량 편집, 하위 품목 추가 입력, 삭제·완료 검토창 | 로딩과 전환, 빈 구성, 잠금 상태, 입력 취소, 확인창 포커스 |
| 내보내기 | 일반·내부 원본 로그·통합 작업, 데이터 범위, 기간, CSV·Excel, 비활성 포함, 로그 종류·월, 단말명 입력, 공식 서식 및 각 다운로드 종류 | 옵션 변화, 진행·완료 안내. 다운로드 파일 내용 대조는 범위 밖 |
| 정합성 | 최초 진입, 다시 검사 | 재검사 중 기존 결과 유지, 완료 상태 |
| 보안 | 화면 진입, 현재 PIN·새 PIN·확인 입력의 포커스 | 빈 입력에서 변경 버튼 비활성. 새 인증정보 입력은 수행하지 않음 |

실제 데이터의 저장·생성·삭제·복구·완료 처리·PIN 변경·권한 저장·순서 저장은 실행하지 않았다. 이 버튼들은 가능한 경우 확인창을 열고 취소했다. BOM 미배치 품목의 상태 체크와 즉시 저장되는 정렬 드래그는 코드 경로를 읽었다. 반복되는 모든 품목/BOM 데이터 행 및 모든 입력 조합을 클릭했다는 의미는 아니다.

실패 응답을 강제로 주입하는 검사, 모션 감소, 1914×883·1280×883의 픽셀 비교는 이번 탐색에서 수행하지 않았다. 구현 후 검증 항목으로 남긴다. 데이터 수는 고정 전제로 사용하지 않으며, 도메인 수치가 필요하면 `python _attic/backend-scripts/facts.py`로 다시 확인한다.

## 2. 발견 사항과 원인

### A1. 모델·품목·직원·부서 선택 시 상세와 하단 버튼의 밝기가 튐 — 직접 재현, 우선 수정

부서를 선택할 때 `부서 비활성화` 버튼이 잠깐 진해졌다 돌아왔다. 모델을 바꿀 때도 삭제 버튼과 텍스트가 이전 화면과 겹쳤다. DOM을 시간 순서로 읽으면 실제 내용의 opacity는 1인 채 이전 화면 복제본만 1→0으로 사라졌다.

원인은 상세 DOM 전체를 `cloneNode(true)`로 복제하면서 복제본의 바탕을 불투명하게 만들지 않는 것이다. 반투명 버튼·테두리·문자가 새 화면 위에 두 겹으로 합성된다. 시간만 조정해도 이 합성 문제는 남는다.

- [복제 및 합성 코드](C:/ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminDetailViewport.tsx:20)
- [복제본 배치와 페이드](C:/ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminDetailViewport.tsx:46)
- [부서 비활성화 버튼](C:/ERP/frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx:296)

### A2. BOM 미배치 원자재를 펼치면 관계없는 세 칸 전체가 사라졌다 나타남 — 직접 재현

펼치기 직후 두 검색창을 포함한 작업 영역의 opacity가 약 0.079까지 내려갔다. 펼치기 자체는 정상인데 작업 영역 전체에 다시 진입하는 느낌이 난다.

`useAdminSelectionFade`의 키에 `unmatchedOpen`이 들어 있고, 해당 ref가 세 칸 전체를 감싼다.

- [펼침 상태를 포함한 전환 키](C:/ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx:110)
- [전체 작업 영역에 적용한 ref](C:/ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx:447)
- [opacity 0→1 동작](C:/ERP/frontend/app/mes/_components/_admin_sections/useAdminSelectionFade.ts:19)

### A3. 화면마다 로딩 종료·선택 전환을 담당하는 계층이 달라 리듬이 다름 — 브라우저 관찰 + 코드 확인

직원은 상세 로딩 종료를 선택 키로 다루며 `AdminReadBoundary`의 reveal을 끈다. 모델·부서는 read reveal을 사용한다. BOM 결과 패널은 선택 fade와 read reveal을 같은 ref에 연결한다. `display: contents` 경계는 상위 요소를 페이드 대상으로 선택한다.

진입 커버가 있는 상태를 selection fade는 피하지만 read reveal은 검사하지 않는다. 따라서 데이터 준비 시점에 따라 큰 영역의 전환과 작은 영역의 전환이 겹칠 수 있다. 이것이 모든 관측 프레임의 단독 원인이라고 단정하지 않으며, 중복 실행 가능성이 확인된 구조적 문제로 분류한다.

- [직원 로딩 선택 키](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminEmployeesSection.tsx:266)
- [직원 read reveal 제외](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminEmployeesSection.tsx:282)
- [모델 read reveal](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminModelsSection.tsx:322)
- [부모를 대상으로 삼는 read reveal](C:/ERP/frontend/app/mes/_components/_admin_sections/useAdminReadReveal.ts:21)
- [BOM 선택과 조회 전환 연결](C:/ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomEditPanel.tsx:46)

### A4. 품목·BOM의 재진입에도 전체 로딩 단계를 반복함 — 직접 재현 + 코드 확인

같은 관리자 세션에서 다른 탭을 거쳐 품목으로 돌아와도 전체 진입 스켈레톤이 나왔다. 한 관측에서는 클릭부터 커버 제거까지 약 2초였다. 추가 관측에서도 약 1.4초 시점까지 커버가 남았다. 이는 도구 왕복 시간을 포함한 관측값이며 정확한 브라우저 프로파일링 수치는 아니다.

현재 코드는 데이터가 준비돼 있어도 품목·BOM 진입마다 커버를 만들고, 두 번의 `requestAnimationFrame` 뒤 본문을 마운트한다. 본문은 탭별 key 때문에 재생성되며 커버 종료에는 별도 페이드 시간이 붙는다.

- [진입 상태 및 준비 여부](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminSectionTransition.tsx:19)
- [두 프레임 뒤 마운트](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminSectionTransition.tsx:38)
- [탭별 본문 key](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminSectionTransition.tsx:64)
- [공통 전환 시간](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminTransitions.module.css:4)

### A5. 많은 목록 행의 DOM 생성 비용이 재진입마다 발생함 — 직접 측정 + 코드 확인

이번 실행에서 품목 화면은 약 1.6만 개, BOM 편집 화면은 약 1.3만 개의 DOM 요소를 만들었다. 품목의 실제 행 높이는 51px였다. 목록은 전체 배열을 `map`하고 있으며, `content-visibility`는 화면 밖의 그리기를 줄여도 React 요소와 DOM 생성 자체를 없애지 않는다.

따라서 전환을 빠르게 만드는 작업만으로 최초 본문 생성 비용이 없어지지는 않는다. 개별 비용의 정확한 비중은 구현 단계에서 프로파일로 분리한다.

- [전체 목록 렌더링](C:/ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminListPanel.tsx:75)
- [현재 그리기 최적화](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminListPerformance.module.css:4)
- [품목의 실제 최소 행 높이](C:/ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminMasterData.module.css:2)

읽기 전용 HTTP 측정에서도 응답 시간은 실행별로 변동했다. 같은 장비에서 반복한 Python 측정은 품목/BOM 조회가 대체로 수백 ms였지만 다른 측정에서는 초 단위도 관찰됐다. 이 결과만으로 서버가 항상 빠르다고 판단하지 않는다. 우선 확인된 클라이언트 낭비를 제거하고, 이후 남는 서버 시간을 따로 측정한다.

### A6. BOM의 재선택과 관리자 재진입에서 조회 결과 재사용이 제한됨 — 코드로 확정

BOM 부모가 바뀌면 직계 구성과 사용처를 모두 조회한다. 현재 편집 모드에서도 사용처 API가 호출되는 구조이며, 이전에 열었던 부모를 다시 선택해도 로컬 상세 상태를 비우고 다시 요청한다.

관리자 bootstrap은 품목·전체 BOM을 로컬 상태와 직접 요청으로 관리한다. 최초 로딩 경로와 realtime revision 경로가 각각 같은 조회를 호출할 수 있다. 공통 React Query에도 realtime 무효화가 있으므로 마이그레이션 후 두 경로를 동시에 남기면 중복 요청이 유지된다.

- [BOM 직계 구성 요청](C:/ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx:184)
- [모드와 무관한 사용처 요청](C:/ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx:211)
- [bootstrap 직접 요청](C:/ERP/frontend/app/mes/_components/_admin_hooks/useAdminBootstrap.ts:98)
- [초기 및 realtime 조회 경로](C:/ERP/frontend/app/mes/_components/_admin_hooks/useAdminBootstrap.ts:151)
- [공통 realtime 무효화](C:/ERP/frontend/lib/queries/realtime.tsx:53)

### A7. 부서를 수정하고 다른 부서를 누르면 입력이 경고 없이 사라짐 — 직접 재현, 입력 보호 우선

부서명에 임시 문자를 입력하고 다른 부서 행을 눌렀을 때 경고 없이 선택이 바뀌었다. `DeptDetailView`는 dirty를 계산하고 전달하지만 상위 화면은 `deptDirty = false`와 빈 저장 함수를 guard에 넣고 있다.

- [항상 false인 guard](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminDepartmentsSection.tsx:75)
- [실제 dirty 전달](C:/ERP/frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx:74)
- [반환을 기다릴 수 없는 현재 save](C:/ERP/frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx:84)

### A8. 직원 메뉴 체크를 원래대로 돌려도 미저장 경고가 뜸 — 직접 재현

변경하지 않은 직원에서 `재고 전수조사`를 켰다가 다시 끈 뒤 부서 관리로 이동하면 미저장 경고가 나왔다. `hidden_sidebar_tabs`를 집합이 아닌 배열 순서로 비교하기 때문이다. 반면 담당 모델의 순서는 우선순위이므로 계속 순서대로 비교해야 한다.

- [메뉴 배열의 순서 비교](C:/ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployeesForm.ts:111)

### A9. 품목 초기 재고 위치의 ‘창고’ 중복 — 직접 재현, 콘솔 오류 확인

위치 목록에 같은 ‘창고’가 두 번 나왔고 브라우저에 duplicate key `창고` 오류가 기록됐다. 기본 창고를 먼저 넣은 뒤 부서 목록을 그대로 붙여 같은 값이 중복된다.

- [중복 옵션 생성](C:/ERP/frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx:147)

### A10. BOM 검토창이 떠도 포커스가 배경에 남음 — 직접 재현

검토창을 연 직후 포커스는 배경의 `검토 · 완료` 버튼에 있었고, Tab을 누르자 배경의 `미배치 원자재`로 이동했다. 같은 공통 확인창을 계속 마운트해 두는 경우와 조건부로 새로 만드는 경우의 차이가 있다.

공통 확인창은 첫 렌더에서 `mounted=false`로 portal을 만들지 않는데 focus trap은 이미 `open=true`로 실행된다. 이후 portal이 생겨도 focus trap의 의존성이 바뀌지 않는다.

- [조건부로 쓰는 BOM 확인창](C:/ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomReviewModal.tsx:59)
- [trap과 portal 마운트 순서](C:/ERP/frontend/lib/ui/ConfirmModal.tsx:122)
- [ref가 없을 때 종료하는 effect](C:/ERP/frontend/lib/mes/useFocusTrap.ts:16)

### 별도 관찰: 목록 필터와 현재 상세가 다를 수 있음

직원 검색·부서 필터나 BOM 상태 필터를 바꿔도 오른쪽에는 필터 밖의 기존 선택이 남는다. 입력을 보호하려는 선택 유지 정책일 수 있어 데이터 오류로 분류하지 않았다. 이번 수정에서는 자동으로 다른 행을 선택해 입력을 버리지 않는다. 필터 밖 선택을 유지할 때 상세에 `현재 선택은 검색 결과에 없습니다`라는 짧은 상태를 표시하고, 기존 상세와 필터의 관계를 명확하게 한다.

## 3. 구현 원칙

실제 렌더 경로는 [DesktopAdminView](C:/ERP/frontend/app/mes/_components/DesktopAdminView.tsx:116) → `AdminSectionTransition` → `AdminSectionContent` → 각 관리자 섹션이다.

- 카드 외곽·탭·검색·표 제목·고정 버튼은 안정적으로 유지한다. 바뀐 데이터 영역만 전환한다.
- 한 전환에는 한 계층만 애니메이션을 맡는다. 진입 커버가 있으면 내부 read/selection 전환은 실행하지 않는다.
- 선택 전환은 180ms, 최초 조회 결과 전환은 220ms를 기본으로 한다. 빠른 연속 선택은 기존 전환을 취소하고 마지막 선택만 남긴다.
- 모션 감소에서는 애니메이션 없이 결과를 즉시 갱신한다. 이미 준비된 데이터에 스켈레톤을 의무적으로 보여주지 않는다.
- 오래된 데이터를 새로 선택한 품목의 데이터처럼 표시하지 않는다. 캐시는 품목 ID와 조회 종류로 구분한다.
- 기존 권한·삭제 확인·복구·BOM 잠금·순서·모델 우선순위·실시간 갱신·저장 실패 처리 계약을 보존한다.
- 앞서 맞춘 168×44 모드 버튼, 검색 48px·필터 40px·제목 36px·BOM 행 37px·결과 헤더 88px와 완료 안내문 자리, 외부 스크롤바 및 둥근 모서리를 유지한다.

## 4. 실행 계획

모든 작업은 GPT-6.1 Sol / High / 순차 실행이다. 아래 코드는 구현 계약을 구체화한 것이며 아직 소스에 적용하지 않았다.

### 작업 1. 상세 합성과 전환의 담당 계층 통일

대상:

- `frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminDetailViewport.tsx`
- `frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminDetailCard.tsx`
- `frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminReadState.tsx`
- `frontend/app/mes/_components/_admin_sections/useAdminReadReveal.ts`
- `frontend/app/mes/_components/_admin_sections/useAdminSelectionFade.ts`
- `frontend/app/mes/_components/_admin_sections/adminFadeDuration.ts`
- `frontend/app/mes/_components/_admin_sections/AdminTransitions.module.css`
- 직접 연결된 모델·품목·직원·부서 섹션과 BOM 표시 패널

- [x] 기존 `AdminDetailCard.test.tsx`에 반투명 복제본을 허용하지 않는 검사, 고정 footer가 snapshot에 포함되지 않는 검사, 빠른 A→B→C 선택 후 snapshot이 하나만 남는 검사를 추가한다.
- [x] 선택 snapshot은 **불투명한 카드 바탕을 포함한 완성된 화면**으로 만든다. live 화면은 opacity 1을 유지하고 이전 완성 화면만 사라지게 한다. 동일한 반투명 표면이 중첩되는 방식을 제거한다. snapshot은 inert·aria-hidden을 유지하고 입력 ID/name을 복제하지 않는다.
- [x] `AdminDetailCard`의 header/tab/footer는 전환 영역 밖에 유지한다. 구현 검토 후 모델·부서 하단 액션은 기존 구조와 간격을 보존하고 불투명 합성으로 밝기 중첩을 제거했다. 직원 계정 액션도 같은 방식을 적용했다. 고정 위치는 두 해상도의 브라우저 검사로 확인했다.
- [x] 복제 표면과 실제 표면은 동일한 clip 경계를 사용한다. 외부 스크롤바 레일은 clip 밖에 유지한다. 새 불투명 표면이 카드의 둥근 모서리를 사각형으로 덮지 않는지 네 모서리를 검증한다.
- [x] `display: contents`의 상위 요소를 임의로 페이드하는 동작을 없애고 명시한 콘텐츠 표면에서만 read reveal을 실행한다.
- [x] `adminFadeDuration(element, kind = "selection")`으로 selection/read 시간을 구분한다. CSS 값의 `ms`/`s` 파싱과 reduced-motion 처리는 보존한다.

핵심 합성 규칙:

```ts
Object.assign(overlay.style, {
  backgroundColor: "var(--c-s1)",
  pointerEvents: "none",
});
// 진입 커버가 표면 전환을 맡는 동안 내부 reveal은 시작하지 않는다.
if (element.closest('[data-admin-entry-covered="true"]')) return;
```

위 배경 지정은 clipping/고정 액션 분리와 함께 적용한다. 배경 한 줄만 추가하고 완료하지 않는다.

검증: 동일한 빨간 버튼의 위치와 색이 선택 전후 유지되고, 이전 이름과 새 이름이 겹쳐 진하게 보이지 않아야 한다. 직원·부서 전환은 같은 180ms 규칙을 사용한다.

### 작업 2. BOM의 펼침·필터·선택 전환 범위 축소

대상:

- `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx`
- `BomEditPanel.tsx`, `BomWhereUsedPanel.tsx`, `BomChildAddBox.tsx`, `BomUnmatchedRawsDrawer.tsx`
- `frontend/app/mes/_components/_admin_sections/AdminEmployeesSection.tsx`

- [x] `BomWorkbench.test.tsx`에 미배치 영역을 펼쳐도 전체 작업 영역의 opacity 애니메이션이 발생하지 않는 검사를 추가한다.
- [x] 펼침 상태를 전체 fade 키에서 제거한다. 모드 전환은 모드로 바뀌는 본문만 담당한다.

```ts
const viewFadeRef = useAdminSelectionFade(mode);
```

- [x] 미배치 영역은 기존 배치 크기를 변경하고 내부 내용만 필요 시 전환한다. 검색창·표 제목·결과 헤더에는 opacity 애니메이션을 걸지 않는다.
- [x] 부모 선택 후 중앙 후보와 우측 결과의 read/selection 전환을 각각 한 번으로 제한한다. 조회 중인 우측 데이터만 스켈레톤을 쓰고 왼쪽 목록·검색·완료 안내문 자리는 유지한다.
- [x] 직원과 BOM에서 현재 선택이 필터 밖일 때만 위의 짧은 상태 문구를 표시한다. 필터를 바꾸는 동작으로 미저장 입력을 버리거나 자동 저장하지 않는다.

검증: 펼침·접힘 직후 검색/헤더 opacity가 1이고 위치가 유지되어야 한다. 완료·미완료 전환, 빈 구성, 사용처 이동에서도 같은 규칙을 적용한다.

### 작업 3. 품목·BOM 대량 목록 렌더링 축소

대상:

- `frontend/package.json`, `frontend/package-lock.json`
- 새 파일 `frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminVirtualRows.tsx`
- `AdminListPanel.tsx`, `AdminMasterItemsSection.tsx`
- `BomParentList.tsx`, `BomChildAddBox.tsx`, `BomUnmatchedRawsDrawer.tsx`
- 해당 목록 테스트

- [x] 품목·BOM 목록에 `@tanstack/react-virtual`을 사용한다. 관리자 외부 또는 소량의 모델·직원·부서 목록으로 적용 범위를 넓히지 않는다.
- [x] 실제 scroll viewport ref와 행 ID를 사용한다. 품목 행은 51px, BOM 기본 행은 37px를 초기 예상값으로 사용하고 실제 높이를 측정한다. 확장된 후보 입력 행은 가변 높이로 처리한다.
- [x] 처음 보이는 범위와 위아래 여유 8행을 렌더링한다. 키는 배열 index가 아닌 품목 ID다. 편집 중인 행·현재 포커스 행·드래그 출발 행은 가시 범위 밖에서도 필요한 동안 유지한다.
- [x] 키보드로 다음 행에 이동할 때 먼저 해당 index를 스크롤 범위로 넣은 뒤 포커스를 이동한다. 기존 grid/row 의미, 행 개수·행 index 정보를 유지한다.
- [x] 품목 정렬의 드롭 대상은 화면의 DOM 순서가 아닌 원래 데이터 ID/순서로 계산한다. 실제 데이터의 정렬 저장은 테스트 fixture에서 검증한다.
- [x] 가상화 대상 행에는 `content-visibility`의 추정 높이를 중복 적용하지 않는다.

구현 골격:

```tsx
const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
  count: rows.length,
  getScrollElement: () => scrollRef.current,
  getItemKey: (index) => getRowId(rows[index]),
  estimateSize: () => estimatedRowHeight,
  overscan: 8,
  useFlushSync: false,
});
```

`AdminVirtualRows`는 `rows`, `getRowId`, `estimatedRowHeight`, 기존 `scrollRef`, `renderRow`를 받는다. `measureElement`를 실제 행 wrapper에 연결하고 header는 가상 목록 밖의 기존 위치에 둔다. 유지해야 하는 편집·포커스·드래그 ID를 추가 범위에 포함한다.

선택한 도구는 요소 단위 스크롤과 가변 높이 측정을 지원하며, React 19에서 동기 flush 경고를 피하기 위한 옵션이 문서화되어 있다. [React 어댑터](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual), [Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer).

검증: 데이터 총량이 늘어도 동시에 생성되는 목록 행 수는 뷰포트와 여유 행 수에 비례해야 한다. 끝으로 스크롤, 필터 후 복귀, 후보 확장, 키보드 이동, 정렬을 모두 검사한다.

### 작업 4. 준비된 데이터의 재진입 커버 생략

대상:

- `frontend/app/mes/_components/_admin_sections/AdminSectionTransition.tsx`
- `AdminSectionEntrySkeleton.tsx`
- `__tests__/AdminSectionTransition.test.tsx`
- `__tests__/AdminSectionEntrySkeleton.test.tsx`

- [x] 데이터가 이미 준비된 품목·BOM으로 재진입하는 테스트를 추가한다. 첫 렌더부터 실제 본문이 있고 진입 커버는 없어야 한다.
- [x] 실제 최초 조회가 pending인 경우에만 커버를 만든다. 데이터가 준비돼 있으면 두 번의 rAF 대기 경로를 거치지 않는다.
- [x] 커버를 보여준 경우에는 읽기 완료 후 커버 하나가 220ms 전환을 담당한다. 내부 read/selection 전환은 생략한다.
- [x] 오류일 때 커버가 영원히 남지 않도록 오류·재시도 화면으로 전환한다. 재시도는 필요한 도메인만 실행한다.
- [x] 저장된 BOM 보기 모드를 스켈레톤과 실제 본문이 처음부터 동일하게 사용한다.

정책 조건:

```ts
const needsColdCover =
  (section === "items" || section === "bom") && entryRead.loading;
```

이 조건을 초기 상태뿐 아니라 탭 변경 상태 전이에도 적용한다. 모든 탭을 계속 마운트해 메모리를 늘리는 방식은 사용하지 않는다.

### 작업 5. 품목·BOM 조회 캐시와 요청 경로 정리

대상:

- `frontend/app/mes/_components/_admin_hooks/useAdminBootstrap.ts`
- `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx`
- `frontend/lib/queries/useItemsQuery.ts`, `useBomQuery.ts`
- `frontend/lib/api/catalog.ts`
- 관련 query/bootstrap/workbench 테스트

- [x] `useItemsQuery`, `useBomListQuery`, `useBomQuery`, `useBomWhereUsedQuery`에 선택적 `enabled` 옵션을 추가한다. 기존 호출의 기본 동작을 유지하고 관리자에서는 기존 unlock 게이트와 현재 모드를 전달한다.
- [x] bootstrap의 품목·전체 BOM만 기존 React Query 키로 옮긴다. 직원·부서의 조회/권한 갱신까지 이번 성능 변경에서 재설계하지 않는다.
- [x] `setItems`, `setAllBomRows`의 기존 호출 계약은 캐시 갱신 어댑터로 유지한다. 저장 직후 캐시 갱신 전에 진행 중인 같은 조회를 취소하여 늦은 응답이 저장 결과를 덮지 않게 한다.
- [x] 품목·BOM의 bootstrap 직접 fetch 및 중복 realtime fetch를 제거하고 기존 공통 query 무효화를 사용한다. 직원 권한 갱신 경로는 유지한다.
- [x] 편집 모드는 직계 구성만, 사용처 모드는 사용처만 조회한다. 이전에 읽은 같은 ID의 결과는 즉시 표시하고 필요할 때 배경 갱신한다. 다른 ID의 데이터를 placeholder로 보여주지 않는다.
- [x] API 클라이언트의 BOM 조회 메서드에 선택적 `AbortSignal`을 연결한다. HTTP 경로나 백엔드 계약은 변경하지 않는다.
- [x] BOM 생성·수량 수정·삭제·완료 처리 후 목록·해당 상세·사용처 캐시를 기존 mutation 계약에 맞게 무효화한다. 완료 상태는 품목 캐시도 갱신한다.

조회 계약 예:

```ts
export function useBomQuery(
  parentId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.bom.detail(parentId),
    queryFn: ({ signal }) => catalogApi.getBOM(parentId, signal),
    enabled: Boolean(parentId) && (options?.enabled ?? true),
  });
}
```

```ts
getBOM: (parentItemId: string, signal?: AbortSignal) =>
  fetcher<BOMEntry[]>(toApiUrl(`/api/bom/${parentItemId}`), signal),
getBOMWhereUsed: (itemId: string, signal?: AbortSignal) =>
  fetcher<BOMDetailEntry[]>(toApiUrl(`/api/bom/where-used/${itemId}`), signal),
```

검증: 최초 요청, 준비된 캐시 재진입, 캐시 만료, A→B→A 연속 선택, 이전 응답의 지연 도착, 저장 후 갱신 실패, realtime 갱신을 각각 검사한다. 초 단위 응답 지연이 계속 남으면 그때 백엔드 쿼리·응답 직렬화 시간을 측정해 별도 병목으로 보고한다.

### 작업 6. 미저장 입력 보호를 실제 상태에 연결

대상:

- `frontend/app/mes/_components/_admin_sections/AdminDepartmentsSection.tsx`
- `frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx`
- `frontend/app/mes/_components/_admin_hooks/useAdminEmployeesForm.ts`
- 부서 섹션·상세와 직원 form 테스트

- [x] 부서 context의 실제 `dirty`를 기존 local/global guard에 연결한다.
- [x] 부서의 저장 ref 타입을 `(() => Promise<void>) | null`로 변경한다. `save()`는 요청을 await하고 성공 후에만 이동을 허용한다. 실패는 오류 안내와 함께 guard에 전달하여 입력과 선택을 유지한다.
- [x] 직원 메뉴 숨김 목록은 집합으로 비교한다. 담당 모델 우선순위는 기존 배열 순서 비교를 유지한다.

```ts
const hiddenA = new Set(orig.hidden_sidebar_tabs);
const hiddenB = new Set(editForm.hidden_sidebar_tabs);
if (hiddenA.size !== hiddenB.size) return true;
for (const tab of hiddenA) {
  if (!hiddenB.has(tab)) return true;
}
```

기존 직원 form 테스트의 fixture를 사용하는 회귀 검사:

```tsx
it("메뉴를 원래 상태로 되돌리면 미저장 상태가 아니다", () => {
  const original = employee({ hidden_sidebar_tabs: ["weekly", "admin"] });
  const { result } = renderHook(() => useAdminEmployeesForm([original]));
  act(() => result.current.setSelectedEmployee(original));
  act(() => result.current.setEditForm((form) => ({
    ...form, hidden_sidebar_tabs: ["admin", "weekly"],
  })));
  expect(result.current.dirty).toBe(false);
});
```

부서는 이름 변경 → 다른 행/탭 선택 → 계속 작성, 저장 안 하고 이동, 저장 후 이동을 검증한다. 저장 실패 테스트에서는 선택·입력 유지와 중복 저장 방지를 확인한다. 실제 서버 저장은 수행하지 않는 fixture 기반 테스트다.

### 작업 7. 중복 위치와 확인창 포커스 수정

대상:

- `frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx`
- `frontend/lib/ui/ConfirmModal.tsx`
- `ItemFormFields.test.tsx`, `AddItemForm.test.tsx`
- `frontend/lib/ui/__tests__/ConfirmModal.keyboard.test.tsx`

- [x] 초기 재고 위치를 값 기준으로 중복 제거한다. 창고의 저장 값과 표시 순서는 유지한다.

```ts
const locationOptions = Array.from(
  new Set([WAREHOUSE_LOCATION, ...departments.map((department) => department.name)]),
  (name) => ({ value: name, label: name }),
);
```

- [x] 확인창의 `mounted` 상태 선언을 focus trap보다 앞으로 옮기고 portal 생성 후 trap을 활성화한다. 전역 focus hook의 다른 호출부는 변경하지 않는다.

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
const panelRef = useFocusTrap<HTMLDivElement>(open && mounted, {
  initialFocusRef: viewer ? closeRef : undefined,
});
```

- [x] 조건부로 처음 마운트한 확인창과 계속 마운트된 확인창 모두 초기 포커스·Tab 순환·Escape·취소·호출 버튼 복귀를 검사한다.
- [x] 입력 없는 확인창에서 취소 버튼의 Enter가 확인 동작으로 바뀌지 않는 기존 계약을 유지한다.

## 5. 검증 순서와 완료 기준 — 원안

아래 목록은 승인 당시 검증 계획이다. 최종 실행 결과와 자동/브라우저 검증의 구분, 수동 최종 실행 제외 항목은 연결된 완료 보고서에 확정했다.

### 자동 검사

계획 작성 당시에는 애플리케이션 테스트를 실행하지 않았다. 이후 구현 완료 시 저장소 Node 20에서 직접 관련 검사 425개와 브라우저 검사, 빌드/타입/번들 검사를 통과했다. 아래 명령은 원래의 단계별 검증 계획을 보존한 것이다. 작업 디렉터리는 `C:\ERP\frontend`다.

```powershell
npm test -- app/mes/_components/_admin_sections/_admin_primitives/__tests__/AdminDetailCard.test.tsx app/mes/_components/_admin_sections/_admin_primitives/__tests__/AdminReadState.test.tsx app/mes/_components/_admin_sections/__tests__/AdminSectionTransition.test.tsx app/mes/_components/_admin_sections/__tests__/AdminSectionEntrySkeleton.test.tsx
```

```powershell
npm test -- app/mes/_components/_admin_sections/__tests__/AdminDepartmentsSection.test.tsx app/mes/_components/_admin_sections/__tests__/DeptDetailView.test.tsx app/mes/_components/_admin_hooks/__tests__/useAdminEmployeesForm.test.tsx app/mes/_components/_admin_hooks/__tests__/useAdminBootstrap.test.tsx
```

```powershell
npm test -- app/mes/_components/_admin_sections/__tests__/AdminMasterItemsSection.test.tsx app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx app/mes/_components/_admin_sections/_master_items_parts/__tests__/AddItemForm.test.tsx app/mes/_components/_admin_sections/_bom_workbench/__tests__/BomWorkbench.test.tsx app/mes/_components/_admin_sections/_bom_workbench/__tests__/BomTableLists.test.tsx app/mes/_components/_admin_sections/_bom_workbench/__tests__/BomRow.test.tsx
```

추가 검사: 새 가상 목록 테스트, 변경한 query 테스트와 아래 공통 확인창 검사를 함께 실행한다.

```powershell
npm test -- lib/ui/__tests__/ConfirmModal.keyboard.test.tsx
```

변경 파일 ESLint와 `npm run typecheck:app`을 통과해야 한다. 가상화 패키지를 추가하므로 번들 영향은 프로덕션 빌드 및 기존 bundle-size 검사로 한 번 확인한다. 전체 커버리지 게이트를 매 단계 반복하지 않는다.

### 브라우저 검사

- [ ] 1914×883과 1280×883에서 최초 진입·재진입·직원/부서/모델/품목 연속 선택을 비교한다.
- [ ] 헤더·탭·검색·표 시작점·고정 버튼의 로딩 전후 위치 차이를 1px 이내로 유지한다.
- [ ] 동일한 비활성화/삭제 버튼이 중간 프레임에서 더 진해지지 않는다. 네 모서리에서 사각 표면이 튀어나오지 않는다.
- [ ] BOM 미배치 펼침·접힘 중 관계없는 패널은 opacity 1을 유지한다.
- [ ] 로딩 지연과 오류·재시도에서는 같은 틀 안에 상태를 표시한다. 실제 데이터가 없는데 빈 결과를 먼저 보여주지 않는다.
- [ ] 보기 모드·검색·선택 복원, 완료/미완료 잠금, 사용처에서 부모 이동을 확인한다.
- [ ] 모션 감소에서는 애니메이션이 없어도 상태·선택·포커스가 정확하다.
- [ ] 확인창 밖으로 키보드 포커스가 빠져나가지 않는다.
- [ ] 부서 입력 유실과 직원 메뉴 원복 경고를 다시 재현했을 때 문제가 사라진다.
- [ ] 테스트용 요청 지연/실패는 fixture 또는 격리된 테스트에서 주입한다. 실데이터 저장·삭제·완료·권한 변경으로 검증하지 않는다.

### 성능 목표

동일 장비·동일 데이터·동일 빌드 모드에서 변경 전후를 비교한다. 개발 서버 최초 컴파일 시간과 이미 준비된 화면의 재진입 시간을 섞지 않는다.

- 준비된 품목·BOM 재진입에 전체 스켈레톤 노출 0회.
- 재선택할 같은 BOM의 신선한 캐시가 있으면 새 상세 요청 없이 표시.
- 편집 모드에서 불필요한 사용처 요청 0회, 같은 조회 키의 동시 중복 요청 0회.
- 목록 DOM은 전체 데이터 수와 무관하게 보이는 행·여유 행·편집 유지 행 범위로 제한.
- 선택 반응은 다음 화면 갱신에서 시작하고 전환은 180ms 규칙을 사용.
- 품목/BOM의 준비된 재진입은 우선 목표 300ms 이내. 달성하지 못하면 네트워크·React commit·애니메이션 시간을 분리해 남은 병목과 실측값을 보고한다.

## 6. 최초 조사 단계의 종료 상태 — 역사 기록

- 조사 중 수정한 로컬 폼은 취소하거나 원복했다. 실제 마스터/BOM 데이터를 변경하는 완료 동작은 실행하지 않았다.
- 다운로드는 진행 표시와 다운로드 시작 안내까지 확인했으며 파일 내용의 정확성까지 검증한 것은 아니다.
- 최초 조사 단계에서는 애플리케이션 소스를 수정하지 않았다. 이후 승인된 구현은 위 실행 기록에 계속 반영하며, 이전 관리자 UI 변경과 기존 작업 트리 변경은 보존한다.
- 이 계획은 앞서 합의한 레이아웃 위치 유지 작업을 대체하지 않고, 그 위에 남은 합성·전환·조회·입력 보호 문제를 해결한다.
