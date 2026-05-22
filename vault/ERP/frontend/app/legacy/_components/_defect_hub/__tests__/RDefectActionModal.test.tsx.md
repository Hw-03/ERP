---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/__tests__/RDefectActionModal.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# RDefectActionModal.test.tsx — RDefectActionModal.test.tsx 설명

## 이 파일은 무엇을 책임지나

`RDefectActionModal.test.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RDefectActionModal } from "../RDefectActionModal";
import type { DefectLocation } from "@/lib/api/types/defects";

vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    unquarantine: vi.fn(),
  },
}));

vi.mock("@/lib/api/stock-requests", () => ({
  stockRequestsApi: {
    createStockRequest: vi.fn(),
  },
}));

import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";

const mockLocation: DefectLocation = {
  item_id: "item-001",
  item_name: "텅스텐 와이어",
  item_code: "7-MAT-0001",
  department: "조립",
  quantity: 5,
  defective_at: "2025-08-15T00:00:00.000Z",
  reason_category: "외관 불량",
  reason_memo: "스크래치",
};

const mockEmployee = {
  employee_id: "emp-001",
  name: "김건호",
  department: "조립",
};

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  location: mockLocation,
  currentEmployee: mockEmployee,
  onSubmitted: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defectsApi.unquarantine).mockResolvedValue(undefined);
  vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValue({} as never);
});

describe("RDefectActionModal", () => {
  it("open=true 시 품목 정보와 액션 선택지가 렌더된다", () => {
    render(<RDefectActionModal {...defaultProps} />);
```
