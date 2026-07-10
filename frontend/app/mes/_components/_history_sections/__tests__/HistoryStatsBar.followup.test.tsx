import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryStatsBar } from "../HistoryStatsBar";

describe("HistoryStatsBar follow-up count grammar", () => {
  it("shows a single period count when the filtered count equals the period total", () => {
    render(
      <HistoryStatsBar
        baseline={{ total: 611, warehouseCount: 97, deptCount: 451, adjustCount: 17, departmentCounts: {} }}
        currentCount={611}
        loading={false}
        periodLabel="\uC774\uBC88\uB2EC"
      />,
    );

    expect(document.querySelector(".text-3xl")?.textContent).toContain("611");
    expect(screen.queryByText("\uBAA9\uB85D \uC870\uAC74")).not.toBeInTheDocument();
    expect(screen.queryByText("\uAE30\uAC04 \uC804\uCCB4 611\uAC74")).not.toBeInTheDocument();
  });
});
