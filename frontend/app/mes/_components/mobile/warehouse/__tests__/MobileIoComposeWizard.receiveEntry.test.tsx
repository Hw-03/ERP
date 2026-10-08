import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { MobileIoComposeWizard } from "../MobileIoComposeWizard";

vi.mock("@/lib/api", () => ({
  api: {
    getAllBOM: vi.fn(),
    getItems: vi.fn(),
    listSuppliers: vi.fn(),
    preview: vi.fn(),
    saveDraft: vi.fn(),
    submitDraft: vi.fn(),
    deleteDraft: vi.fn(),
  },
}));

vi.mock("@/lib/queries/useBomQuery", () => ({
  useBomListQuery: () => ({ data: [], isSuccess: true, isPending: false, isError: false, refetch: vi.fn() }),
}));

const supplier = {
  supplier_id: "supplier-1",
  name: "기존 공급업체",
  is_active: true,
  created_at: "2026-09-21T00:00:00Z",
  updated_at: "2026-09-21T00:00:00Z",
};

const item = {
  item_id: "mobile-receive-item",
  item_name: "모바일 빠른 입고 품목",
  unit: "EA",
  quantity: 0,
  warehouse_qty: 0,
  production_total: 0,
  defective_total: 0,
  pending_quantity: 0,
  available_quantity: 0,
  last_reserver_name: null,
  location: null,
  locations: [],
  legacy_part: null,
  legacy_item_type: null,
  supplier: null,
  min_stock: null,
  mes_code: "M-RECEIVE-1",
  model_symbol: null,
  model_slots: [],
  process_type_code: "AF",
  serial_no: null,
  bom_completed_at: null,
  deleted_at: null,
  created_at: "2026-09-21T00:00:00Z",
  updated_at: "2026-09-21T00:00:00Z",
  department: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listSuppliers).mockResolvedValue([supplier]);
  vi.mocked(api.preview).mockResolvedValue({
    bundles: [{
      bundle_id: "mobile-receive-bundle",
      source_kind: "direct_item",
      title: item.item_name,
      source_item_id: item.item_id,
      source_mes_code: item.mes_code,
      quantity: 1,
      expanded_level: 0,
      lines: [],
    }],
  } as never);
});

describe("MobileIoComposeWizard 빠른 원자재 입고", () => {
  it("튜브 전용 업체를 선택한 뒤 TR만 직접 추가한다", async () => {
    vi.mocked(api.listSuppliers).mockResolvedValue([{ ...supplier, scope: "tube" }]);
    render(<MobileIoComposeWizard globalSearch="" operator={{ employee_id: "tube-1", name: "튜브 작업자", department: "튜브", warehouse_role: "none" }} items={[{ ...item, process_type_code: "TR" }]} productModels={[]} setItems={() => {}} onStatusChange={() => {}} entryIntent={{ workType: "tube_material", subType: "tube_receive_supplier" }} preselectedItem={{ ...item, process_type_code: "TR" }} />);
    expect(await screen.findByText("공급업체 선택")).toBeInTheDocument();
    expect(api.listSuppliers).toHaveBeenCalledWith("tube-1", true, "tube");
    expect(api.preview).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "기존 공급업체" }));
    await waitFor(() => expect(api.preview).toHaveBeenCalledWith(expect.objectContaining({ work_type: "tube_material", sub_type: "tube_receive_supplier", from_department: null, to_department: null, targets: [expect.objectContaining({ source_kind: "direct_item" })] })));
  });
  it("다른 부서의 튜브 작업 직접 진입은 차단한다", () => {
    render(<MobileIoComposeWizard globalSearch="" operator={{ employee_id: "assembly-1", name: "조립 작업자", department: "조립", warehouse_role: "primary" }} items={[item]} setItems={() => {}} onStatusChange={() => {}} entryIntent={{ workType: "tube_material", subType: "tube_receive_supplier" }} preselectedItem={item} />);
    expect(screen.queryByRole("button", { name: "튜브 원자재 입출고" })).not.toBeInTheDocument();
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.listSuppliers).not.toHaveBeenCalled();
  });
  it("공급업체 선택 전에는 Step 2에서 품목 미리보기를 보류하고 선택 후 재개한다", async () => {
    render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={{
          employee_id: "warehouse-1",
          name: "창고 담당자",
          department: "조립",
          warehouse_role: "primary",
        }}
        items={[item]}
        productModels={[]}
        setItems={() => {}}
        onStatusChange={() => {}}
        entryIntent={{ workType: "receive", subType: "receive_supplier" }}
        preselectedItem={item}
      />,
    );

    expect(await screen.findByText("공급업체 선택")).toBeInTheDocument();
    expect(api.preview).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "기존 공급업체" }));

    await waitFor(() => expect(api.preview).toHaveBeenCalledWith(expect.objectContaining({
      work_type: "receive",
      sub_type: "receive_supplier",
      targets: [expect.objectContaining({ item_id: "mobile-receive-item" })],
    })));
  });
});
