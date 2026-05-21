---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/hooks/__tests__/useEmployees.test.tsx
tags: [vault, code-note, auto-generated, stub]
---

# useEmployees.test.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/hooks/__tests__/useEmployees.test.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { getEmployees: vi.fn() },
}));

import { api } from "@/lib/api";
import { useEmployees } from "../useEmployees";

describe("useEmployees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("기본 호출 시 activeOnly=true 로 fetch", async () => {
    (api.getEmployees as any).mockResolvedValue([{ employee_id: "e1", name: "A" }]);
    const { result } = renderHook(() => useEmployees());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.employees).toHaveLength(1);
    expect(api.getEmployees).toHaveBeenCalledWith({ department: undefined, activeOnly: true });
  });

  it("에러 시 error state", async () => {
    (api.getEmployees as any).mockRejectedValue(new Error("oops"));
    const { result } = renderHook(() => useEmployees());
    await waitFor(() => expect(result.current.error).toBe("oops"));
  });

  it("department 인자가 fetch 에 forward 됨", async () => {
```
