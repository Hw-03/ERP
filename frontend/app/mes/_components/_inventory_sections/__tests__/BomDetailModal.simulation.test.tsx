import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type BOMTreeNode } from "@/lib/api";
import { BomDetailModal } from "../BomDetailModal";

const realtime = vi.hoisted(() => ({ revision: 1 }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => realtime.revision }));
const node = (id: string, children: BOMTreeNode[] = []): BOMTreeNode => ({ item_id: id, mes_code: `code-${id}`, item_name: id, process_type_code: "AA", unit: "EA", required_quantity: 1, current_stock: 7, children });
const tree = { ...node("root", [node("branch", [node("leaf")]), node("other")]), additional_producible_quantity: 7, additional_producible_limiting_item_id: "leaf", ship_ready: 7, fast_production: 3, total_production: 14, fast_production_status: "finite" as const, total_production_status: "finite" as const, fast_production_limiting_item_id: "other", total_production_limiting_item_id: "leaf" };
const response = { item_id: "root", additional_producible_quantity: 20, additional_producible_status: "finite" as const, additional_producible_limiting_item_id: "leaf", ship_ready: 7, fast_production: 12, total_production: 27, fast_production_status: "finite" as const, total_production_status: "finite" as const, fast_production_limiting_item_id: "leaf", total_production_limiting_item_id: "leaf" };
const props = { itemId: "root", open: true, onClose: vi.fn() };

