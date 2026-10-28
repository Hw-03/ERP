import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { BOMEntry, Item } from "@/lib/api";
import { BomChildAddBox } from "../BomChildAddBox";
import { BomReviewModal } from "../BomReviewModal";

const parent = { item_id: "parent", item_name: "부모", process_type_code: "AA", mes_code: "AA-1" } as Item;
const child = { item_id: "child", item_name: "후보 자식", process_type_code: "AR", mes_code: "AR-1", unit: "EA" } as Item;
const row: BOMEntry = { bom_id: "bom", parent_item_id: parent.item_id, child_item_id: child.item_id, quantity: 1, unit: "EA", notes: null };

describe("BOM 저장 컨트롤의 동기 잠금", () => {
  it("추가 Enter 연타를 차단하고 이전 부모 응답이 새 부모의 입력을 닫지 않는다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolve!: (ok: boolean) => void;
    const onAdd = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const other = { ...parent, item_id: "other" };
    const props = { items: [parent, other, child], bomRows: [], onAdd };
    const { rerender } = render(<QueryClientProvider client={client}><BomChildAddBox {...props} parent={parent} /></QueryClientProvider>);
    fireEvent.click(screen.getByText(child.item_name));
    const firstInput = screen.getByRole("spinbutton");
    fireEvent.keyDown(firstInput, { key: "Enter" });
    fireEvent.keyDown(firstInput, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledTimes(1);
    rerender(<QueryClientProvider client={client}><BomChildAddBox {...props} parent={other} /></QueryClientProvider>);
    fireEvent.click(screen.getByText(child.item_name));
    const secondInput = screen.getByRole("spinbutton");
    fireEvent.change(secondInput, { target: { value: "9" } });
    await act(async () => { resolve(true); });
    expect(secondInput).toBeInTheDocument();
    expect(secondInput).toHaveValue(9);
    expect(screen.getByRole("button", { name: "추가 (Enter)" })).toBeEnabled();
    client.clear();
  });

  it("완료 Enter 연타를 한 번으로 제한하고 실패 결과에서는 모달을 유지한다", async () => {
    let resolve!: (ok: boolean) => void;
    const onConfirm = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const onClose = vi.fn();
    render(<BomReviewModal parent={parent} rows={[row]} items={[parent, child]} isCompleted={false}
      onConfirm={onConfirm} onClose={onClose} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(false); });
    await waitFor(() => expect(screen.getByRole("button", { name: "완료로 표시" })).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
