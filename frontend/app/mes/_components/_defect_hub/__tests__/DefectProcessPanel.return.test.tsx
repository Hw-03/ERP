import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DefectLocation } from "@/lib/api/types/defects";
import { ApiError } from "@/lib/api-core";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/api/stock-requests", () => ({ stockRequestsApi: { createStockRequest: mocks.create } }));
vi.mock("../ReasonFormFields", async () => ({ ReasonFormFields: (await import("./reasonFormFieldsStub")).ReasonFormFieldsStub }));
vi.mock("../DisassembleTree", () => ({ DisassembleTree: () => null, toServerDecision: (value: unknown) => value, validateDecisionTree: () => true }));
vi.mock("../../_warehouse_v2/SupplierPickerStep", () => ({ SupplierPickerStep: ({ onSelect, onLoadStateChange }: { onSelect: (value: unknown) => void; onLoadStateChange: (value: boolean) => void }) => (
  <button onClick={() => { onLoadStateChange(true); onSelect({ supplier_id: "supplier-1", name: "당시 공급업체", is_active: true }); }}>공급업체 고르기</button>
) }));
import { DefectProcessPanel } from "../DefectProcessPanel";
import { MobileDefectProcessPanel } from "../../mobile/screens/MobileDefectProcessPanel";

describe("DefectProcessPanel supplier return", () => {
  it.each([["PC", DefectProcessPanel], ["mobile", MobileDefectProcessPanel]] as const)("preserves a return retry identity and target after a supplier rejection: %s", async (_presentation, Panel) => {
    mocks.create.mockReset().mockRejectedValueOnce(new ApiError("숨김 처리된 공급업체는 반품할 수 없습니다.", 422)).mockResolvedValueOnce({});
    const origin: DefectLocation = { record_id: "record-1", item_id: "item-1", item_name: "반품 대상", mes_code: "3-TR-0001", department: "창고",
      quantity: 3, original_quantity: 3, available_quantity: 3, pending_quantity: 0, defective_at: "2026-10-07T00:00:00Z",
      reason_category: "외관 불량", reason_memo: "원건 메모", quarantined_by: "격리 직원", is_legacy: false, legacy_origin: null, has_bom: false };
    const onDone = vi.fn();
    render(<Panel location={origin} currentEmployee={{ employee_id: "employee-1", name: "처리 직원", department: "조립" }} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^반품/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "외관 불량" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "반품 사유 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "공급업체 선택 →" }));
    expect(screen.getByRole("button", { name: "반품 확인" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "공급업체 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "반품 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 반품" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].client_request_id).toMatch(/^defect-return:/);
    expect(await screen.findByText("숨김 처리된 공급업체는 반품할 수 없습니다.")).toBeVisible();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ supplier_id: "supplier-1", reason_memo: "반품 사유 메모", lines: [{ record_id: "record-1", quantity: 3 }] });
    fireEvent.click(screen.getByRole("button", { name: "반품 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 반품" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1][0]).toEqual(mocks.create.mock.calls[0][0]);
  });
});
