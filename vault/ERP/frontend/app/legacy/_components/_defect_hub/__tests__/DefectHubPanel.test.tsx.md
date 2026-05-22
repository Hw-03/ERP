---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/__tests__/DefectHubPanel.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DefectHubPanel.test.tsx — DefectHubPanel.test.tsx 설명

## 이 파일은 무엇을 책임지나

`DefectHubPanel.test.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

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
import { DefectHubPanel } from "../DefectHubPanel";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";

// defectsApi 모킹
vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    getDefectKpi: vi.fn(),
    listDefects: vi.fn(),
  },
}));

// 처리 모달 모킹 — DOM 렌더만 검증 (실제 API 호출 X)
vi.mock("../RDefectActionModal", () => ({
  RDefectActionModal: ({ open, location }: { open: boolean; location: { item_code: string } }) =>
    open ? <div data-testid="r-modal">{location.item_code}</div> : null,
}));
vi.mock("../PaPfDefectWizard", () => ({
  PaPfDefectWizard: ({ open, location }: { open: boolean; location: { item_code: string } }) =>
    open ? <div data-testid="papf-wizard">{location.item_code}</div> : null,
}));
vi.mock("../AddQuarantineModal", () => ({
  AddQuarantineModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-quarantine">add</div> : null,
}));

import { defectsApi } from "@/lib/api/defects";

const mockKpi: DefectKpi = {
  quarantined: 17,
  over_one_year: 3,
  pending_approval: 2,
  processed_today: 1,
};

// 조립부 1개, 진공부 1개
const mockLocations: DefectLocation[] = [
  {
    item_id: "item-001",
    item_name: "전극(70kV)",
    item_code: "7-TR-0001",
    department: "조립",
    quantity: 3,
    defective_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // 200일 전
    reason_category: "외관 불량",
    reason_memo: "스크래치",
  },
  {
    item_id: "item-002",
    item_name: "게터",
    item_code: "7-TR-0003",
    department: "진공",
    quantity: 8,
    defective_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), // 400일 전 (1년 초과)
```
