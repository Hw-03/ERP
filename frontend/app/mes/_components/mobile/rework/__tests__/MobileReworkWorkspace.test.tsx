import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import type { AdjLineTemplate, BomTemplateResponse } from "@/lib/api/types/dept-adjustment";
import { MobileReworkWorkspace } from "../MobileReworkWorkspace";
import type { MobileReworkMemory } from "../useMobileReworkWorkspace";
import type { MobileReworkDecision } from "../mobileReworkModel";

vi.mock("@/lib/api/dept-adjustment", () => ({ deptAdjustmentApi: { getBomTemplate: vi.fn() } }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); disconnect = vi.fn(); }));
afterAll(() => vi.unstubAllGlobals());

function template(id: string, name: string, hasChildren = false, amount = 4): AdjLineTemplate {
  return { item_id: id, item_name: name, mes_code: `CODE-${id}`, quantity: amount, unit: "EA", department: "고압", has_children: hasChildren, bom_auto_token: `token-${id}` } as AdjLineTemplate;
}
const root = template("assembly", "히터트랜스포머", true);
const child = template("core", "T 코어");
const response = (...lines: AdjLineTemplate[]): BomTemplateResponse => ({ sub_type: "disassembly", lines });
let session = 0;

function Harness({ qty = 1, onConfirm = vi.fn(), visible = true, busy = false }: { qty?: number; onConfirm?: () => void; visible?: boolean; busy?: boolean }) {
  const [decisions, setDecisions] = useState<MobileReworkDecision[]>([]);
  const sessionRef = useRef<MobileReworkMemory | null>(null);
  return <>
    {visible && <MobileReworkWorkspace sessionId={`test-${session}`} parentItemId="target" parentItemName="재작업 대상" parentMesCode="TARGET" parentQty={qty} parentUnit="EA" reason="외관 불량" decisions={decisions} onChange={setDecisions} sessionRef={sessionRef} onBack={vi.fn()} onConfirm={onConfirm} busy={busy} canSubmit={decisions.length > 0} steps={["수량 조정", "구성품 처리"]} current={1} />}
    <output data-testid="decisions">{JSON.stringify(decisions)}</output>
  </>;
}

async function row(name: string) {
  return screen.findByRole("group", { name: `${name} 처리` });
}
function nodes(): MobileReworkDecision[] {
  return JSON.parse(screen.getByTestId("decisions").textContent!);
}
async function travel(delta: number): Promise<void> {
  await act(async () => { window.history.go(delta); await new Promise((resolve) => setTimeout(resolve, 50)); });
}
async function drill(name: string): Promise<void> {
  const button = within(await row(name)).getByRole("button", { name: "하위 펼쳐 처리" });
  await act(async () => { fireEvent.click(button); });
}

beforeEach(() => {
  vi.clearAllMocks();
  session += 1;
  window.history.replaceState({ defect: "cart", mode: "scrap", directAction: "rework", step: 4 }, "");
  vi.mocked(deptAdjustmentApi.getBomTemplate).mockImplementation(async (id) => id === "target" ? response(root) : response(child));
});

