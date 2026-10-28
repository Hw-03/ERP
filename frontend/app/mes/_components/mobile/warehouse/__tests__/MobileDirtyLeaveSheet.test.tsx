import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MobileDirtyLeaveSheet } from "../MobileDirtyLeaveSheet";

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
}));

describe("MobileDirtyLeaveSheet", () => {
  it("조사 중 추가 변경은 저장 불가 사유와 기존 초안을 유지하는 이동을 안내한다", () => {
    render(<MobileDirtyLeaveSheet open onConfirm={vi.fn()} onCancel={vi.fn()} onDiscard={vi.fn()}
      saveBlockedReason="재고 조사 중 추가 변경은 저장할 수 없습니다. 기존 서버 초안은 유지됩니다." />);
    expect(screen.getByText(/기존 서버 초안은 유지/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "임시저장하고 이동" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "추가 변경 저장 없이 이동" })).toBeEnabled();
  });
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
