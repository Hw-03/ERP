import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { costNumber, CostStatusBadge, CostSummaryContent } from "../CostSummaryCard";
import { CostTree, CostIssues } from "../CostAnalysisPanel";
import type { CostNode, ItemCost } from "@/lib/api/types/cost";

vi.mock("../../DepartmentsContext", () => ({ useDeptColorLookup: () => () => "var(--c-blue)" }));

const node = (id: string, children: CostNode[] = []): CostNode => ({
  item_id: id, mes_code: id, item_name: `품목 ${id}`, quantity_per_parent: "1",
  required_quantity: "1", material_cost: "0", own_labor_cost: "0", labor_cost: "0",
  unit_cost: "0", amount: "0", status: "complete", issues: [], children,
});
const cost = (patch: Partial<ItemCost> = {}): ItemCost => ({
  item_id: "root", process_type_code: "AA", currency: "KRW", basis: "management_standard", can_edit: false,
  standards: { standard_purchase_price: null, purchase_price_effective_date: null, standard_work_minutes: null },
  hourly_labor_rate: null, material_cost: "0", labor_cost: "0", unit_cost: "0",
  status: "complete", issues: [], tree: node("root"), ...patch,
});

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    disconnect(): void {}
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("관리 기준 원가", () => {
  it.each([
    { codes: ["missing_work_minutes", "missing_hourly_rate", "missing_work_minutes"], labels: ["인건비 미등록"] },
    { codes: ["missing_price"], labels: ["자재 단가 미등록"] },
    { codes: ["missing_price", "missing_work_minutes"], labels: ["자재 단가 미등록", "인건비 미등록"] },
    { codes: ["missing_bom", "incomplete_child_bom"], labels: ["BOM 미등록", "BOM 등록 미완료"] },
    { codes: ["cycle", "unit_mismatch"], labels: ["BOM 순환 참조", "단위 불일치"] },
  ])("누락 이유를 중복 없이 표시한다: $codes", ({ codes, labels }) => {
    render(<CostStatusBadge status="partial" issues={codes.map(code => ({ code, item_id: "root", path: ["root"] }))} />);
    for (const label of labels) expect(screen.getAllByText(label)).toHaveLength(1);
    expect(screen.queryByText("미완성")).not.toBeInTheDocument();
  });
  it("계산할 금액이 없어도 누락 이유를 표시하고 완료 원가에는 배지를 표시하지 않는다", () => {
    const issues = [{ code: "missing_price", item_id: "raw", path: ["raw"] }];
    const view = render(<CostStatusBadge status="unavailable" issues={issues} />);
    expect(screen.getByText("자재 단가 미등록")).toBeInTheDocument();
    expect(screen.queryByText("인건비 미등록")).not.toBeInTheDocument();
    view.rerender(<CostStatusBadge status="complete" issues={[]} />);
    expect(view.container).toBeEmptyDOMElement();
  });
  it("가계도에도 하위 경로에서 올라온 인건비 누락 이유를 표시한다", () => {
    const root = { ...node("root", [node("child")]), status: "partial" as const, issues: [{ code: "missing_work_minutes", item_id: "child", path: ["root", "child"] }] };
    render(<CostTree root={root} />);
    expect(screen.getByText("인건비 미등록")).toBeInTheDocument();
    expect(screen.queryByText("미완성")).not.toBeInTheDocument();
  });
  it("큰 누적 소요량을 금액과 같은 정확한 정수로 표시한다", () => {
    render(<CostTree root={{ ...node("root"), required_quantity: "994014980014994001", amount: "994014980014994001.00" }} />);
    fireEvent.click(screen.getByRole("button", { name: "품목 root 비용 상세 펼치기" }));
    expect(screen.getByText("소요량").nextElementSibling).toHaveTextContent("994,014,980,014,994,001");
    expect(screen.getByRole("button", { name: "품목 root 비용 상세 접기" })).toHaveTextContent("994,014,980,014,994,001 원");
  });
  it("큰 금액의 소수 두 자리를 잃지 않고 표시한다", () => {
    expect(costNumber("9007199254740991.01")).toBe("9,007,199,254,740,991.01");
    expect(costNumber("1234.50")).toBe("1,234.50");
    expect(costNumber("1110.00")).toBe("1,110");
  });
  it("하위 품목과 상위 원가 차이를 단계 인건비 행으로 표시한다", () => {
    render(<CostTree root={{ ...node("root"), own_labor_cost: "300.00" }} />);
    fireEvent.click(screen.getByRole("button", { name: "품목 root 비용 상세 펼치기" }));
    expect(screen.getByText("단계 인건비").nextElementSibling).toHaveTextContent("300 원");
    expect(screen.queryByText("이 단계 인건비 300 원 포함")).not.toBeInTheDocument();
  });
  it("기본에는 비용만 표시하고 카드별 상세와 하위 품목 펼침을 독립적으로 유지한다", () => {
    render(<CostTree root={node("root", [node("child")])} />);
    const amounts = screen.getAllByRole("button", { name: /비용 상세 펼치기$/ });
    expect(amounts).toHaveLength(2);
    amounts.forEach(button => expect(button).toHaveTextContent("0 원"));
    expect(screen.queryByText("합계")).not.toBeInTheDocument();
    expect(screen.queryByText("개당 원가")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "품목 root 비용 상세 펼치기" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("개당 원가")).toHaveLength(1);
    expect(screen.getByText("소요량")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "품목 child 비용 상세 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("품목 child")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("개당 원가")).not.toBeInTheDocument();
    expect(screen.getByText("품목 child")).toBeInTheDocument();
  });
  it("비용 구성은 처음에 접혀 있고 펼치면 재료비·누적 인건비를 보여준다", () => {
    render(<CostSummaryContent cost={cost()} onOpen={vi.fn()} />);
    expect(screen.queryByText("재료비")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "비용 구성 펼치기" }));
    expect(screen.getByText("재료비")).toBeInTheDocument();
    expect(screen.getByText("누적 인건비")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원가 분석 펼치기" })).toBeInTheDocument();
  });
  it("빠진 기준값의 원인과 품목 경로를 읽을 수 있는 이름으로 안내한다", () => {
    const tree = node("root", [node("child")]);
    render(<CostIssues root={tree} issues={[{ item_id: "child", path: ["root", "child"], code: "unit_mismatch" }, { item_id: "root", path: ["root"], code: "incomplete_child_bom" }]} />);
    expect(screen.getByText("BOM 수량 단위가 품목 단위와 다릅니다.")).toBeInTheDocument();
    expect(screen.getByText("BOM 완료 표시가 필요합니다.")).toBeInTheDocument();
    expect(screen.getByText("품목 root → 품목 child")).toBeInTheDocument();
  });
  it("확정된 0원과 정보가 없는 값을 구분한다", () => {
    const { rerender } = render(<CostSummaryContent cost={cost()} onOpen={vi.fn()} />);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    rerender(<CostSummaryContent cost={cost({ material_cost: null, labor_cost: null, unit_cost: null, status: "unavailable" })} onOpen={vi.fn()} />);
    expect(screen.getAllByText("정보 없음").length).toBeGreaterThan(0);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("인건비 미등록 원가는 부분 합계로 안내하며 편집 권한이 없으면 수정 버튼을 숨긴다", () => {
    render(<CostSummaryContent cost={cost({ status: "partial", unit_cost: "1200", issues: [{ code: "missing_work_minutes", item_id: "root", path: ["root"] }] })} onOpen={vi.fn()} />);
    expect(screen.getByText("인건비 미등록")).toBeInTheDocument();
    expect(screen.getByText("부분 합계")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "기준값 수정" })).not.toBeInTheDocument();
  });

  it("모든 가지를 미리 펼치고 반복 품목의 접힘은 독립적으로 유지한다", () => {
    const sharedA = node("shared", [node("leaf-a")]);
    const sharedB = node("shared", [node("leaf-b")]);
    render(<CostTree root={node("root", [node("a", [sharedA]), node("b", [sharedB])])} />);
    expect(screen.getByText("품목 a")).toBeInTheDocument();
    expect(screen.getAllByText("품목 shared")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "품목 shared 하위 품목 접기" })[1]);
    expect(screen.getByText("품목 leaf-a")).toBeInTheDocument();
    expect(screen.queryByText("품목 leaf-b")).not.toBeInTheDocument();
  });
});
