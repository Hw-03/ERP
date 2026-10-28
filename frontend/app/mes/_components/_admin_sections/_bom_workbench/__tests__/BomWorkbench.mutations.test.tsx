import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { api, type BOMDetailEntry, type BOMEntry, type Item } from "@/lib/api";
import { catalogApi } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/queries/keys";
import { BomWorkbench } from "../BomWorkbench";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const parent = { item_id: "parent-1", item_name: "상위 품목", mes_code: "AA-001", process_type_code: "AA",
  bom_completed_at: null, updated_at: "before", quantity: 18, warehouse_qty: 12, pending_quantity: 3,
  available_quantity: 15, has_bom: true, model_slots: [2, 5], work_reservations: { quantity: 3 } } as unknown as Item;
const child = { item_id: "child-1", item_name: "현재 자식", mes_code: "AR-001", process_type_code: "AR", unit: "EA", serial_no: 1 } as Item;
const candidate = { ...child, item_id: "child-2", item_name: "추가 후보", mes_code: "TA-001", process_type_code: "TA" };
const row: BOMEntry = { bom_id: "bom-1", parent_item_id: parent.item_id, child_item_id: child.item_id, quantity: 2, unit: "EA", notes: null };
const detailRow: BOMDetailEntry = { ...row, parent_item_name: parent.item_name, parent_mes_code: parent.mes_code,
  child_item_name: child.item_name, child_mes_code: child.mes_code };
let client: QueryClient;
let status: ReturnType<typeof vi.fn>;
let error: ReturnType<typeof vi.fn>;
let refreshItems: ReturnType<typeof vi.fn>;
let refreshAllBom: ReturnType<typeof vi.fn>;

function show(items: Item[] = [parent, child, candidate], rows: BOMEntry[] = [row]) {
  client.setQueryData(queryKeys.bom.detail(parent.item_id), rows);
  function Harness() {
    const [currentItems, setItems] = useState(items);
    return <BomWorkbench items={currentItems} setItems={setItems} allBomRows={rows.length ? [detailRow] : []}
      refreshAllBom={refreshAllBom} refreshItems={refreshItems} onStatusChange={status} onError={error} />;
  }
  return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
}

