---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/hooks/__tests__/useModels.test.tsx
tags: [vault, code-note, auto-generated, stub]
---

# useModels.test.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/hooks/__tests__/useModels.test.tsx]]

## 원본 첫 줄

```
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { getModels: vi.fn() },
}));

import { api } from "@/lib/api";
import { useModels } from "../useModels";

describe("useModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초기 fetch 결과를 반영", async () => {
    (api.getModels as any).mockResolvedValue([{ slot: 1, model_name: "M1" }]);
    const { result } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("에러 시 error state", async () => {
    (api.getModels as any).mockRejectedValue(new Error("404"));
    const { result } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.error).toBe("404"));
  });
});
```
