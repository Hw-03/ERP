import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workReservationsApi } from "@/lib/api/work-reservations";
import type { AdminWorkReservationDetail } from "@/lib/api/types/work-reservations";
import { ApiError } from "@/lib/api-core";
import type { DepartmentMaster, Employee } from "@/lib/api";
import { AdminWorkReservationsSection } from "../AdminWorkReservationsSection";
import { AdminWorkReservationDetailBody, workElapsed } from "../AdminWorkReservationDetail";
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
  fireEvent.click(await screen.findByRole("button", { name: /작업 담당자/ }));
  await screen.findByRole("button", { name: "작업 삭제" });
}
beforeEach(() => {
  session.pin = "test-pin";
  vi.spyOn(workReservationsApi, "listAdmin").mockResolvedValue({ items: [work], total: 1, skip: 0, limit: 30 });
  vi.spyOn(workReservationsApi, "getAdminDetail").mockResolvedValue(work);
});
afterEach(() => vi.restoreAllMocks());
describe("관리자 작업 예약 표시", () => {
  it("저장된 작업이 없을 때 검색 실패나 선택 지시 대신 빈 작업 안내를 보여준다", async () => {
    vi.mocked(workReservationsApi.listAdmin).mockResolvedValue({ items: [], total: 0, skip: 0, limit: 30 });
    mount();
    await screen.findByText("저장된 작업이 없습니다.");
    expect(screen.getByText("작업 예약이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("왼쪽에서 작업을 선택해 주세요.")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "담당자·품목·작업번호 검색" }), { target: { value: "없는 품목" } });
    await screen.findByText("조건에 맞는 작업이 없습니다.");
    expect(screen.getByText("검색어나 필터를 바꿔 확인해 주세요.")).toBeInTheDocument();
  });
  it.each(["reserved", "not_required", "inactive"] as const)("자재 예약 상태 %s와 관계없이 작업 중으로 표시한다", async (reservation_status) => {
    vi.mocked(workReservationsApi.listAdmin).mockResolvedValue({ items: [{ ...work, reservation_status }], total: 1, skip: 0, limit: 30 });
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue({ ...work, reservation_status });
    mount(); await selectWork();
    expect(within(screen.getByRole("button", { name: /작업 담당자/ })).getByText("작업 중", { exact: true })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "예약 상태" })).not.toBeInTheDocument();
    expect(screen.queryByText("예약 중", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("자재 예약 없음", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("예약할 자재 없음", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "예약 자재" })).toBeVisible();
  });
  it("예약 해제된 임시 작업도 자재 내역과 함께 작업 중으로 보여준다", async () => {
    const inactiveWork = { ...work, reservation_status: "inactive" as const, reserved_inputs: [] };
    vi.mocked(workReservationsApi.listAdmin).mockResolvedValue({ items: [inactiveWork], total: 1, skip: 0, limit: 30 });
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue(inactiveWork);
    mount(); await selectWork();
    expect(within(screen.getByRole("button", { name: /작업 담당자/ })).getByText("작업 중", { exact: true })).toBeVisible();
    expect(screen.queryByText("종료", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("예약 필요")).not.toBeInTheDocument();
    expect(screen.getByText("예약된 자재가 없습니다.")).toBeInTheDocument();
  });
  it("반려된 작업의 상태와 다시 확인할 사유는 숨기지 않는다", async () => {
    const returned = { ...work, reservation_status: "inactive" as const, reserved_inputs: [], reservation_issue: { code: "returned_after_rejection" as const, message: "검토 후 다시 저장해 주세요.", shortages: [] } };
    vi.mocked(workReservationsApi.listAdmin).mockResolvedValue({ items: [returned], total: 1, skip: 0, limit: 30 });
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue(returned);
    mount(); await selectWork();
    expect(within(screen.getByRole("button", { name: /작업 담당자/ })).getByText("반려됨")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("반려 후 다시 저장하여 예약해야 합니다.");
  });
  it("입고 결과는 완료 후 사용을 안내하고 이동 안내는 이동이 있을 때만 표시한다", () => {
    render(<AdminWorkReservationDetailBody work={{ ...work, expected_effects: [
      { ...work.targets[0], effect_id: "made", operation_line_id: "line-in", bundle_id: "bundle", kind: "in", from: null, to: { bucket: "production", department: "조립" } },
    ] }} />);
    const result = screen.getByRole("heading", { name: "완료 후 결과" }).closest("section")!;
    expect(within(result).getByText("완료 후 사용")).toBeVisible();
    expect(within(result).getByText("조립 입고 예정")).toBeVisible();
    expect(within(result).queryByText("입고", { exact: true })).not.toBeInTheDocument();
    expect(within(result).queryByText(/이동은 전체 재고/)).not.toBeInTheDocument();
  });
  it("예약 자재를 품목·재고 위치·예약 수량 표로 보여준다", () => {
    render(<AdminWorkReservationDetailBody work={work} />);
    const table = screen.getByRole("table", { name: "예약 자재" });
    expect(within(table).getAllByRole("columnheader").map((heading) => heading.textContent)).toEqual(["품목", "재고 위치", "예약 수량"]);
    const row = within(table).getByRole("row", { name: /해제 자재.*M-1.*창고.*4 개/ });
    expect(within(row).getAllByRole("cell")).toHaveLength(3);
  });
  it("완료 결과와 이동 목적지를 먼저 보여주고 사용 자재는 펼쳐 확인한다", () => {
    render(<AdminWorkReservationDetailBody work={{ ...work, expected_effects: [
      { ...work.targets[0], effect_id: "made", operation_line_id: "line-in", bundle_id: "bundle", quantity: 2, kind: "in", from: null, to: { bucket: "production", department: "조립" } },
      { ...work.reserved_inputs[0], item_name: "사용 자재 상세", effect_id: "used", operation_line_id: "line-out", bundle_id: "bundle", quantity: 4, kind: "out", from: { bucket: "warehouse", department: null }, to: null },
      { ...work.targets[0], item_name: "이동 품목", effect_id: "moved", operation_line_id: "line-move", bundle_id: "bundle", quantity: 1, kind: "move", from: { bucket: "production", department: "조립" }, to: { bucket: "production", department: "검사" } },
    ] }} />);
    const consumed = screen.getByText("사용 자재 상세");
    expect(consumed).not.toBeVisible();
    expect(screen.getByText("조립 → 검사")).toBeVisible();
    expect(screen.getByText("조립 입고 예정")).toBeVisible();
    expect(screen.getByText("이동은 전체 재고가 늘지 않습니다.")).toBeVisible();
    fireEvent.click(screen.getByText("사용 자재 1건 보기"));
    expect(consumed).toBeVisible();
  });
  it("전체 기록은 접되 과거 경고와 취소 사유는 기본으로 보여준다", () => {
    const event = { revision: 3, occurred_at: work.updated_at, actor_employee_id: null, actor_name: "공유 관리자", reason: null };
    render(<AdminWorkReservationDetailBody work={{ ...work, history: [
      { ...event, event_id: "failure", action: "settlement_failed", reason: "INTERNAL_FAILURE" },
      { ...event, event_id: "cancel", action: "admin_cancelled", reason: "중복 작업으로 취소" },
      { ...event, event_id: "saved", action: "saved", actor_name: "최신 작업자" },
    ] }} />);
    const expanded = screen.getByText("전체 처리 기록 3건 보기").closest("details");
    expect(expanded).not.toHaveAttribute("open");
    expect(screen.getByText("중복 작업으로 취소")).toBeVisible();
    expect(screen.getByText("작업을 완료하지 못했습니다. 담당자가 작업 상태를 확인해야 합니다.")).toBeVisible();
    expect(screen.getByText(/최근 처리.*작업 저장.*최신 작업자/)).toBeVisible();
    fireEvent.click(screen.getByText("전체 처리 기록 3건 보기"));
    expect(expanded).toHaveAttribute("open");
  });
  it("내부 작업번호를 숨기고 목록과 상세는 기본 스크롤을 사용한다", async () => {
    const { container } = mount();
    await selectWork();
    expect(screen.queryByText("WORK-123")).not.toBeInTheDocument();
    expect(container.querySelector("[data-scrollbar-rail-shell], [data-scrollbar-rail-frame], [data-scrollbar-rail-masks]")).not.toBeInTheDocument();
  });
});
describe("관리자 작업예약 관리", () => {
  it("현재 부서가 달라진 비활성 담당자도 작업 생성 당시 부서와 함께 필터링할 수 있다", async () => {
    const movedOwner: Employee = {
      employee_id: "owner", employee_code: "E-1", name: "이동한 담당자", department: "고압",
      role: "employee", phone: null, warehouse_role: "none", department_role: "none", as_research_approver: false,
      display_order: 0, is_active: false, created_at: work.created_at, updated_at: work.updated_at,
    };
    vi.mocked(workReservationsApi.listAdmin).mockResolvedValue({ items: [{ ...work, requester_name: movedOwner.name, requester_active: false }], total: 1, skip: 0, limit: 30 });
    mount([{ id: 1, name: "조립", display_order: 0, is_active: true, color_hex: null }], [movedOwner]);
    await screen.findByRole("button", { name: /이동한 담당자/ });
    fireEvent.click(screen.getByRole("combobox", { name: "담당 부서" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "조립" }));
    const ownerSelect = screen.getByRole("combobox", { name: "담당자" });
    fireEvent.click(ownerSelect);
    fireEvent.mouseDown(screen.getByRole("option", { name: "이동한 담당자 (비활성)" }));
    await waitFor(() => expect(workReservationsApi.listAdmin).toHaveBeenLastCalledWith(expect.objectContaining({ requester_department: "조립", requester_employee_id: "owner" }), expect.any(Object)));
    fireEvent.click(screen.getByRole("combobox", { name: "담당 부서" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "부서 전체" }));
    await waitFor(() => expect(workReservationsApi.listAdmin).toHaveBeenLastCalledWith(expect.objectContaining({ requester_department: undefined, requester_employee_id: undefined }), expect.any(Object)));
  });
  it("임의의 오래됨 기준 없이 마지막 저장 이후 실제 경과를 표시한다", () => {
    expect(workElapsed("2026-10-20T00:00:00Z", Date.parse("2026-10-21T01:05:00Z"))).toBe("1일 1시간 5분 경과");
    expect(workElapsed("2026-10-20T00:00:00", Date.parse("2026-10-20T00:05:00Z"))).toBe("5분 경과");
  });
  it("메뉴 목록만 조회하고 선택 시 상세를 읽는다", async () => {
    mount(); await screen.findByRole("button", { name: /작업 담당자/ });
    expect(workReservationsApi.getAdminDetail).not.toHaveBeenCalled();
    await selectWork();
    expect(workReservationsApi.getAdminDetail).toHaveBeenCalledWith("batch-1", expect.any(Object));
    expect(screen.getByRole("heading", { name: "예약 자재" })).toBeInTheDocument();
  });
  it("품목이 많은 작업은 목록에서 요약하고 상세에서 전체 품목과 수량을 확인한다", async () => {
    const targets = Array.from({ length: 12 }, (_, index) => ({ ...work.targets[0], item_id: `target-${index}`, item_name: `작업 품목 ${index + 1}`, quantity: index + 1 }));
    const manyTargets = { ...work, targets };
    vi.mocked(workReservationsApi.listAdmin).mockResolvedValue({ items: [manyTargets], total: 1, skip: 0, limit: 30 });
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue(manyTargets);
    mount();
    const row = await screen.findByRole("button", { name: /작업 담당자/ });
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
    mount(); await selectWork(); fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("해제 자재")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("삭제 사유"), { target: { value: "  " } });
    fireEvent.keyDown(window, { key: "Enter" }); expect(cancel).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("삭제 사유"), { target: { value: " 정리 필요 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "작업 삭제" }));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("batch-1", { expected_revision: 3, reason: "정리 필요" });
    await act(async () => resolve({ ...work, status: "cancelled" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("작업이 삭제되고 예약 자재가 해제되었습니다.");
    expect(notice).toHaveClass("status-target-notice");
    fireEvent.animationEnd(notice);
    expect(screen.queryByText("작업이 삭제되고 예약 자재가 해제되었습니다.")).not.toBeInTheDocument();
  });
  it("돌아가기 버튼의 Enter는 확인으로 바뀌지 않는다", async () => {
    const cancel = vi.spyOn(workReservationsApi, "cancelAdmin");
    mount(); await selectWork(); fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    fireEvent.change(screen.getByLabelText("삭제 사유"), { target: { value: "사유 입력" } });
    const back = within(screen.getByRole("dialog")).getByRole("button", { name: "돌아가기" });
    fireEvent.keyDown(back, { key: "Enter" });
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(back); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("검색과 담당자 필터만 제공하고 취소 기록·비활성·정렬 옵션은 제공하지 않는다", async () => {
    mount(); await screen.findByRole("button", { name: /작업 담당자/ });
    expect(screen.queryByRole("combobox", { name: "예약 상태" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "정렬" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "비활성 담당자만" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "취소 기록 보기" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "담당자·품목·작업번호 검색" }), { target: { value: "작업 품목" } });
    await waitFor(() => expect(workReservationsApi.listAdmin).toHaveBeenLastCalledWith({ search: "작업 품목", skip: 0, limit: 30 }, expect.any(Object)));
  });
  it.each(["filter", "selection"])("취소 성공 알림을 %s 변경 시 지운다", async (change) => {
    vi.spyOn(workReservationsApi, "cancelAdmin").mockResolvedValue({ ...work, status: "cancelled" });
    mount(); await selectWork(); fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    fireEvent.change(screen.getByLabelText("삭제 사유"), { target: { value: "정리 필요" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "작업 삭제" }));
    await screen.findByText("작업이 삭제되고 예약 자재가 해제되었습니다.");
    if (change === "filter") fireEvent.change(screen.getByRole("textbox", { name: "담당자·품목·작업번호 검색" }), { target: { value: "다른 품목" } });
    else fireEvent.click(screen.getByRole("button", { name: /작업 담당자/ }));
    expect(screen.queryByText("작업이 삭제되고 예약 자재가 해제되었습니다.")).not.toBeInTheDocument();
  });
  it("409 후 사유를 유지하고 새 revision을 자동 재전송하지 않는다", async () => {
    const cancel = vi.spyOn(workReservationsApi, "cancelAdmin").mockRejectedValue(new ApiError("변경 충돌", 409));
    mount(); await selectWork(); fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    fireEvent.change(screen.getByLabelText("삭제 사유"), { target: { value: "기록 정리" } });
    vi.mocked(workReservationsApi.getAdminDetail).mockResolvedValue({ ...work, revision: 4 });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "작업 삭제" }));
    await screen.findByText(/최신 상세를 검토/);
    expect(screen.getByLabelText("삭제 사유")).toHaveValue("기록 정리");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "작업 삭제" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Enter" }); expect(cancel).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "돌아가기" }));
    fireEvent.click(await screen.findByRole("button", { name: "작업 삭제" }));
    expect(screen.getByLabelText("삭제 사유")).toHaveValue("기록 정리");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "작업 삭제" }));
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
    mount(); fireEvent.click(await screen.findByRole("button", { name: /작업 담당자/ }));
    await screen.findByRole("heading", { name: "예약 자재" });
    expect(screen.queryByRole("button", { name: "작업 삭제" })).not.toBeInTheDocument();
  });
});