function changeQuantity(container: HTMLElement, quantity: number): void {
  const currentRow = container.querySelector<HTMLElement>("div[data-bom-row-surface]")!;
  fireEvent.click(within(currentRow).getByTitle("클릭하여 수량 수정"));
  const input = within(currentRow).getByRole("spinbutton");
  fireEvent.change(input, { target: { value: String(quantity) } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
}

function openAdd(name = candidate.item_name): HTMLElement {
  const label = screen.getByText("하위 품목 추가");
  const panel = label.closest<HTMLElement>("[data-scrollbar-rail-shell]")!;
  fireEvent.click(within(panel).getByText(name));
  return panel;
}

describe("BOM 저장 응답 즉시 반영", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    window.history.replaceState({}, "", "/mes?tab=admin");
    status = vi.fn(); error = vi.fn(); refreshItems = vi.fn(); refreshAllBom = vi.fn();
    vi.spyOn(catalogApi, "getBOMWhereUsed").mockResolvedValue([]);
  });
  afterEach(() => { client.clear(); });

  it("추가는 서버 응답 전 캐시를 유지하고 응답 후 정렬·메타데이터를 반영하며 조회를 기다리지 않는다", async () => {
    const save = deferred<BOMEntry>();
    const background = deferred<BOMEntry[]>();
    vi.spyOn(catalogApi, "getBOM").mockReturnValue(background.promise);
    const create = vi.spyOn(api, "createBOM").mockReturnValue(save.promise);
    client.setQueryData(queryKeys.bom.list(), [detailRow]);
    const { container } = show();
    const addPanel = openAdd();
    const input = within(addPanel).getByRole("spinbutton");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([row]);
    expect(status).not.toHaveBeenCalled();
    const saved = { ...row, bom_id: "bom-2", child_item_id: candidate.item_id, quantity: 1, notes: "server" };
    await act(async () => { save.resolve(saved); });
    await waitFor(() => expect(status).toHaveBeenCalledWith('"추가 후보" 을(를) 추가했습니다.'));
    expect(within(addPanel).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([saved, row]);
    expect(client.getQueryData(queryKeys.bom.list())).toEqual([detailRow, {
      ...saved, parent_item_name: parent.item_name, parent_mes_code: parent.mes_code,
      child_item_name: candidate.item_name, child_mes_code: candidate.mes_code,
    }]);
    expect(container.querySelectorAll("div[data-bom-row-surface]")).toHaveLength(2);
    expect(refreshAllBom).not.toHaveBeenCalled();
    expect(refreshItems).not.toHaveBeenCalled();
  });

  it("같은 부모의 연속 저장을 막고 수량 서버 응답 직후 편집 잠금을 해제한다", async () => {
    const save = deferred<BOMEntry>();
    const background = deferred<BOMEntry[]>();
    vi.spyOn(catalogApi, "getBOM").mockReturnValue(background.promise);
    const update = vi.spyOn(api, "updateBOM").mockReturnValue(save.promise);
    const { container } = show();
    changeQuantity(container, 7);
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("클릭하여 수량 수정")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "검토 · 완료" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([row]);
    await act(async () => { save.resolve({ ...row, quantity: 7, notes: "server note" }); });
    await waitFor(() => expect(status).toHaveBeenCalledWith("수량을 변경했습니다."));
    expect(screen.getByTitle("클릭하여 수량 수정")).toBeEnabled();
    expect(screen.getByText("7EA")).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([{ ...row, quantity: 7, notes: "server note" }]);
    expect(refreshAllBom).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("클릭하여 수량 수정"));
    expect(screen.getByRole("spinbutton")).toHaveValue(7);
  });

  it("검색 목록에 기존 자식 메타데이터가 없어도 수량과 full 캐시를 갱신하고 기존 정렬을 보존한다", async () => {
    vi.spyOn(catalogApi, "getBOM").mockImplementation(() => new Promise(() => {}));
    const saved = { ...row, quantity: 5 };
    vi.spyOn(api, "updateBOM").mockResolvedValue(saved);
    const secondRow = { ...row, bom_id: "second", child_item_id: candidate.item_id };
    client.setQueryData(queryKeys.bom.list(), [detailRow]);
    const { container } = show([parent, candidate], [row, secondRow]);
    changeQuantity(container, 5);
    await waitFor(() => expect(status).toHaveBeenCalledWith("수량을 변경했습니다."));
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([saved, secondRow]);
    expect(client.getQueryData(queryKeys.bom.list())).toEqual([{ ...detailRow, quantity: 5 }]);
  });

  it("기존 full 목록의 이름과 코드가 품목 목록과 달라도 수량 수정은 고유 메타데이터를 보존한다", async () => {
    vi.spyOn(catalogApi, "getBOM").mockImplementation(() => new Promise(() => {}));
    vi.spyOn(api, "updateBOM").mockResolvedValue({ ...row, quantity: 4, unit: "SET" });
    const rich = { ...detailRow, parent_item_name: "전체 목록 부모", parent_mes_code: "FULL-P",
      child_item_name: "전체 목록 자식", child_mes_code: "FULL-C" };
    client.setQueryData(queryKeys.bom.list(), [rich]);
    const { container } = show();
    changeQuantity(container, 4);
    await waitFor(() => expect(status).toHaveBeenCalledWith("수량을 변경했습니다."));
    expect(client.getQueryData(queryKeys.bom.list())).toEqual([{ ...rich, quantity: 4, unit: "SET" }]);
  });

  it("신규 추가에서 기존 자식의 정렬 메타데이터가 없으면 기존 행 순서를 유지한다", async () => {
    vi.spyOn(catalogApi, "getBOM").mockImplementation(() => new Promise(() => {}));
    const saved = { ...row, bom_id: "new", child_item_id: candidate.item_id, quantity: 1 };
    vi.spyOn(api, "createBOM").mockResolvedValue(saved);
    show([parent, candidate], [row]);
    const panel = openAdd();
    fireEvent.click(within(panel).getByRole("button", { name: "추가 (Enter)" }));
    await waitFor(() => expect(status).toHaveBeenCalledWith('"추가 후보" 을(를) 추가했습니다.'));
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([row, saved]);
  });

  it("이전 부모 저장 중 다른 부모를 선택·저장할 수 있고 늦은 응답은 원래 캐시에만 반영한다", async () => {
    const save = deferred<BOMEntry>();
    vi.spyOn(api, "updateBOM").mockReturnValue(save.promise);
    const other = { ...parent, item_id: "parent-2", item_name: "다른 부모" };
    client.setQueryData(queryKeys.bom.detail(other.item_id), []);
    vi.spyOn(catalogApi, "getBOM").mockImplementation((id) => new Promise(() => { void id; }));
    const create = vi.spyOn(api, "createBOM").mockResolvedValue({ ...row, bom_id: "other-bom", parent_item_id: other.item_id, child_item_id: candidate.item_id });
    const { container } = show([parent, other, child, candidate]);
    changeQuantity(container, 8);
    fireEvent.click(screen.getByRole("button", { name: /다른 부모/, pressed: false }));
    await screen.findByText("등록된 BOM 이 없습니다");
    const panel = openAdd();
    fireEvent.click(within(panel).getByRole("button", { name: "추가 (Enter)" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.getQueryData<BOMEntry[]>(queryKeys.bom.detail(other.item_id))?.[0]?.bom_id).toBe("other-bom"));
    await act(async () => { save.resolve({ ...row, quantity: 8 }); });
    await waitFor(() => expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([{ ...row, quantity: 8 }]));
    expect(client.getQueryData<BOMEntry[]>(queryKeys.bom.detail(other.item_id))?.[0]?.bom_id).toBe("other-bom");
    expect(container.querySelector("div[data-bom-row-surface]")).toHaveTextContent("추가 후보");
    expect(container.querySelector("div[data-bom-row-surface]")).not.toHaveTextContent("현재 자식");
    expect(client.getQueryData(queryKeys.bom.list())).toBeUndefined();
  });

  it("삭제 실패는 모달과 캐시를 유지하고 재시도 성공 응답 후 행과 모달을 즉시 제거한다", async () => {
    const background = deferred<BOMEntry[]>();
    vi.spyOn(catalogApi, "getBOM").mockReturnValue(background.promise);
    const remove = vi.spyOn(api, "deleteBOM").mockRejectedValueOnce(new Error("삭제 거절")).mockResolvedValueOnce(undefined);
    client.setQueryData(queryKeys.bom.list(), [detailRow]);
    const { container } = show();
    fireEvent.click(screen.getByTitle("삭제"));
    const dialog = screen.getByRole("dialog", { name: "BOM 자식 품목 삭제" });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("삭제 거절"));
    expect(dialog).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([row]);
    expect(status).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(status).toHaveBeenCalledWith('"현재 자식" 을(를) 삭제했습니다.'));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container.querySelector("div[data-bom-row-surface]")).toBeNull();
    expect(client.getQueryData(queryKeys.bom.list())).toEqual([]);
  });

  it("완료 실패는 모달을 유지하고 성공 시 두 필드만 기존 품목 상태·캐시에 병합한다", async () => {
    vi.spyOn(catalogApi, "getBOM").mockImplementation(() => new Promise(() => {}));
    const serverItem = { ...parent, bom_completed_at: "completed", updated_at: "after", quantity: 0,
      warehouse_qty: 0, pending_quantity: 0, available_quantity: 0, has_bom: false, model_slots: [], work_reservations: undefined };
    const update = vi.spyOn(api, "updateBomCompletion").mockRejectedValueOnce(new Error("완료 거절")).mockResolvedValueOnce(serverItem);
    const listKey = queryKeys.items.list({ limit: 2000 });
    const secondListKey = queryKeys.items.list({ search: "상위" });
    client.setQueryData(listKey, [parent, child]);
    client.setQueryData(secondListKey, [{ ...parent, quantity: 99 }]);
    client.setQueryData(queryKeys.items.detail(parent.item_id), parent);
    show();
    fireEvent.click(screen.getByRole("button", { name: "검토 · 완료" }));
    const dialog = screen.getByRole("dialog", { name: "BOM 검토 · 완료" });
    fireEvent.click(within(dialog).getByRole("button", { name: "완료로 표시" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("완료 거절"));
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "완료로 표시" }));
    await waitFor(() => expect(status).toHaveBeenCalledWith('"상위 품목" 완료 처리됨'));
    const expected = { ...parent, bom_completed_at: "completed", updated_at: "after" };
    expect(client.getQueryData(listKey)).toEqual([expected, child]);
    expect(client.getQueryData(secondListKey)).toEqual([{ ...expected, quantity: 99 }]);
    expect(client.getQueryData(queryKeys.items.detail(parent.item_id))).toEqual(expected);
    expect(client.getQueryData(queryKeys.items.list({}))).toBeUndefined();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTitle("클릭하여 수량 수정")).toBeDisabled();
    expect(update).toHaveBeenCalledTimes(2);
    expect(refreshItems).not.toHaveBeenCalled();
  });

  it("연결 오류를 자동 재전송하지 않고 서버 성공 캐시와 알림을 만들지 않는다", async () => {
    vi.spyOn(catalogApi, "getBOM").mockResolvedValue([row]);
    const update = vi.spyOn(api, "updateBOM").mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = show();
    changeQuantity(container, 9);
    await waitFor(() => expect(error).toHaveBeenCalledWith("Failed to fetch"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([row]);
    expect(screen.getByTitle("클릭하여 수량 수정")).toBeEnabled();
  });

  it("저장 성공 뒤 후행 조회 실패는 별도 안내하며 확정 캐시와 편집 가능 상태를 유지한다", async () => {
    vi.spyOn(catalogApi, "getBOM").mockRejectedValue(new Error("조회 실패"));
    vi.spyOn(api, "updateBOM").mockResolvedValue({ ...row, quantity: 6 });
    const { container } = show();
    changeQuantity(container, 6);
    await waitFor(() => expect(error).toHaveBeenCalledWith("저장됐지만 최신 목록 조회에 실패했습니다."));
    expect(status).toHaveBeenCalledWith("수량을 변경했습니다.");
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([{ ...row, quantity: 6 }]);
    expect(screen.getByTitle("클릭하여 수량 수정")).toBeEnabled();
  });

  it("저장과 후행 조회가 모두 실패하면 저장됐다는 안내를 만들지 않는다", async () => {
    vi.spyOn(catalogApi, "getBOM").mockRejectedValue(new Error("조회 실패"));
    vi.spyOn(api, "updateBOM").mockRejectedValue(new Error("저장 실패"));
    const { container } = show();
    changeQuantity(container, 6);
    await waitFor(() => expect(error).toHaveBeenCalledWith("최신 목록 조회에 실패했습니다."));
    expect(error).toHaveBeenCalledWith("저장 실패");
    expect(status).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.bom.detail(parent.item_id))).toEqual([row]);
  });
});
