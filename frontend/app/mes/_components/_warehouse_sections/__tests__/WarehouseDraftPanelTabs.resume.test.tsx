import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, type IoBatch } from "@/lib/api";
import { WarehouseDraftPanelTabs, type WarehouseDraftPanelTabsProps } from "../WarehouseDraftPanelTabs";
import { restoreInternalUseBundles } from "../../_warehouse_v2/useIoDraftRestore";

const state = vi.hoisted(() => ({ draft: null as unknown as IoBatch }));
vi.mock("@/lib/api", () => ({ api: { saveDraft: vi.fn() } }));
vi.mock("../../common/AccessRevocationGuard", () => ({ AccessRevocationGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../DraftCartPanel", () => ({ DraftCartPanel: ({ onContinueIo }: { onContinueIo: (draft: IoBatch) => void }) => <button onClick={() => onContinueIo(state.draft)}>이어서 작업</button> }));
vi.mock("../MyRequestsPanel", () => ({ MyRequestsPanel: ({ onContinueIoDraft }: { onContinueIoDraft: (draft: IoBatch) => void }) => <button onClick={() => onContinueIoDraft(state.draft)}>이어서 작업</button> }));

beforeEach(() => {
  vi.clearAllMocks();
  state.draft = { batch_id: "work", revision: 7, requester_employee_id: "worker", work_type: "warehouse_io", sub_type: "warehouse_to_dept",
    from_department: null, to_department: "조립", reference_no: "ref", notes: "메모 보존", supplier_id: null,
    bundles: [{ bundle_id: "bundle", quantity: 3, lines: [{ quantity: 3 }] }],
    stocktake_pause: { token: "token", round_id: "round", state: "ready", paused_at: "now", pending_target_count: 0, missing_target_count: 0 },
  } as IoBatch;
});

function setup(layout: "desktop" | "mobile" = "desktop", sectionTab: "cart" | "mine" = "cart") {
  const onContinue = vi.fn();
  const props = { layout, sectionTab, onAccessRevoked: vi.fn(), operatorEmployeeId: "worker", employeeId: "worker", refreshNonce: 0,
    items: [], globalSearch: "", setItems: vi.fn(), onContinueDraft: vi.fn(), onContinueIoDraft: onContinue,
    bumpRefresh: vi.fn(), resetDraftTracking: vi.fn(), operator: null, canSeeQueue: false, canSeeDeptQueue: false, canSeeAsResearchQueue: false,
  } satisfies WarehouseDraftPanelTabsProps;
  render(<WarehouseDraftPanelTabs {...props} />);
  return onContinue;
}

it.each(["desktop", "mobile"] as const)("%s 목록에서 한 번 누르면 기존 수량으로 재개하여 편집기를 연다", async (layout) => {
  const resumed = { ...state.draft, revision: 8, stocktake_pause: null };
  vi.mocked(api.saveDraft).mockResolvedValue(resumed);
  const onContinue = setup(layout);
  fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
  await waitFor(() => expect(onContinue).toHaveBeenCalledWith(expect.objectContaining(resumed)));
  expect(api.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ batch_id: "work", expected_revision: 7,
    stocktake_resume_token: "token", notes: "메모 보존", reference_no: "ref", bundles: state.draft.bundles }));
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("내 요청의 이어서 작업도 같은 재개 경로를 사용한다", async () => {
  const resumed = { ...state.draft, stocktake_pause: null };
  vi.mocked(api.saveDraft).mockResolvedValue(resumed);
  const onContinue = setup("desktop", "mine");
  fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
  await waitFor(() => expect(onContinue).toHaveBeenCalledWith(expect.objectContaining(resumed)));
});

it("조사 반영 전에는 재개 요청과 편집기 진입을 차단한다", () => {
  state.draft.stocktake_pause!.state = "blocked";
  const onContinue = setup();
  fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(onContinue).not.toHaveBeenCalled();
});

it("서버가 재개를 거부하면 편집기를 열지 않고 입력 원본을 보존한다", async () => {
  vi.mocked(api.saveDraft).mockRejectedValue(new Error("작업 상태가 변경되었습니다."));
  const onContinue = setup();
  fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("작업 상태가 변경되었습니다.");
  expect(onContinue).not.toHaveBeenCalled();
  expect(state.draft.bundles[0].quantity).toBe(3);
});

it("사용출고 재개도 수동 수정한 자재 수량을 BOM 기대량으로 바꾸지 않는다", async () => {
  state.draft.work_type = "internal_use";
  state.draft.sub_type = "internal_use_out";
  state.draft.bundles = [{ source_kind: "bom_parent", quantity: 5, internal_use_bom_mode: "children_only",
    lines: [{ origin: "bom_auto", quantity: 3, bom_expected: 10, included: true, selected: true, edited: true }],
  }] as IoBatch["bundles"];
  vi.mocked(api.saveDraft).mockResolvedValue({ ...state.draft, revision: 8, stocktake_pause: null });
  const onContinue = setup();
  fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
  await waitFor(() => expect(onContinue).toHaveBeenCalledOnce());
  const restored = restoreInternalUseBundles(onContinue.mock.calls[0][0]);
  expect(restored[0].lines[0]).toMatchObject({ quantity: 3, edited: true });
});
