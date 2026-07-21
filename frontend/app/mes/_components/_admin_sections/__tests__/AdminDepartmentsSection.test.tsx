import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AdminDepartmentsSection } from "../AdminDepartmentsSection";

const assembly = { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" };

const context = {
  departments: [assembly],
  addName: "",
  setAddName: vi.fn(),
  addDepartmentMaster: vi.fn(),
  selectedDept: assembly,
  setSelectedDept: vi.fn(),
  setDirty: vi.fn(),
};

vi.mock("../AdminDepartmentsContext", () => ({
  useAdminDepartmentsContext: () => context,
}));

vi.mock("../../DepartmentsContext", () => ({
  useRefreshDepartments: () => vi.fn(),
}));

describe("AdminDepartmentsSection", () => {
  it("counts related items from their process type instead of their legacy department field", () => {
    render(
      <DirtyGuardProvider>
        <AdminDepartmentsSection
          employees={[]}
          items={[
            { item_id: "assembly", item_name: "조립 품목", process_type_code: "AA", department: "기타" },
            { item_id: "tube", item_name: "튜브 품목", process_type_code: "TR", department: "조립" },
            { item_id: "unmapped", item_name: "미매핑 품목", process_type_code: null, department: "조립" },
          ] as any}
          adminPin="0000"
          setDepartments={vi.fn()}
          onStatusChange={vi.fn()}
          onError={vi.fn()}
        />
      </DirtyGuardProvider>,
    );

    expect(screen.getByText("관련 품목").parentElement).toHaveTextContent("1개");
  });
});
