import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryIntegrityResult } from "@/lib/api/admin";

const state = vi.hoisted(() => ({
  getInventoryIntegrity: vi.fn(),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    getInventoryIntegrity: state.getInventoryIntegrity,
  },
}));

import { AdminIntegritySection } from "../AdminIntegritySection";

const issueResult: InventoryIntegrityResult = {
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
};
const healthyResult: InventoryIntegrityResult = {
  ...issueResult,
  is_consistent: true,
  issue_count: 0,
  category_counts: { ...issueResult.category_counts, WORKFLOW_STATE_RESIDUE: 0 },
  issues: [],
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("AdminIntegritySection", () => {
  beforeEach(() => {
    state.getInventoryIntegrity.mockReset();
    state.getInventoryIntegrity.mockResolvedValue(issueResult);
  });

  it.each([healthyResult, issueResult])("최초 조회는 스켈레톤에서 실제 결과로 전환한다: consistent=$is_consistent", async (result) => {
    const pending = deferred<InventoryIntegrityResult>();
    state.getInventoryIntegrity.mockReturnValueOnce(pending.promise);
    const { container } = render(<AdminIntegritySection />);

    expect(screen.getByRole("region", { name: "정합성 검사" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("정합성 검사 결과를 불러오는 중입니다.");
    expect(screen.getByRole("button", { name: "다시 검사" })).toBeDisabled();
    expect(container.querySelector(".admin-integrity-summary")).toBeInTheDocument();
    expect(screen.getByText("항목별 검사")).toBeInTheDocument();
    expect(screen.getByText("불량 원장·재고")).toBeInTheDocument();
    expect(container.querySelector(".admin-integrity-results")).toBeInTheDocument();
    expect(screen.queryByText("정상", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("검사 완료", { exact: true })).not.toBeInTheDocument();
    expect(container.querySelector(".admin-integrity-mascot")).toBeNull();
    expect(container.querySelector("time")).toBeNull();

    await act(async () => pending.resolve(result));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "정합성 검사" })).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("button", { name: "다시 검사" })).toBeEnabled();
    expect(screen.getByText(result.is_consistent ? "발견된 정합성 문제가 없습니다." : "INT-ABC123")).toBeInTheDocument();
  });

  it("최초 실패 시 스켈레톤을 제거하고 재시도할 수 있다", async () => {
    state.getInventoryIntegrity.mockRejectedValueOnce(new Error("조회 실패"));
    const { container } = render(<AdminIntegritySection />);
    expect(await screen.findByRole("alert")).toHaveTextContent("조회 실패");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector(".admin-integrity-results")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 검사" }));
    expect(await screen.findByText("INT-ABC123")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("재검사 대기·실패 중에는 기존 결과를 유지한다", async () => {
    const pending = deferred<InventoryIntegrityResult>();
    state.getInventoryIntegrity.mockReturnValueOnce(Promise.resolve(issueResult)).mockReturnValueOnce(pending.promise);
    render(<AdminIntegritySection />);
    await screen.findByText("INT-ABC123");
    fireEvent.click(screen.getByRole("button", { name: "다시 검사" }));
    expect(screen.getByText("INT-ABC123")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 검사" })).toBeDisabled();
    await act(async () => pending.reject(new Error("재검사 실패")));
    expect(screen.getByRole("alert")).toHaveTextContent("재검사 실패");
    expect(screen.getByText("INT-ABC123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 검사" })).toBeEnabled();
  });

  it("재검사 성공 시 기존 문제를 최신 정상 결과로 바꾼다", async () => {
    const pending = deferred<InventoryIntegrityResult>();
    state.getInventoryIntegrity.mockResolvedValueOnce(issueResult).mockReturnValueOnce(pending.promise);
    render(<AdminIntegritySection />);
    await screen.findByText("INT-ABC123");
    fireEvent.click(screen.getByRole("button", { name: "다시 검사" }));
    expect(screen.getByText("INT-ABC123")).toBeInTheDocument();
    await act(async () => pending.resolve(healthyResult));
    expect(screen.queryByText("INT-ABC123")).not.toBeInTheDocument();
    expect(screen.getByText("발견된 정합성 문제가 없습니다.")).toBeInTheDocument();
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
