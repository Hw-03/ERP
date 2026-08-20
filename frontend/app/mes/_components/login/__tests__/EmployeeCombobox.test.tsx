import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Employee } from "@/lib/api";
import { EmployeeCombobox } from "../EmployeeCombobox";

const employee = {
  employee_id: "emp-1",
  employee_code: "E1",
  name: "김현우",
  department: "조립",
} as Employee;

describe("EmployeeCombobox", () => {
  it("prevents a closed combobox Enter from submitting its parent form", () => {
    render(
      <form>
        <EmployeeCombobox employees={[employee]} value={employee} onChange={vi.fn()} />
      </form>,
    );

    const enter = createEvent.keyDown(screen.getByRole("combobox"), {
      key: "Enter",
      code: "Enter",
      cancelable: true,
    });
    fireEvent(screen.getByRole("combobox"), enter);

    expect(enter.defaultPrevented).toBe(true);
  });
});
