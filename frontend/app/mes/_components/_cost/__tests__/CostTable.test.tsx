import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CostNode, ItemCost } from "@/lib/api/types/cost";
import { CostAnalysisPanel, CostViews } from "../CostAnalysisPanel";

vi.mock("../../DepartmentsContext", () => ({ useDeptColorLookup: () => () => "var(--c-blue)" }));

const query = vi.hoisted(() => ({ data: null as ItemCost | null }));
vi.mock("@/lib/queries/useCostQuery", () => ({
  useCostActor: () => ({ employee_id: "employee", token: "token" }),
  useCostQuery: (itemId: string) => ({ data: query.data ? { ...query.data, item_id: itemId } : null, isError: false }),
}));

function node(id: string, children: CostNode[] = [], patch: Partial<CostNode> = {}): CostNode {
  return { item_id: id, item_name: `품목 ${id}`, mes_code: `CODE-${id}`, children,
    quantity_per_parent: "1", required_quantity: "1", material_cost: "0", own_labor_cost: "0",
    labor_cost: "0", unit_cost: "0", amount: "0", status: "complete", issues: [], ...patch };
}

function openTable(): HTMLElement {
  fireEvent.click(screen.getByRole("tab", { name: "표" }));
  return screen.getByRole("table", { name: "BOM 원가 표" });
}

