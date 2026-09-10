import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getInventoryIntegrity: vi.fn(),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    getInventoryIntegrity: state.getInventoryIntegrity,
  },
}));

import { AdminIntegritySection } from "../AdminIntegritySection";

describe("AdminIntegritySection", () => {
  beforeEach(() => {
    state.getInventoryIntegrity.mockReset();
    state.getInventoryIntegrity.mockResolvedValue({
      contract: "inventory-integrity/v1",
      status: "fail",
      blocking_count: 1,
      warning_count: 0,
      checks: [
        {
          check_id: "WORKFLOW_STATE_RESIDUE",
          severity: "blocking",
          count: 1,
          samples: [{ problem_id: "INT-ABC123" }],
        },
      ],
      generated_at: "2026-08-25T09:00:00",
      is_consistent: false,
      issue_count: 1,
      category_counts: {
        DEFECT_STOCK_MISMATCH: 0,
        PARTIAL_CANCELLATION: 0,
        WORKFLOW_STATE_RESIDUE: 1,
        SHIPPING_ALLOCATION_MISMATCH: 0,
        DUPLICATE_REVERSAL: 0,
        WEEKLY_UNCLASSIFIED_EFFECT: 0,
      },
      issues: [
        {
          problem_id: "INT-ABC123",
          category: "WORKFLOW_STATE_RESIDUE",
          title: "취소된 작업의 업무 상태 잔존",
          description: "출하 업무가 최종 취소 상태로 닫히지 않았습니다.",
          cause_ids: ["operation-1", "effect-1", "request-1"],
          current_value: "현재 상태 PICKED_UP",
          expected_value: "최종 상태 CANCELLED",
          repairable: true,
        },
      ],
    });
  });

  it("문제 ID와 현재·기대값을 읽기 전용으로 표시한다", async () => {
    render(<AdminIntegritySection />);

    expect(await screen.findByText("취소된 작업의 업무 상태 잔존")).toBeInTheDocument();
    expect(screen.getByText("INT-ABC123")).toBeInTheDocument();
    expect(screen.getByText("현재 상태 PICKED_UP")).toBeInTheDocument();
    expect(screen.getByText("최종 상태 CANCELLED")).toBeInTheDocument();
    expect(screen.getAllByText("CLI 복구 가능")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /복구/ })).not.toBeInTheDocument();
  });

  it("새로고침은 진단 API만 다시 조회한다", async () => {
    render(<AdminIntegritySection />);
    await screen.findByText("INT-ABC123");

    fireEvent.click(screen.getByRole("button", { name: "다시 검사" }));

    await waitFor(() => expect(state.getInventoryIntegrity).toHaveBeenCalledTimes(2));
  });

  it("새 blocking check를 문제 수와 결과 목록에 표시한다", async () => {
    state.getInventoryIntegrity.mockResolvedValueOnce({
      contract: "inventory-integrity/v1",
      status: "fail",
      blocking_count: 1,
      warning_count: 0,
      checks: [
        {
          check_id: "WAREHOUSE_PHYSICAL_MISMATCH",
          severity: "blocking",
          count: 1,
          samples: [
            {
              item_id: "item-1",
              warehouse_quantity: 4,
              unplaced_quantity: 1,
            },
          ],
        },
      ],
      generated_at: "2026-09-02T09:00:00",
      is_consistent: false,
      issue_count: 0,
      category_counts: {
        DEFECT_STOCK_MISMATCH: 0,
        PARTIAL_CANCELLATION: 0,
        WORKFLOW_STATE_RESIDUE: 0,
        SHIPPING_ALLOCATION_MISMATCH: 0,
        DUPLICATE_REVERSAL: 0,
        WEEKLY_UNCLASSIFIED_EFFECT: 0,
      },
      issues: [],
    });

    render(<AdminIntegritySection />);

    expect(await screen.findByText("WAREHOUSE_PHYSICAL_MISMATCH")).toBeInTheDocument();
    expect(screen.getByText(/발견 문제 1건/)).toBeInTheDocument();
    expect(screen.queryByText("발견된 정합성 문제가 없습니다.")).not.toBeInTheDocument();
  });
});
