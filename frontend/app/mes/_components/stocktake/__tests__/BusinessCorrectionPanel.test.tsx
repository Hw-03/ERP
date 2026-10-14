import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BusinessCorrectionPanel } from "../BusinessCorrectionPanel";
import { stocktakeApi } from "@/lib/api/stocktake";

vi.mock("@/lib/api/stocktake", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/stocktake")>(), stocktakeApi: { read: vi.fn(), command: vi.fn() } }));
const operator = { employee_id: "admin", name: "관리자", role: "부서 정", department_role: "primary" } as Parameters<typeof BusinessCorrectionPanel>[0]["operator"];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(stocktakeApi.read).mockResolvedValue({ items: [{ correction_id: "correction-1", version: 1, status: "REQUESTED", source_type: "StockRequest", source_id: "source-1", requester_name: "작업자", target_status: "CANCELLED", reason: "오입력", evidence: "승인 기록" }] });
});

it("keeps correction requests collapsed and preserves the draft when reopened", () => {
  render(<BusinessCorrectionPanel token="t" operator={operator} onChanged={vi.fn()} />);
  const disclosure = screen.getByText("업무 정정").closest("details")!;
  expect(disclosure).not.toHaveAttribute("open");
  fireEvent.click(disclosure.querySelector("summary")!);
  fireEvent.change(screen.getByLabelText("원업무 ID"), { target: { value: "draft-source" } });
  fireEvent.click(disclosure.querySelector("summary")!);
  fireEvent.click(disclosure.querySelector("summary")!);
  expect(screen.getByLabelText("원업무 ID")).toHaveValue("draft-source");
  expect(stocktakeApi.command).not.toHaveBeenCalled();
});

it("requests a correction without sending an actor identity", async () => {
  vi.mocked(stocktakeApi.command).mockResolvedValue({ correction_id: "correction-2", version: 1, status: "REQUESTED" });
  render(<BusinessCorrectionPanel token="t" operator={operator} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByText("업무 정정", { selector: "summary" }));
  fireEvent.change(screen.getByLabelText("원업무 ID"), { target: { value: "source-2" } });
  fireEvent.change(screen.getByLabelText("정정 사유"), { target: { value: "잘못된 완료" } });
  fireEvent.change(screen.getByLabelText("증빙"), { target: { value: "담당자 확인 기록" } });
  fireEvent.click(screen.getByRole("button", { name: "정정 요청" }));
  await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledWith("correction_request", "/api/inventory/business-corrections", "t", expect.objectContaining({ source_id: "source-2", reason: "잘못된 완료", evidence: "담당자 확인 기록" }), expect.anything()));
  expect(JSON.stringify(vi.mocked(stocktakeApi.command).mock.calls[0][3])).not.toContain("admin");
});

it("keeps processing and receipt recovery visible when correction controls are collapsed", async () => {
  let rejectCommand!: (error: Error) => void;
  vi.mocked(stocktakeApi.command).mockImplementationOnce(() => new Promise((_, reject) => { rejectCommand = reject; }));
  render(<BusinessCorrectionPanel token="t" operator={operator} onChanged={vi.fn()} />);
  const summary = screen.getByText("업무 정정", { selector: "summary" });
  fireEvent.click(summary);
  fireEvent.change(screen.getByLabelText("원업무 ID"), { target: { value: "source-2" } });
  fireEvent.change(screen.getByLabelText("정정 사유"), { target: { value: "잘못된 완료" } });
  fireEvent.change(screen.getByLabelText("증빙"), { target: { value: "담당자 확인 기록" } });
  fireEvent.click(screen.getByRole("button", { name: "정정 요청" }));
  fireEvent.click(summary);
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByRole("status").closest("details")).toBeNull();
  await act(async () => rejectCommand(Object.assign(new Error("응답 불명확"), { code: "COMMAND_RESULT_UNKNOWN" })));
  expect(screen.getByRole("button", { name: "영수증 조회" }).closest("details")).toBeNull();
  expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
});

