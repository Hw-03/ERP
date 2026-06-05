/**
 * PR#3 — InventoryItemRow DEFECTIVE 행 렌더링 테스트
 *
 * 검증 항목:
 *  1. PRODUCTION + DEFECTIVE 행 모두 포함 시 색상 띠에 두 segment 가 렌더링됨
 *  2. DEFECTIVE segment 색상이 #ef4444 인지 (style 검증)
 *  3. aria-label 에 "[불량]" 텍스트 포함 여부
 *  4. DEFECTIVE 수량 0 인 부서는 segment 에 포함 안 됨
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Item } from "@/lib/api";

// next/image mock
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// DepartmentsContext mock — useDeptColorLookup 이 "#3ac4b0" 반환
vi.mock("@/app/legacy/_components/DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#3ac4b0",
}));

import { InventoryItemRow } from "../InventoryItemRow";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    item_id: "test-item-001",
    item_name: "테스트 부품",
    mes_code: "7-TR-0001",
    spec: null,
    unit: "EA",
    quantity: 20,
    warehouse_qty: 5,
    min_stock: null,
    department: "조립",
    process_type: null,
    image_filename: null,
    locations: [],
    ...overrides,
  } as unknown as Item;
}

describe("InventoryItemRow — DEFECTIVE 게이지 세그먼트", () => {
  it("PRODUCTION + DEFECTIVE 행이 모두 있을 때 게이지 aria-label 에 두 부서 정보 포함", () => {
    const item = makeItem({
      quantity: 15,
      warehouse_qty: 5,
      locations: [
        { department: "조립", status: "PRODUCTION", quantity: 8 },
        { department: "조립", status: "DEFECTIVE", quantity: 2 },
      ],
    });

    const { getByRole } = render(
      <table>
        <tbody>
          <InventoryItemRow item={item} selected={false} onSelect={() => {}} />
        </tbody>
      </table>,
    );

    const gauge = getByRole("img");
    expect(gauge.getAttribute("aria-label")).toContain("조립");
    expect(gauge.getAttribute("aria-label")).toContain("[불량]");
  });

  it("DEFECTIVE segment 는 #ef4444 배경색으로 렌더링", () => {
    const item = makeItem({
      quantity: 10,
      warehouse_qty: 0,
      locations: [
        { department: "진공", status: "PRODUCTION", quantity: 7 },
        { department: "진공", status: "DEFECTIVE", quantity: 3 },
      ],
    });

    const { getByRole } = render(
      <table>
        <tbody>
          <InventoryItemRow item={item} selected={false} onSelect={() => {}} />
        </tbody>
      </table>,
    );

    const gauge = getByRole("img");
    const segments = gauge.querySelectorAll("div");
    // JSDOM 은 hex → rgb 로 변환함: #ef4444 = rgb(239, 68, 68)
    const redSegment = Array.from(segments).find((el) => {
      const bg = (el as HTMLElement).style.background;
      return bg === "#ef4444" || bg === "rgb(239, 68, 68)";
    });
    expect(redSegment).toBeDefined();
  });

  it("DEFECTIVE 수량 0 이면 게이지에 불량 구간 없음", () => {
    const item = makeItem({
      quantity: 10,
      warehouse_qty: 0,
      locations: [
        { department: "고압", status: "PRODUCTION", quantity: 10 },
        { department: "고압", status: "DEFECTIVE", quantity: 0 },
      ],
    });

    const { getByRole } = render(
      <table>
        <tbody>
          <InventoryItemRow item={item} selected={false} onSelect={() => {}} />
        </tbody>
      </table>,
    );

    const gauge = getByRole("img");
    expect(gauge.getAttribute("aria-label")).not.toContain("[불량]");
    const segments = gauge.querySelectorAll("div");
    const redSegment = Array.from(segments).find((el) => {
      const bg = (el as HTMLElement).style.background;
      return bg === "#ef4444" || bg === "rgb(239, 68, 68)";
    });
    expect(redSegment).toBeUndefined();
  });

  it("PRODUCTION 만 있는 품목은 기존 동작 유지 (불량 segment 없음)", () => {
    const item = makeItem({
      quantity: 10,
      warehouse_qty: 4,
      locations: [
        { department: "튜브", status: "PRODUCTION", quantity: 6 },
      ],
    });

    const { getByRole } = render(
      <table>
        <tbody>
          <InventoryItemRow item={item} selected={false} onSelect={() => {}} />
        </tbody>
      </table>,
    );

    const gauge = getByRole("img");
    expect(gauge.getAttribute("aria-label")).not.toContain("[불량]");
  });
});
