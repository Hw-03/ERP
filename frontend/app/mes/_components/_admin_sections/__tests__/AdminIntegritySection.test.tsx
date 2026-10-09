import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("8.19-24 모든 엔진 진단 유형의 원인 ID와 현재·기대값을 누락 없이 표시한다", async () => {
    const categories = [
      ["INVENTORY_TOTAL_MISMATCH", "전체 재고 합계 불일치"], ["NEGATIVE_INVENTORY", "음수 재고"],
      ["NEGATIVE_LOCATION", "음수 위치 재고"], ["PENDING_RESERVATION_MISMATCH", "예약 수량 불일치"],
      ["STOCK_REQUEST_STATE_MISMATCH", "요청과 상세 처리 상태 불일치"], ["SHIPPING_ALLOCATION_MISMATCH", "출하 배정"],
      ["WAREHOUSE_PHYSICAL_MISMATCH", "창고 실제 배치 수량 불일치"], ["ORPHAN_REFERENCE", "연결된 원본 기록 없음"],
      ["OPERATION_V2_EFFECT_INVALID", "작업의 재고 영향 근거 오류"], ["OPERATION_V1_EFFECT_MISSING", "이전 작업의 재고 영향 근거 누락"],
      ["DEFECT_STOCK_MISMATCH", "불량 원장·재고"], ["PARTIAL_CANCELLATION", "부분 취소 의심"],
      ["WORKFLOW_STATE_RESIDUE", "업무 상태 잔존"], ["DUPLICATE_REVERSAL", "중복 역전"], ["WEEKLY_UNCLASSIFIED_EFFECT", "주간 미분류"],
    ];
    state.getInventoryIntegrity.mockResolvedValue({
      generated_at: "2026-10-07T09:00:00Z", issue_count: 0, issues: [], category_counts: {},
      blocking_count: categories.length, warning_count: 0, is_consistent: false,
      checks: categories.map(([check_id], index) => ({ check_id, severity: "blocking", count: 1,
        samples: [{ problem_id: `actual-problem-${index}`, item_id: `actual-item-${index}`, reason: "missing_effect", current_value: index + 20, expected_value: index + 10 }] })),
    });
    const { container } = render(<AdminIntegritySection />);
    await screen.findByRole("heading", { name: "전체 재고 합계 불일치", exact: true });
    const rows = container.querySelectorAll(".admin-integrity-results li");
    expect(rows).toHaveLength(categories.length);
    categories.forEach(([, title], index) => {
      const row = within(rows[index] as HTMLElement);
      expect(row.getByRole("heading", { name: title, exact: true })).toBeInTheDocument();
      expect(row.getByText(`actual-problem-${index}`, { exact: true })).toBeInTheDocument();
      expect(row.getByText(`원인 ID: actual-item-${index} · actual-problem-${index}`)).toBeInTheDocument();
      expect(row.getByText(`현재값 ${index + 20}`)).toBeInTheDocument();
      expect(row.getByText(`기대값 ${index + 10}`)).toBeInTheDocument();
      expect(row.getByText("재고 영향 근거가 없습니다.")).toBeInTheDocument();
      expect(row.getByText("수동 검토 필요")).toBeInTheDocument();
    });
    expect(screen.getByText(`· 발견 문제 ${categories.length}건`)).toBeInTheDocument();
    expect(screen.queryByText("발견된 정합성 문제가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /복구/ })).not.toBeInTheDocument();
  });
  it("8.19-24 새 엔진 전용 문제도 실제 ID·원인·현재값·기대값과 수동 검토를 표시한다", async () => {
    state.getInventoryIntegrity.mockResolvedValue({
      generated_at: "2026-10-07T09:00:00Z", is_consistent: false, issue_count: 0, category_counts: {}, issues: [],
      contract: "inventory-integrity/v1", blocking_count: 1, warning_count: 0,
      checks: [{ check_id: "INVENTORY_TOTAL_MISMATCH", severity: "blocking", count: 1,
        samples: [{ item_id: "actual-item-1", stored_quantity: "21", computed_quantity: "20" }] }],
    });
    render(<AdminIntegritySection />);
    expect(await screen.findByRole("heading", { name: "전체 재고 합계 불일치", exact: true })).toBeInTheDocument();
    expect(screen.getByText(/INVENTORY_TOTAL_MISMATCH:.*actual-item-1/)).toBeInTheDocument();
    expect(screen.getByText("현재 전체 재고 21")).toBeInTheDocument();
    expect(screen.getByText("계산된 전체 재고 20")).toBeInTheDocument();
    expect(screen.getByText("수동 검토 필요")).toBeInTheDocument();
    expect(screen.getByText(/발견 문제 1건/)).toBeInTheDocument();
    expect(screen.queryByText("발견된 정합성 문제가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /복구/ })).not.toBeInTheDocument();
  });

  it("엔진 요약의 차단·경고 수와 누락된 상세 표본을 구분한다", async () => {
    state.getInventoryIntegrity.mockResolvedValue({
      generated_at: "2026-10-07T09:00:00Z", is_consistent: true, issue_count: 0, category_counts: {}, issues: [],
      blocking_count: 0, warning_count: 6,
      checks: [{ check_id: "OPERATION_V1_EFFECT_MISSING", severity: "warning", count: 6, samples: [{ operation_id: "actual-operation-1" }] }],
    });
    render(<AdminIntegritySection />);
    expect(await screen.findByRole("heading", { name: "이전 작업의 재고 영향 근거 누락", exact: true })).toBeInTheDocument();
    expect(screen.getByText(/차단 0건 · 경고 6건/)).toBeInTheDocument();
    expect(screen.getByText(/검출 6건 중 상세 표본 1건/)).toBeInTheDocument();
    expect(screen.queryByText("발견된 정합성 문제가 없습니다.")).not.toBeInTheDocument();
  });

  it("기존 문제와 같은 ID의 엔진 표본을 중복 표시하지 않는다", async () => {
    const legacy = await state.getInventoryIntegrity();
    state.getInventoryIntegrity.mockResolvedValue({ ...legacy, blocking_count: 1, warning_count: 0,
      checks: [{ check_id: "WORKFLOW_STATE_RESIDUE", severity: "blocking", count: 1, samples: [{ problem_id: "INT-ABC123", current_value: "현재 상태 PICKED_UP", expected_value: "최종 상태 CANCELLED" }] }],
    });
    render(<AdminIntegritySection />);
    expect(await screen.findByText("INT-ABC123")).toBeInTheDocument();
    expect(screen.getAllByText("INT-ABC123")).toHaveLength(1);
    expect(screen.getByText(/발견 문제 1건/)).toBeInTheDocument();
  });
  beforeEach(() => {
    state.getInventoryIntegrity.mockReset();
    state.getInventoryIntegrity.mockResolvedValue({
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

  it("[8.19-25] 문제 ID와 현재·기대값만 읽기 전용으로 표시한다", async () => {
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
});
