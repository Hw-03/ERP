---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/hooks/__tests__/useEmployees.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useEmployees.test.tsx — useEmployees.test.tsx 설명

## 이 파일은 무엇을 책임지나

`useEmployees.test.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/hooks/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
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
    (api.getEmployees as any).mockResolvedValue([]);
    renderHook(() => useEmployees({ department: "조립" }));
    await waitFor(() => expect(api.getEmployees).toHaveBeenCalled());
    expect(api.getEmployees).toHaveBeenCalledWith({ department: "조립", activeOnly: true });
  });
});
```
