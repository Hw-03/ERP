# AppSelect.tsx

## 이 파일은 뭐예요?
WAI-ARIA combobox 스펙을 직접 구현한 커스텀 드롭다운 셀렉트 컴포넌트입니다. 브라우저 기본 `<select>`를 대체하며, 키보드 탐색(ArrowUp/Down/Home/End/Enter/Escape)과 포커스 관리를 포함합니다.

## 언제 보나요?
- 폼에서 옵션 목록 중 하나를 선택해야 할 때 (`<select>` 대체 용도)
- 필터 바 등 UI 전반에서 드롭다운이 필요한 모든 곳

## 중요한 내용
- `AppSelectOption` — `{ value, label, disabled? }` 형태의 옵션 인터페이스
- `AppSelectProps` — `value`, `onChange`, `options` 필수; `size` ("sm" | "md" | "lg"), `placeholder`, `disabled`, `triggerClassName`, `triggerStyle` 등 선택
- `SIZE_TRIGGER`, `SIZE_CHEVRON` — size별 Tailwind 클래스 매핑 상수
- `firstEnabledIndex` / `lastEnabledIndex` / `nextEnabledIndex` — disabled 옵션 건너뛰는 키보드 탐색 헬퍼
- 열린 상태에서 selected 항목에 체크마크(Check 아이콘) 표시
- `name` prop 제공 시 `<input type="hidden">`을 렌더해 폼 제출 지원

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/index.ts]] — 이 컴포넌트는 index에서 export되지 않음(개별 import 필요)
