import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopDefectView } from "../DesktopDefectView";
import { DefectHubPanel } from "../_defect_hub/DefectHubPanel";
import type { Operator } from "../login/useCurrentOperator";
import type { DefectLocation, DefectManagementCategory } from "@/lib/api/types/defects";

const api = vi.hoisted(() => ({ listDefects: vi.fn(), unquarantine: vi.fn() }));
vi.mock("@/lib/api/defects", () => ({ defectsApi: api }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => null }));
vi.mock("../_warehouse_hooks/useWarehouseData", () => ({ useWarehouseData: () => ({ items: [], productModels: [] }) }));
vi.mock("../_defect_hub/ReasonFormFields", async () => ({
  ReasonFormFields: (await import("../_defect_hub/__tests__/reasonFormFieldsStub")).ReasonFormFieldsStub,
}));

const operator = { employee_id: "tester", name: "검증 작업자", department: "조립", warehouse_role: "none", department_role: "none" } as Operator;
const shellState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["mes"], mobileShippingIndex: 8, mobileTargetEntry: { source: "test" } };
let records: DefectLocation[];

function fixture(category: DefectManagementCategory): DefectLocation {
  return { record_id: "record-storage", item_id: "item-storage", item_name: "보관 검증 품목", mes_code: "STORE-001", department: "조립", quantity: 5, original_quantity: 5, available_quantity: 5, pending_quantity: 0, management_category: category, defective_at: null, quarantined_by: operator.name, quarantined_by_employee_id: operator.employee_id, is_legacy: false, legacy_origin: null, has_bom: false };
}

function mount(mobile: boolean): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{mobile ? <DefectHubPanel currentEmployee={operator} mobilePresentation /> : <DesktopDefectView operator={operator} />}</QueryClientProvider>);
}

async function traverse(direction: "back" | "forward"): Promise<void> {
  await act(async () => {
    const popped = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { window.removeEventListener("popstate", onPop); reject(new Error("history traversal did not dispatch popstate")); }, 1000);
      const onPop = (): void => { window.clearTimeout(timer); resolve(); };
      window.addEventListener("popstate", onPop, { once: true });
    });
    window.history[direction]();
    await popped;
  });
}

async function openRestore(): Promise<void> {
  await screen.findByText("보관 검증 품목", { exact: true });
  const group = screen.queryByRole("button", { name: /보관 검증 품목 격리 1건$/ });
  if (group && group.getAttribute("aria-expanded") !== "true") fireEvent.click(group);
  fireEvent.click(await screen.findByRole("button", { name: "정상 복귀", exact: true }));
  expect(await screen.findByRole("spinbutton")).toHaveValue(records[0].available_quantity);
}

async function complete(qty: number): Promise<void> {
  const expectedTransactions = api.unquarantine.mock.calls.length + 1;
  const expectedReads = api.listDefects.mock.calls.length + 1;
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: qty } });
  fireEvent.change(screen.getByRole("combobox", { name: "사유 카테고리" }), { target: { value: "검사 통과" } });
  fireEvent.click(screen.getByRole("button", { name: "정상 복귀 →" }));
  fireEvent.click(await screen.findByRole("button", { name: "즉시 복귀" }));
  await waitFor(() => expect(api.unquarantine).toHaveBeenCalledTimes(expectedTransactions));
  await waitFor(() => expect(api.listDefects).toHaveBeenCalledTimes(expectedReads));
}

beforeEach(() => {
  records = [fixture("B_GRADE")];
  api.listDefects.mockReset().mockImplementation(async () => records.map((record) => ({ ...record })));
  api.unquarantine.mockReset().mockImplementation(async ({ qty }: { qty: number }) => {
    records = records.flatMap((record) => Number(record.available_quantity) > qty ? [{ ...record, quantity: Number(record.quantity) - qty, available_quantity: Number(record.available_quantity) - qty }] : []);
  });
  window.localStorage.clear();
  window.history.pushState({ ...shellState, defect: "hub" }, "");
});
afterEach(cleanup);

