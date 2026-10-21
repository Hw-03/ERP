# 관리자 전환·로딩·입력 보호 구현 및 검증

검증 종료일: 2026-10-21 KST. 승인된 관리자 개선을 구현했으며 커밋·푸시는 수행하지 않았다.

## 반영 내용

- 반투명 상세 화면이 중첩되어 밝아지는 원인을 제거했다. 불투명하게 합성한 이전 화면만 180ms 동안 사라지고 실제 입력은 계속 유지한다. 로딩 종료는 220ms이며 모션 감소를 존중한다. 복제된 `id`·`name`·`for`를 제거해 직원 전환 때 접근성 이름이 중복되지 않는다. [AdminDetailViewport.tsx](C:/ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminDetailViewport.tsx:28)
- 준비된 품목·BOM 재진입에는 전체 스켈레톤과 두 프레임 대기를 생략한다. 실제 조회가 필요할 때만 같은 배치의 커버를 표시한다. [AdminSectionTransition.tsx](C:/ERP/frontend/app/mes/_components/_admin_sections/AdminSectionTransition.tsx:24)
- 품목·BOM 조회 캐시를 공유하고 현재 BOM 모드에 필요한 요청만 실행한다. 저장 전 진행 조회 취소, 이전 선택의 늦은 응답 방어를 적용했다.
- 큰 품목·BOM 목록은 가상 행으로 렌더링하며 포커스·편집·드래그 행과 키보드 끝 행 이동을 유지한다. [AdminVirtualRows.tsx](C:/ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminVirtualRows.tsx:43)
- 검색·필터·선택·상세 탭·목록 및 BOM 결과 스크롤을 관리자 세션 동안 복원한다. PIN과 미저장 입력은 복원 저장소에 넣지 않는다. [useAdminSessionState.tsx](C:/ERP/frontend/app/mes/_components/_admin_hooks/useAdminSessionState.tsx:14)
- 모델·품목·직원·부서의 추가/수정 중 미저장 보호, 실제 저장 완료 대기, 중복 제출 방지, 실패 시 입력 유지, 삭제 확인 유지, 재시도를 보완했다. 품목/모델 순서 저장이 실패해도 서버 상태를 다시 읽는다. [useAdminSave.ts](C:/ERP/frontend/app/mes/_components/_admin_hooks/useAdminSave.ts:6), [useItemsQuery.ts](C:/ERP/frontend/lib/queries/useItemsQuery.ts:72), [useModelsQuery.ts](C:/ERP/frontend/lib/queries/useModelsQuery.ts:65)
- 기존 디자인·계정 권한·API/DB 계약과 BOM 편집 규칙은 유지했다. 모델·부서 하단 동작은 구조를 크게 옮기지 않고 기존 위치에서 불투명 전환으로 밝기 중첩을 해소했다. 품목 상세 탭/삭제/저장 영역은 본문 전환과 분리되어 있다.

## 검증 결과

최종 QA: `admin-completion-20261020-d`, `http://127.0.0.1:3031/mes?tab=admin`.
HEAD와 파일별 SHA256, 별도 DB, boot ID, 프로세스는 [session.json](C:/ERP/_attic/runtime/mes-browser-regression/admin-completion-20261020-d/session.json)에 기록했다. 최종 검증 시 overlay와 작업 트리 불일치 0개다.

| 대상/동작 | 판정 | 근거와 범위 |
|---|---|---|
| 관리자 8개 상단 탭 | PASS | 실제 Chromium에서 순회하고 현재 탭 상태 확인 |
| 모델 선택·미저장 이동·계속 작성 | PASS | 두 해상도에서 입력 유지 및 삭제 버튼 위치 차이 ≤1px |
| 모델 저장 오류·재시도 | PASS | QA에서 PUT 503 주입, 입력 유지, 실제 재저장, 원래 모델명 복구 |
| 직원·부서 연속 선택 | PASS | 두 해상도에서 고정 액션 위치 차이 ≤1px, 스냅샷 종료 확인 |
| 직원 선택 시 중복 라벨 | PASS | 실제 Chrome 접근성 트리에서 `이름` 한 번만 표시, 회귀 테스트 포함 |
| 품목 지연 조회 | PASS | 두 해상도에서 상세 탭·삭제 버튼·본문의 x/y/너비/높이 차이 ≤1px |
| BOM 지연 조회 | PASS | 두 해상도에서 보기 버튼·두 검색창·표 제목 시작점·미배치 영역 위치 일치 |
| BOM 필터·보기 복원·모션 감소 | PASS | 부서/단계 필터, 편집/사용처 전환·재진입 복원, reduced-motion 시 잔여 스냅샷 없음 |
| 대량 목록·키보드·빠른 선택 | PASS | 단위 회귀에서 가상 행 범위·끝 행 이동·고정 행·단일 스냅샷 검사 |
| 추가/수정/삭제 실패 및 중복 실행 | PASS | 관련 hook·화면 단위 회귀. 브라우저의 실제 저장 실패/재시도는 모델 대표 경로 |
| 정합성 조회·실패·재검사 | PASS | 실제 탭 진입 + 초기 실패/재시도/기존 결과 유지/재검사 단위 회귀 |
| 보안 PIN 화면 | PASS | 실제 탭 진입 + 길이/일치/저장 중 비활성 단위 회귀 |
| 영구 삭제·PIN 변경/초기화 최종 실행 | SKIP(수동) | 원본과 수동 QA에서 최종 실행하지 않음. 확인창/명령 계약은 격리 자동 테스트 |
| CSV·Excel·공식 서식 | PASS | 실제 다운로드 및 파일 재개방. 아래 범위 참조 |
| 라이트·다크 | PASS | QA 계정의 실제 테마 설정 후 직원 화면·선택 전환·모서리 확인 |

