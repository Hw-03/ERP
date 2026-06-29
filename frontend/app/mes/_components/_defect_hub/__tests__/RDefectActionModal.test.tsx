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
  mes_code: "7-MAT-0001",
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

function selectReasonCategory(label: string) {
  const combobox = screen.getByRole("combobox");
  fireEvent.click(combobox);
  fireEvent.mouseDown(screen.getByRole("option", { name: label }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defectsApi.unquarantine).mockResolvedValue(undefined);
  vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValue({} as never);
});

describe("RDefectActionModal", () => {
  it("open=true 시 품목 정보와 액션 선택지가 렌더된다", () => {
    render(<RDefectActionModal {...defaultProps} />);

    expect(screen.getByText(/텅스텐 와이어/)).toBeInTheDocument();
    expect(screen.getByText(/7-MAT-0001/)).toBeInTheDocument();
    expect(screen.getByLabelText(/정상 복귀/i) ?? screen.getByText("정상 복귀")).toBeInTheDocument();
    expect(screen.getByText("폐기")).toBeInTheDocument();
    expect(screen.getByText("원자재 반품")).toBeInTheDocument();
  });

  it("open=false 면 아무것도 렌더하지 않는다", () => {
    render(<RDefectActionModal {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("액션 라디오를 '폐기'로 변경할 수 있다", () => {
    render(<RDefectActionModal {...defaultProps} />);

    const scrapRadio = screen.getByDisplayValue("scrap");
    fireEvent.click(scrapRadio);
    expect(scrapRadio).toBeChecked();

    const unquarantineRadio = screen.getByDisplayValue("unquarantine");
    expect(unquarantineRadio).not.toBeChecked();
  });

  it("카테고리 미선택 시 [확인] 버튼이 비활성(disabled)이다", () => {
    render(<RDefectActionModal {...defaultProps} />);

    const confirmBtn = screen.getByText("확인 →");
    expect(confirmBtn).toBeDisabled();
  });

  it("정상복귀 선택 + 카테고리 선택 후 확인 클릭 → unquarantine API 호출", async () => {
    render(<RDefectActionModal {...defaultProps} />);

    // 카테고리 선택
    selectReasonCategory("검사 통과");

    // 정상복귀는 기본 선택 상태
    const confirmBtn = screen.getByText("확인 →");
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(defectsApi.unquarantine).toHaveBeenCalledOnce();
      expect(defectsApi.unquarantine).toHaveBeenCalledWith(
        expect.objectContaining({
          item_id: "item-001",
          qty: 5,
          dept: "조립",
          reason_category: "검사 통과",
          actor_employee_id: "emp-001",
        }),
      );
    });
  });

  it("폐기 선택 → 확인 클릭 → createStockRequest(purpose=defect_scrap) 호출", async () => {
    render(<RDefectActionModal {...defaultProps} />);

    fireEvent.click(screen.getByDisplayValue("scrap"));

    selectReasonCategory("외관 불량");

    fireEvent.click(screen.getByText("확인 →"));

    await waitFor(() => {
      expect(stockRequestsApi.createStockRequest).toHaveBeenCalledOnce();
      expect(stockRequestsApi.createStockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          request_type: "defect_scrap",
          requester_employee_id: "emp-001",
          reason_category: "외관 불량",
          reason_memo: null,
          lines: expect.arrayContaining([
            expect.objectContaining({
              item_id: "item-001",
              quantity: 5,
              from_bucket: "defective",
            }),
          ]),
        }),
      );
    });
  });

  it("성공 후 onSubmitted, onClose 호출된다", async () => {
    const onSubmitted = vi.fn();
    const onClose = vi.fn();

    render(
      <RDefectActionModal
        {...defaultProps}
        onSubmitted={onSubmitted}
        onClose={onClose}
      />,
    );

    selectReasonCategory("기타");
    fireEvent.click(screen.getByText("확인 →"));

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("[취소] 클릭 시 onClose 호출된다", () => {
    const onClose = vi.fn();
    render(<RDefectActionModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByText("취소"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
