# index.ts

## 이 파일은 뭐예요?
`primitives` 폴더에 있는 모든 모바일 primitive 컴포넌트와 타입을 한 곳에서 re-export하는 배럴 파일입니다. 외부 화면 컴포넌트는 이 파일 하나에서 필요한 것을 import합니다.

## 언제 보나요?
- 모바일 화면에서 `import { IconButton, StatusBadge, ... } from "../primitives"` 형태로 가져올 때
- 어떤 primitive가 공개 API인지 확인할 때

## 중요한 내용
- 현재 export 목록 (29개): `IconButton`, `StatusBadge`, `KpiCard`, `SectionHeader`, `SheetHeader`, `FilterChip`, `FilterChipRow`, `Stepper`, `StickyFooter`, `WizardProgress`, `WizardHeader`, `PersonAvatar`, `ItemRow`, `InlineSearch`, `AsyncState`, `AsyncSkeletonRows`, `SummaryChipBar`, `SummaryChip(type)`, `SectionCard`, `SectionCardRow`, `PrimaryActionButton`, `MoreMenuRow`, `QuickActionGrid`, `QuickAction(type)`, `SegmentedControl`, `SegmentedTab(type)`, `PinInput`, `ErrorAlert`, `SubScreenHeader`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/📁_primitives]] — 이 폴더의 모든 primitive 파일들
