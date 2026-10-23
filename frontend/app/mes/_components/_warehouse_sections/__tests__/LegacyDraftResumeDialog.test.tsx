import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { StockRequest } from "@/lib/api";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { LegacyDraftResumeDialog } from "../LegacyDraftResumeDialog";

vi.mock("@/lib/api/stock-requests", () => ({ stockRequestsApi: { upsertStockRequestDraft: vi.fn(), submitStockRequestDraft: vi.fn() } }));
const pause = { token: "pause", round_id: "round", state: "ready", paused_at: "now", pending_target_count: 0, missing_target_count: 0 };
const draft = { request_id: "request", request_type: "rework_normal", requester_employee_id: "employee", stocktake_pause: pause,
  supplier_id: "supplier", reason_category_id: "reason", reason_category: "사유", reason_memo: "상세", reference_no: "ref", submission_id: "submission",
  notes: JSON.stringify({ memo: "보존", child_decisions: [{ item_id: "child", item_name: "하위", qty: 6, normal_qty: 3, defective_qty: 2, scrap_qty: 1, children: [{ item_id: "leaf", qty: 2, keep_qty: 2 }] }] }),
  lines: [{ line_id: "line", item_id: "parent", item_name_snapshot: "상위", quantity: 3, from_bucket: "production", from_department: "조립", to_bucket: "none", to_department: null, pool_id: "pool", record_id: "record" }],
} as unknown as StockRequest;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false }))); });

it("필수 확인 없이 원래 수량과 metadata로 재개하고 같은 요청을 즉시 제출한다", async () => {
  vi.mocked(stockRequestsApi.upsertStockRequestDraft).mockResolvedValue({ ...draft, stocktake_pause: null });
  vi.mocked(stockRequestsApi.submitStockRequestDraft).mockResolvedValue({ ...draft, status: "submitted", stocktake_pause: null });
  const onChanged = vi.fn();
  const onClose = vi.fn();
  render(<LegacyDraftResumeDialog draft={draft} onClose={onClose} onChanged={onChanged} />);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByText(/실사에 포함된 작업량을 제외/)).not.toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "상위 수량" })).toHaveValue(3);
  fireEvent.click(screen.getByRole("button", { name: "요청 제출" }));
  await waitFor(() => expect(stockRequestsApi.upsertStockRequestDraft).toHaveBeenCalledOnce());
  const payload = vi.mocked(stockRequestsApi.upsertStockRequestDraft).mock.calls[0][0];
  expect(payload).toMatchObject({ stocktake_resume_token: "pause", supplier_id: "supplier", submission_id: "submission", reason_category_id: "reason", reference_no: "ref", reason_category: "사유", reason_memo: "상세", lines: [expect.objectContaining({ quantity: 3, record_id: "record", pool_id: "pool", from_bucket: "production", from_department: "조립", to_bucket: "none", to_department: null })] });
  expect(JSON.parse(payload.notes!)).toEqual(JSON.parse(draft.notes!));
  await waitFor(() => expect(stockRequestsApi.submitStockRequestDraft).toHaveBeenCalledWith("request", "employee"));
  expect(onChanged).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});

it("재개 실패 시 수량 입력과 일시중지를 유지한다", async () => {
  vi.mocked(stockRequestsApi.upsertStockRequestDraft).mockRejectedValue(new Error("재고 부족"));
  render(<LegacyDraftResumeDialog draft={draft} onClose={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.change(screen.getByRole("spinbutton", { name: "상위 수량" }), { target: { value: "1" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "leaf 유지 수량" }), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "요청 제출" }));
  expect(await screen.findByText("재고 부족")).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "상위 수량" })).toHaveValue(1);
  expect(screen.getByRole("spinbutton", { name: "leaf 유지 수량" })).toHaveValue(1);
  expect(stockRequestsApi.submitStockRequestDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "요청 제출" }));
  await waitFor(() => expect(stockRequestsApi.upsertStockRequestDraft).toHaveBeenCalledTimes(2));
  expect(vi.mocked(stockRequestsApi.upsertStockRequestDraft).mock.calls[1][0].stocktake_resume_token).toBe("pause");
});

it("일시중지가 없는 구형 작업도 같은 요청을 실제 제출한다", async () => {
  vi.mocked(stockRequestsApi.submitStockRequestDraft).mockResolvedValue({ ...draft, status: "submitted" });
  render(<LegacyDraftResumeDialog draft={{ ...draft, stocktake_pause: null }} onClose={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "요청 제출" }));
  await waitFor(() => expect(stockRequestsApi.submitStockRequestDraft).toHaveBeenCalledWith("request", "employee"));
  expect(stockRequestsApi.upsertStockRequestDraft).not.toHaveBeenCalled();
});

it("미반영 조사나 수량 0에서는 제출을 비활성화한다", () => {
  const view = render(<LegacyDraftResumeDialog draft={{ ...draft, stocktake_pause: { ...draft.stocktake_pause!, state: "blocked" } }} onClose={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByRole("button", { name: "요청 제출" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "요청 제출" }));
  expect(stockRequestsApi.upsertStockRequestDraft).not.toHaveBeenCalled();
  expect(stockRequestsApi.submitStockRequestDraft).not.toHaveBeenCalled();
  view.unmount();
  render(<LegacyDraftResumeDialog draft={draft} onClose={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.change(screen.getByRole("spinbutton", { name: "상위 수량" }), { target: { value: "0" } });
  expect(screen.getByRole("button", { name: "요청 제출" })).toBeDisabled();
});

it("재개 뒤 제출 실패 시 추가 수정은 서버가 재발급한 구성품 근거를 사용한다", async () => {
  const refreshedNotes = JSON.stringify({ child_decisions: [{ item_id: "child", qty: 6, bom_auto_token: "refreshed" }] });
  vi.mocked(stockRequestsApi.upsertStockRequestDraft).mockResolvedValue({ ...draft, notes: refreshedNotes, stocktake_pause: null });
  vi.mocked(stockRequestsApi.submitStockRequestDraft).mockRejectedValue(new Error("제출 실패"));
  render(<LegacyDraftResumeDialog draft={draft} onClose={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "요청 제출" }));
  expect(await screen.findByText("제출 실패")).toBeVisible();
  fireEvent.change(screen.getByRole("spinbutton", { name: "상위 수량" }), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "작업 내용 반영" }));
  await waitFor(() => expect(stockRequestsApi.upsertStockRequestDraft).toHaveBeenCalledTimes(2));
  expect(JSON.parse(vi.mocked(stockRequestsApi.upsertStockRequestDraft).mock.calls[1][0].notes!)).toEqual(JSON.parse(refreshedNotes));
  expect(vi.mocked(stockRequestsApi.upsertStockRequestDraft).mock.calls[1][0].stocktake_resume_token).toBeUndefined();
});

it("일시중지 없는 요청의 수정은 작업 내용 반영 후 별도로 제출한다", async () => {
  vi.mocked(stockRequestsApi.upsertStockRequestDraft).mockResolvedValue({ ...draft, stocktake_pause: null });
  render(<LegacyDraftResumeDialog draft={{ ...draft, stocktake_pause: null }} onClose={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.change(screen.getByRole("spinbutton", { name: "상위 수량" }), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "작업 내용 반영" }));
  await waitFor(() => expect(stockRequestsApi.upsertStockRequestDraft).toHaveBeenCalledOnce());
  expect(stockRequestsApi.submitStockRequestDraft).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "요청 제출" })).toBeEnabled();
});
