import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workReservationsApi } from "@/lib/api/work-reservations";
import type { AdminWorkReservationDetail } from "@/lib/api/types/work-reservations";
import { ApiError } from "@/lib/api-core";
import type { DepartmentMaster, Employee } from "@/lib/api";
import { AdminWorkReservationsSection } from "../AdminWorkReservationsSection";
import { workElapsed } from "../AdminWorkReservationDetail";
const session = vi.hoisted(() => ({ pin: "test-pin" as string | null }));
vi.mock("@/lib/auth/admin-session", () => ({ useAdminSession: () => session }));
const work: AdminWorkReservationDetail = {
  batch_id: "batch-1", revision: 3, status: "draft", reservation_status: "reserved", reservation_issue: null,
  work_type: "process", sub_type: "produce", reference_no: "WORK-123", requester_employee_id: "owner",
  requester_name: "작업 담당자", requester_department: "조립", requester_active: true,
  targets: [{ item_id: "result", item_name: "완성품 목표", mes_code: "P-1", unit: "개", quantity: 2 }],
  reserved_inputs: [{ item_id: "material", item_name: "해제 자재", mes_code: "M-1", unit: "개", quantity: 4, location: { bucket: "warehouse", department: null }, source: "draft", stock_request_id: null, operation_line_ids: [] }],
  expected_effects: [], forecast_issue: null, notes: null, effective_plan: null, history: [],
  created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z",
};
function mount(departments: DepartmentMaster[] = [], employees: Employee[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminWorkReservationsSection departments={departments} employees={employees} /></QueryClientProvider>);
}
async function selectWork() {
  fireEvent.click(await screen.findByRole("button", { name: /WORK-123/ }));
  await screen.findByRole("button", { name: "작업 취소" });
}
beforeEach(() => {
  session.pin = "test-pin";
  vi.spyOn(workReservationsApi, "listAdmin").mockResolvedValue({ items: [work], total: 1, skip: 0, limit: 30, counts: { draft: 1, reserved: 1, needs_reservation: 0, not_required: 0 } });
  vi.spyOn(workReservationsApi, "getAdminDetail").mockResolvedValue(work);
});
afterEach(() => vi.restoreAllMocks());
describe("관리자 작업예약 관리", () => {
  it("현재 부서가 달라진 비활성 담당자도 작업 생성 당시 부서와 함께 필터링할 수 있다", async () => {
    const movedOwner: Employee = {
      employee_id: "owner", employee_code: "E-1", name: "이동한 담당자", department: "고압",
      role: "employee", phone: null, warehouse_role: "none", department_role: "none", as_research_approver: false,
      display_order: 0, is_active: false, created_at: work.created_at, updated_at: work.updated_at,
    };
    vi.mocked(workReservationsApi.listAdmin).mockResolvedValue({ items: [{ ...work, requester_name: movedOwner.name, requester_active: false }], total: 1, skip: 0, limit: 30, counts: { draft: 1, reserved: 1, needs_reservation: 0, not_required: 0 } });
    mount([{ id: 1, name: "조립", display_order: 0, is_active: true, color_hex: null }], [movedOwner]);
    await screen.findByRole("button", { name: /WORK-123/ });
    fireEvent.change(screen.getByRole("combobox", { name: "담당 부서" }), { target: { value: "조립" } });
    const ownerSelect = screen.getByRole("combobox", { name: "담당자" });
    expect(within(ownerSelect).getByRole("option", { name: "이동한 담당자 (비활성)" })).toBeInTheDocument();
    fireEvent.change(ownerSelect, { target: { value: "owner" } });
    await waitFor(() => expect(workReservationsApi.listAdmin).toHaveBeenLastCalledWith(expect.objectContaining({ requester_department: "조립", requester_employee_id: "owner" }), expect.any(Object)));
  });
  it("임의의 오래됨 기준 없이 마지막 저장 이후 실제 경과를 표시한다", () => {
    expect(workElapsed("2026-10-20T00:00:00Z", Date.parse("2026-10-21T01:05:00Z"))).toBe("1일 1시간 5분 경과");
    expect(workElapsed("2026-10-20T00:00:00", Date.parse("2026-10-20T00:05:00Z"))).toBe("5분 경과");
  });
  it("메뉴 목록만 조회하고 선택 시 상세를 읽는다", async () => {
    mount(); await screen.findByRole("button", { name: /WORK-123/ });
    expect(workReservationsApi.getAdminDetail).not.toHaveBeenCalled();
    await selectWork();
    expect(workReservationsApi.getAdminDetail).toHaveBeenCalledWith("batch-1", expect.any(Object));
    expect(screen.getByRole("heading", { name: "예약 자재" })).toBeInTheDocument();
  });
  it("품목이 많은 작업은 목록에서 요약하고 상세에서 전체 품목과 수량을 확인한다", async () => {
    const targets = Array.from({ length: 12 }, (_, index) => ({ ...work.targets[0], item_id: `target-${index}`, item_name: `작업 품목 ${index + 1}`, quantity: index + 1 }));
    const manyTargets = { ...work, targets };
    vi.mocked(workReservationsApi.listAdmin).mockResolvedValue({ items: [manyTargets], total: 1, skip: 0, limit: 30, counts: { draft: 1, reserved: 1, needs_reservation: 0, not_required: 0 } });
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue(manyTargets);
    mount();
    const row = await screen.findByRole("button", { name: /WORK-123/ });
    expect(within(row).getByText("외 10개 품목")).toBeInTheDocument();
    expect(within(row).queryByText("작업 품목 12")).not.toBeInTheDocument();
    fireEvent.click(row);
    const lastTarget = await screen.findByText("작업 품목 12");
    expect(lastTarget.parentElement?.parentElement).toHaveTextContent("12 개");
    expect(screen.getByText("작업 품목 3")).toBeInTheDocument();
  });
  it("공백 사유와 Enter를 차단하고 클릭·Enter 중복 제출은 한 번만 처리한다", async () => {
    let resolve!: (value: AdminWorkReservationDetail) => void;
    const cancel = vi.spyOn(workReservationsApi, "cancelAdmin").mockImplementation(() => new Promise((done) => { resolve = done; }));
    mount(); await selectWork(); fireEvent.click(screen.getByRole("button", { name: "작업 취소" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("해제 자재")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("취소 사유"), { target: { value: "  " } });
    fireEvent.keyDown(window, { key: "Enter" }); expect(cancel).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("취소 사유"), { target: { value: " 정리 필요 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "작업 취소" }));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("batch-1", { expected_revision: 3, reason: "정리 필요" });
    await act(async () => resolve({ ...work, status: "cancelled" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("돌아가기 버튼의 Enter는 확인으로 바뀌지 않는다", async () => {
    const cancel = vi.spyOn(workReservationsApi, "cancelAdmin");
    mount(); await selectWork(); fireEvent.click(screen.getByRole("button", { name: "작업 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "사유 입력" } });
    const back = within(screen.getByRole("dialog")).getByRole("button", { name: "돌아가기" });
    fireEvent.keyDown(back, { key: "Enter" });
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(back); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("검색·필터는 서버 파라미터로 전달하고 상태 필터에도 서버 집계 건수를 유지한다", async () => {
    mount(); await screen.findByRole("button", { name: /WORK-123/ });
    fireEvent.change(screen.getByRole("combobox", { name: "예약 상태" }), { target: { value: "needs_reservation" } });
    await waitFor(() => expect(workReservationsApi.listAdmin).toHaveBeenLastCalledWith(expect.objectContaining({ reservation_status: "needs_reservation", skip: 0, sort: "updated_asc" }), expect.any(Object)));
    fireEvent.click(screen.getByRole("checkbox", { name: "비활성 담당자만" }));
    await waitFor(() => expect(workReservationsApi.listAdmin).toHaveBeenLastCalledWith(expect.objectContaining({ owner_active: false }), expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: "취소 기록 보기" }));
    await waitFor(() => expect(workReservationsApi.listAdmin).toHaveBeenLastCalledWith(expect.objectContaining({ view: "cancelled" }), expect.any(Object)));
    expect(screen.getAllByText("예약 중")[0].parentElement).toHaveTextContent("1");
  });
  it("409 후 사유를 유지하고 새 revision을 자동 재전송하지 않는다", async () => {
    const cancel = vi.spyOn(workReservationsApi, "cancelAdmin").mockRejectedValue(new ApiError("변경 충돌", 409));
    mount(); await selectWork(); fireEvent.click(screen.getByRole("button", { name: "작업 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "기록 정리" } });
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue({ ...work, revision: 4 });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "작업 취소" }));
    await screen.findByText(/최신 상세를 검토/);
    expect(screen.getByLabelText("취소 사유")).toHaveValue("기록 정리");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "작업 취소" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Enter" }); expect(cancel).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "돌아가기" }));
    fireEvent.click(await screen.findByRole("button", { name: "작업 취소" }));
    expect(screen.getByLabelText("취소 사유")).toHaveValue("기록 정리");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "작업 취소" }));
    await waitFor(() => expect(cancel).toHaveBeenLastCalledWith("batch-1", { expected_revision: 4, reason: "기록 정리" }));
  });
  it("조회 실패는 0건으로 표시하지 않는다", async () => {
    vi.mocked(workReservationsApi.listAdmin).mockRejectedValue(new Error("목록 조회 실패"));
    mount(); expect(await screen.findByRole("alert")).toHaveTextContent("작업 목록을 불러오지 못했습니다.");
    expect(screen.queryByText("0건")).not.toBeInTheDocument();
  });
  it("자동 처리의 내부 사유는 안내하고 관리자가 남긴 취소 사유는 유지한다", async () => {
    const event = { event_id: "auto", action: "approval_changed" as const, revision: 3, occurred_at: work.updated_at, actor_employee_id: null, actor_name: "system", reason: "last_as_research_approver_removed" };
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue({ ...work, history: [event, { ...event, event_id: "cancel", action: "admin_cancelled", actor_name: "공유 관리자", reason: "담당자와 확인 후 작업 취소" }] });
    mount(); await selectWork();
    expect(screen.getByText("승인 담당자가 없어 승인 상태가 변경되었습니다.")).toBeInTheDocument();
    expect(screen.getByText("담당자와 확인 후 작업 취소")).toBeInTheDocument();
    expect(screen.queryByText(/last_as_research_approver_removed|system|버전 3/)).not.toBeInTheDocument();
  });
  it("draft가 아닌 상세는 관리자 취소를 제공하지 않는다", async () => {
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue({ ...work, status: "submitted" });
    mount(); fireEvent.click(await screen.findByRole("button", { name: /WORK-123/ }));
    await screen.findByRole("heading", { name: "예약 자재" });
    expect(screen.queryByRole("button", { name: "작업 취소" })).not.toBeInTheDocument();
  });
});
