---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/FilterPills.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - filter
aliases:
  - 필터 칩
  - 카테고리 필터
---

# FilterPills.tsx

> [!summary] 역할
> 카테고리/상태별 필터를 칩(Pill) 형태로 보여주는 공용 컴포넌트.

> [!info] 주요 책임
> - 선택 가능한 필터 칩 목록 렌더링
> - 선택된 칩 강조 표시
> - 선택 변경 이벤트 상위로 전달

---

## 쉬운 말로 설명

**여러 버튼을 한 줄로 쭉 배치한 필터 위젯**. 부서/공정/상태 같은 카테고리 선택에 사용. 선택된 칩만 배경색이 들어가고 나머지는 투명.

가로 스크롤 가능 (`overflow-x: auto`). 모바일에서 칩이 많아도 옆으로 밀어서 볼 수 있다.

## Props

| Prop | 타입 | 설명 |
|------|------|------|
| `options` | `string[]` | 칩 레이블 배열 |
| `value` | `string` | 현재 선택된 값 |
| `onChange` | `(v: string) => void` | 클릭 시 콜백 |
| `activeColor` | `string?` | 활성 칩 색상 (기본: 파랑) |

## 동작

- **기본 상태**: 투명 배경 + 회색 테두리
- **호버**: 테두리 강조 (`color-mix` 로 activeColor 20% 혼합)
- **선택됨**: activeColor 배경 + 흰색 글씨

```
[ 전체 ] [조립] [고압] [진공] [튜닝]
   ↑ (선택)
```

## FAQ

**Q. 다중 선택?**
현재는 단일 선택만. 다중 선택 원하면 `value: string[]` + toggle 로직으로 개조 필요.

**Q. 옵션 추가/삭제?**
상위에서 `options` 배열만 바꾸면 자동 반영. 상태는 그대로 유지되지만, 선택된 값이 목록에서 사라지면 UI 상 아무 칩도 활성화 안 됨.

**Q. 아이콘 넣기?**
현재는 텍스트만. 필요 시 `options: {label, icon}[]` 형식으로 변경.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]] — 부서 필터로 사용
- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] — 작업 유형 필터로 사용
- [[frontend/app/legacy/_components/legacyUi.ts.md]] — `LEGACY_PARTS`, `LEGACY_MODELS` 옵션 상수

Up: [[frontend/app/legacy/_components/_components]]
