import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { BOMTreeNode } from "@/lib/api";
import { DesktopCapacityPfWorkspace } from "../_capacity_sections/DesktopCapacityPfWorkspace";

const realtime = vi.hoisted(() => ({ revision: 1 }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => realtime.revision }));
const variant = { pf_item_id: "pf", pf_code: "PF", pf_name: "완제품", af_item_id: "af", ship_ready: 0, fast_production: 7, total_production: 7, bom_status: "complete" as const };
const leaf = (id: string, children: BOMTreeNode[] = []): BOMTreeNode => ({ item_id: id, item_name: id, mes_code: `code-${id}`, process_type_code: "PR", unit: "EA", required_quantity: 1, current_stock: 7, children });
const tree = leaf("pf", [leaf("top", [leaf("branch", [leaf("leaf")]), leaf("other")])]);
const result = { pf_item_id: "pf", ship_ready: 0, fast_production: 20, fast_production_status: "finite" as const, total_production: 30, total_production_status: "finite" as const };
const mount = () => render(<DesktopCapacityPfWorkspace variant={variant} onBack={vi.fn()} onClose={vi.fn()} />);

describe("생산 가능수량 임시 제외", () => {
  it("총생산 안내는 같은 제한 품목의 빠른 생산으로 전환하면 사라지고 4초 후 해제된다", async () => {
    render(<DesktopCapacityPfWorkspace variant={{ ...variant, fast_production_limiting_item_id: "other", total_production_limiting_item_id: "other" }} onBack={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText("other", { exact: true });
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "총생산 제한 품목 찾기" }));
      expect(within(screen.getByText("other", { exact: true }).closest("li")!).getByText("총생산 수량에는 현재 재고가 포함됩니다.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "빠른 생산 제한 품목 찾기" }));
      expect(screen.queryByText("총생산 수량에는 현재 재고가 포함됩니다.")).not.toBeInTheDocument();
      expect(screen.getByText("생산 제한 품목")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "총생산 제한 품목 찾기" }));
      await act(async () => { vi.advanceTimersByTime(4000); });
      expect(screen.queryByText("총생산 수량에는 현재 재고가 포함됩니다.")).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it("연속 제외는 마지막 조건만 계산하고 초기화하면 진행 요청을 취소한다", async () => {
    vi.mocked(api.simulateProductionCapacity).mockReturnValue(new Promise(() => {}));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "leaf 제외" }));
    fireEvent.click(screen.getByRole("button", { name: "other 제외" }));
    await waitFor(() => expect(api.simulateProductionCapacity).toHaveBeenCalledOnce());
    expect(vi.mocked(api.simulateProductionCapacity).mock.calls[0][0].excluded_item_ids).toEqual(["leaf", "other"]);
    const signal = vi.mocked(api.simulateProductionCapacity).mock.calls[0][1];
    expect(signal?.aborted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    expect(signal?.aborted).toBe(true);
  });
  it("공유 품목은 제외된 조상 아래 행을 건너뛰고 활성 행으로 이동한다", async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.mocked(api.getBOMTree).mockResolvedValue(leaf("pf", [leaf("top", [leaf("branch", [leaf("leaf")]), leaf("sibling", [leaf("leaf")])])]));
    vi.mocked(api.simulateProductionCapacity).mockResolvedValue({ ...result, total_production_limiting_item_id: "leaf" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "branch 제외" }));
    await screen.findByText("30");
    fireEvent.click(screen.getByRole("button", { name: "총생산 제한 품목 찾기" }));
    expect(scroll.mock.contexts[0]).toHaveAttribute("data-bom-excluded", "false");
    expect(screen.getAllByText("생산 제한 품목")).toHaveLength(1);
  });
  it("일반 수량의 빠른 생산 카드도 제한 품목으로 이동한다", async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    render(<DesktopCapacityPfWorkspace variant={{ ...variant, fast_production_limiting_item_id: "other" }} onBack={vi.fn()} onClose={vi.fn()} />);
    const card = await screen.findByRole("button", { name: "빠른 생산 제한 품목 찾기" });
    await waitFor(() => expect(card).toBeEnabled());
    fireEvent.click(card);
    const row = screen.getByText("other", { exact: true }).closest("li")!;
    expect(within(row).getByText("생산 제한 품목")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "총생산 제한 품목 찾기" })).toBeDisabled();
  });
  it("수량 카드를 누르면 접힌 제한 품목 경로를 펼치고 행을 강조한다", async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.mocked(api.simulateProductionCapacity).mockResolvedValue({ ...result, total_production_limiting_item_id: "leaf", fast_production_limiting_item_id: "other" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "other 제외" }));
    await screen.findByText("30");
    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(screen.queryByText("leaf", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "총생산 제한 품목 찾기" }));
    const row = (await screen.findByText("leaf", { exact: true })).closest("li")!;
    expect(within(row).getByText("생산 제한 품목")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
  });
  it("자동 갱신 중과 실패 후에도 마지막 수량을 유지하고 안내를 머리글에 표시한다", async () => {
    const view = mount();
    fireEvent.click(await screen.findByRole("button", { name: "leaf 제외" }));
    await screen.findByText("20");
    expect(within(screen.getByTestId("bom-modal-grid-header")).getByText("시뮬레이션 중")).toBeInTheDocument();
    let rejectRefresh!: (error: Error) => void;
    vi.mocked(api.simulateProductionCapacity).mockReturnValueOnce(new Promise((_, reject) => { rejectRefresh = reject; }));
    realtime.revision++;
    view.rerender(<DesktopCapacityPfWorkspace variant={variant} onBack={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(api.simulateProductionCapacity).toHaveBeenCalledTimes(2));
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.queryByText("계산 중…")).not.toBeInTheDocument();
    await act(async () => { rejectRefresh(new Error("offline")); });
    expect(await screen.findByRole("alert")).toHaveTextContent("최신 계산 갱신 실패");
    expect(screen.getByText("20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계산 다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() => expect(api.simulateProductionCapacity).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "other 제외" }));
    await waitFor(() => expect(api.simulateProductionCapacity).toHaveBeenCalledTimes(4));
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    realtime.revision = 1;
    vi.spyOn(api, "getBOMTree").mockResolvedValue(tree);
    vi.spyOn(api, "simulateProductionCapacity").mockResolvedValue(result);
  });

  it("최상위에는 버튼 없이 하위 행만 제외하고 상위 제외를 전파한다", async () => {
    mount();
    await screen.findByRole("button", { name: "branch 제외" });
    expect(screen.queryByRole("button", { name: "top 제외" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "branch 제외" }));
    expect(await screen.findByText("시뮬레이션 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "빠른 생산 제한 품목 찾기" })).toHaveStyle({ background: "var(--c-warning-bg)", borderColor: "var(--c-yellow)" });
    expect(screen.getByRole("button", { name: "leaf 제외" })).toBeDisabled();
    expect(screen.getByText("상위 항목 제외")).toBeInTheDocument();
    expect(screen.getByText("leaf", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(api.simulateProductionCapacity).toHaveBeenCalledWith({ pf_item_id: "pf", excluded_item_ids: ["branch"] }, expect.any(AbortSignal)));
    expect(await screen.findByText("20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    expect(screen.queryByText("시뮬레이션 중")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "leaf 제외" })).toBeEnabled();
    expect(screen.getAllByText("7")).toHaveLength(2);
  });

  it("연속 변경의 늦은 응답이 최신 선택을 덮어쓰지 않는다", async () => {
    let resolveFirst!: (value: typeof result) => void;
    vi.mocked(api.simulateProductionCapacity).mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValueOnce({ ...result, total_production: 55 });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "leaf 제외" }));
    await waitFor(() => expect(api.simulateProductionCapacity).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "other 제외" }));
    expect(await screen.findByText("55")).toBeInTheDocument();
    await act(async () => { resolveFirst(result); });
    expect(screen.getByText("55")).toBeInTheDocument();
  });

  it("실패 후 재시도와 제약 없음 표시를 제공한다", async () => {
    vi.mocked(api.simulateProductionCapacity).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...result, total_production: null, total_production_status: "no_constraints" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "leaf 제외" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("시뮬레이션 계산에 실패했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "계산 다시 시도" }));
    expect(await screen.findByText("제약 없음")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "총생산 제한 품목 찾기" })).toBeDisabled();
  });

  it("재진입과 품목 변경 시 상태를 초기화한다", async () => {
    const view = mount();
    fireEvent.click(await screen.findByRole("button", { name: "leaf 제외" }));
    await screen.findByText("20");
    view.unmount();
    const next = mount();
    expect(screen.queryByText("시뮬레이션 중")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "leaf 제외" }));
    await screen.findByText("20");
    next.rerender(<DesktopCapacityPfWorkspace variant={{ ...variant, pf_item_id: "pf2" }} onBack={vi.fn()} onClose={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByText("시뮬레이션 중")).not.toBeInTheDocument();
  });

  it("실시간 갱신 시 제외 상태로 다시 계산한다", async () => {
    const view = mount();
    fireEvent.click(await screen.findByRole("button", { name: "leaf 제외" }));
    await screen.findByText("20");
    realtime.revision++;
    view.rerender(<DesktopCapacityPfWorkspace variant={variant} onBack={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(api.simulateProductionCapacity).toHaveBeenCalledTimes(2));
    await screen.findByText("20");
    const row = screen.getByText("leaf", { exact: true }).closest("li")!;
    expect(within(row).getByRole("button", { name: "leaf 복원" })).toBeInTheDocument();
  });

  it("동일 품목은 모두 함께 제외하고 버튼 키 입력으로 가지가 접히지 않는다", async () => {
    vi.mocked(api.getBOMTree).mockResolvedValue(leaf("pf", [leaf("top", [leaf("branch", [leaf("leaf")]), leaf("sibling", [leaf("leaf")])])]));
    mount();
    const branchButton = await screen.findByRole("button", { name: "branch 제외" });
    fireEvent.keyDown(branchButton, { key: "Enter" });
    expect(screen.getAllByRole("button", { name: "leaf 제외" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "leaf 제외" })[0]);
    expect(screen.getAllByRole("button", { name: "leaf 복원" })).toHaveLength(2);
    await screen.findByText("20");
  });
});
