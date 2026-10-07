import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileDefectCartFlow } from "../../screens/MobileDefectCartFlow";
import { MobileDefectProcessPanel } from "../../screens/MobileDefectProcessPanel";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { defectsApi } from "@/lib/api/defects";
import type { AdjLineTemplate } from "@/lib/api/types/dept-adjustment";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Item } from "../../../_warehouse_v2/types";

vi.mock("@/lib/api/dept-adjustment", () => ({ deptAdjustmentApi: { getBomTemplate: vi.fn() } }));
vi.mock("@/lib/api/stock-requests", () => ({ stockRequestsApi: { createStockRequest: vi.fn() } }));
vi.mock("@/lib/api/defects", () => ({ defectsApi: { listReasonCategories: vi.fn() } }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); disconnect = vi.fn(); }));
afterAll(() => vi.unstubAllGlobals());
vi.mock("../../../_defect_hub/DefectItemPicker", () => ({
  DefectItemPicker: ({ onAdd }: { onAdd: (item: Item) => void }) => <button onClick={() => onAdd({ item_id: "target", item_name: "대상 품목", mes_code: "6-HA-0014", process_type_code: "HA", has_bom: true, quantity: 30, locations: [{ department: "고압", status: "PRODUCTION", quantity: 30, pending_quantity: 0, available_quantity: 30 }], unit: "EA" } as Item)}>대상 선택</button>,
}));

const employee = { employee_id: "employee", name: "작업자", department: "고압" };
const location = { record_id: "record", item_id: "target", item_name: "대상 품목", mes_code: "6-HA-0014", department: "고압", quantity: 3, available_quantity: 3, has_bom: true } as DefectLocation;
function line(id: string, amount: number, hasChildren = false): AdjLineTemplate {
  return { item_id: id, item_name: id === "assembly" ? "조립품" : "반복 구성품", mes_code: id, quantity: amount, unit: "EA", department: "고압", has_children: hasChildren, bom_auto_token: `${id}:${amount}` } as AdjLineTemplate;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defectsApi.listReasonCategories).mockResolvedValue([{ category_id: "surface-id", name: "외관 불량", is_active: true, is_other: false }]);
  window.history.replaceState(null, "");
  vi.mocked(deptAdjustmentApi.getBomTemplate).mockImplementation(async (id) => ({ sub_type: "disassembly", lines: id === "target" ? [line("assembly", 3, true), line("repeat", 3)] : [line("repeat", 6)] }));
});

describe("mobile rework submission", () => {
  it.each(["immediate", "quarantine"] as const)("%s review and real payload contain the same separate paths and quantities", async (entry) => {
    let resolveSubmit!: () => void;
    vi.mocked(stockRequestsApi.createStockRequest).mockImplementation(() => new Promise((resolve) => { resolveSubmit = () => resolve({} as never); }));
    const onDone = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}>{entry === "immediate" ? <MobileDefectCartFlow mode="scrap" initialAction="rework" items={[]} productModels={[]} currentEmployee={employee} onDone={onDone} onCancel={vi.fn()} /> : <MobileDefectProcessPanel location={location} currentEmployee={employee} onDone={onDone} onCancel={vi.fn()} />}</QueryClientProvider>);
    if (entry === "immediate") {
      fireEvent.click(screen.getByRole("button", { name: "대상 선택" }));
      fireEvent.click(screen.getByRole("button", { name: "수량 조정 (1건) →" }));
      fireEvent.change(screen.getByRole("spinbutton", { name: "수량" }), { target: { value: "3" } });
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "외관 확인" } });
      fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
      fireEvent.click(await screen.findByRole("button", { name: "외관 불량", exact: true }));
      fireEvent.click(screen.getByRole("button", { name: "BOM 확인 →" }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "재작업", exact: true }));
      fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
      fireEvent.click(await screen.findByRole("button", { name: "외관 불량", exact: true }));
      fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    }
    const assembly = within(await screen.findByRole("group", { name: "조립품 처리" }));
    fireEvent.click(assembly.getByRole("button", { name: "하위 펼쳐 처리" }));
    await waitFor(() => expect(screen.getAllByRole("group", { name: "반복 구성품 처리" })).toHaveLength(2));
    const item = within(screen.getAllByRole("group", { name: "반복 구성품 처리" })[0]);
    fireEvent.change(item.getByLabelText("격리 수량"), { target: { value: "1" } });
    fireEvent.change(item.getByLabelText("폐기 수량"), { target: { value: "2" } });
    fireEvent.change(item.getByLabelText("메모"), { target: { value: "끝단 손상" } });
    fireEvent.click(assembly.getByRole("button", { name: "하위 접기" }));
    fireEvent.click(screen.getByRole("button", { name: "처리 결과 확인 →" }));
    const rows = screen.getAllByTestId("rework-result-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("조립품");
    expect(within(rows[0]).getByLabelText("정상 수량")).toHaveValue(3);
    expect(within(rows[0]).getByLabelText("격리 수량")).toHaveValue(1);
    expect(within(rows[0]).getByLabelText("폐기 수량")).toHaveValue(2);
    expect(within(rows[0]).getByLabelText("메모")).toHaveValue("끝단 손상");
    expect(within(rows[1]).getByLabelText("정상 수량")).toHaveValue(3);
    expect(within(rows[1]).getByLabelText("격리 수량")).toHaveValue(0);
    expect(within(rows[1]).getByLabelText("폐기 수량")).toHaveValue(0);
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(screen.getByRole("heading", { name: "구성품 처리" })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "반복 구성품 처리" })).toHaveLength(1);
    fireEvent.click(within(screen.getByRole("group", { name: "조립품 처리" })).getByRole("button", { name: "하위 펼치기" }));
    expect(within(screen.getAllByRole("group", { name: "반복 구성품 처리" })[0]).getByLabelText("메모")).toHaveValue("끝단 손상");
    await act(async () => { window.history.forward(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(screen.getAllByTestId("rework-result-row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "재작업 실행 확인 →" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "즉시 재작업", exact: true }));
    await waitFor(() => expect(stockRequestsApi.createStockRequest).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "처리 중..." })).toBeDisabled();
    const payload = vi.mocked(stockRequestsApi.createStockRequest).mock.calls[0][0];
    expect(payload.request_type).toBe(entry === "immediate" ? "rework_normal" : "defect_disassemble");
    expect(payload.lines[0]).toMatchObject({ item_id: "target", quantity: 3, from_bucket: entry === "immediate" ? "production" : "defective", to_bucket: "none" });
    expect(JSON.parse(payload.notes!)).toEqual({ child_decisions: [
      { item_id: "assembly", qty: 3, bom_auto_token: "assembly:3", children: [{ item_id: "repeat", qty: 6, bom_auto_token: "repeat:6", normal_qty: 3, defective_qty: 1, scrap_qty: 2, reason_memo: "끝단 손상" }] },
      { item_id: "repeat", qty: 3, bom_auto_token: "repeat:3", normal_qty: 3, defective_qty: 0, scrap_qty: 0, reason_memo: null },
    ] });
    await act(async () => resolveSubmit());
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
