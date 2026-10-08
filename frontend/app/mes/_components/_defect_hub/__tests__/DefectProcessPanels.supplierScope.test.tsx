import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DefectLocation } from "@/lib/api/types/defects";
import { DefectProcessPanel } from "../DefectProcessPanel";
import { MobileDefectProcessPanel } from "../../mobile/screens/MobileDefectProcessPanel";

const mocks = vi.hoisted(() => ({ listSuppliers: vi.fn(), createStockRequest: vi.fn(), unquarantine: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { listSuppliers: mocks.listSuppliers } }));
vi.mock("@/lib/api/defects", () => ({ defectsApi: { unquarantine: mocks.unquarantine } }));
vi.mock("@/lib/api/stock-requests", () => ({ stockRequestsApi: { createStockRequest: mocks.createStockRequest } }));
vi.mock("../ReasonFormFields", async () => ({ ReasonFormFields: (await import("./reasonFormFieldsStub")).ReasonFormFieldsStub }));
vi.mock("../DisassembleTree", () => ({ DisassembleTree: () => null, toServerDecision: (value: unknown) => value, validateDecisionTree: () => true }));
vi.mock("../../mobile/rework/MobileReworkWorkspace", () => ({ MobileReworkWorkspace: () => null }));

const employee = { employee_id: "actor-1", name: "직원", department: "조립" };
const location: DefectLocation = {
  record_id: "record-1", item_id: "tr-1", item_name: "튜브 원자재", mes_code: "TR-1",
  department: "튜브", process_type_code: "TR", return_supplier_scope: "tube", quantity: 2, original_quantity: 2,
  available_quantity: 2, pending_quantity: 0, defective_at: null,
  is_legacy: false, legacy_origin: null, has_bom: false,
};

function chooseReturn(): void {
  fireEvent.click(screen.getByRole("button", { name: /^반품/ }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "외관 불량" } });
  fireEvent.click(screen.getByRole("button", { name: "공급업체 선택 →" }));
}

describe.each([["desktop", DefectProcessPanel], ["mobile", MobileDefectProcessPanel]] as const)("%s 불량 반품 범위", (_variant, Panel) => {
  beforeEach(() => {
    mocks.listSuppliers.mockReset().mockImplementation((_id: string, _inactive: boolean, scope: string) => Promise.resolve([{ supplier_id: "supplier-1", name: "반품 업체", scope, is_active: true, created_at: "", updated_at: "" }]));
    mocks.createStockRequest.mockReset().mockResolvedValue(undefined);
    mocks.unquarantine.mockReset().mockResolvedValue(undefined);
  });

  it("실제 격리 부서와 TR 코드로 튜브 업체를 고르고 요청한다", async () => {
    render(<Panel location={location} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    chooseReturn();
    fireEvent.click(await screen.findByRole("button", { name: "반품 업체", exact: true }));
    expect(mocks.listSuppliers).toHaveBeenCalledWith("actor-1", false, "tube");
    fireEvent.click(screen.getByRole("button", { name: "반품 확인", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 반품" }));
    await waitFor(() => expect(mocks.createStockRequest).toHaveBeenCalledWith(expect.objectContaining({ request_type: "defect_return", supplier_id: "supplier-1", lines: [expect.objectContaining({ record_id: "record-1", from_department: "튜브" })] })));
  });

  it.each([
    { department: "창고", process_type_code: "TR", return_supplier_scope: "warehouse" as const },
    { department: "튜브", process_type_code: "R", return_supplier_scope: "warehouse" as const },
    { department: "튜브", process_type_code: "TR", is_legacy: true, legacy_origin: "aggregate" as const, return_supplier_scope: "warehouse" as const },
    { return_supplier_scope: undefined },
  ])("튜브 원건 조건을 만족하지 않으면 창고 업체를 유지한다 (%j)", async (overrides) => {
    render(<Panel location={{ ...location, ...overrides }} currentEmployee={{ ...employee, department: "튜브" }} onDone={vi.fn()} onCancel={vi.fn()} />);
    chooseReturn();
    await screen.findByRole("button", { name: "반품 업체", exact: true });
    expect(mocks.listSuppliers).toHaveBeenCalledWith("actor-1", false, "warehouse");
  });

  it("튜브 정상 복귀는 기존 격리 해제 요청을 유지한다", async () => {
    render(<Panel location={location} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "검사 통과" } });
    fireEvent.click(screen.getByRole("button", { name: "정상 복귀 →" }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 복귀" }));
    await waitFor(() => expect(mocks.unquarantine).toHaveBeenCalledWith(expect.objectContaining({ record_id: "record-1", dept: "튜브" })));
    expect(mocks.listSuppliers).not.toHaveBeenCalled();
    expect(mocks.createStockRequest).not.toHaveBeenCalled();
  });
});

it("혼합 범위의 일괄 반품은 분리 반품을 안내하고 업체 단계로 진행하지 않는다", () => {
  render(<DefectProcessPanel locations={[location, { ...location, record_id: "warehouse-1", department: "창고", return_supplier_scope: "warehouse" }]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^반품/ }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "외관 불량" } });
  expect(screen.getByText(/창고와 튜브.*나누어 반품/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "공급업체 선택 →" })).toBeDisabled();
});
