---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_master_items_parts/EditItemForm.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# EditItemForm.tsx — EditItemForm.tsx 설명

## 이 파일은 무엇을 책임지나

`EditItemForm.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `EditItemForm`

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

import { useState } from "react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";
import { ItemFormFields } from "./ItemFormFields";
import type { ItemFormData } from "./ItemFormFields";

function itemToForm(item: Item): ItemFormData & { item_code: string } {
  return {
    item_name: item.item_name,
    legacy_item_type: item.legacy_item_type ?? "",
    supplier: item.supplier ?? "",
    min_stock: item.min_stock != null ? String(item.min_stock) : "",
    process_type_code: item.process_type_code ?? "TR",
    unit: item.unit ?? "EA",
    model_slots: item.model_slots ?? [],
    option_code: item.option_code ?? "",
    item_code: item.item_code ?? "",
  };
}

export function EditItemForm({ selectedItem }: { selectedItem: Item }) {
  const { updateItemFull } = useAdminMasterItemsContext();
  const [form, setForm] = useState(() => itemToForm(selectedItem));

  function handleSave() {
    updateItemFull({
      item_name: form.item_name || undefined,
      legacy_item_type: form.legacy_item_type || undefined,
      supplier: form.supplier || undefined,
      min_stock: form.min_stock ? Number(form.min_stock) : undefined,
      process_type_code: form.process_type_code || undefined,
      unit: form.unit || undefined,
      model_slots: form.model_slots,
      option_code: form.option_code || undefined,
      item_code: form.item_code || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-base font-bold">{selectedItem.item_name}</div>

      <ItemFormFields
        form={form}
        setForm={setForm as (u: (f: ItemFormData) => ItemFormData) => void}
        showItemCode
      />

      <button
        onClick={handleSave}
        className="w-full rounded-[18px] py-3 text-base font-bold text-white"
        style={{ background: LEGACY_COLORS.blue }}
```
