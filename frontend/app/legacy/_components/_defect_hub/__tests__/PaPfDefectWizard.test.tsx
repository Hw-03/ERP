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
      </div>
    ),
  }),
);

import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import { PaPfDefectWizard } from "../PaPfDefectWizard";

const mockLocation: DefectLocation = {
  item_id: "item-pa-001",
  item_name: "전극 어셈블리",
  item_code: "7-TR-0001",
  department: "조립",
  quantity: 5,
  defective_at: "2025-08-15T00:00:00.000Z",
  reason_category: "기능 불량",
  reason_memo: "기능 검사 실패",
};

const mockEmployee = {
  employee_id: "emp-001",
  name: "김건호",
  department: "조립",
};

const mockBomTemplate = {
  sub_type: "disassembly" as const,
  lines: [
    {
      item_id: "child-001",
      item_name: "필라멘트",
      item_code: "F-001",
      unit: "개",
      direction: "out" as const,
      quantity: 5,
      bom_expected: 5,
      has_children: false,
      process_type_code: null,
      department: "조립" as const,
      reason: null,
    },
    {
      item_id: "child-002",
      item_name: "게터",
      item_code: "G-001",
      unit: "개",
      direction: "out" as const,
      quantity: 5,
      bom_expected: 5,
      has_children: false,
      process_type_code: null,
      department: "조립" as const,
      reason: null,
    },
  ],
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
  vi.mocked(deptAdjustmentApi.getBomTemplate).mockResolvedValue(mockBomTemplate);
  vi.mocked(defectsApi.unquarantine).mockResolvedValue(undefined);
  vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValue({
    request_id: "req-001",
    request_code: null,
    requester_employee_id: "emp-001",
    requester_name: "김건호",
    requester_department: "조립",
    request_type: "defect_disassemble",
    status: "submitted",
    requires_warehouse_approval: false,
    reserved_at: null,
    submitted_at: null,
    approved_by_employee_id: null,
    approved_by_name: null,
    approved_at: null,
    rejected_by_employee_id: null,
    rejected_by_name: null,
    rejected_at: null,
    rejected_reason: null,
    requires_department_approval: true,
    department_approved_by_employee_id: null,
    department_approved_by_name: null,
    department_approved_at: null,
    cancelled_at: null,
    completed_at: null,
    reference_no: null,
    notes: null,
    created_at: "2025-08-15T00:00:00.000Z",
    updated_at: "2025-08-15T00:00:00.000Z",
    lines: [],
  });
});

describe("PaPfDefectWizard", () => {
  it("open=true 시 모달이 렌더링된다", () => {
    render(<PaPfDefectWizard {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/전극 어셈블리/)).toBeInTheDocument();
    expect(screen.getByText(/7-TR-0001/)).toBeInTheDocument();
  });

  it("'정상 복귀' 선택 시 DisassembleTree 미표시, 버튼 텍스트 변경", async () => {
    render(<PaPfDefectWizard {...defaultProps} />);

    // 정상 복귀 라디오 클릭
    fireEvent.click(screen.getByLabelText(/정상 복귀/));

    // BOM 트리 영역이 없어야 함 (로딩 텍스트도 없어야 함)
    expect(screen.queryByText("BOM 자식 목록 로딩 중...")).not.toBeInTheDocument();

    // 사유 선택
    fireEvent.change(screen.getByTestId("category-select"), {
      target: { value: "기능 불량" },
    });

    // 버튼 텍스트
    expect(screen.getByText("정상 복귀로 변경")).toBeInTheDocument();
  });

  it("'전부 폐기' 선택 → DisassembleTree 미표시, 결재 요청 클릭 → createStockRequest(DEFECT_SCRAP)", async () => {
    render(<PaPfDefectWizard {...defaultProps} />);

    fireEvent.click(screen.getByLabelText(/전부 폐기/));

    expect(screen.queryByText("BOM 자식 목록 로딩 중...")).not.toBeInTheDocument();

    // 사유 필수 — 카테고리 선택
    fireEvent.change(screen.getByTestId("category-select"), {
      target: { value: "외관 불량" },
    });

    fireEvent.click(screen.getByText("결재 요청 →"));

    await waitFor(() => {
      expect(stockRequestsApi.createStockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          request_type: "defect_scrap",
          reason_category: "외관 불량",
          reason_memo: null,
          lines: expect.arrayContaining([
            expect.objectContaining({
              item_id: "item-pa-001",
              quantity: 5,
              from_bucket: "defective",
            }),
          ]),
        }),
      );
    });
  });

  it("'분해' 선택 → DisassembleTree 렌더 → getBomTemplate 호출 → 자식 행 표시", async () => {
    render(<PaPfDefectWizard {...defaultProps} />);

    // 분해는 기본 선택이므로 BOM 로드
    await waitFor(() => {
      expect(screen.getByText("필라멘트")).toBeInTheDocument();
      expect(screen.getByText("게터")).toBeInTheDocument();
    });

    expect(deptAdjustmentApi.getBomTemplate).toHaveBeenCalledWith(
      "item-pa-001",
      "disassembly",
      5,
    );
  });

  it("분해 + keep/scrap 선택 → 결재 요청 → createStockRequest(DEFECT_DISASSEMBLE, notes JSON 검증)", async () => {
    render(<PaPfDefectWizard {...defaultProps} />);

    // BOM 로드 대기
    await waitFor(() => {
      expect(screen.getByText("필라멘트")).toBeInTheDocument();
    });

    // 카테고리 선택
    fireEvent.change(screen.getByTestId("category-select"), {
      target: { value: "기능 불량" },
    });

    // 게터 행의 폐기 라디오 선택 — label text로 조회
    const scrapLabels = screen.getAllByText("폐기");
    fireEvent.click(scrapLabels[1]); // 두 번째 자식(게터) 폐기 label 클릭

    fireEvent.click(screen.getByText("결재 요청 →"));

    await waitFor(() => {
      expect(stockRequestsApi.createStockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          request_type: "defect_disassemble",
          reason_category: "기능 불량",
          reason_memo: null,
          lines: expect.arrayContaining([
            expect.objectContaining({
              item_id: "item-pa-001",
              from_bucket: "defective",
            }),
          ]),
        }),
      );
    });

    const call = vi.mocked(stockRequestsApi.createStockRequest).mock.calls[0][0];
    const parsedNotes = JSON.parse(call.notes as string) as {
      child_decisions: { item_id: string; action: string; qty: number }[];
    };
    expect(parsedNotes.child_decisions).toHaveLength(2);
    expect(parsedNotes.child_decisions[1]).toMatchObject({
      item_id: "child-002",
      action: "scrap",
    });
  });

  it("카테고리 미선택 시 결재 요청 버튼 비활성", () => {
    render(<PaPfDefectWizard {...defaultProps} />);

    const submitBtn = screen.getByText("결재 요청 →");
    expect(submitBtn).toBeDisabled();
  });

  it("open=false 시 아무것도 렌더되지 않는다", () => {
    render(<PaPfDefectWizard {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
