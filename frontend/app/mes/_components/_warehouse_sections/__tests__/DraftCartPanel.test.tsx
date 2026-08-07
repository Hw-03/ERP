import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftCartPanel } from "../DraftCartPanel";

vi.mock("@/lib/queries/useDraftCartQuery", () => ({
  useDraftCartQuery: () => ({
    data: { stockDrafts: [], ioDrafts: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDeleteIoDraftMutation: () => ({ mutate: vi.fn() }),
  useDeleteStockRequestDraftMutation: () => ({ mutate: vi.fn() }),
}));

describe("DraftCartPanel empty state", () => {
  it("offers a request-compose action when there is no work in progress", () => {
    const onStartCompose = vi.fn();

    render(
      <DraftCartPanel
        employeeId="emp-1"
        refreshNonce={0}
        onContinue={vi.fn()}
        onChanged={vi.fn()}
        onStartCompose={onStartCompose}
      />,
    );

    expect(screen.getByText("작업 중인 요청이 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "요청 작성" }));
    expect(onStartCompose).toHaveBeenCalledOnce();
  });
});