describe("mobile inline rework workspace", () => {
  it("edits normal quantity directly with the PC remainder rule", async () => {
    render(<Harness />);
    const item = within(await row("히터트랜스포머"));
    fireEvent.change(item.getByLabelText("폐기 수량"), { target: { value: "1" } });
    fireEvent.change(item.getByRole("spinbutton", { name: "정상 수량", exact: true }), { target: { value: "2" } });
    expect(nodes()[0]).toMatchObject({ normal_qty: 2, defective_qty: 1, scrap_qty: 1, keep_qty: 2, manuallySet: true });
    fireEvent.change(item.getByLabelText("정상 수량"), { target: { value: "4" } });
    expect(nodes()[0]).toMatchObject({ normal_qty: 4, defective_qty: 0, scrap_qty: 0 });
  });
  it("expands in place and submits edited children even when collapsed", async () => {
    render(<Harness />);
    const parent = within(await row("히터트랜스포머"));
    const historyLength = window.history.length;
    fireEvent.click(parent.getByRole("button", { name: "하위 펼쳐 처리" }));
    const childRow = within(await row("T 코어"));
    expect(await row("히터트랜스포머")).toBeInTheDocument();
    expect(childRow.getByText("2단계")).toBeInTheDocument();
    fireEvent.change(childRow.getByLabelText("폐기 수량"), { target: { value: "4" } });
    fireEvent.click(parent.getByRole("button", { name: "하위 접기" }));
    expect(screen.queryByRole("group", { name: "T 코어 처리" })).not.toBeInTheDocument();
    expect(parent.getByText(/숨겨진 처리 변경 1건/)).toBeInTheDocument();
    expect(window.history.length).toBe(historyLength);
    fireEvent.click(screen.getByRole("button", { name: "처리 결과 확인 →" }));
    expect(screen.getAllByTestId("rework-result-row")).toHaveLength(1);
    expect(within(await row("T 코어")).getByLabelText("폐기 수량")).toHaveValue(4);
    await travel(-1);
    expect(screen.queryByRole("group", { name: "T 코어 처리" })).not.toBeInTheDocument();
    fireEvent.click(within(await row("히터트랜스포머")).getByRole("button", { name: "하위 펼치기" }));
    expect(within(await row("T 코어")).getByLabelText("폐기 수량")).toHaveValue(4);
  });

  it("searches loaded descendants with their ancestors without changing saved expansion", async () => {
    render(<Harness />);
    const parent = within(await row("히터트랜스포머"));
    fireEvent.click(parent.getByRole("button", { name: "하위 펼쳐 처리" }));
    await row("T 코어");
    fireEvent.click(parent.getByRole("button", { name: "하위 접기" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "T 코어" } });
    expect(await row("T 코어")).toBeInTheDocument();
    expect(await row("히터트랜스포머")).toBeInTheDocument();
    expect(deptAdjustmentApi.getBomTemplate).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.queryByRole("group", { name: "T 코어 처리" })).not.toBeInTheDocument();
  });

  it("opens ten levels at full width and prevents an eleventh child request", async () => {
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockImplementation(async (id) => response(template(String(id === "target" ? 1 : Number(id) + 1), `${id === "target" ? 1 : Number(id) + 1}단계 품목`, true, 1)));
    render(<Harness />);
    for (let depth = 1; depth < 10; depth += 1) await drill(`${depth}단계 품목`);
    const last = within(await row("10단계 품목"));
    expect(screen.getAllByTestId("rework-item-row")).toHaveLength(10);
    expect(last.getByRole("button", { name: "하위 펼쳐 처리" })).toBeDisabled();
    expect(deptAdjustmentApi.getBomTemplate).toHaveBeenCalledTimes(10);
    fireEvent.change(last.getByLabelText("폐기 수량"), { target: { value: "1" } });
    fireEvent.click(within(await row("1단계 품목")).getByRole("button", { name: "하위 접기" }));
    fireEvent.click(screen.getByRole("button", { name: /처리 변경/ }));
    expect(screen.getAllByTestId("rework-item-row")).toHaveLength(10);
    const scrap = within(await row("10단계 품목")).getByLabelText("폐기 수량");
    act(() => scrap.focus());
    fireEvent.change(scrap, { target: { value: "0" } });
    expect(await row("10단계 품목")).toBeInTheDocument();
    act(() => screen.getByRole("searchbox").focus());
    expect(screen.queryByRole("group", { name: "10단계 품목 처리" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /전체 10/ }));
    expect(screen.getAllByTestId("rework-item-row")).toHaveLength(1);
  });

  it("normalizes old path history and skips consecutive duplicate list entries", async () => {
    window.history.pushState({ quantity: true }, "");
    window.history.pushState({ workspace: true }, "");
    render(<Harness />);
    await drill("히터트랜스포머");
    await row("T 코어");
    const state = window.history.state;
    const legacy = { ...state, mobileRework: { ...state.mobileRework, nav: { path: [0], review: false, depth: 1 } } };
    window.history.pushState(legacy, "");
    fireEvent.click(screen.getByRole("button", { name: "처리 결과 확인 →" }));
    await travel(-1);
    expect(await row("히터트랜스포머")).toBeInTheDocument();
    expect(await row("T 코어")).toBeInTheDocument();
    expect(window.history.state.mobileRework.nav.path).toEqual([]);
    await travel(-1);
    await waitFor(() => expect(window.history.state?.mobileRework?.key).not.toBe(state.mobileRework.key));
  });

  it("edits a single quantity and memo directly without a dialog or history entry", async () => {
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockResolvedValueOnce(response(template("single", "단일 부품", false, 1)));
    render(<Harness />);
    const item = within(await row("단일 부품"));
    const historyLength = window.history.length;
    fireEvent.change(item.getByLabelText("폐기 수량"), { target: { value: "1" } });
    fireEvent.change(item.getByLabelText("메모"), { target: { value: "끝단 손상" } });
    expect(nodes()[0]).toMatchObject({ normal_qty: 0, defective_qty: 0, scrap_qty: 1, reason_memo: "끝단 손상" });
    expect(item.getByLabelText("정상 수량")).toHaveValue(0);
    expect(item.queryByRole("button", { name: /정상|격리|폐기|수량 나누기/ })).not.toBeInTheDocument();
    expect(item.queryByText("자동")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.history.length).toBe(historyLength);
  });

  it("divides a single quantity into fractional results in the same row", async () => {
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockResolvedValueOnce(response(template("single", "단일 부품", false, 1)));
    render(<Harness />);
    const item = within(await row("단일 부품"));
    fireEvent.change(item.getByLabelText("격리 수량"), { target: { value: "0.25" } });
    fireEvent.change(item.getByLabelText("폐기 수량"), { target: { value: "0.5" } });
    expect(nodes()[0]).toMatchObject({ normal_qty: 0.25, defective_qty: 0.25, scrap_qty: 0.5 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps numeric focus and clamps scrap to the remaining quantity", async () => {
    render(<Harness />);
    const item = within(await row("히터트랜스포머"));
    const quarantine = item.getByLabelText("격리 수량");
    act(() => quarantine.focus());
    fireEvent.change(quarantine, { target: { value: "1" } });
    expect(quarantine).toHaveFocus();
    fireEvent.change(item.getByLabelText("폐기 수량"), { target: { value: "9" } });
    expect(nodes()[0]).toMatchObject({ normal_qty: 0, defective_qty: 1, scrap_qty: 3 });
    expect(item.getByLabelText("폐기 수량")).toHaveValue(3);
  });

  it("pins the focused row in the changed filter until focus leaves it", async () => {
    render(<Harness />);
    const element = await row("히터트랜스포머");
    const item = within(element);
    fireEvent.change(item.getByLabelText("폐기 수량"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "처리 변경 1" }));
    const normal = item.getByLabelText("폐기 수량");
    act(() => normal.focus());
    fireEvent.change(normal, { target: { value: "0" } });
    expect(element).toBeInTheDocument();
    act(() => screen.getByRole("searchbox").focus());
    expect(element).not.toBeInTheDocument();
    expect(screen.getByText("조건에 맞는 구성품이 없습니다.")).toBeInTheDocument();
  });

  it("keeps several branches open and identifies the same item by its path", async () => {
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockImplementation(async (id) => id === "target" ? response(root, template("other", "다른 조립품", true)) : response(child));
    render(<Harness />);
    await drill("히터트랜스포머");
    fireEvent.change(within(await row("T 코어")).getByLabelText("폐기 수량"), { target: { value: "4" } });
    await drill("다른 조립품");
    expect(screen.getAllByRole("group", { name: "T 코어 처리" })).toHaveLength(2);
    expect(nodes()[0].children![0].scrap_qty).toBe(4);
    expect(nodes()[1].children![0].scrap_qty).toBe(0);
    fireEvent.click(within(screen.getAllByRole("group", { name: "T 코어 처리" })[1]).getByRole("button", { name: "상위 · CODE-other" }));
    expect(await row("다른 조립품")).toHaveClass(/highlight/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("splits without confirmation, confirms whole changes and restores cached children", async () => {
    render(<Harness />);
    fireEvent.change(within(await row("히터트랜스포머")).getByLabelText("격리 수량"), { target: { value: "4" } });
    await drill("히터트랜스포머");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.change(within(await row("T 코어")).getByLabelText("격리 수량"), { target: { value: "0" } });
    fireEvent.change(within(await row("T 코어")).getByLabelText("폐기 수량"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "통째 처리로 변경" }));
    fireEvent.click(await screen.findByRole("button", { name: "통째 처리 적용" }));
    expect(within(await row("히터트랜스포머")).getByLabelText("격리 수량")).toHaveValue(4);
    await drill("히터트랜스포머");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(await row("T 코어")).getByLabelText("폐기 수량")).toHaveValue(4);
    expect(deptAdjustmentApi.getBomTemplate).toHaveBeenCalledTimes(2);
  });

  it("shows a child error only on the requesting row and retries without losing input", async () => {
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockResolvedValueOnce(response(root, child)).mockRejectedValueOnce(new Error("연결 실패")).mockResolvedValueOnce(response(child));
    render(<Harness />);
    await drill("히터트랜스포머");
    expect(await within(await row("히터트랜스포머")).findByRole("alert")).toHaveTextContent("연결 실패");
    expect(within(await row("T 코어")).queryByRole("alert")).not.toBeInTheDocument();
    expect(nodes()[0].nodeMode).not.toBe("split");
    fireEvent.click(within(await row("히터트랜스포머")).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getAllByRole("group", { name: "T 코어 처리" })).toHaveLength(2));
    expect(await row("히터트랜스포머")).toBeInTheDocument();
  });

  it("ignores a late response after the parent quantity changes", async () => {
    let resolveOld!: (value: BomTemplateResponse) => void;
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(response(template("new", "새 구성", false, 8)));
    const view = render(<Harness />);
    view.rerender(<Harness qty={2} />);
    expect(await row("새 구성")).toBeInTheDocument();
    await act(async () => resolveOld(response(root)));
    expect(screen.queryByRole("group", { name: "히터트랜스포머 처리" })).not.toBeInTheDocument();
  });

  it("ignores child responses after leaving the workspace", async () => {
    let resolveChild!: (value: BomTemplateResponse) => void;
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockResolvedValueOnce(response(root)).mockResolvedValueOnce(response(template("middle", "중간 조립품", true))).mockImplementationOnce(() => new Promise((resolve) => { resolveChild = resolve; }));
    const view = render(<Harness />);
    await drill("히터트랜스포머");
    await drill("중간 조립품");
    view.rerender(<Harness visible={false} />);
    await act(async () => resolveChild(response(child)));
    expect(nodes()[0].children![0].nodeMode).not.toBe("split");
    expect(screen.queryByRole("group", { name: "T 코어 처리" })).not.toBeInTheDocument();
  });

  it("restores list search and scroll after review and browser back/forward", async () => {
    render(<Harness />);
    await row("히터트랜스포머");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "히터" } });
    fireEvent.scroll(screen.getByTestId("rework-scroll"), { target: { scrollTop: 120 } });
    fireEvent.click(screen.getByRole("button", { name: "처리 결과 확인 →" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    await travel(-1);
    expect(screen.getByRole("searchbox")).toHaveValue("히터");
    expect(screen.getByTestId("rework-scroll").scrollTop).toBe(120);
    await travel(1);
    expect(screen.getByRole("button", { name: "재작업 실행 확인 →" })).toBeInTheDocument();
  });

  it("retains search, filter, scroll and edits across the quantity view", async () => {
    const view = render(<Harness />);
    fireEvent.change(within(await row("히터트랜스포머")).getByLabelText("폐기 수량"), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "히터" } });
    fireEvent.click(screen.getByRole("button", { name: "처리 변경 1" }));
    fireEvent.scroll(screen.getByTestId("rework-scroll"), { target: { scrollTop: 140 } });
    view.rerender(<Harness visible={false} />);
    view.rerender(<Harness />);
    expect(screen.getByRole("searchbox")).toHaveValue("히터");
    expect(screen.getByRole("button", { name: "처리 변경 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("rework-scroll").scrollTop).toBe(140);
    expect(nodes()[0].scrap_qty).toBe(4);
    expect(deptAdjustmentApi.getBomTemplate).toHaveBeenCalledTimes(1);
  });

  it("keeps individual edits when the inline basic allocation changes", async () => {
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockResolvedValueOnce(response(root, child));
    render(<Harness qty={4} />);
    fireEvent.change(within(await row("T 코어")).getByLabelText("폐기 수량"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("기본 정상 수량"), { target: { value: "1" } });
    expect(nodes()[0]).toMatchObject({ normal_qty: 1, defective_qty: 3, scrap_qty: 0 });
    expect(nodes()[1]).toMatchObject({ normal_qty: 0, defective_qty: 0, scrap_qty: 4 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("retries a root error and leaves an empty child BOM in whole mode", async () => {
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockRejectedValueOnce(new Error("목록 조회 실패")).mockResolvedValueOnce(response(root)).mockResolvedValueOnce(response());
    render(<Harness />);
    expect(await screen.findByText("목록 조회 실패")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await drill("히터트랜스포머");
    expect(await screen.findByText(/하위 구성품이 없습니다/)).toBeInTheDocument();
    expect(nodes()[0].children).toBeNull();
  });

  it("edits the reviewed effective leaf and disables inputs while submitting", async () => {
    const onConfirm = vi.fn();
    const view = render(<Harness onConfirm={onConfirm} />);
    await drill("히터트랜스포머");
    await row("T 코어");
    fireEvent.click(screen.getByRole("button", { name: "처리 결과 확인 →" }));
    const result = screen.getByTestId("rework-result-row");
    expect(result).toHaveTextContent("재작업 대상 › 히터트랜스포머");
    fireEvent.change(within(result).getByLabelText("격리 수량"), { target: { value: "4" } });
    expect(nodes()[0].children![0].defective_qty).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "재작업 실행 확인 →" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    view.rerender(<Harness onConfirm={onConfirm} busy />);
    expect(screen.getByRole("button", { name: "처리 중..." })).toBeDisabled();
    expect(within(result).getByLabelText("폐기 수량")).toBeDisabled();
  });

  it("restores nested expansion after switching a branch to whole and back", async () => {
    vi.mocked(deptAdjustmentApi.getBomTemplate).mockImplementation(async (id) => id === "target" ? response(root) : id === "assembly" ? response(template("middle", "중간 조립품", true)) : response(child));
    render(<Harness />);
    await drill("히터트랜스포머");
    await drill("중간 조립품");
    await row("T 코어");
    fireEvent.click(within(await row("히터트랜스포머")).getByRole("button", { name: "통째 처리로 변경" }));
    fireEvent.click(await screen.findByRole("button", { name: "통째 처리 적용" }));
    expect(screen.queryByRole("group", { name: "T 코어 처리" })).not.toBeInTheDocument();
    await drill("히터트랜스포머");
    expect(await row("중간 조립품")).toBeInTheDocument();
    expect(await row("T 코어")).toBeInTheDocument();
  });

  it("normalizes legacy sheet history into a list without opening a dialog", async () => {
    render(<Harness />);
    await row("히터트랜스포머");
    const state = window.history.state;
    const legacy = { ...state, mobileRework: { ...state.mobileRework, nav: { path: [], review: false, editor: [0], overlay: "edit", depth: 1 } } };
    window.history.pushState(legacy, "");
    fireEvent.popState(window, { state: legacy });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await drill("히터트랜스포머");
    await row("T 코어");
    expect(await row("히터트랜스포머")).toBeInTheDocument();
    expect(window.history.state.mobileRework.nav).not.toHaveProperty("overlay");
  });
});