const resizeCallbacks: ResizeObserverCallback[] = [];
let hiddenCanvas = false;
beforeEach(() => {
  query.data = { item_id: "root", process_type_code: "AA", currency: "KRW", basis: "management_standard", can_edit: false,
    standards: { standard_purchase_price: null, purchase_price_effective_date: null, standard_work_minutes: null },
    hourly_labor_rate: null, material_cost: "123", labor_cost: "45", unit_cost: "168", status: "complete", issues: [],
    tree: node("root", [node("a", [node("shared", [node("leaf-a")])]), node("b", [node("shared", [node("leaf-b")])])]) };
  resizeCallbacks.length = 0;
  hiddenCanvas = false;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => hiddenCanvas ? 0 : 800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => hiddenCanvas ? 0 : 600);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => hiddenCanvas ? 0 : 1200);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => hiddenCanvas ? 0 : 800);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe(): void {}
    disconnect(): void {}
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("원가 계층형 표", () => {
  it("시뮬레이션 변수는 가계도·표의 기존 조절 버튼 왼쪽에만 표시한다", () => {
    render(<CostViews root={node("root")} canEdit information={<p>정보 입력</p>} simulationControls={<input aria-label="시뮬레이션 시급" />} />);
    const tree = screen.getByRole("tabpanel", { name: "가계도" });
    const rate = within(tree).getByLabelText("시뮬레이션 시급");
    expect(rate.compareDocumentPosition(within(tree).getByRole("button", { name: "모두 펼치기" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "표" }));
    const table = screen.getByRole("tabpanel", { name: "표" });
    expect(within(table).getByLabelText("시뮬레이션 시급").compareDocumentPosition(within(table).getByRole("button", { name: "모두 펼치기" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    expect(screen.queryByLabelText("시뮬레이션 시급")).not.toBeInTheDocument();
  });
  it("가계도 전체 펼침은 같은 품목의 각 경로를 열고 비용 상세 상태를 유지한다", () => {
    render(<CostViews root={query.data!.tree} canEdit={false} />);
    const tree = screen.getByRole("tabpanel", { name: "가계도" });
    fireEvent.click(within(tree).getByRole("button", { name: "품목 root 비용 상세 펼치기" }));
    fireEvent.click(within(tree).getByRole("button", { name: "모두 펼치기" }));
    expect(within(tree).getByText("품목 leaf-a")).toBeVisible();
    expect(within(tree).getByText("품목 leaf-b")).toBeVisible();
    fireEvent.click(within(tree).getByRole("button", { name: "모두 접기" }));
    expect(within(tree).queryByText("품목 a")).not.toBeInTheDocument();
    expect(within(tree).getByRole("button", { name: "품목 root 비용 상세 접기" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(tree).getByRole("button", { name: "모두 펼치기" }));
    expect(within(tree).getAllByText("품목 shared")).toHaveLength(2);
  });
  it("정보 탭을 다녀와도 표의 접힘과 스크롤 요소를 유지한다", () => {
    render(<CostViews root={node("root", [node("a", [node("leaf")])])} canEdit information={<p>정보 입력</p>} />);
    const table = openTable();
    fireEvent.click(within(table).getByRole("button", { name: "품목 a 하위 품목 접기" }));
    const scroll = screen.getByRole("region", { name: "BOM 원가 표 스크롤" });
    scroll.scrollTop = 80;
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    expect(screen.getByText("정보 입력")).toBeVisible();
    openTable();
    expect(screen.getByRole("region", { name: "BOM 원가 표 스크롤" })).toBe(scroll);
    expect(scroll.scrollTop).toBe(80);
    expect(within(table).queryByText("품목 leaf")).not.toBeInTheDocument();
  });
  it("권한 있는 사용자만 첫 번째 정보 탭을 보고, 권한이 사라지면 내용도 닫힌다", () => {
    const info = <p>구매 정보 입력</p>;
    const view = render(<CostViews root={node("root")} canEdit={false} information={info} />);
    expect(screen.queryByRole("tab", { name: "정보" })).not.toBeInTheDocument();
    expect(screen.queryByText("구매 정보 입력")).not.toBeInTheDocument();
    view.rerender(<CostViews root={node("root")} canEdit information={info} />);
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["정보", "가계도", "표"]);
    expect(screen.getByRole("tab", { name: "가계도" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "가계도" }), { key: "Home" });
    expect(screen.getByRole("tab", { name: "정보" })).toHaveFocus();
    expect(screen.getByText("구매 정보 입력")).toBeVisible();
    view.rerender(<CostViews root={node("root")} canEdit={false} information={info} />);
    expect(screen.queryByText("구매 정보 입력")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "가계도" })).toHaveAttribute("aria-selected", "true");
  });

  it("정보 탭 전환은 미저장 확인을 거치고 저장 중에는 전환하지 않는다", () => {
    const actions: (() => void)[] = [];
    const guard = (action: () => void): void => { actions.push(action); };
    const view = render(<CostViews root={node("root")} canEdit information={<p>정보 폼</p>} beforeViewChange={guard} />);
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    expect(screen.queryByText("정보 폼")).not.toBeInTheDocument();
    act(() => actions[0]());
    expect(screen.getByText("정보 폼")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "표" }));
    expect(screen.getByText("정보 폼")).toBeVisible();
    act(() => actions[1]());
    expect(screen.queryByText("정보 폼")).not.toBeInTheDocument();
    view.rerender(<CostViews root={node("root")} canEdit information={<p>정보 폼</p>} beforeViewChange={guard} navigationDisabled />);
    expect(screen.getByRole("tab", { name: "정보" })).toBeDisabled();
  });
  it("개당 원가에 포함된 해당 단계 인건비를 전용 열로 표시한다", () => {
    query.data!.tree = node("root", [], { own_labor_cost: "3000.00", labor_cost: "9000.00", unit_cost: "12000.00", amount: "12000.00" });
    render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    const table = openTable();
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["품목명", "품목코드", "소요량", "개당 원가", "단계 인건비", "합계"]);
    const cells = within(within(table).getByText("품목 root").closest("tr")!).getAllByRole("cell");
    expect(cells[4]).toHaveTextContent("3,000 원");
    expect(cells[3]).toHaveTextContent("12,000 원");
    expect(within(table).queryByText(/이 단계 인건비/)).not.toBeInTheDocument();
    expect(cells[5]).toHaveTextContent("12,000 원");
  });
  it("단계 인건비가 0원인 같은 합계만 생략하고 수량으로 달라진 금액은 유지한다", () => {
    query.data!.tree = node("root", [node("multiple", [], { required_quantity: "2", unit_cost: "100.00", amount: "200.00", own_labor_cost: "0.00" })], { unit_cost: "100.00", amount: "100.00" });
    render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    const table = openTable();
    const rootCells = within(within(table).getByText("품목 root").closest("tr")!).getAllByRole("cell");
    const childCells = within(within(table).getByText("품목 multiple").closest("tr")!).getAllByRole("cell");
    expect(rootCells[5]).toHaveTextContent("—");
    expect(childCells[4]).toHaveTextContent("—");
    expect(childCells[5]).toHaveTextContent("200 원");
  });
  it("가계도를 기본으로 보여주고 표에 처음 들어가면 모든 경로를 펼친다", () => {
    render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "가계도" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const table = openTable();
    expect(within(table).getByText("품목 leaf-a")).toBeInTheDocument();
    expect(within(table).getByText("품목 leaf-b")).toBeInTheDocument();
    for (const heading of ["품목명", "품목코드", "소요량", "개당 원가", "합계"]) {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
  });

  it("모두 접기·펼치기와 같은 품목의 경로별 접기를 독립적으로 적용한다", () => {
    render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    const table = openTable();
    fireEvent.click(within(table).getAllByRole("button", { name: "품목 shared 하위 품목 접기" })[0]);
    expect(within(table).queryByText("품목 leaf-a")).not.toBeInTheDocument();
    expect(within(table).getByText("품목 leaf-b")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "모두 펼치기" }));
    expect(within(table).getByText("품목 leaf-a")).toBeInTheDocument();
    expect(within(table).getByText("품목 leaf-b")).toBeInTheDocument();
  });

  it("0원·정보 없음과 큰 소요량·금액을 정확히 표시하고 상태·단계 인건비를 안내한다", () => {
    query.data!.tree = node("root", [node("zero"), node("missing", [], { unit_cost: null, amount: null, own_labor_cost: null, status: "unavailable", issues: [{ code: "missing_price", item_id: "missing", path: ["root", "missing"] }] }),
      node("large", [], { required_quantity: "994014980014994001", unit_cost: "9007199254740991.01", amount: "994014980014994001.25", own_labor_cost: "300.00", status: "partial", issues: [{ code: "missing_work_minutes", item_id: "child", path: ["root", "large", "child"] }] })]);
    render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    const table = openTable();
    const zero = within(table).getByText("품목 zero").closest("tr")!;
    expect(within(zero).getAllByText("—")).toHaveLength(3);
    expect(within(zero).queryByText("0 원")).not.toBeInTheDocument();
    const missing = within(table).getByText("품목 missing").closest("tr")!;
    expect(within(missing).getAllByText("정보 없음")).toHaveLength(2);
    expect(within(missing).getByText("자재 단가 미등록")).toBeInTheDocument();
    expect(within(missing).getAllByRole("cell")[4]).toHaveTextContent("미등록");
    expect(within(table).getByText("994,014,980,014,994,001")).toBeInTheDocument();
    expect(within(table).getByText("9,007,199,254,740,991.01 원")).toBeInTheDocument();
    expect(within(table).getByText("994,014,980,014,994,001.25 원")).toBeInTheDocument();
    expect(within(table).getByText("인건비 미등록")).toBeInTheDocument();
    expect(within(table).getByText("300 원")).toBeInTheDocument();
    expect(screen.getByText("168")).toBeInTheDocument();
  });

  it("담당자에게도 표·가계도·이전 패널의 기준값 바로가기를 표시하지 않는다", () => {
    const { rerender } = render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    let table = openTable();
    expect(within(table).queryByRole("button", { name: /기준값 수정/ })).not.toBeInTheDocument();
    query.data = { ...query.data!, can_edit: true };
    rerender(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    table = screen.getByRole("table", { name: "BOM 원가 표" });
    expect(within(table).queryByRole("button", { name: /기준값/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "가계도" }));
    expect(screen.queryByRole("button", { name: /기준값/ })).not.toBeInTheDocument();
  });

  it("탭을 왕복해도 가계도 배율·위치와 표의 펼침·스크롤을 보존한다", () => {
    render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    const treeScroll = screen.getByRole("group", { name: "품목 원가 가계도" });
    fireEvent.click(screen.getByRole("button", { name: "가계도 확대" }));
    fireEvent.keyDown(treeScroll, { key: "ArrowLeft" });
    fireEvent.keyDown(treeScroll, { key: "ArrowUp" });
    const content = screen.getByTestId("cost-tree-content");
    const camera = content.style.transform;
    expect(screen.getByLabelText("가계도 배율")).toHaveTextContent("120%");
    const table = openTable();
    hiddenCanvas = true;
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    fireEvent.click(within(table).getByRole("button", { name: "품목 a 하위 품목 접기" }));
    const scroll = screen.getByRole("region", { name: "BOM 원가 표 스크롤" });
    scroll.scrollTop = 160;
    scroll.scrollLeft = 80;
    hiddenCanvas = false;
    fireEvent.click(screen.getByRole("tab", { name: "가계도" }));
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    expect(screen.getByTestId("cost-tree-content")).toBe(content);
    expect(content.style.transform).toBe(camera);
    expect(treeScroll.scrollTop).toBe(0);
    expect(treeScroll.scrollLeft).toBe(0);
    openTable();
    expect(within(table).queryByText("품목 leaf-a")).not.toBeInTheDocument();
    expect(within(table).getByText("품목 leaf-b")).toBeInTheDocument();
    expect(scroll.scrollTop).toBe(160);
    expect(scroll.scrollLeft).toBe(80);
  });

  it("선택 품목이 바뀌면 기본 가계도와 새 표 펼침 상태로 시작한다", () => {
    const { rerender } = render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    openTable();
    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    query.data = { ...query.data!, item_id: "next", tree: node("next", [node("next-child")]) };
    rerender(<CostAnalysisPanel itemId="next" onCollapse={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "가계도" })).toHaveAttribute("aria-selected", "true");
    expect(within(openTable()).getByText("품목 next-child")).toBeInTheDocument();
  });

  it("방향키로 탭과 포커스를 옮기고 각 패널을 연결한다", () => {
    render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    let treeTab = screen.getByRole("tab", { name: "가계도" });
    fireEvent.keyDown(treeTab, { key: "ArrowRight" });
    const tableTab = screen.getByRole("tab", { name: "표" });
    expect(tableTab).toHaveFocus();
    expect(tableTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "표" })).toHaveAttribute("id", tableTab.getAttribute("aria-controls"));
    fireEvent.keyDown(tableTab, { key: "Home" });
    treeTab = screen.getByRole("tab", { name: "가계도" });
    expect(treeTab).toHaveFocus();
    expect(treeTab).toHaveAttribute("aria-selected", "true");
  });

  it("검수 환경에서만 BOM 참고 단가 배지를 표시한다", () => {
    vi.stubEnv("NEXT_PUBLIC_COST_PREVIEW", "1");
    const { unmount } = render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    expect(screen.getByText("BOM 참고 단가 · 검수용")).toBeInTheDocument();
    unmount();
    vi.stubEnv("NEXT_PUBLIC_COST_PREVIEW", "0");
    render(<CostAnalysisPanel itemId="root" onCollapse={vi.fn()} />);
    expect(screen.queryByText("BOM 참고 단가 · 검수용")).not.toBeInTheDocument();
  });
});
