import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WarehouseSectionTabs } from "../WarehouseSectionTabs";

describe("mobile warehouse inbox presentation", () => {
  it("marks unavailable counts without presenting them as zero or loading", () => {
    render(<WarehouseSectionTabs mobilePresentation mobileInboxView active="queue" onChange={vi.fn()} showQueue showDeptQueue={false} unavailableCounts={["queue"]} />);
    expect(screen.getByLabelText("창고 승인함 건수 확인 실패")).toHaveTextContent("—");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("opens the inbox without switching work and forwards the existing section only on selection", () => {
    const onChange = vi.fn();
    const onOpen = vi.fn();
    const props = { active: "compose" as const, onChange, showQueue: true, showDeptQueue: true, queueCount: 7, deptQueueCount: 3, mobilePresentation: true };
    const { rerender } = render(<WarehouseSectionTabs {...props} onMobileInboxOpen={onOpen} />);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    fireEvent.click(screen.getByRole("tab", { name: "승인함" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "부서 승인함 3" })).not.toBeInTheDocument();
    rerender(<WarehouseSectionTabs {...props} mobileInboxView />);
    fireEvent.click(screen.getByRole("button", { name: "부서 승인함 3" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("dept-queue");
  });

  it("preserves permission filtering and the selected inbox label", () => {
    const props = { active: "queue" as const, onChange: vi.fn(), showQueue: true, showDeptQueue: false, queueCount: 7, mobilePresentation: true };
    const { rerender } = render(<WarehouseSectionTabs {...props} />);
    expect(screen.getByText("창고 승인함", { selector: "p" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "승인함" })).toHaveAttribute("aria-selected", "true");
    rerender(<WarehouseSectionTabs {...props} mobileInboxView />);
    expect(screen.queryByText("부서 승인함")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "창고 승인함 7" })).toBeInTheDocument();
  });
});