describe.each([false, true])("보관 정상 복귀 history mobile=%s", (mobile) => {
  it("허브에서 새 작업을 열 때 이전 작업의 선택값을 이어받지 않는다", async () => {
    window.history.replaceState({ ...shellState, defect: "hub", action: "scrap", source: "warehouse" }, "");
    mount(mobile);
    await waitFor(() => expect(api.listDefects).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /불량 처리/ }));
    expect(window.history.state).toMatchObject({ ...shellState, defect: "work-choice", action: null, source: null });
  });

  it.each(["B_GRADE", "OBSOLETE"] as const)("%s 부분 완료 후 한 번 Back은 허브이고 Forward는 완료 폼을 열지 않는다", async (category) => {
    records = [fixture(category)];
    mount(mobile);
    fireEvent.click(screen.getByRole("button", { name: /B급·구형 자재/ }));
    const storageState = window.history.state;
    const storageLength = window.history.length;
    await openRestore();
    expect(window.history.state).toMatchObject({ ...shellState, defect: "process", restoreOnly: true });
    expect(window.history.length).toBe(storageLength + 1);

    // 실제 브라우저 이동과 취소 버튼을 번갈아 반복한다.
    await traverse("back");
    expect(window.history.state).toEqual(storageState);
    await openRestore();
    fireEvent.click(screen.getByRole("button", { name: "목록", exact: true }));
    await waitFor(() => expect(window.history.state).toEqual(storageState));
    await openRestore();
    await complete(2);
    await waitFor(() => expect(window.history.state).toEqual(storageState));
    expect((await screen.findAllByText("3개", { exact: true })).length).toBeGreaterThan(0);
    expect(api.unquarantine).toHaveBeenCalledWith(expect.objectContaining({ record_id: "record-storage", qty: 2 }));

    await traverse("back");
    expect(window.history.state).toMatchObject({ ...shellState, defect: "hub" });
    expect(screen.getByRole("button", { name: /격리 목록/ })).toBeInTheDocument();
    await traverse("forward");
    await traverse("forward");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(api.unquarantine).toHaveBeenCalledTimes(1);
  });

  it("부분 복귀를 반복해도 보관 앞에는 허브 한 개만 남는다", async () => {
    mount(mobile);
    fireEvent.click(screen.getByRole("button", { name: /B급·구형 자재/ }));
    const storageState = window.history.state;
    await openRestore();
    await complete(2);
    await waitFor(() => expect(window.history.state).toEqual(storageState));
    await openRestore();
    await complete(1);
    await waitFor(() => expect(window.history.state).toEqual(storageState));
    expect((await screen.findAllByText("2개", { exact: true })).length).toBeGreaterThan(0);
    await traverse("back");
    expect(window.history.state.defect).toBe("hub");
    expect(api.unquarantine).toHaveBeenCalledTimes(2);
    await traverse("forward");
    await traverse("forward");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(api.unquarantine).toHaveBeenCalledTimes(2);
  });

  it.each(["B_GRADE", "OBSOLETE"] as const)("%s 전량 완료 후 목록을 갱신하고 작업 선택 버튼은 허브로 복귀한다", async (category) => {
    records = [fixture(category)];
    mount(mobile);
    fireEvent.click(screen.getByRole("button", { name: /B급·구형 자재/ }));
    await openRestore();
    await complete(5);
    expect(await screen.findByText("보관 중인 B급·구형 자재가 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "작업 선택", exact: true }));
    await waitFor(() => expect(window.history.state.defect).toBe("hub"));
    expect(screen.getByRole("button", { name: /격리 목록/ })).toBeInTheDocument();
    expect(api.unquarantine).toHaveBeenCalledWith(expect.objectContaining({ qty: 5 }));
  });

  it("직접 보관 진입 완료는 목록 재조회 후 안전한 허브로 돌아간다", async () => {
    window.history.replaceState({ ...shellState, defect: "storage" }, "");
    mount(mobile);
    await openRestore();
    await complete(2);
    expect(await screen.findByRole("button", { name: /격리 목록/ })).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ ...shellState, defect: "hub" });
    expect(records[0].available_quantity).toBe(3);
  });

  it("옛 중복 보관 기록으로 Back하면 허브로 정규화한다", async () => {
    window.history.replaceState({ ...shellState, defect: "storage" }, "");
    window.history.pushState({ ...shellState, defect: "storage" }, "");
    mount(mobile);
    await traverse("back");
    expect(window.history.state).toMatchObject({ ...shellState, defect: "hub" });
    expect(screen.getByRole("button", { name: /격리 목록/ })).toBeInTheDocument();
  });

  it("기록 데이터 없는 정상 복귀 process 직접 복원은 허브로 정규화한다", async () => {
    window.history.replaceState({ ...shellState, defect: "process", restoreOnly: true, recordId: "record-storage" }, "");
    mount(mobile);
    expect(await screen.findByRole("button", { name: /격리 목록/ })).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ ...shellState, defect: "hub" });
    expect(api.unquarantine).not.toHaveBeenCalled();
  });
});
