---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/__tests__/PaPfDefectWizard.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# PaPfDefectWizard.test.tsx — PaPfDefectWizard.test.tsx 설명

## 이 파일은 무엇을 책임지나

`PaPfDefectWizard.test.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

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
import type { DefectLocation } from "@/lib/api/types/defects";

// --- API 모킹 ---
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

vi.mock("@/lib/api/dept-adjustment", () => ({
  deptAdjustmentApi: {
    getBomTemplate: vi.fn(),
  },
}));

// ReasonFormFields — A 작업자 파일. 테스트에서 stub 처리
vi.mock(
  "../ReasonFormFields",
  () => ({
    ReasonFormFields: ({
      category,
      memo,
      onCategoryChange,
      onMemoChange,
      required: _required,
    }: {
      category: string;
      memo: string;
      onCategoryChange: (c: string) => void;
      onMemoChange: (m: string) => void;
      required?: boolean;
    }) => (
      <div>
        <select
          data-testid="category-select"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          <option value="">-- 선택 --</option>
          <option value="기능 불량">기능 불량</option>
          <option value="외관 불량">외관 불량</option>
        </select>
        <textarea
          data-testid="memo-input"
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
        />
```
