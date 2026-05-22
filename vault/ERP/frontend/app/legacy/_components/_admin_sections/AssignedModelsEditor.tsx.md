---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/AssignedModelsEditor.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AssignedModelsEditor.tsx — AssignedModelsEditor.tsx 설명

## 이 파일은 무엇을 책임지나

`AssignedModelsEditor.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AssignedModelsEditor`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import type { ProductModel } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * 조립 부서 직원의 담당 모델 편집 위젯.
 * - 배열 순서 = 우선순위 (0 = 1순위, 작을수록 위)
 * - ▲/▼ 버튼으로 순서 조정, ✕ 로 제거, 미선택 모델 칩 클릭으로 추가
 * - 입출고 화면에서 조립 그룹 내 정렬 시 이 순서를 사용한다
 */
export function AssignedModelsEditor({
  models,
  selected,
  onChange,
}: {
  models: ProductModel[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const labelOf = (slot: number) => {
    const m = models.find((x) => x.slot === slot);
    if (!m) return `slot ${slot}`;
    return m.model_name || m.symbol || `slot ${slot}`;
  };
  const unselected = models.filter((m) => !selected.includes(m.slot));

  function add(slot: number) {
    if (selected.includes(slot)) return;
    onChange([...selected, slot]);
  }
  function remove(slot: number) {
    onChange(selected.filter((s) => s !== slot));
  }
  function move(idx: number, delta: number) {
    const next = selected.slice();
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div>
      {selected.length === 0 ? (
        <div
          className="rounded-[10px] border px-3 py-2 text-[12px]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
          }}
        >
          담당 모델 없음
        </div>
```
