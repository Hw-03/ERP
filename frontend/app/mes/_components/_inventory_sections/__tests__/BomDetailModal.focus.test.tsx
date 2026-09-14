import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { BomDetailModal } from "../BomDetailModal";

vi.mock("../../_warehouse_v2/BomSubExpander", () => ({
  getBomBranchItemIds: () => [],
  ModalBomTree: () => null,
  useBomTree: () => ({ tree: false, retry: vi.fn() }),
}));

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>BOM 호출자</button>
      {open && <BomDetailModal itemId="item-1" open onClose={() => setOpen(false)} />}
    </>
  );
}

describe("BomDetailModal focus", () => {
  it.each([
    ["닫기 버튼", () => fireEvent.click(screen.getByRole("button", { name: "닫기" }))],
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
  ])("%s로 닫으면 호출자 포커스를 복구한다", async (_name, close) => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "BOM 호출자" });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("dialog");
    const closeButton = screen.getByRole("button", { name: "닫기" });
    closeButton.focus();
    expect(closeButton).toHaveFocus();

    close();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});
