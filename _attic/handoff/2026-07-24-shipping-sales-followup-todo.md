# 출하 영업부 요청 구현 TODO

## 전체 현황

- 구현 완료: 6개
- 구현 대기: 0개
- 정책 확인 대기: 0개
- 최종 통합 검증: 완료

## 확정 정책

- 인보이스는 선택 입력으로 시작하되 `준비 완료`에는 필수입니다.
- 인보이스는 공백 제거·대문자화 후 최대 100자로 저장하며, 같은 번호를 여러 요청에서 사용할 수 있습니다.
- 모든 보존 상태에서 번호를 정정할 수 있지만 한 번이라도 준비 완료된 요청은 공란으로 되돌릴 수 없습니다.
- 취소는 물리 삭제가 아니라 `CANCELLED` 전환이며 요청·수정 이력·취소자를 보존합니다.
- 수정 권한은 부서·직급으로 막지 않고, `X-MES-Employee-Code`로 확인한 활성 직원을 기록합니다.
- 모바일 `수정됨`은 준비 작업에 영향을 주는 최신 수정만 보여 주며 별도 읽음 처리는 없습니다.
- 중요 품목은 `PC 관리 > 품목 관리 > 기본 정보 > 영업 확인 필요`에서 설정합니다.
- 별도 출고처 필드를 만들지 않고 PF 품명으로 이력을 검색합니다.

## 완료 목록

### 1. 인보이스 중심 출하 요청

- [x] 새 요청 1단계에서 PF 선택보다 먼저 인보이스 입력
- [x] 공란 요청 생성과 준비 중 전환 허용
- [x] 공백 제거·대문자 저장, 중복 번호 허용
- [x] 목록·상세·이력에서 번호 표시
- [x] 모든 보존 상태 상세에서 번호 정정
- [x] 준비 완료 이력 이후 공란 저장 차단

주요 구현: `backend/app/models/shipping.py:65`, `backend/app/services/shipping.py:95`, `backend/app/routers/shipping.py:458`, `frontend/app/mes/_components/DesktopShippingView.tsx:1559`

### 2. 인보이스 없는 준비 완료 차단

- [x] 인보이스 검사를 재고·배정·이벤트 변경보다 먼저 수행
- [x] 실패 시 요청 상태와 재고를 변경하지 않음
- [x] PC에서 `준비 완료` 비활성화와 입력 안내 제공
- [x] 체크리스트 전건 완료 조건은 새로 추가하지 않음

주요 구현: `backend/app/services/shipping.py:1381`, `frontend/app/mes/_components/DesktopShippingView.tsx:1597`

### 3. 구조화된 요청 수정 이력

- [x] 수정자 ID·이름, 시각, 요약, 준비 영향 여부, 필드별 전후값 저장
- [x] 실제 값이 달라진 저장만 revision 한 건 생성
- [x] BOM·동반품에 당시 품명·MES 코드를 함께 보존
- [x] 인보이스 수정과 일반 요청 수정 후 PC 이력 즉시 갱신
- [x] 단건 요청과 전체 revision 조회 API 제공

주요 구현: `backend/app/models/shipping.py:224`, `backend/app/services/shipping.py:117`, `backend/app/services/shipping.py:411`, `backend/app/routers/shipping.py:403`, `backend/app/routers/shipping.py:476`, `frontend/app/mes/_components/DesktopShippingView.tsx:1653`

### 4. 모바일 최신 목록과 수정 안내

- [x] 공용 출하 Query 캐시 사용
- [x] 화면 진입 즉시, 앱 복귀 즉시, 열린 동안 30초마다 갱신
- [x] 백그라운드와 화면 이탈 뒤 폴링 중단
- [x] 준비 영향 revision의 `수정됨`·수정자·KST 시각·한국어 요약 표시
- [x] 품목 추가·삭제·수량·포함/제외 변경 펼침 제공
- [x] 기존 품목별 체크와 `전체 해제` 유지, 자동 전체 초기화 없음

주요 구현: `frontend/lib/queries/useShippingQuery.ts:30`, `frontend/app/mes/_components/mobile/screens/MobileShippingScreen.tsx:54`, `frontend/app/mes/_components/mobile/screens/MobileShippingScreen.tsx:293`

### 5. 영업 확인 품목 설정과 강조

- [x] 품목 기본 정보에 `영업 확인 필요` 저장 항목 추가
- [x] 기존 품목 기본값은 미설정
- [x] 출하 작성 2단계의 BOM·동반품 강조
- [x] 출하 작성 5단계의 BOM·동반품 강조와 `영업 확인` 배지
- [x] 동결된 5단계 카드 높이·2열·내부 스크롤 유지

주요 구현: `backend/app/models/item.py:97`, `backend/app/routers/items.py:505`, `frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx:172`, `frontend/app/mes/_components/DesktopShippingView.tsx:2807`, `frontend/app/mes/_components/DesktopShippingView.tsx:3271`

### 6. 검색 가능한 완료·취소 이력

- [x] 완료·취소 상태 전환
- [x] 연도 > 월 폴더와 월별 건수
- [x] 완료는 픽업일, 취소는 취소일 기준 분류
- [x] 인보이스와 최종 PF → 사용자 지정 PF → 기준 PF 품명 검색
- [x] 50건 keyset cursor 이어 보기
- [x] 오래된 취소 상세 URL 직접 복원

주요 구현: `backend/app/routers/shipping.py:598`, `backend/app/routers/shipping.py:634`, `frontend/app/mes/_components/DesktopShippingView.tsx:1798`

## 검증 현황

- 백엔드 출하 서비스·라우터 관련 테스트 통과
- 품목 생성·수정과 마이그레이션 관련 테스트 통과
- 데스크톱 출하 전체 테스트 통과
- 모바일 출하·공용 Query 테스트 통과
- 프런트 TypeScript와 변경 파일 ESLint 통과
- 사양 검토와 코드 품질·디자인 검토 통과
- 최종 프로젝트 검증: 백엔드·OpenAPI·프런트 lint·TypeScript·전체 테스트·프로덕션 빌드 통과
- 번들 크기 게이트: 2.164MB 산출물을 승인 기준 2.165MB에서 통과
- 실행 명령: `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode auto`

## 범위에서 제외한 내용

- 실시간 푸시·소켓 알림
- 모바일 읽음 처리나 확인 버튼
- 체크리스트 전건 완료 강제
- 출고처 전용 필드
- 동결된 모바일 하단 탭 바와 데스크톱 출하 5단계 카드 레이아웃 변경
