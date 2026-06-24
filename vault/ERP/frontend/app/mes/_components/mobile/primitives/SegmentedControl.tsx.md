# SegmentedControl.tsx

## 이 파일은 뭐예요?
여러 탭을 가로로 나열해 하나를 선택하는 세그먼트 컨트롤 컴포넌트입니다. s2 배경 트레이 위에 활성 탭만 s1 배경 + 그림자로 돋보이게 표시합니다.

## 언제 보나요?
- ItemDetailSheet(재고 정보/BOM/이력 탭), IoHubScreen(입고/출고 탭), HistoryScreen, HistoryDetailSheet 등에서 화면 내 탭 전환
- 불량 격리 Step1의 출처 선택 토글(size="lg")

## 중요한 내용
- `SegmentedControl<T extends string>({ tabs, active, onChange, className?, size? })` — 제네릭 타입 T로 탭 ID 타입 안전 보장
- `SegmentedTab<T>` 타입: `{ id, label, badge? }` — `badge`는 숫자/문자 표시 가능
- `size="md"(기본)`: `p-1 py-[7px] caption`, `size="lg"`: `p-1.5 py-4 title` (불량격리 단일 사용처)
- 활성 탭 배지: 파란 배경, 비활성 탭 배지: muted 배경
- `role="tablist"` + `role="tab"` + `aria-selected` 접근성 속성 포함

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
