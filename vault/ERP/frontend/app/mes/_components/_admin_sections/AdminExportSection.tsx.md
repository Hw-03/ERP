# AdminExportSection.tsx

## 이 파일은 뭐예요?
시스템 데이터를 Excel 또는 CSV로 내보내는 관리자 섹션입니다. 전체 데이터 Excel 다운로드(백엔드 생성)와 선택 범위 CSV 다운로드(클라이언트 생성) 두 가지 경로를 제공하며, 이번 세션 내보내기 이력을 `sessionStorage`에 임시 보관합니다.

## 언제 보나요?
- 관리자 화면에서 "내보내기" 섹션을 선택했을 때
- 품목·거래·직원·BOM 데이터를 엑셀이나 CSV로 추출해야 할 때

## 중요한 내용
- `AdminExportSection({ itemsExportUrl, transactionsExportUrl })` — export 컴포넌트
- `RangePreset` — `"today" | "7d" | "30d" | "90d" | "custom"` 기간 프리셋
- `DataScope` — `"all" | "items" | "transactions" | "employees" | "bom"` 데이터 범위
- `ExportRecord` 타입 — 이번 세션 내보내기 기록 단위
- `handleExcelAll()` — 백엔드 URL에서 품목·거래 xlsx 직접 다운로드
- `handleCsvSelected()` — 클라이언트에서 API 호출 후 CSV blob 변환·다운로드
- `buildCsvFor(scope, range, ...)` — 범위별 API 호출 + CSV 문자열 구성
- `sessionStorage` key `"admin.export.recent"` — 최근 5건 기록 보관

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — `itemsExportUrl`, `transactionsExportUrl` 주입
- [[ERP/frontend/lib/api/index.ts]] — `api.getItems`, `api.getTransactions`, `api.getEmployees`, `api.getAllBOM`
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminKpiBar.tsx]] — KPI 표시
