import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopDefectView } from "../DesktopDefectView";
import { DefectHubPanel } from "../_defect_hub/DefectHubPanel";
import { defectsApi } from "@/lib/api/defects";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Operator } from "../login/useCurrentOperator";
import { defectEntryUrl, type DefectEntryTarget } from "@/lib/defect-entry";

vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => null }));
vi.mock("@/lib/api/defects", () => ({ defectsApi: { listDefects: vi.fn(), listReasonCategories: vi.fn().mockResolvedValue([]) } }));
vi.mock("../_warehouse_hooks/useWarehouseData", () => ({ useWarehouseData: () => ({ items: [], productModels: [] }) }));
vi.mock("@/lib/queries/useItemSearch", () => ({ useItemSearch: () => ({ config: undefined }) }));
const employee = { employee_id: "viewer", name: "조회자", department: "조립", warehouse_role: "none", department_role: "none" } as Operator;
const row = { record_id: "r1", item_id: "focus", item_name: "같은 이름", mes_code: "8-TR-0001", department: "튜브",
  management_category: "DEFECT", quantity: 1, available_quantity: 1, pending_quantity: 0, original_quantity: 1,
  defective_at: "2026-10-20T00:00:00Z", quarantined_by: "다른 직원", quarantined_by_employee_id: "other", is_legacy: false,
} as DefectLocation;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(defectsApi.listDefects).mockResolvedValue([{ ...row, reason_memo: "첫 대상 기록" }, { ...row, record_id: "r2", reason_memo: "둘째 대상 기록" }, { ...row, record_id: "other-item", item_id: "other", reason_memo: "동명 품목 제외" },
    { ...row, record_id: "other-dept", department: "조립" }, { ...row, record_id: "b", management_category: "B_GRADE" }, { ...row, record_id: "o", management_category: "OBSOLETE" }]);
});

async function openEntry(layout: "desktop" | "mobile", category: DefectEntryTarget["managementCategory"] = "DEFECT"): Promise<void> {
  window.history.replaceState({ preserved: true }, "", defectEntryUrl("/", { itemId: "focus", department: "튜브", managementCategory: category }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { render(<QueryClientProvider client={client}>{layout === "desktop"
    ? <DesktopDefectView operator={employee} /> : <DefectHubPanel mobilePresentation currentEmployee={employee} />}</QueryClientProvider>); });
}

describe("재고 상세에서 불량 재고 바로 보기", () => {
  it.each(["desktop", "mobile"] as const)("%s 진입은 다른 부서의 대상 품목 기록을 즉시 펼친다", async (layout) => {
    window.history.replaceState(null, "", "/mes?tab=defect&defect_item_id=focus&defect_dept=튜브&defect_category=DEFECT");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { render(<QueryClientProvider client={client}>{layout === "desktop"
      ? <DesktopDefectView operator={employee} />
      : <DefectHubPanel mobilePresentation currentEmployee={employee} />}</QueryClientProvider>); });
    expect(await screen.findByRole("searchbox", { name: "불량 검색" })).toHaveValue("8-TR-0001");
    expect(await screen.findByText("첫 대상 기록")).toBeInTheDocument();
    expect(screen.getByText("둘째 대상 기록")).toBeInTheDocument();
    expect(screen.queryByText("동명 품목 제외")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^불량 처리 품목/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "불량 검색" }), { target: { value: "" } });
    expect(screen.getByRole("searchbox", { name: "불량 검색" })).toHaveValue("");
    if (layout === "desktop") expect(await screen.findByText("동명 품목 제외")).toBeInTheDocument();
    else expect(screen.getByRole("button", { name: "같은 이름 격리 1건" })).toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s B급·구형 분류와 대상 기록을 바로 열고 작업 선택은 허브로 간다", async (layout) => {
    vi.mocked(defectsApi.listDefects).mockResolvedValue([
      { ...row, record_id: "b1", management_category: "B_GRADE", reason_memo: "B급 대상" },
      { ...row, record_id: "b2", management_category: "B_GRADE", reason_memo: "B급 둘째" },
      { ...row, record_id: "o1", management_category: "OBSOLETE", reason_memo: "구형 대상" },
    ]);
    await openEntry(layout, "B_GRADE");
    expect(await screen.findByText("B급 대상")).toBeInTheDocument();
    expect(screen.getByText("B급 둘째")).toBeInTheDocument();
    expect(screen.queryByText("구형 대상")).not.toBeInTheDocument();
    const categories = within(screen.getByRole("group", { name: "보관 분류 필터" }));
    expect(categories.getByRole("button", { name: /^B급/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(categories.getByRole("button", { name: /^구형/ }));
    if (layout === "mobile") fireEvent.click(screen.getByRole("button", { name: /같은 이름 격리 1건/ }));
    expect(screen.getByText("구형 대상")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /작업 선택/ }));
    expect(new URLSearchParams(window.location.search).has("defect_item_id")).toBe(false);
    expect(window.history.state.preserved).toBe(true);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 직접 구형 진입과 코드 없는 구형 API 기록도 표시한다", async (layout) => {
    vi.mocked(defectsApi.listDefects).mockResolvedValue([{ ...row, management_category: "OBSOLETE", mes_code: "", reason_memo: "코드 없는 대상" }]);
    await openEntry(layout, "OBSOLETE");
    expect(await screen.findByLabelText("B급·구형 검색")).toHaveValue("같은 이름");
    expect(screen.getByText("코드 없는 대상")).toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 대상이 사라지면 다른 재고로 대체하지 않는다", async (layout) => {
    vi.mocked(defectsApi.listDefects).mockResolvedValue([{ ...row, department: "조립" }]);
    await openEntry(layout);
    expect(await screen.findByText("해당 품목·부서의 불량 재고가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("같은 이름")).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 조회 실패를 빈 재고와 구분한다", async (layout) => {
    vi.mocked(defectsApi.listDefects).mockRejectedValue(new Error("조회 실패 확인"));
    await openEntry(layout);
    expect(await screen.findByText(/조회 실패 확인/)).toBeInTheDocument();
    expect(screen.queryByText("해당 품목·부서의 불량 재고가 없습니다.")).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 저장 필터와 충돌해도 레거시 불량 기록은 보이고 저장값은 보존된다", async (layout) => {
    const key = "dexcowin_mes_defect_filters:viewer";
    const saved = JSON.stringify({ version: 2, scope: "my", actorScope: "mine", sort: "oldest", selectedDepartments: ["조립"], selectedModels: ["SOLO"], selectedProcessSteps: ["F"] });
    localStorage.setItem(key, saved);
    vi.mocked(defectsApi.listDefects).mockResolvedValue([{ ...row, management_category: undefined, defective_at: null, is_legacy: true, reason_memo: "레거시 대상" }]);
    await openEntry(layout);
    expect(await screen.findByText("레거시 대상")).toBeInTheDocument();
    expect(localStorage.getItem(key)).toBe(saved);
  });
});
