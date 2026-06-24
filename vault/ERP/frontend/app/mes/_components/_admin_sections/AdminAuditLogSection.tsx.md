# AdminAuditLogSection.tsx

## 이 파일은 뭐예요?
외부 심사(감사) 대응용 월별 입출고 CSV 파일을 조회·다운로드하는 관리자 섹션 컴포넌트입니다. 거래 발생 시 자동 누적된 CSV를 월별로 나열하고, 누락 시 "백필 재실행"으로 DB 기준 재생성을 트리거합니다.

## 언제 보나요?
- 관리자 화면에서 "외부 제출용 로그" 섹션을 선택했을 때
- 외부 심사 공지가 와서 입출고 CSV를 다운로드해야 할 때

## 중요한 내용
- `AdminAuditLogSection` — export 컴포넌트, 월별 파일 목록 + KPI 바 렌더링
- `useAuditCsvListQuery` — 월별 CSV 파일 목록 조회 React Query 훅
- `useTriggerAuditBackfillMutation` — 백필(DB→CSV 전체 재생성) 트리거 뮤테이션
- `handleDownload(url, fileName)` — `<a>` 태그로 CSV/XLSX 직접 다운로드
- `adminApi.auditXlsxDownloadUrl(month)` / `adminApi.auditCsvDownloadUrl(month)` — 다운로드 URL 생성
- 컬럼 11개(일시·거래유형·품목코드·품목명·수량·변경전재고·변경후재고·참조번호·처리자·비고·거래ID)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminKpiBar.tsx]] — KPI 지표 표시
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminPageHeader.tsx]] — 섹션 헤더
- [[ERP/frontend/lib/queries/useSettingsQuery.ts]] — 훅 정의 위치
- [[ERP/frontend/lib/api/admin.ts]] — adminApi (다운로드 URL 함수)