describe("일반 BOM 임시 제외", () => {
  it("총생산 안내는 같은 제한 품목의 빠른 생산으로 전환하면 사라지고 4초 후 해제된다", async () => {
    vi.mocked(api.getBOMTree).mockResolvedValue({ ...tree, fast_production_limiting_item_id: "leaf" });
    render(<BomDetailModal {...props} />);
    await screen.findByRole("button", { name: "총생산 제한 품목 찾기" });
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "총생산 제한 품목 찾기" }));
      expect(within(screen.getByText("leaf", { exact: true }).closest("li")!).getByText("총생산 수량에는 현재 재고가 포함됩니다.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "빠른 생산 제한 품목 찾기" }));
      expect(screen.queryByText("총생산 수량에는 현재 재고가 포함됩니다.")).not.toBeInTheDocument();
      expect(screen.getByText("생산 제한 품목")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "총생산 제한 품목 찾기" }));
      await act(async () => { vi.advanceTimersByTime(4000); });
      expect(screen.queryByText("총생산 수량에는 현재 재고가 포함됩니다.")).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    realtime.revision = 1;
    vi.spyOn(api, "getBOMTree").mockResolvedValue(tree);
    vi.spyOn(api, "simulateBOMCapacity").mockResolvedValue(response);
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  it("연속 제외는 마지막 조건만 계산하고 닫으면 진행 요청을 취소한다", async () => {
    vi.mocked(api.simulateBOMCapacity).mockReturnValue(new Promise(() => {}));
    const view = render(<BomDetailModal {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "other 제외" }));
    fireEvent.click(screen.getByRole("button", { name: "branch 제외" }));
    await waitFor(() => expect(api.simulateBOMCapacity).toHaveBeenCalledOnce());
    expect(vi.mocked(api.simulateBOMCapacity).mock.calls[0][1].excluded_item_ids).toEqual(["branch", "other"]);
    const signal = vi.mocked(api.simulateBOMCapacity).mock.calls[0][2];
    expect(signal?.aborted).toBe(false);
    view.rerender(<BomDetailModal {...props} open={false} />);
    expect(signal?.aborted).toBe(true);
  });
  it("직계 구성품 제외와 복원 및 머리글 안내를 제공한다", async () => {
    render(<BomDetailModal {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "other 제외" }));
    await waitFor(() => expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("총생산 27"));
    expect(api.simulateBOMCapacity).toHaveBeenCalledWith("root", { excluded_item_ids: ["other"] }, expect.any(AbortSignal));
    expect(within(screen.getByTestId("bom-modal-grid-header")).getByText("시뮬레이션 중")).toBeInTheDocument();
    expect(screen.getByTestId("bom-current-stock-badge")).toHaveTextContent("현재 재고 7");
    expect(screen.getByTestId("bom-fast-production-card")).toHaveTextContent("빠른 생산 12");
    expect(screen.getByTestId("bom-modal-header")).not.toHaveTextContent("EA");
    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    expect(screen.queryByText("시뮬레이션 중")).not.toBeInTheDocument();
    expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("총생산 14");
  });
  it("빠른 생산과 총생산 카드가 각 제한 품목을 찾고 접힌 경로를 펼친다", async () => {
    render(<BomDetailModal {...props} />);
    const card = await screen.findByRole("button", { name: "총생산 제한 품목 찾기" });
    fireEvent.click(screen.getByRole("button", { name: "빠른 생산 제한 품목 찾기" }));
    expect(within(screen.getByText("other", { exact: true }).closest("li")!).getByText("생산 제한 품목")).toBeInTheDocument();
    expect(screen.queryByText("leaf", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(card);
    const row = (await screen.findByText("leaf", { exact: true })).closest("li")!;
    expect(within(row).getByText("생산 제한 품목")).toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
  it("자동 갱신 실패에도 마지막 수량 유지 후 재시도하며 다시 열면 초기화한다", async () => {
    const view = render(<BomDetailModal {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "other 제외" }));
    await waitFor(() => expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("총생산 27"));
    let reject!: (error: Error) => void;
    vi.mocked(api.simulateBOMCapacity).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    realtime.revision++;
    view.rerender(<BomDetailModal {...props} />);
    await waitFor(() => expect(api.simulateBOMCapacity).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("총생산 27");
    await act(async () => reject(new Error("offline")));
    expect(await screen.findByRole("alert")).toHaveTextContent("최신 계산 갱신 실패");
    fireEvent.click(screen.getByRole("button", { name: "계산 다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    view.rerender(<BomDetailModal {...props} open={false} />);
    view.rerender(<BomDetailModal {...props} />);
    await screen.findByRole("button", { name: "other 제외" });
    expect(screen.queryByText("시뮬레이션 중")).not.toBeInTheDocument();
  });
  it("조건 변경 로딩 후 최신 응답만 표시하고 제약 없음일 때 이동을 비활성화한다", async () => {
    let first!: (value: typeof response) => void;
    let second!: (value: typeof response) => void;
    vi.mocked(api.simulateBOMCapacity)
      .mockReturnValueOnce(new Promise((resolve) => { first = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { second = resolve; }));
    render(<BomDetailModal {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "other 제외" }));
    expect(screen.getByTestId("bom-fast-production-card")).toHaveTextContent("계산 중…");
    expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("계산 중…");
    expect(screen.getByRole("button", { name: "총생산 제한 품목 찾기" })).toBeDisabled();
    await waitFor(() => expect(api.simulateBOMCapacity).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "branch 제외" }));
    await waitFor(() => expect(api.simulateBOMCapacity).toHaveBeenCalledTimes(2));
    await act(async () => second({ ...response, total_production: 41 }));
    expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("총생산 41");
    await act(async () => first(response));
    expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("총생산 41");
    vi.mocked(api.simulateBOMCapacity).mockResolvedValueOnce({ ...response, fast_production: null, total_production: null, fast_production_status: "no_constraints", total_production_status: "no_constraints", fast_production_limiting_item_id: null, total_production_limiting_item_id: null });
    fireEvent.click(screen.getByRole("button", { name: "other 복원" }));
    await waitFor(() => expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("제약 없음"));
    expect(screen.getByTestId("bom-fast-production-card")).toHaveTextContent("제약 없음");
    expect(screen.getByRole("button", { name: "빠른 생산 제한 품목 찾기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "총생산 제한 품목 찾기" })).toBeDisabled();
    expect(screen.getByTestId("bom-current-stock-badge")).toHaveTextContent("현재 재고 7");
  });
  it("품목을 바꾸면 제외 선택을 폐기하고 이전 계산 응답을 무시한다", async () => {
    let finish!: (value: typeof response) => void;
    vi.mocked(api.getBOMTree).mockResolvedValueOnce(tree).mockResolvedValueOnce({ ...tree, item_id: "next", item_name: "next", current_stock: 9, total_production: 30 });
    vi.mocked(api.simulateBOMCapacity).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const view = render(<BomDetailModal {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "other 제외" }));
    await waitFor(() => expect(api.simulateBOMCapacity).toHaveBeenCalledOnce());
    view.rerender(<BomDetailModal {...props} itemId="next" />);
    await waitFor(() => expect(screen.getByTestId("bom-current-stock-badge")).toHaveTextContent("현재 재고 9"));
    expect(screen.queryByText("시뮬레이션 중")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "other 제외" })).toBeInTheDocument();
    expect(api.simulateBOMCapacity).toHaveBeenCalledOnce();
    await act(async () => finish(response));
    expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("총생산 30");
  });
  it("공유 제한 품목의 제외된 경로를 건너뛰어 유효한 경로를 펼친다", async () => {
    vi.mocked(api.getBOMTree).mockResolvedValue({ ...tree, children: [node("excluded-branch", [node("leaf")]), node("active-branch", [node("leaf")])] });
    render(<BomDetailModal {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "excluded-branch 제외" }));
    await waitFor(() => expect(screen.getByTestId("bom-additional-producible-badge")).toHaveTextContent("총생산 27"));
    fireEvent.click(screen.getByRole("button", { name: "총생산 제한 품목 찾기" }));
    const leaf = await screen.findByText("leaf", { exact: true });
    expect(screen.getByRole("button", { name: "active-branch 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "excluded-branch 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(within(leaf.closest("li")!).getByText("생산 제한 품목")).toBeInTheDocument();
  });
});
