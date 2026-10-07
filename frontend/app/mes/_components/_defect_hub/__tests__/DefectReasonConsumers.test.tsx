import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import type { DefectLocation } from "@/lib/api/types/defects";

const api = vi.hoisted(() => ({ unquarantine: vi.fn(), createStockRequest: vi.fn(), getItems: vi.fn() }));
vi.mock("@/lib/api/defects", () => ({ defectsApi: { unquarantine: api.unquarantine } }));
vi.mock("@/lib/api/stock-requests", () => ({ stockRequestsApi: { createStockRequest: api.createStockRequest } }));
vi.mock("@/lib/api/items", () => ({ itemsApi: { getItems: api.getItems } }));
vi.mock("../ReasonFormFields", async () => ({ ReasonFormFields: (await import("./reasonFormFieldsStub")).ReasonFormFieldsStub }));
vi.mock("../DisassembleTree", () => ({ DisassembleTree: () => null, validateDecisionTree: () => true, toServerDecision: (value: unknown) => value }));

import { DefectProcessPanel } from "../DefectProcessPanel";
import { MobileDefectProcessPanel } from "../../mobile/screens/MobileDefectProcessPanel";
import { RDefectActionPanel } from "../RDefectActionPanel";
import { RDefectActionModal } from "../RDefectActionModal";
import { PaPfDefectWizard } from "../PaPfDefectWizard";
import { PaPfDefectWizardPanel } from "../PaPfDefectWizardPanel";
import { DefectBatchConfirm } from "../DefectBatchConfirm";
import { AddRDirectModal } from "../AddRDirectModal";

const employee = { employee_id: "employee-1", name: "작업자", department: "조립" };
const location = { record_id: "record-1", item_id: "item-1", item_name: "불량 품목", mes_code: "9-PF-0001", department: "조립", quantity: 2, original_quantity: 2, pending_quantity: 0, available_quantity: 2, defective_at: null, reason_category: null, reason_memo: null, quarantined_by: null, quarantined_by_employee_id: null, is_legacy: false, has_bom: false } satisfies DefectLocation;
type Props = { location: DefectLocation; currentEmployee: typeof employee; onDone: () => void; onCancel: () => void };
const singleConsumers: Array<[string, ComponentType<Props>, string]> = [
  ["PC 처리", DefectProcessPanel, "정상 복귀 →"],
  ["모바일 처리", MobileDefectProcessPanel, "정상 복귀 →"],
  ["원자재 패널", (props) => <RDefectActionPanel {...props} onSubmitted={props.onDone} onClose={props.onCancel} />, "확인 →"],
  ["원자재 모달", (props) => <RDefectActionModal {...props} open onSubmitted={props.onDone} onClose={props.onCancel} />, "확인 →"],
  ["분해 모달", (props) => <PaPfDefectWizard {...props} open onSubmitted={props.onDone} onClose={props.onCancel} />, "정상 복귀로 변경"],
  ["분해 패널", (props) => <PaPfDefectWizardPanel {...props} onSubmitted={props.onDone} onClose={props.onCancel} />, "정상 복귀로 변경"],
];

beforeEach(() => {
  vi.clearAllMocks();
  api.unquarantine.mockResolvedValue(undefined);
  api.createStockRequest.mockResolvedValue({});
  api.getItems.mockResolvedValue([{ item_id: "item-1", item_name: "정상 품목", mes_code: "9-TR-0001", warehouse_qty: 10, locations: [], unit: "EA" }]);
});

describe.each(singleConsumers)("%s 사유 마스터 연결", (_name, Component, submitLabel) => {
  it("작업자와 선택 ID를 공통 폼·정상 복귀 요청으로 전파한다", async () => {
    render(<Component location={location} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    const restoreRadio = screen.queryByDisplayValue("unquarantine");
    if (restoreRadio) fireEvent.click(restoreRadio);
    expect(screen.getByTestId("reason-master")).toHaveAttribute("data-employee-id", employee.employee_id);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "검사 통과" } });
    fireEvent.click(screen.getByRole("button", { name: submitLabel }));
    const confirm = screen.queryByRole("button", { name: "즉시 복귀", exact: true });
    if (confirm) fireEvent.click(confirm);
    await waitFor(() => expect(api.unquarantine).toHaveBeenCalledWith(expect.objectContaining({ reason_category: "검사 통과", reason_category_id: "reason-검사 통과", actor_employee_id: employee.employee_id })));
  });

  it("메모만으로 진행하지 않고 기타 선택에는 메모를 요구한다", () => {
    render(<Component location={location} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    const restoreRadio = screen.queryByDisplayValue("unquarantine");
    if (restoreRadio) fireEvent.click(restoreRadio);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "메모만 입력" } });
    expect(screen.getByRole("button", { name: submitLabel })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "기타" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: submitLabel })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "상세 사유" } });
    expect(screen.getByRole("button", { name: submitLabel })).toBeEnabled();
  });
});

describe("정상 재고 바로 폐기 사유 연결", () => {
  it("기타 메모를 확인한 뒤 선택 ID를 폐기 요청에 전파한다", async () => {
    render(<AddRDirectModal mode="scrap" open currentEmployee={employee} onSubmitted={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/품목 코드 또는 이름 검색/), { target: { value: "정상" } });
    fireEvent.click(await screen.findByText("정상 품목"));
    fireEvent.change(screen.getByPlaceholderText("예: 3"), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("combobox", { name: "사유 카테고리" }), { target: { value: "기타" } });
    const submit = screen.getByRole("button", { name: "즉시 폐기 →" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "상세 사유" } });
    fireEvent.click(submit);
    fireEvent.click(screen.getByRole("button", { name: "폐기", exact: true }));
    await waitFor(() => expect(api.createStockRequest).toHaveBeenCalledWith(expect.objectContaining({ request_type: "scrap_normal", reason_category: "기타", reason_category_id: "reason-기타", reason_memo: "상세 사유" })));
  });
});

describe("일괄 확인 사유·제출 ID", () => {
  it.each(["unquarantine", "scrap"] as const)("%s 요청 모두 같은 제출 ID와 복사한 카테고리 ID를 유지한다", async (action) => {
    render(<DefectBatchConfirm action={action} locations={[location, { ...location, record_id: "record-2" }]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "기타" } });
    fireEvent.click(screen.getByRole("button", { name: "위 사유 복사" }));
    const submit = screen.getByRole("button", { name: action === "unquarantine" ? "정상 복귀 (2건) →" : "즉시 폐기 (2건) →" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "동일 원인" } });
    fireEvent.click(screen.getByRole("button", { name: "위 사유 복사" }));
    const request = action === "unquarantine" ? api.unquarantine : api.createStockRequest;
    request.mockRejectedValueOnce(new Error("재시도"));
    fireEvent.click(submit);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await screen.findByText("실패: 재시도");
    fireEvent.click(submit);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    const payloads = request.mock.calls.map(([payload]) => payload);
    expect(new Set(payloads.map((payload) => payload.submission_id)).size).toBe(1);
    expect(payloads[0].submission_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(payloads.every((payload) => payload.reason_category_id === "reason-기타")).toBe(true);
  });
});
