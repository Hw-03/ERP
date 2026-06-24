# bomDept.ts

## 이 파일은 뭐예요?
BOM 워크벤치 전체에서 공유하는 부서/단계 유틸 모듈. `process_type_code`(2글자, 예: "TR", "HA", "AF") 를 파싱해 부서 letter, 단계 letter, 부서 색상, BOM 완료 상태를 계산하는 순수 함수와 상수를 모두 이곳에 모아둔다.

## 언제 보나요?
- `process_type_code` 에서 부서(첫 글자)·단계(두 번째 글자)를 추출해야 할 때
- BOM 항목의 완료/작업중/미착수 상태를 계산할 때
- 부서 배지 색상(`deptColor`, `deptBadgeBg`)이 필요할 때

## 중요한 내용
- `DEPT_LETTERS`: `["T","H","V","N","A","P"]` — 튜브/고압/진공/튜닝/조립/출하
- `BomDeptFilter`: `DeptLetter | "ALL"`
- `deptOf(pt)`: 첫 글자 → `DeptLetter | null`
- `stageOf(pt)`: 두 번째 글자 → `"R" | "A" | "F" | null`
- `deptColor(letter)`: 부서 fallback 색상 반환 (`getDepartmentFallbackColor` 위임)
- `deptBadgeBg(letter)`: `color-mix` 12% 투명 배경 문자열 반환
- `bomStatusOf(itemId, completedSet, childCountMap)`: `"done" | "wip" | "todo"` 반환
- `BOM_STATUS_META`: 상태별 label·color 정적 매핑

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes-department.ts]] — `getDepartmentFallbackColor` 소스
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 토큰