it("reviews the complete scope before approving with the exact preview and fresh PIN", async () => {
  vi.mocked(stocktakeApi.read).mockImplementation(async (path: string) => path.endsWith("/events") ? { items: [] } : path.endsWith("correction-1") ? { correction_id: "correction-1", version: 1, status: "REQUESTED", scope: { roots: [{ type: "StockRequest", state: { status: "COMPLETED" } }] } } : { items: [{ correction_id: "correction-1", version: 1, status: "REQUESTED", source_type: "StockRequest", source_id: "source-1", requester_name: "작업자", target_status: "CANCELLED", reason: "오입력", evidence: "승인 기록" }] });
  vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "preview-1", preview_hash: "b".repeat(64), cells: [{ item_id: "item-1", scope_id: "warehouse", quantities: { normal: 5 }, reservations: { normal: 2 }, after_reservations: { normal: 1 } }], observations: [{ application_id: "apply-1" }] }).mockResolvedValueOnce({ status: "APPLIED" });
  render(<BusinessCorrectionPanel token="t" operator={operator} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByText("업무 정정", { selector: "summary" }));
  fireEvent.click(await screen.findByRole("button", { name: "상세 검토" }));
  await screen.findByText(/원업무 전체 범위/);
  fireEvent.change(screen.getByLabelText("정정 승인 PIN"), { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: "승인 미리보기" }));
  await screen.findByText(/승인 검토/);
  expect(screen.getByRole("cell", { name: "정상" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
  expect(screen.getByText(/실사 적용 증빙 연결 1건/)).toBeInTheDocument();
  expect((screen.getByLabelText("정정 승인 PIN") as HTMLInputElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("정정 승인 PIN"), { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: "검토한 내용으로 승인" }));
  await waitFor(() => expect(stocktakeApi.command).toHaveBeenNthCalledWith(2, "correction_approve", "/api/inventory/business-corrections/correction-1/approve", "t", { expected_version: 1, preview_id: "preview-1", preview_hash: "b".repeat(64) }, expect.objectContaining({ adminPin: "1234" })));
  expect((screen.getByLabelText("정정 승인 PIN") as HTMLInputElement).value).toBe("");
});

it("keeps the newer correction detail when an older request resolves late", async () => {
  let finishOld!: (value: unknown) => void;
  vi.mocked(stocktakeApi.read).mockImplementation((path: string) => {
    if (path.endsWith("correction-1")) return new Promise(resolve => { finishOld = resolve; });
    if (path.endsWith("correction-2")) return Promise.resolve({ correction_id: "correction-2", version: 1, status: "REQUESTED", source_type: "StockRequest", source_id: "source-2", requester_name: "두 번째", target_status: "CANCELLED", reason: "두 번째", evidence: "증빙", scope: { roots: [{ type: "StockRequest", state: { status: "COMPLETED" } }] } });
    if (path.endsWith("/events")) return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [
      { correction_id: "correction-1", version: 1, status: "REQUESTED", source_type: "StockRequest", source_id: "source-1" },
      { correction_id: "correction-2", version: 1, status: "REQUESTED", source_type: "StockRequest", source_id: "source-2" },
    ] });
  });
  render(<BusinessCorrectionPanel token="t" operator={operator} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByText("업무 정정", { selector: "summary" }));
  const buttons = await screen.findAllByRole("button", { name: "상세 검토" });
  fireEvent.click(buttons[0]); fireEvent.click(buttons[1]);
  await screen.findByText(/요청자 두 번째/);
  await act(async () => { finishOld({ correction_id: "correction-1", version: 1, status: "REQUESTED", source_type: "StockRequest", source_id: "source-1", requester_name: "첫 번째", target_status: "CANCELLED", reason: "첫 번째", evidence: "증빙", scope: {} }); });
  expect(screen.getByText(/요청자 두 번째/)).toBeInTheDocument();
});

it("hides administrator decisions from a requester while allowing own withdrawal", async () => {
  const requester = { ...operator, employee_id: "requester", department_role: "none" } as typeof operator;
  vi.mocked(stocktakeApi.read).mockImplementation(async (path: string) => path.endsWith("/events") ? { items: [] } : path.endsWith("correction-1")
    ? { correction_id: "correction-1", version: 1, status: "REQUESTED", source_type: "StockRequest", source_id: "source-1", requester_id: "requester", requester_name: "요청자", target_status: "CANCELLED", reason: "오입력", evidence: "증빙", scope: { roots: [] } }
    : { items: [{ correction_id: "correction-1", version: 1, status: "REQUESTED", source_type: "StockRequest", source_id: "source-1", requester_id: "requester" }] });
  render(<BusinessCorrectionPanel token="t" operator={requester} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByText("업무 정정", { selector: "summary" }));
  fireEvent.click(await screen.findByRole("button", { name: "상세 검토" }));
  await screen.findByText(/요청자 요청자/);
  expect(screen.queryByRole("button", { name: "승인 미리보기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "정정 거절" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "요청 철회" })).toBeInTheDocument();
});
