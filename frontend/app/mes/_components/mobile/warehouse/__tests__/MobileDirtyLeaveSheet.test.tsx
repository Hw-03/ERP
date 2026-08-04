import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MobileDirtyLeaveSheet } from "../MobileDirtyLeaveSheet";

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
}));

describe("MobileDirtyLeaveSheet", () => {
  it("locks every leave action while the draft flush is pending", async () => {
    let release: (() => void) | undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));

    render(
      <MobileDirtyLeaveSheet
        open
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "임시저장하고 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "저장 중…" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "저장 안 하고 나가기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "계속 작성" })).toBeDisabled();

    await act(async () => release?.());
    expect(screen.getByRole("button", { name: "임시저장하고 이동" })).toBeEnabled();
  });
});
