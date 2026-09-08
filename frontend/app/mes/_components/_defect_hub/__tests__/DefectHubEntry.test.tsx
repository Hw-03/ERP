import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectHubEntry } from "../DefectHubEntry";

describe("DefectHubEntry", () => {
  it("renders work cards in a two-by-two desktop grid with stable navigation order", () => {
    const onSelect = vi.fn();
    const { container } = render(<DefectHubEntry onSelect={onSelect} />);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    const labels = ["불량 격리", "바로 처리", "격리 목록", "불량 통계"];
    const ids = ["quarantine", "scrap", "list", "statistics"];
    screen.getAllByRole("button").forEach((button, index) => {
      expect(button).toHaveTextContent(labels[index]);
      fireEvent.click(button);
      expect(onSelect).toHaveBeenNthCalledWith(index + 1, ids[index]);
    });
    expect(container.firstElementChild).toHaveClass("grid-cols-1", "md:grid-cols-2", "md:grid-rows-2");
    expect(container.firstElementChild).not.toHaveClass("xl:grid-cols-4");
  });
});
