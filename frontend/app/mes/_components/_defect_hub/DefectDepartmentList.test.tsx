import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectDepartmentList } from "./DefectDepartmentList";
import type { DefectLocation } from "@/lib/api/types/defects";

function makeLocation(overrides: Partial<DefectLocation> = {}): DefectLocation {
  return {
    item_id: "item-1",
    item_name: "AX-100",
    mes_code: "AX-001",
    department: "Assembly",
    quantity: 2,
    defective_at: "2026-07-01T00:00:00Z",
    reason_category: "dimension",
    reason_memo: "left bracket scratched",
    quarantined_by: "김길호",
    quarantined_by_employee_id: "employee-1",
    has_bom: false,
    ...overrides,
  };
}

describe("DefectDepartmentList", () => {
  it("renders defect reason category and memo on each row", () => {
    render(
      <DefectDepartmentList
        locations={[makeLocation()]}
        onProcess={vi.fn()}
      />,
    );

    expect(screen.getByText("사유 dimension · left bracket scratched")).toBeInTheDocument();
  });

  it("renders the quarantine date and actor together", () => {
    render(<DefectDepartmentList locations={[makeLocation()]} onProcess={vi.fn()} />);

    expect(screen.getByText("격리 2026-07-01 · 김길호")).toBeInTheDocument();
  });

  it.each([null, "", "   "])("renders an unknown actor for %j", (quarantinedBy) => {
    render(
      <DefectDepartmentList
        locations={[makeLocation({ quarantined_by: quarantinedBy })]}
        onProcess={vi.fn()}
      />,
    );

    expect(screen.getByText("격리 2026-07-01 · 처리자 미상")).toBeInTheDocument();
  });
});