자동 검사:

- 관리자 hook/section·조회·확인창: **53개 파일, 425개 테스트 통과**.
- Chromium E2E: **14개 고유 시나리오 통과**. 12개 일괄 실행 후 품목 위치 검사 2개 추가와 강화한 BOM 위치 검사 포함 6개 재실행 통과.
- 변경 파일 ESLint: 오류·경고 0개. TanStack Virtual 소비 컴포넌트만 `use no memo`로 명시적으로 컴파일러 메모이제이션을 제외한다.
- 프로덕션 빌드와 빌드 내 TypeScript 검사 통과.
- 번들 검사 통과: **3,442,280 bytes / 3.283 MB**. 새 가상 목록 의존성과 입력 보호 증가분에 맞춰 예산을 **3.25→3.30 MB**로 조정했다. 기존 한도를 그대로 통과한 것으로 해석하면 안 된다. 초과 검출 테스트는 유지한다.
- `git diff --check` 통과.

## 재진입 성능

동일 QA 데이터·개발 빌드에서 최초 진입을 제외하고 각 화면 10회 측정했다. 클릭부터 커버 제거와 두 번의 화면 갱신까지의 Playwright 측정이며 서버 최초 컴파일 시간은 제외했다. 운영 환경 수치나 수정 전후의 통제된 비교로 해석하지 않는다.

| 뷰포트 | 화면 | 중앙값 | P95 |
|---|---|---:|---:|
| 1914×883 | 품목 | 233ms | 281ms |
| 1914×883 | BOM | 225.5ms | 282ms |
| 1280×883 | 품목 | 218ms | 250ms |
| 1280×883 | BOM | 233ms | 266ms |

모든 반복에서 재진입 완료 시 진입 커버 0개를 확인했다. 목표 중앙값 300ms/P95 500ms 이내다.

## 다운로드와 화면 증거

격리 fixture 기준 품목 CSV/Excel은 헤더 포함 106행, BOM CSV 16행, 직원 CSV 4행이었다. 입출고 데이터가 없는 fixture에서는 헤더 1행을 확인했다. 운영 데이터 개수와 무관한 검증 스냅샷이다.

F704는 선택 연도의 파일명과 2개 서식 시트, F705는 선택 연도의 파일명과 12개월 시트를 `openpyxl`로 다시 열었다. 실제 업무 거래를 채운 모든 계산식의 검증을 뜻하지 않는다.

- [다운로드 검사 원본](C:/ERP/_attic/runtime/mes-browser-regression/admin-completion-20261020-d/downloads.json)
- [브라우저 검사 산출물](C:/ERP/_attic/runtime/mes-browser-regression/admin-completion-20261020-d/playwright)
- [강화한 위치 검사 산출물](C:/ERP/_attic/runtime/mes-browser-regression/admin-completion-20261020-d/geometry)
- [라이트 직원 화면](C:/ERP/_attic/runtime/mes-browser-regression/admin-completion-20261020-d/employees-light.png)
- [다크 직원 화면](C:/ERP/_attic/runtime/mes-browser-regression/admin-completion-20261020-d/employees-dark.png)

원본 데이터의 저장·삭제·완료 처리는 실행하지 않았다. QA 생성/변경은 별도 DB에서만 수행했다. 화면의 모든 가능한 데이터 조합을 사람이 전수 클릭했다는 주장은 하지 않으며, 위의 실제 UI 검사와 자동 회귀 범위를 구분한다.
