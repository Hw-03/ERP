import { describe, expect, it } from "vitest";
import * as inventory from "../inventory";

const item = {
  warehouse_qty: 10,
  pending_quantity: 2,
  department_pending_quantity: 3,
  locations: [
    { department: "조립", status: "PRODUCTION", quantity: 8, pending_quantity: 3, available_quantity: 5 },
    { department: "조립", status: "DEFECTIVE", quantity: 4 },
  ],
};

type InventoryReservationHelpers = {
  warehousePending: (value: typeof item) => number;
  warehouseAvailable: (value: typeof item) => number;
  findInventoryLocation: (
    value: typeof item,
    department: string | null | undefined,
    status: "PRODUCTION" | "DEFECTIVE",
  ) => (typeof item.locations)[number] | undefined;
  locationPending: (location: (typeof item.locations)[number] | undefined) => number;
  locationAvailable: (location: (typeof item.locations)[number] | undefined) => number;
  totalApprovalPending: (value: typeof item) => number;
  ioLineAvailable: (value: typeof item, line: { from_bucket: string; from_department?: string | null; to_bucket: string; to_department?: string | null }) => number | null;
};

const helpers = inventory as unknown as Partial<InventoryReservationHelpers>;

describe("inventory reservation helpers", () => {
  it("keeps warehouse and department approval reservations separate while totaling the approval wait", () => {
    expect(helpers.warehousePending?.(item)).toBe(2);
    expect(helpers.warehouseAvailable?.(item)).toBe(8);
    expect(helpers.totalApprovalPending?.(item)).toBe(5);
  });

  it("finds an exact department location and subtracts only its own pending quantity", () => {
    const production = helpers.findInventoryLocation?.(item, "조립", "PRODUCTION");
    const defective = helpers.findInventoryLocation?.(item, "조립", "DEFECTIVE");

    expect(production).toMatchObject({ quantity: 8, pending_quantity: 3 });
    expect(helpers.locationPending?.(production)).toBe(3);
    expect(helpers.locationAvailable?.(production)).toBe(5);
    expect(helpers.locationPending?.(defective)).toBe(0);
    expect(helpers.locationAvailable?.(defective)).toBe(4);
  });

  it("uses zero pending and physical quantity fallbacks while rolling backend fields out", () => {
    const legacyItem = {
      warehouse_qty: 7,
      pending_quantity: 1,
      locations: [{ department: "조립", status: "PRODUCTION" as const, quantity: 6 }],
    };
    const location = helpers.findInventoryLocation?.(legacyItem, "조립", "PRODUCTION");

    expect(helpers.warehouseAvailable?.(legacyItem)).toBe(6);
    expect(helpers.totalApprovalPending?.(legacyItem)).toBe(1);
    expect(helpers.locationPending?.(location)).toBe(0);
    expect(helpers.locationAvailable?.(location)).toBe(6);

    const pendingOnlyLocation = { department: "조립", status: "PRODUCTION" as const, quantity: 6, pending_quantity: 2 };
    expect(helpers.locationAvailable?.(pendingOnlyLocation)).toBe(4);

    const backendAvailableLocation = {
      department: "조립",
      status: "PRODUCTION" as const,
      quantity: 6,
      pending_quantity: 2,
      available_quantity: 1,
    };
    expect(helpers.locationAvailable?.(backendAvailableLocation)).toBe(1);
  });

  it("uses only the line's warehouse or department location reservation for outbound limits", () => {
    expect(helpers.ioLineAvailable?.(item, {
      from_bucket: "warehouse",
      to_bucket: "production",
      to_department: "조립",
    })).toBe(8);
    expect(helpers.ioLineAvailable?.(item, {
      from_bucket: "production",
      from_department: "조립",
      to_bucket: "none",
    })).toBe(5);
    expect(helpers.ioLineAvailable?.(item, {
      from_bucket: "defective",
      from_department: "조립",
      to_bucket: "none",
    })).toBe(4);
  });

  it("prefers the backend canonical warehouse availability", () => {
    const canonicalItem = {
      ...item,
      warehouse_available_quantity: 3,
    };

    expect(helpers.warehouseAvailable?.(canonicalItem)).toBe(3);
    expect(helpers.ioLineAvailable?.(canonicalItem, {
      from_bucket: "warehouse",
      to_bucket: "production",
      to_department: "조립",
    })).toBe(3);
  });
});
